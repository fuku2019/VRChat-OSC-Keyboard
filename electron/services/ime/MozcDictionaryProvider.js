import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { LearningStore } from './LearningStore.js';
import { dedupeCandidates, extractLastWord, toHiragana } from './textUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let hasLoggedMozcManifestLoad = false;
const SUPPORTED_FORMAT_VERSIONS = new Set([1, 2]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

function resolveAssetsRoot(customRoot) {
  if (customRoot) return customRoot;
  return path.join(__dirname, '../../assets/ime/mozc');
}

function toShardKey(reading) {
  const normalized = toHiragana(reading);
  if (!normalized) return '_';
  return normalized.slice(0, 1);
}

function toShardFilename(shardKey) {
  const safe = Array.from(shardKey || '_')
    .map((char) => char.codePointAt(0).toString(16))
    .join('-');
  return `${safe}.json.gz`;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function compareCodePointStrings(left = '', right = '') {
  if (left === right) return 0;
  const leftChars = Array.from(left);
  const rightChars = Array.from(right);
  const minLength = Math.min(leftChars.length, rightChars.length);
  for (let index = 0; index < minLength; index += 1) {
    const leftCode = leftChars[index].codePointAt(0);
    const rightCode = rightChars[index].codePointAt(0);
    if (leftCode !== rightCode) return leftCode - rightCode;
  }
  return leftChars.length - rightChars.length;
}

function normalizeHash(hashValue) {
  if (!isNonEmptyString(hashValue)) return '';
  const trimmed = hashValue.trim();
  return SHA256_PATTERN.test(trimmed) ? trimmed.toLowerCase() : '';
}

function createEmptyShardData() {
  return {
    entries: [],
    byReading: new Map(),
  };
}

export class MozcDictionaryProvider {
  constructor(options = {}) {
    this.maxCandidates = options.maxCandidates || 20;
    this.maxCacheEntries = options.maxCacheEntries || 32;
    this.assetsRoot = resolveAssetsRoot(options.assetsRoot);
    this.manifestPath = path.join(this.assetsRoot, 'manifest.json');
    this.shardsRoot = path.join(this.assetsRoot, 'shards');
    this.learningStore = options.learningStore || new LearningStore();
    this.shardCache = new Map();
    this.invalidShardKeys = new Set();
    this.loggedShardErrors = new Set();
    this.manifestShardMap = new Map();
    this.manifestVersion = 1;
    this.loadManifest();
  }

  getShardFilesOnDisk() {
    if (!fs.existsSync(this.shardsRoot)) {
      throw new Error(`Mozc shards directory not found: ${this.shardsRoot}`);
    }
    return fs
      .readdirSync(this.shardsRoot)
      .filter((fileName) => fileName.endsWith('.json.gz'));
  }

  validateManifest(manifest, shardFilesOnDisk) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new Error('Mozc manifest must be a JSON object');
    }
    if (!isNonEmptyString(manifest.source)) {
      throw new Error('Mozc manifest "source" must be a non-empty string');
    }
    if (!isNonEmptyString(manifest.mozcCommit)) {
      throw new Error('Mozc manifest "mozcCommit" must be a non-empty string');
    }
    if (!isNonEmptyString(manifest.generatedAt)) {
      throw new Error('Mozc manifest "generatedAt" must be a non-empty string');
    }
    if (manifest.compression !== 'gzip') {
      throw new Error(
        `Mozc manifest "compression" must be "gzip" but got "${manifest.compression}"`,
      );
    }
    if (!SUPPORTED_FORMAT_VERSIONS.has(manifest.formatVersion)) {
      throw new Error(
        `Mozc manifest formatVersion must be one of ${Array.from(SUPPORTED_FORMAT_VERSIONS).join(', ')}`,
      );
    }
    if (!isNonNegativeInteger(manifest.shardCount)) {
      throw new Error('Mozc manifest "shardCount" must be a non-negative integer');
    }
    if (!isNonNegativeInteger(manifest.entryCount)) {
      throw new Error('Mozc manifest "entryCount" must be a non-negative integer');
    }
    if (manifest.shardCount !== shardFilesOnDisk.length) {
      throw new Error(
        `Mozc manifest shardCount mismatch: manifest=${manifest.shardCount} actual=${shardFilesOnDisk.length}`,
      );
    }

    if (manifest.formatVersion === 1) {
      return { formatVersion: 1, shardMap: new Map() };
    }

    if (!Array.isArray(manifest.shards)) {
      throw new Error('Mozc manifest v2 requires "shards" array');
    }
    if (manifest.shards.length !== manifest.shardCount) {
      throw new Error(
        `Mozc manifest shard list mismatch: shardCount=${manifest.shardCount} shards.length=${manifest.shards.length}`,
      );
    }

    const shardFilesSet = new Set(shardFilesOnDisk);
    const listedFiles = new Set();
    const shardMap = new Map();
    let sumOfEntries = 0;
    let previousKey = '';

    for (const shard of manifest.shards) {
      if (!shard || typeof shard !== 'object' || Array.isArray(shard)) {
        throw new Error('Mozc manifest shard entry must be an object');
      }
      if (!isNonEmptyString(shard.key)) {
        throw new Error('Mozc manifest shard.key must be a non-empty string');
      }
      if (!isNonEmptyString(shard.file) || !shard.file.endsWith('.json.gz')) {
        throw new Error(
          `Mozc manifest shard.file must be a .json.gz filename: key=${shard.key}`,
        );
      }
      if (!isNonNegativeInteger(shard.entryCount)) {
        throw new Error(
          `Mozc manifest shard.entryCount must be a non-negative integer: key=${shard.key}`,
        );
      }
      const normalizedSha = normalizeHash(shard.sha256);
      if (!normalizedSha) {
        throw new Error(
          `Mozc manifest shard.sha256 must be a 64-character hex string: key=${shard.key}`,
        );
      }
      if (shardMap.has(shard.key)) {
        throw new Error(`Mozc manifest has duplicate shard key: ${shard.key}`);
      }
      if (compareCodePointStrings(previousKey, shard.key) > 0) {
        throw new Error('Mozc manifest shards must be sorted by key');
      }
      if (!shardFilesSet.has(shard.file)) {
        throw new Error(
          `Mozc manifest references missing shard file: ${shard.file}`,
        );
      }
      if (listedFiles.has(shard.file)) {
        throw new Error(
          `Mozc manifest has duplicate shard file entries: ${shard.file}`,
        );
      }

      previousKey = shard.key;
      listedFiles.add(shard.file);
      shardMap.set(shard.key, {
        key: shard.key,
        file: shard.file,
        entryCount: shard.entryCount,
        sha256: normalizedSha,
      });
      sumOfEntries += shard.entryCount;
    }

    for (const shardFile of shardFilesOnDisk) {
      if (!listedFiles.has(shardFile)) {
        throw new Error(`Mozc manifest is missing shard metadata for ${shardFile}`);
      }
    }

    if (sumOfEntries !== manifest.entryCount) {
      throw new Error(
        `Mozc manifest entryCount mismatch: manifest=${manifest.entryCount} shardsSum=${sumOfEntries}`,
      );
    }

    return { formatVersion: 2, shardMap };
  }

  loadManifest() {
    if (!fs.existsSync(this.manifestPath)) {
      throw new Error(`Mozc manifest not found: ${this.manifestPath}`);
    }
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(this.manifestPath, 'utf-8'));
    } catch (error) {
      throw new Error(`Mozc manifest parse failed: ${error.message}`);
    }

    const shardFilesOnDisk = this.getShardFilesOnDisk();
    const validated = this.validateManifest(manifest, shardFilesOnDisk);
    this.manifest = manifest;
    this.manifestVersion = validated.formatVersion;
    this.manifestShardMap = validated.shardMap;

    if (!hasLoggedMozcManifestLoad) {
      console.info(
        `[IME] Mozc shards loaded: entries=${this.manifest.entryCount} shards=${this.manifest.shardCount} format=v${this.manifest.formatVersion}`,
      );
      hasLoggedMozcManifestLoad = true;
    }
  }

  hasReading(reading) {
    const normalized = toHiragana(reading);
    if (!normalized) return false;
    const shardData = this.loadShard(normalized);
    return shardData.byReading.has(normalized);
  }

  hasReadingPrefix(prefix) {
    const normalized = toHiragana(prefix);
    if (!normalized) return false;
    const shardData = this.loadShard(normalized);
    for (const reading of shardData.byReading.keys()) {
      if (reading.startsWith(normalized)) return true;
    }
    return false;
  }

  touchCacheEntry(key) {
    const cached = this.shardCache.get(key);
    this.shardCache.delete(key);
    this.shardCache.set(key, cached);
    return cached;
  }

  getManifestShardMeta(shardKey) {
    if (this.manifestVersion !== 2) return null;
    return this.manifestShardMap.get(shardKey) || null;
  }

  resolveShardLoadTarget(shardKey) {
    const manifestMeta = this.getManifestShardMeta(shardKey);
    if (manifestMeta) {
      return {
        shardPath: path.join(this.shardsRoot, manifestMeta.file),
        expectedHash: manifestMeta.sha256,
        expectedEntryCount: manifestMeta.entryCount,
      };
    }

    const encodedPath = path.join(this.shardsRoot, toShardFilename(shardKey));
    const legacyPath = path.join(this.shardsRoot, `${shardKey}.json.gz`);
    if (fs.existsSync(encodedPath)) {
      return { shardPath: encodedPath, expectedHash: '', expectedEntryCount: null };
    }
    if (fs.existsSync(legacyPath)) {
      return { shardPath: legacyPath, expectedHash: '', expectedEntryCount: null };
    }
    return { shardPath: '', expectedHash: '', expectedEntryCount: null };
  }

  computeSha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  cacheEmptyShard(key) {
    const empty = createEmptyShardData();
    this.setCache(key, empty);
    return empty;
  }

  buildShardData(rawEntries, shardKey) {
    if (!Array.isArray(rawEntries)) {
      throw new Error(`Mozc shard must be an array: key=${shardKey}`);
    }

    const entries = [];
    const byReading = new Map();
    for (let index = 0; index < rawEntries.length; index += 1) {
      const entry = rawEntries[index];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`Mozc shard entry must be object: key=${shardKey} index=${index}`);
      }
      if (!isNonEmptyString(entry.r) || !isNonEmptyString(entry.s)) {
        throw new Error(
          `Mozc shard entry has invalid reading/surface: key=${shardKey} index=${index}`,
        );
      }

      const normalizedEntry = {
        r: entry.r,
        s: entry.s,
        c: Number.isFinite(entry.c) ? entry.c : 5000,
        p: Number.isFinite(entry.p) ? entry.p : 0,
      };
      entries.push(normalizedEntry);
      if (!byReading.has(normalizedEntry.r)) {
        byReading.set(normalizedEntry.r, []);
      }
      byReading.get(normalizedEntry.r).push(normalizedEntry);
    }

    return { entries, byReading };
  }

  disableShard(shardKey, error) {
    this.invalidShardKeys.add(shardKey);
    const empty = this.cacheEmptyShard(shardKey);
    if (!this.loggedShardErrors.has(shardKey)) {
      console.warn(`[IME] Mozc shard disabled key=${shardKey}: ${error.message}`);
      this.loggedShardErrors.add(shardKey);
    }
    return empty;
  }

  loadShard(readingOrKey) {
    const normalized = toHiragana(readingOrKey || '');
    const shardKey = toShardKey(normalized);

    if (this.shardCache.has(shardKey)) {
      return this.touchCacheEntry(shardKey);
    }
    if (this.invalidShardKeys.has(shardKey)) {
      return this.cacheEmptyShard(shardKey);
    }

    const loadTarget = this.resolveShardLoadTarget(shardKey);
    if (!loadTarget.shardPath) {
      return this.cacheEmptyShard(shardKey);
    }

    try {
      const gz = fs.readFileSync(loadTarget.shardPath);
      if (loadTarget.expectedHash) {
        const actualHash = this.computeSha256(gz);
        if (actualHash !== loadTarget.expectedHash) {
          throw new Error(
            `sha256 mismatch expected=${loadTarget.expectedHash} actual=${actualHash}`,
          );
        }
      }
      const json = zlib.gunzipSync(gz).toString('utf-8');
      const parsedEntries = JSON.parse(json);
      const shardData = this.buildShardData(parsedEntries, shardKey);
      if (
        Number.isInteger(loadTarget.expectedEntryCount) &&
        loadTarget.expectedEntryCount !== shardData.entries.length
      ) {
        throw new Error(
          `entryCount mismatch expected=${loadTarget.expectedEntryCount} actual=${shardData.entries.length}`,
        );
      }
      this.setCache(shardKey, shardData);
      return shardData;
    } catch (error) {
      return this.disableShard(shardKey, error);
    }
  }

  setCache(key, shardData) {
    this.shardCache.set(key, shardData);
    while (this.shardCache.size > this.maxCacheEntries) {
      const oldestKey = this.shardCache.keys().next().value;
      this.shardCache.delete(oldestKey);
    }
  }

  getCandidates(reading, context = {}) {
    const normalized = toHiragana(reading);
    if (!normalized) return [];
    const previousWord =
      context.previousWord || extractLastWord(context.previousText || '');
    const shardData = this.loadShard(normalized);
    const entries = shardData.byReading.get(normalized) || [];

    if (entries.length === 0) {
      return [];
    }

    const ranked = entries
      .map((entry) => {
        const cost = Number.isFinite(entry.c) ? entry.c : 5000;
        const dictScore = Math.max(0, 10000 - cost) / 100;
        const learning = this.learningStore.score(
          dictScore,
          normalized,
          entry.s,
          previousWord,
        );
        const dictSource =
          learning.bigramCount > 0
            ? 'context'
            : learning.candidateCount > 0
              ? 'learned'
              : 'mozc';
        return {
          text: entry.s,
          reading: normalized,
          cost,
          posId: entry.p,
          source: dictSource === 'context' ? 'context' : 'dictionary',
          dictSource,
          score: learning.score,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (a.cost || 5000) - (b.cost || 5000);
      });

    return dedupeCandidates(ranked, this.maxCandidates);
  }
}
