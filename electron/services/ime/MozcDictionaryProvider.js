import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { LearningStore } from './LearningStore.js';
import { dedupeCandidates, extractLastWord, toHiragana } from './textUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let hasLoggedMozcManifestLoad = false;

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

export class MozcDictionaryProvider {
  constructor(options = {}) {
    this.maxCandidates = options.maxCandidates || 20;
    this.maxCacheEntries = options.maxCacheEntries || 32;
    this.assetsRoot = resolveAssetsRoot(options.assetsRoot);
    this.manifestPath = path.join(this.assetsRoot, 'manifest.json');
    this.shardsRoot = path.join(this.assetsRoot, 'shards');
    this.learningStore = options.learningStore || new LearningStore();
    this.shardCache = new Map();
    this.fallbackEntries = [];
    this.loadManifest();
  }

  loadManifest() {
    if (!fs.existsSync(this.manifestPath)) {
      throw new Error(`Mozc manifest not found: ${this.manifestPath}`);
    }
    this.manifest = JSON.parse(fs.readFileSync(this.manifestPath, 'utf-8'));
    if (!hasLoggedMozcManifestLoad) {
      console.info(
        `[IME] Mozc shards loaded: entries=${this.manifest.entryCount} shards=${this.manifest.shardCount}`,
      );
      hasLoggedMozcManifestLoad = true;
    }
  }

  hasReading(reading) {
    const normalized = toHiragana(reading);
    if (!normalized) return false;
    const entries = this.loadShard(normalized);
    return entries.some((entry) => entry.r === normalized);
  }

  hasReadingPrefix(prefix) {
    const normalized = toHiragana(prefix);
    if (!normalized) return false;
    const entries = this.loadShard(normalized);
    return entries.some((entry) => entry.r.startsWith(normalized));
  }

  loadShard(readingOrKey) {
    const normalized = toHiragana(readingOrKey || '');
    const shardKey = toShardKey(normalized);

    if (this.shardCache.has(shardKey)) {
      const cached = this.shardCache.get(shardKey);
      this.shardCache.delete(shardKey);
      this.shardCache.set(shardKey, cached);
      return cached;
    }

    const encodedPath = path.join(this.shardsRoot, toShardFilename(shardKey));
    const legacyPath = path.join(this.shardsRoot, `${shardKey}.json.gz`);
    const shardPath = fs.existsSync(encodedPath) ? encodedPath : legacyPath;
    if (!fs.existsSync(shardPath)) {
      this.setCache(shardKey, []);
      return [];
    }

    const gz = fs.readFileSync(shardPath);
    const json = zlib.gunzipSync(gz).toString('utf-8');
    const entries = JSON.parse(json);
    this.setCache(shardKey, entries);
    return entries;
  }

  setCache(key, entries) {
    this.shardCache.set(key, entries);
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
    const entries = this.loadShard(normalized).filter(
      (entry) => entry.r === normalized,
    );

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
