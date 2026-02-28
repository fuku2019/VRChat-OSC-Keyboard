import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearningStore } from './LearningStore.js';
import { MozcDictionaryProvider } from './MozcDictionaryProvider.js';

const tempDirs: string[] = [];

type ShardEntry = { r: string; s: string; c: number; p: number };

type CreateAssetsOptions = {
  formatVersion?: 1 | 2;
  compression?: string;
  useEncodedFilenames?: boolean;
};

function toShardFilename(shardKey: string) {
  const safe = Array.from(shardKey || '_')
    .map((char) => char.codePointAt(0)!.toString(16))
    .join('-');
  return `${safe}.json.gz`;
}

function compareCodePointStrings(left = '', right = '') {
  if (left === right) return 0;
  const leftChars = Array.from(left);
  const rightChars = Array.from(right);
  const minLength = Math.min(leftChars.length, rightChars.length);
  for (let index = 0; index < minLength; index += 1) {
    const leftCode = leftChars[index].codePointAt(0)!;
    const rightCode = rightChars[index].codePointAt(0)!;
    if (leftCode !== rightCode) return leftCode - rightCode;
  }
  return leftChars.length - rightChars.length;
}

function createAssets(
  entriesByShard: Record<string, ShardEntry[]>,
  options: CreateAssetsOptions = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mozc-assets-'));
  tempDirs.push(root);
  const shardsDir = path.join(root, 'shards');
  fs.mkdirSync(shardsDir, { recursive: true });

  const formatVersion = options.formatVersion ?? 1;
  const compression = options.compression ?? 'gzip';
  const useEncodedFilenames =
    options.useEncodedFilenames ?? formatVersion === 2;

  let count = 0;
  const shardFilesByKey: Record<string, string> = {};
  const shardManifest: Array<{
    key: string;
    file: string;
    entryCount: number;
    sha256: string;
  }> = [];

  const keys = Object.keys(entriesByShard);
  for (const key of keys) {
    const entries = entriesByShard[key];
    const file = useEncodedFilenames ? toShardFilename(key) : `${key}.json.gz`;
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(entries), 'utf-8'));
    fs.writeFileSync(path.join(shardsDir, file), gz);
    shardFilesByKey[key] = file;
    shardManifest.push({
      key,
      file,
      entryCount: entries.length,
      sha256: crypto.createHash('sha256').update(gz).digest('hex'),
    });
    count += entries.length;
  }

  const manifest: Record<string, unknown> = {
    source: 'mozc_dictionary_oss',
    mozcCommit: 'a'.repeat(40),
    generatedAt: new Date().toISOString(),
    shardCount: keys.length,
    entryCount: count,
    compression,
    formatVersion,
  };
  if (formatVersion === 2) {
    shardManifest.sort((left, right) =>
      compareCodePointStrings(left.key, right.key),
    );
    manifest.shards = shardManifest;
  }

  fs.writeFileSync(
    path.join(root, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );

  return { root, shardsDir, shardFilesByKey };
}

