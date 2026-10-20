import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { HelperProcessService } from '../HelperProcessService.js';
import { ZenzaiEngine } from '../ZenzaiEngine.js';
import { KanaFallbackEngine } from '../KanaFallbackEngine.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const request = (revision = 1, sessionId = 'keyboard') => ({ sessionId, revision, text: 'にほんご' });
const outcome = (promise) => promise.then((value) => ({ value }), (error) => ({ error }));
const ready = { v: 1, type: 'ready', engine: 'zenzai' };

function setup(t, options = {}) {
  const children = [];
  let spawnOptions;
  const client = new HelperProcessService({ executable: process.execPath,
    restartDelaysMs: [], requestTimeoutMs: 500, readyTimeoutMs: 500,
    shutdownTimeoutMs: 10, ...options,
    spawnProcess: (_exe, _args, config) => {
      spawnOptions = config;
      const child = new EventEmitter();
      Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(),
        writes: [], exitCode: null, signalCode: null });
      child.stdin = new Writable({ write(chunk, _encoding, callback) {
        child.writes.push(JSON.parse(chunk.toString()));
        callback(options.writeError ? new Error('write failed') : undefined);
      } });
      child.kill = () => { child.exitCode = 1; queueMicrotask(() => child.emit('exit', 1)); };
      children.push(child);
      if (options.autoReady !== false) queueMicrotask(() => send(child, ready));
      return child;
    },
  });
  t.after(() => client.dispose());
  return { client, children, get child() { return children.at(-1); }, get spawnOptions() { return spawnOptions; } };
}

function send(child, message) { child.stdout.write(`${JSON.stringify(message)}\n`); }
function reply(child, index = child.writes.length - 1, extra = {}) {
  const message = child.writes[index];
  send(child, { ...message, type: message.type === 'reset' ? 'reset' : 'result',
    engine: 'zenzai', candidates: [{ text: '日本語' }], elapsedMs: 3, ...extra });
}

test('absolute executable required', () => {
  assert.throws(() => new HelperProcessService({ executable: 'helper.exe' }), { code: 'invalid-path' });
});

test('real child: UTF-8, CRLF, ranking, kana fallback, reset and shutdown', async () => {
  const client = new HelperProcessService({ executable: process.execPath,
    args: [fileURLToPath(new URL('./fake-helper.mjs', import.meta.url))], restartDelaysMs: [] });
  const engine = new ZenzaiEngine(client);
  try {
    const result = await engine.convert(request());
    assert.deepEqual(result.candidates, [{ text: '日本語' }, { text: 'にほんご' }]);
    assert.equal(result.engine, 'azookey');
    await engine.reset('keyboard');
  } finally { await engine.dispose(); }
  assert.equal(engine.status.state, 'stopped');
});

test('spawn is hidden, shell-free and uses piped streams', async (t) => {
  const s = setup(t);
  await s.client.start();
  assert.equal(s.spawnOptions.shell, false);
  assert.equal(s.spawnOptions.windowsHide, true);
  assert.deepEqual(s.spawnOptions.stdio, ['pipe', 'pipe', 'pipe']);
});

test('one executing and one latest waiting conversion; all promises terminate', async (t) => {
  const s = setup(t);
  await s.client.start();
  const first = s.client.convert(request(1));
  await tick();
  const middle = outcome(s.client.convert(request(2)));
  const last = s.client.convert(request(3));
  assert.equal((await middle).error.code, 'superseded');
  assert.equal(s.child.writes.length, 1);
  reply(s.child);
  assert.equal((await first).revision, 1);
  assert.equal(s.child.writes.length, 2);
  reply(s.child);
  assert.equal((await last).revision, 3);
});

test('latest-only scheduling also applies before ready', async (t) => {
  const s = setup(t, { autoReady: false });
  const first = outcome(s.client.convert(request(1)));
  const last = s.client.convert(request(2));
  assert.equal((await first).error.code, 'superseded');
  send(s.child, ready);
  assert.equal(s.child.writes[0].revision, 2);
  reply(s.child);
  assert.equal((await last).revision, 2);
});

test('reset cancels active and queued session, then forms a barrier before newer conversion', async (t) => {
  const s = setup(t);
  await s.client.start();
  const first = outcome(s.client.convert(request(1)));
  const waiting = outcome(s.client.convert(request(2)));
  const reset = s.client.reset('keyboard');
  const last = s.client.convert(request(3));
  assert.equal((await first).error.code, 'cancelled');
  assert.equal((await waiting).error.code, 'cancelled');
  reply(s.child); // Cancelled in-flight inference must finish before reset is sent.
  assert.equal(s.child.writes[1].type, 'reset');
  reply(s.child);
  await reset;
  assert.equal(s.child.writes[2].revision, 3);
  reply(s.child);
  assert.equal((await last).revision, 3);
});

