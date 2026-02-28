import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { LearningStore } from './LearningStore.js';
import { MozcDictionaryProvider } from './MozcDictionaryProvider.js';

const tempDirs: string[] = [];

function createAssets(entriesByShard: Record<string, Array<{ r: string; s: string; c: number; p: number }>>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mozc-assets-'));
  tempDirs.push(root);
  const shardsDir = path.join(root, 'shards');
  fs.mkdirSync(shardsDir, { recursive: true });

  let count = 0;
  for (const [key, entries] of Object.entries(entriesByShard)) {
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(entries), 'utf-8'));
    fs.writeFileSync(path.join(shardsDir, `${key}.json.gz`), gz);
    count += entries.length;
  }

  fs.writeFileSync(
    path.join(root, 'manifest.json'),
    JSON.stringify(
      {
        source: 'mozc_dictionary_oss',
        mozcCommit: 'test',
        generatedAt: new Date().toISOString(),
        shardCount: Object.keys(entriesByShard).length,
        entryCount: count,
        compression: 'gzip',
        formatVersion: 1,
      },
      null,
      2,
    ),
    'utf-8',
  );

  return root;
}

describe('MozcDictionaryProvider', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns candidates for exact reading match', () => {
    const assetsRoot = createAssets({
      に: [
        { r: 'にほん', s: '日本', c: 3000, p: 1 },
        { r: 'にほん', s: 'ニホン', c: 3500, p: 2 },
      ],
    });
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
    });
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
    });
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
