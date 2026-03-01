// Mozc OSS dictionary provider for kanji conversion / Mozc OSS辞書プロバイダー（漢字変換用）
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
const SUPPORTED_FORMAT_VERSIONS = new Set([1, 2]); // Manifest format versions / マニフェスト形式バージョン
const SHA256_PATTERN = /^[0-9a-f]{64}$/i; // SHA-256 hash pattern / SHA-256ハッシュパターン

// Resolve the root directory for Mozc dictionary assets / Mozc辞書アセットのルートディレクトリを解決
function resolveAssetsRoot(customRoot) {
  if (customRoot) return customRoot;
  return path.join(__dirname, '../../assets/ime/mozc');
}

// Derive shard key from reading (first hiragana character) / 読みからシャードキーを導出（最初のひらがな文字）
function toShardKey(reading) {
  const normalized = toHiragana(reading);
  if (!normalized) return '_';
  return normalized.slice(0, 1);
}

// Convert shard key to hex-encoded filename / シャードキーを16進エンコードファイル名に変換
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

// Create empty shard data structure / 空のシャードデータ構造を作成
function createEmptyShardData() {
  return {
    entries: [],
    byReading: new Map(),
  };
}

// Provides IME candidates from Mozc OSS dictionary shards.
// Loads gzipped JSON shards on demand with LRU caching and SHA-256 integrity checks.
// Mozc OSSの辞書シャードからIME候補を提供する。
// gzip圧縮JSONシャードをオンデマンドでロードし、LRUキャッシュとSHA-256整合性チェックを行う。
export class MozcDictionaryProvider {
  constructor(options = {}) {
    this.maxCandidates = options.maxCandidates || 20;
    this.maxCacheEntries = options.maxCacheEntries || 32; // LRU cache limit / LRUキャッシュ上限
    this.assetsRoot = resolveAssetsRoot(options.assetsRoot);
    this.manifestPath = path.join(this.assetsRoot, 'manifest.json');
    this.shardsRoot = path.join(this.assetsRoot, 'shards');
    this.learningStore = options.learningStore || new LearningStore();
    this.shardCache = new Map(); // LRU shard cache / LRUシャードキャッシュ
    this.invalidShardKeys = new Set(); // Permanently failed shards / 恒久的に失敗したシャード
    this.loggedShardErrors = new Set(); // Deduplicate error logs / エラーログの重複排除
    this.manifestShardMap = new Map(); // v2 manifest shard metadata / v2マニフェストシャードメタデータ
    this.manifestVersion = 1;
    this.loadManifest();
  }

  // List .json.gz shard files in the shards directory / shardsディレクトリ内の.json.gzシャードファイルを一覧
  getShardFilesOnDisk() {
    if (!fs.existsSync(this.shardsRoot)) {
      throw new Error(`Mozc shards directory not found: ${this.shardsRoot}`);
    }
    return fs
      .readdirSync(this.shardsRoot)
      .filter((fileName) => fileName.endsWith('.json.gz'));
  }

  // Validate manifest structure and cross-check with shard files on disk / マニフェスト構造を検証し、ディスク上のシャードファイルとクロスチェック
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
      throw new Error(
        'Mozc manifest "shardCount" must be a non-negative integer',
      );
    }
    if (!isNonNegativeInteger(manifest.entryCount)) {
      throw new Error(
        'Mozc manifest "entryCount" must be a non-negative integer',
      );
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
        throw new Error(
          `Mozc manifest is missing shard metadata for ${shardFile}`,
        );
      }
    }

    if (sumOfEntries !== manifest.entryCount) {
      throw new Error(
        `Mozc manifest entryCount mismatch: manifest=${manifest.entryCount} shardsSum=${sumOfEntries}`,
      );
    }

    return { formatVersion: 2, shardMap };
  }

  // Load and validate manifest.json from assets root / アセットルートからmanifest.jsonをロード・検証
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

  // Check if dictionary has entries for a given reading / 指定した読みの辞書エントリが存在するか確認
  hasReading(reading) {
    const normalized = toHiragana(reading);
    if (!normalized) return false;
    const shardData = this.loadShard(normalized);
    return shardData.byReading.has(normalized);
  }

  // Check if any dictionary reading starts with the given prefix / 辞書の読みが指定の接頭辞で始まるか確認
  hasReadingPrefix(prefix) {
    const normalized = toHiragana(prefix);
    if (!normalized) return false;
    const shardData = this.loadShard(normalized);
    for (const reading of shardData.byReading.keys()) {
      if (reading.startsWith(normalized)) return true;
    }
    return false;
  }

  // Move cache entry to most-recent position (LRU touch) / キャッシュエントリを最新位置に移動（LRUタッチ）
  touchCacheEntry(key) {
    const cached = this.shardCache.get(key);
    this.shardCache.delete(key);
    this.shardCache.set(key, cached);
    return cached;
  }

  // Get manifest metadata for a shard key (v2 only) / シャードキーのマニフェストメタデータを取得（v2のみ）
  getManifestShardMeta(shardKey) {
    if (this.manifestVersion !== 2) return null;
    return this.manifestShardMap.get(shardKey) || null;
  }

  // Resolve file path and expected hash for a shard key / シャードキーのファイルパスと期待ハッシュを解決
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
      return {
        shardPath: encodedPath,
        expectedHash: '',
        expectedEntryCount: null,
      };
    }
    if (fs.existsSync(legacyPath)) {
      return {
        shardPath: legacyPath,
        expectedHash: '',
        expectedEntryCount: null,
      };
    }
    return { shardPath: '', expectedHash: '', expectedEntryCount: null };
  }

  // Compute SHA-256 hash of a buffer / バッファのSHA-256ハッシュを計算
  computeSha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  cacheEmptyShard(key) {
    const empty = createEmptyShardData();
    this.setCache(key, empty);
    return empty;
  }

  // Parse and index raw shard entries into structured data / 生のシャードエントリを構造化データに解析・インデックス化
  buildShardData(rawEntries, shardKey) {
    if (!Array.isArray(rawEntries)) {
      throw new Error(`Mozc shard must be an array: key=${shardKey}`);
    }

    const entries = [];
    const byReading = new Map();
    for (let index = 0; index < rawEntries.length; index += 1) {
      const entry = rawEntries[index];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(
          `Mozc shard entry must be object: key=${shardKey} index=${index}`,
        );
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

  // Permanently disable a corrupted shard and log warning / 破損シャードを恒久的に無効化し警告をログ出力
  disableShard(shardKey, error) {
    this.invalidShardKeys.add(shardKey);
    const empty = this.cacheEmptyShard(shardKey);
    if (!this.loggedShardErrors.has(shardKey)) {
      console.warn(
        `[IME] Mozc shard disabled key=${shardKey}: ${error.message}`,
      );
      this.loggedShardErrors.add(shardKey);
    }
    return empty;
  }

  // Load a shard from disk or cache, with integrity verification / ディスクまたはキャッシュからシャードをロード（整合性検証付き）
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

  // Add shard data to LRU cache, evicting oldest if over limit / シャードデータをLRUキャッシュに追加（上限超過時は最古を削除）
  setCache(key, shardData) {
    this.shardCache.set(key, shardData);
    while (this.shardCache.size > this.maxCacheEntries) {
      const oldestKey = this.shardCache.keys().next().value;
      this.shardCache.delete(oldestKey);
    }
  }

  // Get ranked conversion candidates for a reading, with learning score / 読みのランク付き変換候補を取得（学習スコア付き）
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
