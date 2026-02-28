import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const inputDir =
  process.env.IME_DICT_INPUT_DIR ||
  path.join(repoRoot, 'vendor', 'mozc_dictionary_oss');
const outputRoot = path.join(repoRoot, 'electron', 'assets', 'ime', 'mozc');
const shardsDir = path.join(outputRoot, 'shards');
const REQUIRED_FILES = Array.from({ length: 10 }, (_, index) =>
  `dictionary${String(index).padStart(2, '0')}.txt`,
);
const SAMPLE_READINGS = ['にほん', 'とうきょう', 'わたし', 'ありがとう'];
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

function toHiragana(text = '') {
  return String(text).replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  );
}

function isNumericToken(token = '') {
  return /^-?\d+$/.test(token);
}

function toSafeInteger(token) {
  if (!isNumericToken(token)) return null;
  return Number.parseInt(token, 10);
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

function compareShardEntries(left, right) {
  const byReading = compareCodePointStrings(left.r, right.r);
  if (byReading !== 0) return byReading;
  const bySurface = compareCodePointStrings(left.s, right.s);
  if (bySurface !== 0) return bySurface;
  const byCost = left.c - right.c;
  if (byCost !== 0) return byCost;
  return left.p - right.p;
}

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return { entry: null, malformed: false };
  }

  const cols = trimmed.split('\t');
  if (cols.length < 2) {
    return { entry: null, malformed: true };
  }

  const reading = toHiragana(cols[0] || '').trim();
  if (!reading) {
    return { entry: null, malformed: true };
  }

  let surface = '';
  if (cols.length >= 2 && !isNumericToken(cols[1])) {
    surface = cols[1];
  } else {
    for (let index = cols.length - 1; index >= 0; index -= 1) {
      if (!isNumericToken(cols[index])) {
        surface = cols[index];
        break;
      }
    }
  }
  surface = String(surface || '').trim();
  if (!surface) {
    return { entry: null, malformed: true };
  }

  const costCandidates = cols
    .map((col) => toSafeInteger(col))
    .filter((value) => value !== null);
  if (costCandidates.some((value) => !Number.isFinite(value))) {
    return { entry: null, malformed: true };
  }
  const numericValues = costCandidates
    .filter((n) => Number.isFinite(n));
  const cost = numericValues.length > 0 ? numericValues[numericValues.length - 1] : 5000;
  const posId = numericValues.length > 0 ? numericValues[0] : 0;

  return {
    entry: { reading, surface, cost, posId },
    malformed: false,
  };
}

function toShardKey(reading) {
  if (!reading) return '_';
  return reading.slice(0, 1);
}

