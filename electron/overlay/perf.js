/**
 * Capture pipeline instrumentation / キャプチャパイプラインの計測
 *
 * Enabled only by the `--perf-log` launch flag. Every entry point returns
 * immediately when disabled and never calls performance.now(), so the default
 * build pays nothing for having this in the hot path.
 * `--perf-log` 起動フラグでのみ有効化される。無効時はすべての入口が即座に return
 * し performance.now() も呼ばないため、ホットパスに置いても既定ビルドのコストは
 * ゼロである。
 */

const FLUSH_INTERVAL_MS = 1000;
const MAX_SAMPLES = 2048;

let enabled = false;
let flushTimer = null;
let windowStartedAt = 0;
let lastFrameAt = 0;
let frameCount = 0;
let dropCount = 0;
const dropReasons = new Map();
/** @type {Map<string, number[]>} */
const stages = new Map();

function sampleBucket(name) {
  let bucket = stages.get(name);
  if (!bucket) {
    bucket = [];
    stages.set(name, bucket);
  }
  return bucket;
}

function push(name, value) {
  const bucket = sampleBucket(name);
  if (bucket.length >= MAX_SAMPLES) return;
  bucket.push(value);
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index];
}

function formatStage(name) {
  const bucket = stages.get(name);
  if (!bucket || bucket.length === 0) return null;
  const sorted = [...bucket].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5).toFixed(2);
  const p95 = percentile(sorted, 0.95).toFixed(2);
  const p99 = percentile(sorted, 0.99).toFixed(2);
  return `${name} p50=${p50} p95=${p95} p99=${p99}`;
}

function resetWindow(now) {
  windowStartedAt = now;
  frameCount = 0;
  dropCount = 0;
  dropReasons.clear();
  stages.clear();
}

function flush() {
  if (!enabled) return;
  const now = performance.now();
  const elapsed = now - windowStartedAt;
  if (elapsed <= 0) return;

  const fps = (frameCount / elapsed) * 1000;
  const parts = [`[perf] fps=${fps.toFixed(1)}`];
  for (const name of ['frame', 'total', 'bitmap', 'submit', 'import']) {
    const formatted = formatStage(name);
    if (formatted) parts.push(formatted);
  }
  if (dropCount > 0) {
    const reasons = [...dropReasons.entries()]
      .map(([reason, count]) => `${reason}:${count}`)
      .join(',');
    parts.push(`drops=${dropCount}(${reasons})`);
  }
  console.log(parts.join('  '));

  resetWindow(now);
}

/**
 * Turn measurement on or off. Enabling installs the only timer this module
 * ever creates; disabling removes it.
 * 計測の有効/無効を切り替える。有効化時にこのモジュール唯一のタイマーを設置し、
 * 無効化時に破棄する。
 */
export function setPerfLogEnabled(value) {
  const next = Boolean(value);
  if (next === enabled) return;
  enabled = next;

  if (enabled) {
    resetWindow(performance.now());
    lastFrameAt = 0;
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
    if (typeof flushTimer.unref === 'function') flushTimer.unref();
    console.log('[perf] capture instrumentation enabled');
    return;
  }

  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  resetWindow(0);
  lastFrameAt = 0;
}

export function isPerfLogEnabled() {
  return enabled;
}

/**
 * Timestamp source for callers. Returns 0 while disabled so that callers can
 * pass the result straight back into recordStage() without branching twice.
 * 呼び出し側用のタイムスタンプ。無効時は 0 を返すので、呼び出し側は分岐を重ねずに
 * そのまま recordStage() へ渡せる。
 */
export function perfNow() {
  return enabled ? performance.now() : 0;
}

/**
 * Record how long a stage took, given the value perfNow() returned before it.
 * perfNow() が返した値を渡して、その区間の所要時間を記録する。
 */
export function recordStage(name, startedAt) {
  if (!enabled || startedAt === 0) return;
  push(name, performance.now() - startedAt);
}

/**
 * Record one delivered frame and the interval since the previous one.
 * 1フレームの到達と、前フレームからの間隔を記録する。
 */
export function recordFrame() {
  if (!enabled) return;
  const now = performance.now();
  if (lastFrameAt !== 0) push('frame', now - lastFrameAt);
  lastFrameAt = now;
  frameCount += 1;
}

/**
 * Record a frame that was skipped, with the reason for the skip.
 * 破棄されたフレームと、その理由を記録する。
 */
export function recordDrop(reason) {
  if (!enabled) return;
  dropCount += 1;
  dropReasons.set(reason, (dropReasons.get(reason) ?? 0) + 1);
}