test('reset before ready prevents old conversion from being sent', async (t) => {
  const s = setup(t, { autoReady: false });
  const old = outcome(s.client.convert(request()));
  const reset = s.client.reset('keyboard');
  assert.equal((await old).error.code, 'cancelled');
  send(s.child, ready);
  assert.equal(s.child.writes[0].type, 'reset');
  reply(s.child);
  await reset;
});

test('reset of another session does not cancel active conversion', async (t) => {
  const s = setup(t);
  await s.client.start();
  const conversion = s.client.convert(request());
  const reset = s.client.reset('settings');
  reply(s.child);
  assert.equal((await conversion).revision, 1);
  reply(s.child);
  await reset;
});

for (const [name, chunk, code] of [
  ['bad JSON', Buffer.from('{bad}\n'), 'transport'],
  ['invalid UTF-8', Buffer.from([0xff, 10]), 'transport'],
  ['oversized line', Buffer.alloc(1025, 97), 'line-too-large'],
  ['version mismatch', Buffer.from('{"v":2,"type":"ready"}\n'), 'protocol-version'],
]) {
  test(name + ' terminates startup', async (t) => {
    const s = setup(t, { autoReady: false, maxLineBytes: 1024 });
    const result = outcome(s.client.start());
    s.child.stdout.write(chunk);
    assert.equal((await result).error.code, code);
    assert.equal(s.client.status.state, 'failed');
  });
}

test('split UTF-8, multiple lines and blank candidate normalization', async (t) => {
  const s = setup(t, { autoReady: false });
  const result = new ZenzaiEngine(s.client).convert(request());
  send(s.child, ready);
  const bytes = Buffer.from(JSON.stringify({ ...s.child.writes[0], type: 'result',
    engine: 'zenzai', candidates: [{ text: '' }, { text: '日本語' }], elapsedMs: 1 }) + '\r\n');
  for (const byte of bytes) s.child.stdout.write(Buffer.from([byte]));
  assert.deepEqual((await result).candidates, [{ text: '日本語' }, { text: 'にほんご' }]);
});

test('response mismatch kills generation without accepting stale result', async (t) => {
  const s = setup(t);
  await s.client.start();
  const result = outcome(s.client.convert(request()));
  reply(s.child, 0, { revision: 99 });
  assert.equal((await result).error.code, 'response-mismatch');
});

test('helper errors terminate request and allow next conversion', async (t) => {
  const s = setup(t);
  await s.client.start();
  const first = outcome(s.client.convert(request()));
  reply(s.child, 0, { type: 'error', code: 'model-unavailable' });
  assert.equal((await first).error.code, 'model-unavailable');
  const next = s.client.convert(request(2));
  reply(s.child);
  assert.equal((await next).revision, 2);
});

test('status follows per-request fallback and recovery', async (t) => {
  const s = setup(t);
  await s.client.start();
  const fallback = s.client.convert(request());
  reply(s.child, 0, { engine: 'azookey', reason: 'inference-failed' });
  await fallback;
  assert.deepEqual(s.client.status, { state: 'ready', engine: 'azookey', reason: 'inference-failed' });
  const recovery = s.client.convert(request(2));
  reply(s.child);
  await recovery;
  assert.equal(s.client.status.engine, 'zenzai');
  assert.equal(s.client.status.reason, undefined);
});

for (const mode of ['exit', 'timeout', 'write']) {
  test(mode + ' terminates active and waiting requests', async (t) => {
    const s = setup(t, { requestTimeoutMs: 15, writeError: mode === 'write' });
    await s.client.start();
    const first = outcome(s.client.convert(request(1)));
    const second = outcome(s.client.convert(request(2)));
    if (mode === 'exit') s.child.emit('exit', 5);
    assert.ok((await first).error);
    assert.ok((await second).error);
  });
}

test('ready timeout terminates conversion', async (t) => {
  const s = setup(t, { autoReady: false, readyTimeoutMs: 15 });
  assert.equal((await outcome(s.client.convert(request()))).error.code, 'ready-timeout');
});

