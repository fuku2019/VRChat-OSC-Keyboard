import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
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

function toHiragana(text = '') {
  return String(text).replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  );
}

function isNumericToken(token = '') {
  return /^-?\d+$/.test(token);
}

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const cols = trimmed.split('\t');
  if (cols.length < 2) return null;

  const reading = toHiragana(cols[0] || '').trim();
  if (!reading) return null;

  let surface = '';
  if (cols.length >= 2 && !isNumericToken(cols[1])) {
    surface = cols[1];
  } else {
    surface = cols[cols.length - 1];
  }
  surface = String(surface || '').trim();
  if (!surface) return null;

  const costCandidates = cols
    .map((col) => Number.parseInt(col, 10))
    .filter((n) => Number.isFinite(n));
  const cost = costCandidates.length > 0 ? costCandidates[costCandidates.length - 1] : 5000;
  const posId = costCandidates.length > 1 ? costCandidates[0] : 0;

  return { reading, surface, cost, posId };
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
  const sampleReadingHits = Object.fromEntries(
    SAMPLE_READINGS.map((reading) => [reading, 0]),
  );

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseLine(line);
      if (!parsed) continue;
      const key = `${parsed.reading}\t${parsed.surface}`;
      const current = merged.get(key);
      if (!current || parsed.cost < current.cost) {
        merged.set(key, parsed);
      }
      readingSet.add(parsed.reading);
      if (Object.prototype.hasOwnProperty.call(sampleReadingHits, parsed.reading)) {
        sampleReadingHits[parsed.reading] += 1;
      }
    }
  }

  return {
    entries: Array.from(merged.values()),
    stats: {
      uniqueReadings: readingSet.size,
      sampleReadingHits,
      sourceFileCount: files.length,
    },
  };
}

function writeShards(entries) {
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

  for (const [key, list] of grouped.entries()) {
    list.sort((a, b) => {
      if (a.r !== b.r) return a.r.localeCompare(b.r, 'ja');
      if (a.s !== b.s) return a.s.localeCompare(b.s, 'ja');
      return a.c - b.c;
    });
    entryCount += list.length;
    const json = JSON.stringify(list);
    const gz = zlib.gzipSync(Buffer.from(json, 'utf-8'), { level: zlib.constants.Z_BEST_COMPRESSION });
    fs.writeFileSync(path.join(shardsDir, toShardFilename(key)), gz);
    shardCount += 1;
  }

  const manifest = {
    source: 'mozc_dictionary_oss',
    mozcCommit: process.env.MOZC_COMMIT || 'master',
    generatedAt: new Date().toISOString(),
    shardCount,
    entryCount,
    compression: 'gzip',
    formatVersion: 1,
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
  const { entries, stats } = collectEntries();
  const manifest = writeShards(entries);
  console.log('[ime:build-dict] done');
  console.log(`[ime:build-dict] inputDir=${inputDir}`);
  console.log(
    `[ime:build-dict] sourceFiles=${stats.sourceFileCount} uniqueReadings=${stats.uniqueReadings}`,
  );
  console.log(
    `[ime:build-dict] entries=${manifest.entryCount} shards=${manifest.shardCount}`,
  );
  for (const [reading, count] of Object.entries(stats.sampleReadingHits)) {
    console.log(`[ime:build-dict] sampleReading ${reading} hits=${count}`);
  }
}

main();
