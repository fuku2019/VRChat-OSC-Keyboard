// SQLite-backed learning store for IME candidate ranking / IME候補ランキング用SQLiteベース学習ストア
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { DatabaseSync } from 'node:sqlite';
import { toHiragana } from './textUtils.js';

const require = createRequire(import.meta.url);

// Default learning score weights / デフォルト学習スコアウェイト
const DEFAULT_WEIGHTS = {
  candidate: 6, // Weight for candidate selection frequency / 候補選択頻度のウェイト
  bigram: 10, // Weight for bigram (context) frequency / バイグラム（コンテキスト）頻度のウェイト
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

// Tracks user selection history to boost frequently chosen candidates.
// Uses SQLite WAL mode for concurrent read/write performance.
// ユーザーの選択履歴を追跡し、よく選ばれる候補をブーストする。
// SQLite WALモードで並行読み書き性能を確保。
export class LearningStore {
  constructor(options = {}) {
    this.dbPath = options.dbPath || resolveDefaultDbPath();
    this.weights = {
      candidate: Number.isFinite(options.w1)
        ? options.w1
        : DEFAULT_WEIGHTS.candidate,
      bigram: Number.isFinite(options.w2) ? options.w2 : DEFAULT_WEIGHTS.bigram,
    };
    this.ensureDirectory();
    this.db = new DatabaseSync(this.dbPath);
    this.initialize();
    this.prepareStatements();
  }

  // Ensure the database directory exists / データベースディレクトリの存在を確認
  ensureDirectory() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Create database tables if they don't exist / テーブルが存在しない場合作成
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

  // Prepare reusable SQL statements for performance / パフォーマンスのため再利用可能なSQL文を準備
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

  // Record a committed candidate selection for learning / 学習のため確定した候補選択を記録
  recordCommit(reading, surface, previousWord = '') {
    if (!reading || !surface) return;
    const now = Date.now();
    const normalizedReading = toHiragana(reading);
    this.upsertCandidateStmt.run(normalizedReading, surface, now);
    if (previousWord) {
      this.upsertBigramStmt.run(previousWord, surface, now);
    }
  }

  // Get how many times a candidate was selected for a reading / 読みに対する候補選択回数を取得
  getCandidateCount(reading, surface) {
    if (!reading || !surface) return 0;
    const normalizedReading = toHiragana(reading);
    const row = this.selectCandidateCountStmt.get(normalizedReading, surface);
    return Number(row?.count || 0);
  }

  // Get how many times a surface followed a previous word / 表層形が前の単語に続いた回数を取得
  getBigramCount(previousWord, surface) {
    if (!previousWord || !surface) return 0;
    const row = this.selectBigramCountStmt.get(previousWord, surface);
    return Number(row?.count || 0);
  }

  // Calculate composite score: dictionary base + learning boost + context boost / 複合スコアを計算: 辞書ベース + 学習ブースト + コンテキストブースト
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