function toShardFilename(shardKey) {
  const safe = Array.from(shardKey || '_')
    .map((char) => char.codePointAt(0).toString(16))
    .join('-');
  return `${safe}.json.gz`;
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeCommitSha(commit) {
  if (typeof commit !== 'string') return '';
  const trimmed = commit.trim();
  if (!GIT_SHA_PATTERN.test(trimmed)) return '';
  return trimmed.toLowerCase();
}

function resolveCommitFromGit(inputDirectory) {
  try {
    const resolved = execFileSync(
      'git',
      ['-C', inputDirectory, 'rev-parse', 'HEAD'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    return normalizeCommitSha(resolved);
  } catch {
    return '';
  }
}

function resolveMozcCommit() {
  const envCommit = process.env.MOZC_COMMIT;
  if (typeof envCommit === 'string' && envCommit.trim()) {
    const normalized = normalizeCommitSha(envCommit);
    if (!normalized) {
      throw new Error(
        'MOZC_COMMIT must be a 40-character hexadecimal git commit SHA',
      );
    }
    return normalized;
  }

  const commitFromGit = resolveCommitFromGit(inputDir);
  if (commitFromGit) return commitFromGit;

  throw new Error(
    `Unable to resolve Mozc commit SHA from ${inputDir}. Set MOZC_COMMIT to a valid 40-character SHA.`,
  );
}

function collectEntries() {
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory not found: ${inputDir}`);
  }

  const missing = REQUIRED_FILES.filter(
    (name) => !fs.existsSync(path.join(inputDir, name)),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required files in ${inputDir}: ${missing.join(', ')}`,
    );
  }
  const files = REQUIRED_FILES.map((name) => path.join(inputDir, name));

  const merged = new Map();
  const readingSet = new Set();
  let skippedMalformedLines = 0;
  const sampleReadingHits = Object.fromEntries(
    SAMPLE_READINGS.map((reading) => [reading, 0]),
  );

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseLine(line);
      if (!parsed.entry) {
        if (parsed.malformed) skippedMalformedLines += 1;
        continue;
      }
      const parsedEntry = parsed.entry;
      const key = `${parsedEntry.reading}\t${parsedEntry.surface}`;
      const current = merged.get(key);
      if (!current || parsedEntry.cost < current.cost) {
        merged.set(key, parsedEntry);
      }
      readingSet.add(parsedEntry.reading);
      if (Object.prototype.hasOwnProperty.call(sampleReadingHits, parsedEntry.reading)) {
        sampleReadingHits[parsedEntry.reading] += 1;
      }
    }
  }

  return {
    entries: Array.from(merged.values()),
    stats: {
      uniqueReadings: readingSet.size,
      sampleReadingHits,
      sourceFileCount: files.length,
      skippedMalformedLines,
    },
  };
}

function writeShards(entries, mozcCommit) {
  ensureCleanDir(shardsDir);
  const grouped = new Map();

  for (const entry of entries) {
    const key = toShardKey(entry.reading);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({
      r: entry.reading,
      s: entry.surface,
      c: entry.cost,
      p: entry.posId,
    });
  }

  let shardCount = 0;
  let entryCount = 0;
  const manifestShards = [];

  const sortedKeys = Array.from(grouped.keys()).sort(compareCodePointStrings);
  for (const key of sortedKeys) {
    const list = grouped.get(key);
    list.sort(compareShardEntries);
    entryCount += list.length;
    const json = JSON.stringify(list);
    const gz = zlib.gzipSync(Buffer.from(json, 'utf-8'), { level: zlib.constants.Z_BEST_COMPRESSION });
    const file = toShardFilename(key);
    fs.writeFileSync(path.join(shardsDir, file), gz);
    const sha256 = crypto.createHash('sha256').update(gz).digest('hex');
    manifestShards.push({
      key,
      file,
      entryCount: list.length,
      sha256,
    });
    shardCount += 1;
  }

  const manifest = {
    source: 'mozc_dictionary_oss',
    mozcCommit,
    generatedAt: new Date().toISOString(),
    shardCount,
    entryCount,
    compression: 'gzip',
    formatVersion: 2,
    shards: manifestShards,
  };
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(
    path.join(outputRoot, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );

  return manifest;
}

function main() {
  const mozcCommit = resolveMozcCommit();
  const { entries, stats } = collectEntries();
  const manifest = writeShards(entries, mozcCommit);
  console.log('[ime:build-dict] done');
  console.log(`[ime:build-dict] inputDir=${inputDir}`);
  console.log(`[ime:build-dict] mozcCommit=${manifest.mozcCommit}`);
  console.log(
    `[ime:build-dict] sourceFiles=${stats.sourceFileCount} uniqueReadings=${stats.uniqueReadings}`,
  );
  console.log(
    `[ime:build-dict] skippedMalformedLines=${stats.skippedMalformedLines}`,
  );
  console.log(
    `[ime:build-dict] entries=${manifest.entryCount} shards=${manifest.shardCount}`,
  );
  for (const [reading, count] of Object.entries(stats.sampleReadingHits)) {
    console.log(`[ime:build-dict] sampleReading ${reading} hits=${count}`);
  }
}

main();
