import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { DatabaseSync } from 'node:sqlite';
import { toHiragana } from './textUtils.js';

const require = createRequire(import.meta.url);

const DEFAULT_WEIGHTS = {
  candidate: 6,
  bigram: 10,
};

function resolveDefaultDbPath() {
  try {
    const electron = require('electron');
    if (electron?.app?.getPath) {
      return path.join(electron.app.getPath('userData'), 'ime-learning.sqlite');
    }
  } catch {
    // Ignore and fallback below.
  }
  return path.join(os.tmpdir(), 'vrchat-osc-keyboard-ime-learning.sqlite');
}

export class LearningStore {
  constructor(options = {}) {
    this.dbPath = options.dbPath || resolveDefaultDbPath();
    this.weights = {
      candidate: Number.isFinite(options.w1) ? options.w1 : DEFAULT_WEIGHTS.candidate,
      bigram: Number.isFinite(options.w2) ? options.w2 : DEFAULT_WEIGHTS.bigram,
    };
    this.ensureDirectory();
    this.db = new DatabaseSync(this.dbPath);
    this.initialize();
    this.prepareStatements();
  }

  ensureDirectory() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  initialize() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS candidate_stats (
        reading TEXT NOT NULL,
        surface TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (reading, surface)
      );
      CREATE TABLE IF NOT EXISTS bigram_stats (
        prev_surface TEXT NOT NULL,
        surface TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (prev_surface, surface)
      );
    `);
  }

  prepareStatements() {
    this.upsertCandidateStmt = this.db.prepare(`
      INSERT INTO candidate_stats (reading, surface, count, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(reading, surface)
      DO UPDATE SET count = candidate_stats.count + 1, updated_at = excluded.updated_at
    `);
    this.upsertBigramStmt = this.db.prepare(`
      INSERT INTO bigram_stats (prev_surface, surface, count, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(prev_surface, surface)
      DO UPDATE SET count = bigram_stats.count + 1, updated_at = excluded.updated_at
    `);
    this.selectCandidateCountStmt = this.db.prepare(`
      SELECT count FROM candidate_stats WHERE reading = ? AND surface = ?
    `);
    this.selectBigramCountStmt = this.db.prepare(`
      SELECT count FROM bigram_stats WHERE prev_surface = ? AND surface = ?
    `);
  }

  recordCommit(reading, surface, previousWord = '') {
    if (!reading || !surface) return;
    const now = Date.now();
    const normalizedReading = toHiragana(reading);
    this.upsertCandidateStmt.run(normalizedReading, surface, now);
    if (previousWord) {
      this.upsertBigramStmt.run(previousWord, surface, now);
    }
  }

  getCandidateCount(reading, surface) {
    if (!reading || !surface) return 0;
    const normalizedReading = toHiragana(reading);
    const row = this.selectCandidateCountStmt.get(normalizedReading, surface);
    return Number(row?.count || 0);
  }

  getBigramCount(previousWord, surface) {
    if (!previousWord || !surface) return 0;
    const row = this.selectBigramCountStmt.get(previousWord, surface);
    return Number(row?.count || 0);
  }

  score(dictScore, reading, surface, previousWord = '') {
    const candidateCount = this.getCandidateCount(reading, surface);
    const bigramCount = this.getBigramCount(previousWord, surface);
    const learnedBoost = Math.log1p(candidateCount) * this.weights.candidate;
    const contextBoost = Math.log1p(bigramCount) * this.weights.bigram;
    return {
      score: dictScore + learnedBoost + contextBoost,
      candidateCount,
      bigramCount,
    };
  }

  close() {
    this.db?.close();
  }
}
