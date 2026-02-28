import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { LearningStore } from './LearningStore.js';

const createdPaths: string[] = [];

function createDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ime-learning-'));
  const dbPath = path.join(dir, 'learning.sqlite');
  createdPaths.push(dir);
  return dbPath;
}

describe('LearningStore', () => {
  afterEach(() => {
    for (const dir of createdPaths.splice(0, createdPaths.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records and retrieves candidate/bigram counts', () => {
    const store = new LearningStore({ dbPath: createDbPath() });
    store.recordCommit('かな', '仮名', '');
    store.recordCommit('かな', '仮名', '日本');
    store.recordCommit('かな', '仮名', '日本');

    expect(store.getCandidateCount('かな', '仮名')).toBe(3);
    expect(store.getBigramCount('日本', '仮名')).toBe(2);
    store.close();
  });

  it('returns weighted score boost', () => {
    const store = new LearningStore({ dbPath: createDbPath(), w1: 6, w2: 10 });
    store.recordCommit('にほん', '日本', '');
    store.recordCommit('にほん', '日本', '私');

    const scored = store.score(50, 'にほん', '日本', '私');
    expect(scored.score).toBeGreaterThan(50);
    expect(scored.candidateCount).toBeGreaterThan(0);
    expect(scored.bigramCount).toBeGreaterThan(0);
    store.close();
  });
});