test('restart rejects old generation callbacks; retry budget is bounded', async (t) => {
  const s = setup(t, { restartDelaysMs: [1, 1, 1] });
  await s.client.start();
  const old = s.child;
  const first = outcome(s.client.convert(request()));
  old.emit('exit', 1);
  assert.equal((await first).error.code, 'exit');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(s.children.length, 2);
  old.stdout.write('invalid old bytes\n');
  old.emit('error', new Error('old error'));
  const next = s.client.convert(request(2));
  reply(s.child);
  assert.equal((await next).revision, 2);
  for (let i = 0; i < 3; i++) {
    s.child.emit('exit', 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(s.children.length, 4);
  assert.equal(s.client.status.state, 'failed');
});

test('dispose settles all pending work and forbids restart', async (t) => {
  const s = setup(t, { restartDelaysMs: [5] });
  await s.client.start();
  const first = outcome(s.client.convert(request()));
  const second = outcome(s.client.convert(request(2)));
  await s.client.dispose();
  assert.equal((await first).error.code, 'disposed');
  assert.equal((await second).error.code, 'disposed');
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(s.children.length, 1);
  assert.equal((await outcome(s.client.convert(request()))).error.code, 'disposed');
});

test('kana engine never constructs legacy providers and accepts empty reading', async () => {
  const engine = new KanaFallbackEngine();
  assert.deepEqual((await engine.convert(request())).candidates, [{ text: 'にほんご' }]);
  assert.deepEqual((await engine.convert({ ...request(), text: '' })).candidates, []);
  assert.equal(engine.status.engine, 'kana');
  await engine.dispose();
  assert.equal((await outcome(engine.convert(request()))).error.code, 'disposed');
});

test('request validation rejects invalid sessions, revisions and oversized inputs', async (t) => {
  const s = setup(t);
  for (const invalid of [null, { ...request(), sessionId: '' },
    { ...request(), revision: -1 }, { ...request(), revision: 1.5 },
    { ...request(), text: 'a'.repeat(4097) }, { ...request(), leftContext: 42 }]) {
    assert.equal((await outcome(s.client.convert(invalid))).error.code, 'invalid-request');
  }
  assert.equal(s.children.length, 0);
});

test('invalid result fields never resolve as successful conversions', async (t) => {
  for (const invalid of [{ engine: 'mozc' }, { elapsedMs: -1 },
    { candidates: [{ text: 42 }] }, { candidates: Array(129).fill({ text: 'a' }) }]) {
    const s = setup(t);
    await s.client.start();
    const result = outcome(s.client.convert(request()));
    reply(s.child, 0, invalid);
    assert.equal((await result).error.code, 'invalid-result');
  }
});

test('duplicate ready is a protocol failure', async (t) => {
  const s = setup(t);
  await s.client.start();
  send(s.child, ready);
  assert.equal(s.client.status.reason, 'invalid-ready');
});

test('multiple complete lines in one chunk are handled sequentially', async (t) => {
  const s = setup(t);
  await s.client.start();
  const first = s.client.convert(request(1));
  const second = s.client.convert(request(2));
  const a = s.child.writes[0];
  const b = { ...request(2), v: 1, type: 'convert', id: a.id + 1 };
  const result = (message) => ({ ...message, type: 'result', engine: 'azookey',
    elapsedMs: 0, candidates: [{ text: '日本語' }] });
  s.child.stdout.write(`${JSON.stringify(result(a))}\n${JSON.stringify(result(b))}\n`);
  assert.equal((await first).revision, 1);
  assert.equal((await second).revision, 2);
});

test('stdin backpressure does not duplicate a buffered request', async (t) => {
  const s = setup(t);
  await s.client.start();
  // Hold the stream callback so the write exceeds its highWaterMark.
  let finishWrite;
  const stream = new Writable({ highWaterMark: 1, write(chunk, _encoding, callback) {
    s.child.writes.push(JSON.parse(chunk.toString()));
    finishWrite = callback;
  } });
  s.child.stdin = stream;
  const first = s.client.convert(request());
  assert.equal(stream.writableNeedDrain, true);
  finishWrite();
  await tick();
  assert.equal(s.child.writes.length, 1);
  reply(s.child);
  await first;
  // Restore immediate callbacks for shutdown.
  stream._write = (_chunk, _encoding, callback) => callback();
});

test('reset queue has a hard bound and disposal ends every queued reset', async (t) => {
  const s = setup(t, { autoReady: false });
  const resets = Array.from({ length: 33 }, () => outcome(s.client.reset('keyboard')));
  assert.equal((await resets[32]).error.code, 'queue-full');
  await s.client.dispose();
  const results = await Promise.all(resets.slice(0, 32));
  assert.ok(results.every((result) => result.error.code === 'disposed'));
});

test('dispose during startup rejects ready waiters and cancels scheduled retry', async (t) => {
  const s = setup(t, { autoReady: false, restartDelaysMs: [1] });
  const started = outcome(s.client.start());
  await s.client.dispose();
  assert.equal((await started).error.code, 'disposed');
  await tick();
  assert.equal(s.children.length, 1);
});

test('dispose during backoff prevents a new child from being launched', async (t) => {
  const s = setup(t, { restartDelaysMs: [15] });
  await s.client.start();
  s.child.emit('exit', 1);
  await s.client.dispose();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(s.children.length, 1);
});