describe('MozcDictionaryProvider', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads formatVersion 1 assets and returns candidates for exact reading match', () => {
    const assets = createAssets({
      に: [
        { r: 'にほん', s: '日本', c: 3000, p: 1 },
        { r: 'にほん', s: 'ニホン', c: 3500, p: 2 },
      ],
    }, { formatVersion: 1, useEncodedFilenames: false });
    const assetsRoot = assets.root;
    const store = new LearningStore({ dbPath: path.join(assetsRoot, 'learning.sqlite') });
    const provider = new MozcDictionaryProvider({ assetsRoot, learningStore: store, maxCandidates: 5 });
    const candidates = provider.getCandidates('にほん', {});

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].reading).toBe('にほん');
    expect(candidates.some((c) => c.text === '日本')).toBe(true);
    store.close();
  });

  it('keeps shard cache within configured limit', () => {
    const assetsRoot = createAssets({
      あ: [{ r: 'あ', s: '亜', c: 4000, p: 1 }],
      い: [{ r: 'い', s: '伊', c: 4000, p: 1 }],
      う: [{ r: 'う', s: '宇', c: 4000, p: 1 }],
    }, { formatVersion: 1, useEncodedFilenames: false }).root;
    const store = new LearningStore({ dbPath: path.join(assetsRoot, 'learning.sqlite') });
    const provider = new MozcDictionaryProvider({
      assetsRoot,
      learningStore: store,
      maxCacheEntries: 2,
    });

    provider.getCandidates('あ', {});
    provider.getCandidates('い', {});
    provider.getCandidates('う', {});
    expect(provider.shardCache.size).toBeLessThanOrEqual(2);
    store.close();
  });

  it('promotes learned candidate after commit stats are recorded', () => {
    const assetsRoot = createAssets({
      に: [
        { r: 'にほん', s: '日本', c: 2800, p: 1 },
        { r: 'にほん', s: '二本', c: 3400, p: 1 },
      ],
    }, { formatVersion: 1, useEncodedFilenames: false }).root;
    const store = new LearningStore({ dbPath: path.join(assetsRoot, 'learning.sqlite') });
    const provider = new MozcDictionaryProvider({ assetsRoot, learningStore: store, maxCandidates: 5 });

    const before = provider.getCandidates('にほん', {});
    expect(before[0].text).toBe('日本');

    for (let i = 0; i < 3; i += 1) {
      store.recordCommit('にほん', '二本', 'これは');
    }

    const after = provider.getCandidates('にほん', { previousWord: 'これは' });
    expect(after[0].text).toBe('二本');
    expect(after[0].dictSource).toBe('context');
    store.close();
  });

  it('loads formatVersion 2 assets and verifies shard hashes', () => {
    const assetsRoot = createAssets({
      に: [
        { r: 'にほん', s: '日本', c: 3000, p: 1 },
        { r: 'にほん', s: 'ニホン', c: 3500, p: 2 },
      ],
    }, { formatVersion: 2 }).root;
    const store = new LearningStore({ dbPath: path.join(assetsRoot, 'learning.sqlite') });
    const provider = new MozcDictionaryProvider({ assetsRoot, learningStore: store, maxCandidates: 5 });
    const candidates = provider.getCandidates('にほん', {});

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].text).toBe('日本');
    store.close();
  });

  it('throws when manifest is globally invalid', () => {
    const assetsRoot = createAssets({
      に: [{ r: 'にほん', s: '日本', c: 3000, p: 1 }],
    }, { formatVersion: 2, compression: 'brotli' }).root;
    const store = new LearningStore({ dbPath: path.join(assetsRoot, 'learning.sqlite') });

    expect(() => new MozcDictionaryProvider({ assetsRoot, learningStore: store })).toThrow(
      /compression/,
    );
    store.close();
  });

  it('isolates a hash-mismatched shard and keeps other shards available', () => {
    const assets = createAssets({
      に: [{ r: 'にほん', s: '日本', c: 3000, p: 1 }],
      と: [{ r: 'とうきょう', s: '東京', c: 2800, p: 1 }],
    }, { formatVersion: 2 });
    const assetsRoot = assets.root;
    const manifestPath = path.join(assetsRoot, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as any;
    const brokenShards = manifest.shards.map((shard: Record<string, unknown>) =>
      shard.key === 'に' ? { ...shard, sha256: '0'.repeat(64) } : shard,
    );
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ ...manifest, shards: brokenShards }, null, 2),
      'utf-8',
    );

    const store = new LearningStore({ dbPath: path.join(assetsRoot, 'learning.sqlite') });
    const provider = new MozcDictionaryProvider({ assetsRoot, learningStore: store, maxCandidates: 5 });

    expect(provider.getCandidates('にほん', {})).toEqual([]);
    expect(provider.getCandidates('とうきょう', {}).length).toBeGreaterThan(0);
    expect(provider.invalidShardKeys.has('に')).toBe(true);
    store.close();
  });

  it('disables corrupted shard once and avoids repeated warnings', () => {
    const assets = createAssets({
      に: [{ r: 'にほん', s: '日本', c: 3000, p: 1 }],
      わ: [{ r: 'わたし', s: '私', c: 3000, p: 1 }],
    }, { formatVersion: 2 });
    const brokenFile = path.join(assets.shardsDir, assets.shardFilesByKey['に']);
    fs.writeFileSync(brokenFile, Buffer.from('not-gzip', 'utf-8'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const assetsRoot = assets.root;
    const store = new LearningStore({ dbPath: path.join(assetsRoot, 'learning.sqlite') });
    const provider = new MozcDictionaryProvider({ assetsRoot, learningStore: store, maxCandidates: 5 });

    expect(provider.getCandidates('にほん', {})).toEqual([]);
    expect(provider.getCandidates('にほん', {})).toEqual([]);
    expect(provider.getCandidates('わたし', {}).length).toBeGreaterThan(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('key=に');

    warnSpy.mockRestore();
    store.close();
  });

  it('preserves candidate ranking after reading-index optimization', () => {
    const assetsRoot = createAssets({
      か: [
        { r: 'か', s: '蚊', c: 2900, p: 1 },
        { r: 'か', s: '科', c: 3200, p: 1 },
        { r: 'か', s: '可', c: 3400, p: 1 },
        { r: 'かい', s: '貝', c: 2000, p: 1 },
      ],
    }, { formatVersion: 2 }).root;
    const store = new LearningStore({ dbPath: path.join(assetsRoot, 'learning.sqlite') });
    const provider = new MozcDictionaryProvider({ assetsRoot, learningStore: store, maxCandidates: 5 });
    const candidates = provider.getCandidates('か', {});

    expect(candidates.map((candidate) => candidate.text)).toEqual(['蚊', '科', '可']);
    store.close();
  });

  it('returns mozc candidates for representative readings from bundled shards', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mozc-learning-'));
    tempDirs.push(tempRoot);
    const learningStore = new LearningStore({
      dbPath: path.join(tempRoot, 'learning.sqlite'),
    });
    const provider = new MozcDictionaryProvider({
      learningStore,
      maxCandidates: 5,
    });

    for (const reading of ['にほん', 'とうきょう', 'わたし', 'ありがとう']) {
      const candidates = provider.getCandidates(reading, {});
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.some((candidate) => candidate.dictSource === 'mozc')).toBe(
        true,
      );
    }

    learningStore.close();
  });
});
