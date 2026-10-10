import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { HelperProcessService } from '../electron/services/ime/HelperProcessService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.resolve(root, '.tools/ime-helper-package');
const samples = Number(process.env.IME_BENCH_SAMPLES ?? 30);
assert.ok(Number.isInteger(samples) && samples >= 3 && samples <= 1000);
const sha = (data) => createHash('sha256').update(data).digest('hex');
const corpusBytes = await readFile(path.join(root, 'docs/validation/ime-corpus-v1.json'));
const corpus = JSON.parse(corpusBytes);
const manifest = JSON.parse(await readFile(path.join(root, 'models/manifest.json'), 'utf8'));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
function summary(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, p50: null, p95: null, p99: null, max: null };
  const percentile = (q) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
  return { count: sorted.length, p50: percentile(.5), p95: percentile(.95),
    p99: percentile(.99), max: sorted.at(-1) };
}
function resources(pid) {
  // Outside timed requests. PeakWorkingSet64 is the OS lifetime high-water mark.
  const code = `$p=Get-Process -Id ${Number(pid)} -ErrorAction Stop; [pscustomobject]@{cpuMs=$p.TotalProcessorTime.TotalMilliseconds;workingSetBytes=$p.WorkingSet64;peakWorkingSetBytes=$p.PeakWorkingSet64;privateBytes=$p.PrivateMemorySize64}|ConvertTo-Json -Compress`;
  return JSON.parse(execFileSync('pwsh', ['-NoProfile', '-Command', code], { encoding: 'utf8', windowsHide: true }));
}
const report = {
  version: 1, startedAt: new Date().toISOString(), sourceRevision: git('rev-parse', 'HEAD'),
  sourceDirty: Boolean(git('status', '--porcelain')), corpusSha256: sha(corpusBytes),
  stageManifestSha256: sha(await readFile(path.join(stage, 'stage-manifest.json'))),
  helperSha256: sha(await readFile(path.join(stage, 'ZenzaiHelper.exe'))),
  host: { platform: process.platform, release: os.release(), architecture: os.arch(),
    cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem(), node: process.version },
  runningVrProcesses: JSON.parse(execFileSync('pwsh', ['-NoProfile', '-Command',
    '$names=@(Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.ProcessName -match "^(VRChat|vrserver|vrcompositor|steam_link)$"} | Select-Object -ExpandProperty ProcessName); ConvertTo-Json -InputObject $names -Compress'],
  { encoding: 'utf8', windowsHide: true })),
  methodology: {
    samplesPerCase: samples, startupTrials: 3, traceTrialsPerDebounce: 3,
    requestTimeoutMs: 10000, productionRequestTimeoutMs: 2000,
    startup: 'Process spawn to ready includes dictionary initialization, model load and warm-up; OS file cache is NOT flushed.',
    conversion: 'Fresh composition after reset, same persistent model. Two workloads: cached-replay rotates fixed cases; distinct-context appends 第N回の会話。 to leftContext per iteration (N starts at 1). Internal caches remain enabled. elapsedMs is helper conversion; roundTripMs includes JSONL/service overhead, not Electron IPC.',
    trace: 'Real Node timer debounce and helper queue; stopToResultMs ends at service receipt, NOT React paint/VR display. Stale responses are recorded but excluded from current-result latency.',
    resources: 'Process CPU delta over warm conversions and trace phase, divided by wall time and logical CPU count. Lifetime peak working set includes startup; end private bytes are not peak RAM.',
    unmeasured: ['model load separate from first warm-up inference', 'Electron IPC alone', 'input stop to UI/VR paint', 'VRChat/SteamVR frame time', 'uncached disk cold start'],
  }, models: [],
};
const output = path.join(root, '.tools/ime-benchmark-results.json');
await mkdir(path.dirname(output), { recursive: true });
const save = () => writeFile(output, JSON.stringify(report, null, 2) + '\n');
let revision = 0;
async function convert(client, text, leftContext = '') {
  const begin = performance.now();
  try {
    const result = await client.convert({ sessionId: 'benchmark', revision: ++revision, text, leftContext });
    return { roundTripMs: performance.now() - begin, helperMs: result.elapsedMs,
      engine: result.engine, reason: result.reason ?? null, candidate: result.candidates[0]?.text ?? '' };
  } catch (error) {
    return { roundTripMs: performance.now() - begin, error: error.code ?? error.message };
  }
}
async function trace(client, debounceMs, trial) {
  await client.reset('benchmark');
  const begin = performance.now();
  const requests = [];
  let timer, latest = -1, lastEdit;
  for (const [index, event] of corpus.trace.entries()) {
    await delay(Math.max(0, begin + event.atMs - performance.now()));
    clearTimeout(timer);
    latest = index;
    lastEdit = performance.now();
    const editTime = lastEdit;
    timer = setTimeout(() => {
      requests.push(convert(client, event.text, `待機${debounceMs}、第${trial + 1}回の会話。`).then((result) => ({
        index, scheduledAtMs: event.atMs, stopToResultMs: performance.now() - editTime,
        currentAtReceipt: latest === index, ...result,
      })));
    }, debounceMs);
  }
  await delay(Math.max(0, lastEdit + debounceMs + 5 - performance.now()));
  // The final timer has fired; all conversion promises are handled immediately.
  const results = await Promise.all(requests);
  assert.ok(results.some((item) => item.index === corpus.trace.length - 1), 'final trace request emitted');
  return results;
}
try {
  for (const model of manifest.models) {
    const filename = path.join(root, '.tools/models', model.id, model.filename);
    const bytes = await readFile(filename);
    assert.equal(bytes.length, model.bytes);
    assert.equal(sha(bytes), model.sha256);
    const record = { id: model.id, sha256: model.sha256, startups: [], cases: [], traces: [] };
    report.models.push(record);
    for (let trial = 0; trial < 3; trial++) {
      let stderr = '';
      const client = new HelperProcessService({ executable: path.join(stage, 'ZenzaiHelper.exe'), cwd: stage,
        args: [path.join(stage, 'Dictionary'), filename], requestTimeoutMs: 10000, restartDelaysMs: [],
        log: (chunk) => { stderr = (stderr + chunk).slice(-2 * 1024 * 1024); } });
      try {
        const start = performance.now();
        await client.start();
        assert.equal(client.status.engine, 'zenzai', 'startup must use neural engine');
        record.startups.push({ readyMs: performance.now() - start, firstUser: await convert(client, corpus.cases[0].text) });
        console.log(`${model.id}: startup ${trial + 1}/3`);
        if (trial !== 2) continue;
        const before = resources(client.child.pid);
        const phaseStart = performance.now();
        for (const workload of ['cached-replay', 'distinct-context']) {
          const batches = corpus.cases.map((item) => ({ item, measurements: [] }));
          for (let i = 0; i < samples; i++) {
            for (const batch of batches) {
              await client.reset('benchmark');
              const context = batch.item.leftContext + (workload === 'distinct-context' ? `第${i + 1}回の会話。` : '');
              batch.measurements.push(await convert(client, batch.item.text, context));
            }
            if ((i + 1) % 10 === 0) console.log(`${model.id}: ${workload} ${i + 1}/${samples}`);
          }
          for (const { item, measurements } of batches) {
          const successful = measurements.filter((value) => !value.error && value.engine === 'zenzai');
          record.cases.push({ id: item.id, workload, measurements, neuralSuccesses: successful.length,
            helperMs: summary(successful.map((value) => value.helperMs)),
            roundTripMs: summary(successful.map((value) => value.roundTripMs)),
            failuresOrFallbacks: measurements.filter((value) => value.error || value.engine !== 'zenzai').length });
          console.log(`${model.id}: ${item.id} ${successful.length}/${samples}, p95=${record.cases.at(-1).roundTripMs.p95} ms`);
          await save();
          }
        }
        for (const debounceMs of [50, 75, 100]) {
          const trials = [];
          for (let i = 0; i < 3; i++) trials.push(await trace(client, debounceMs, i));
          const current = trials.flat().filter((value) => value.currentAtReceipt && !value.error && value.engine === 'zenzai');
          record.traces.push({ debounceMs, trials, stopToResultMs: summary(current.map((value) => value.stopToResultMs)),
            failuresOrFallbacks: trials.flat().filter((value) => value.error || value.engine !== 'zenzai').length });
          console.log(`${model.id}: debounce ${debounceMs}, p95=${record.traces.at(-1).stopToResultMs.p95} ms`);
          await save();
        }
        const phaseWallMs = performance.now() - phaseStart;
        const after = resources(client.child.pid);
        record.resources = { before, after, phaseWallMs, cpuDeltaMs: after.cpuMs - before.cpuMs,
          averageMachineCpuPercent: 100 * (after.cpuMs - before.cpuMs) / phaseWallMs / os.cpus().length };
      } finally {
        await client.dispose();
        const diagnostics = stderr.split(/\r?\n/).filter((line) => line.startsWith('{"imeDiagnostics"'))
          .map((line) => JSON.parse(line).imeDiagnostics);
        record.startups[trial].diagnostics = { first: diagnostics[0], last: diagnostics.at(-1) };
      }
    }
    record.readyMs = summary(record.startups.map((value) => value.readyMs));
    record.firstUserRoundTripMs = summary(record.startups.map((value) => value.firstUser.roundTripMs));
    await save();
  }
  report.completedAt = new Date().toISOString();
} catch (error) {
  report.fatalError = error.stack;
  process.exitCode = 1;
} finally { await save(); }
console.log(output);
