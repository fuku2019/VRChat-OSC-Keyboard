import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { ImeEngineError, validateRequest } from './ConversionEngine.js';

const VERSION = 1;
const ENGINES = new Set(['zenzai', 'azookey', 'kana']);

/** Owns one helper generation, one executing request and one waiting conversion. */
export class HelperProcessService {
  constructor({ executable, args = [], cwd, spawnProcess = spawn,
    readyTimeoutMs = 30_000, requestTimeoutMs = 2_000, shutdownTimeoutMs = 1_000,
    maxLineBytes = 1024 * 1024, restartDelaysMs = [1000, 2000, 4000],
    restartWindowMs = 60_000, log = () => {} }) {
    if (!isAbsolute(executable) || (cwd && !isAbsolute(cwd))) {
      throw new ImeEngineError('invalid-path', 'Helper paths must be absolute');
    }
    Object.assign(this, { executable, args, cwd, spawnProcess, readyTimeoutMs,
      requestTimeoutMs, shutdownTimeoutMs, maxLineBytes, restartDelaysMs,
      restartWindowMs, log });
    this.generation = 0;
    this.nextId = 1;
    this.currentStatus = { state: 'idle' };
    this.resets = [];
    this.restarts = [];
    this.disposed = false;
  }

  get status() { return { ...this.currentStatus }; }

  start() {
    if (this.disposed) return Promise.reject(new ImeEngineError('disposed'));
    if (this.currentStatus.state === 'ready') return Promise.resolve(this.status);
    if (this.startPromise) return this.startPromise;
    if (this.restartTimer || this.currentStatus.state === 'failed') {
      return Promise.reject(new ImeEngineError('unavailable'));
    }
    this.currentStatus = { state: 'starting' };
    this.startPromise = new Promise((resolve, reject) => {
      this.startResolve = resolve;
      this.startReject = reject;
    });
    const promise = this.startPromise;
    const generation = ++this.generation;
    this.bytes = Buffer.alloc(0);
    try {
      const child = this.spawnProcess(this.executable, this.args, {
        cwd: this.cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.child = child;
      const fail = (error) => this.fail(error, generation);
      child.on('error', fail);
      child.on('exit', (code, signal) => fail(new ImeEngineError('exit', `Helper exit: ${code ?? signal}`)));
      child.stdin.on('error', fail);
      child.stdout.on('error', fail);
      child.stderr.on('error', fail);
      child.stdout.on('data', (chunk) => {
        if (generation !== this.generation || this.disposed) return;
        try { this.read(chunk); } catch (error) { fail(error); }
      });
      child.stderr.on('data', (chunk) => {
        if (generation === this.generation && !this.disposed) {
          // Bound individual log entries; stderr never enters the protocol parser.
          try { this.log(chunk.toString('utf8').slice(0, 4096)); } catch { /* logging is optional */ }
        }
      });
      this.readyTimer = setTimeout(() => fail(new ImeEngineError('ready-timeout')), this.readyTimeoutMs);
    } catch (error) { this.fail(error, generation); }
    return promise;
  }

  async convert(request) {
    validateRequest(request);
    if (this.disposed) throw new ImeEngineError('disposed');
    return new Promise((resolve, reject) => {
      if (this.waiting) this.settle(this.waiting, new ImeEngineError('superseded'));
      const entry = { type: 'convert', request: { ...request }, resolve, reject };
      this.waiting = entry;
      this.start().then(() => this.pump(), (error) => {
        this.settle(entry, error);
        if (this.waiting === entry) this.waiting = undefined;
      });
      this.pump();
    });
  }

  async reset(sessionId) {
    validateRequest({ sessionId, revision: 0, text: '' });
    if (this.disposed) throw new ImeEngineError('disposed');
    // Invalidate synchronously, including conversions queued before ready.
    if (this.waiting?.request.sessionId === sessionId) {
      this.settle(this.waiting, new ImeEngineError('cancelled'));
      this.waiting = undefined;
    }
    if (this.active?.request.sessionId === sessionId) {
      this.settle(this.active, new ImeEngineError('cancelled'));
    }
    return new Promise((resolve, reject) => {
      if (this.resets.length >= 32) return reject(new ImeEngineError('queue-full'));
      const entry = { type: 'reset', request: { sessionId }, resolve, reject };
      this.resets.push(entry);
      this.start().then(() => this.pump(), (error) => {
        this.settle(entry, error);
        this.resets = this.resets.filter((item) => item !== entry);
      });
      this.pump();
    });
  }

  pump() {
    if (this.active || this.disposed || this.currentStatus.state !== 'ready') return;
    const entry = this.resets.shift() ?? this.waiting;
    if (!entry) return;
    if (entry === this.waiting) this.waiting = undefined;
    this.active = entry;
    entry.id = this.nextId++;
    entry.timer = setTimeout(() => this.fail(new ImeEngineError('request-timeout'), this.generation),
      this.requestTimeoutMs);
    this.write({ ...entry.request, v: VERSION, type: entry.type, id: entry.id });
  }

  write(message) {
    const generation = this.generation;
    try {
      // A false return means Node buffered the write. Do not resend it on drain.
      this.child.stdin.write(`${JSON.stringify(message)}\n`, 'utf8', (error) => {
        if (error) this.fail(error, generation);
      });
    } catch (error) { this.fail(error, generation); }
  }

  read(chunk) {
    // Split bytes before decoding, retaining partial UTF-8 sequences between chunks.
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline < 0 ? chunk.length : newline;
      if (this.bytes.length + end - offset > this.maxLineBytes) {
        throw new ImeEngineError('line-too-large');
      }
      this.bytes = Buffer.concat([this.bytes, chunk.subarray(offset, end)]);
      if (newline < 0) return;
      const line = new TextDecoder('utf-8', { fatal: true }).decode(this.bytes);
      this.bytes = Buffer.alloc(0);
      this.receive(JSON.parse(line));
      offset = newline + 1;
    }
  }

  receive(message) {
    if (message.v !== VERSION) throw new ImeEngineError('protocol-version');
    if (message.type === 'ready') {
      if (this.currentStatus.state !== 'starting' || !ENGINES.has(message.engine)) {
        throw new ImeEngineError('invalid-ready');
      }
      clearTimeout(this.readyTimer);
      this.currentStatus = { state: 'ready', engine: message.engine, reason: message.reason };
      this.startResolve(this.status);
      this.clearStart();
      this.pump();
      return;
    }
    const entry = this.active;
    if (!entry || entry.id !== message.id) throw new ImeEngineError('unexpected-response');
    if (message.sessionId !== entry.request.sessionId ||
      (entry.type === 'convert' && message.revision !== entry.request.revision)) {
      throw new ImeEngineError('response-mismatch');
    }
    if (message.type === 'error') {
      if (typeof message.code !== 'string') throw new ImeEngineError('invalid-error');
      this.settle(entry, new ImeEngineError(message.code));
    } else if (entry.type === 'reset' && message.type === 'reset') {
      this.settle(entry, null);
    } else if (entry.type === 'convert' && message.type === 'result') {
      if (!ENGINES.has(message.engine) || !Number.isFinite(message.elapsedMs) || message.elapsedMs < 0 ||
          !Array.isArray(message.candidates) || message.candidates.length > 128 ||
          !message.candidates.every((item) => item && typeof item.text === 'string' && item.text.length <= 4096)) {
        throw new ImeEngineError('invalid-result');
      }
      this.settle(entry, null, {
        sessionId: message.sessionId, revision: message.revision, engine: message.engine,
        candidates: message.candidates, elapsedMs: message.elapsedMs,
      });
      this.currentStatus = { state: 'ready', engine: message.engine,
        reason: typeof message.reason === 'string' ? message.reason : undefined };
    } else { throw new ImeEngineError('unexpected-response'); }
    clearTimeout(entry.timer);
    this.active = undefined;
    this.pump();
  }

  settle(entry, error, value) {
    if (entry.settled) return;
    entry.settled = true;
    if (error) entry.reject(error); else entry.resolve(value);
  }

  clearStart() {
    this.startPromise = this.startResolve = this.startReject = undefined;
  }

  fail(error, generation) {
    if (generation !== this.generation || this.disposed) return;
    ++this.generation; // Old streams, exit callbacks and write callbacks are inert.
    clearTimeout(this.readyTimer);
    const failure = error instanceof ImeEngineError ? error : new ImeEngineError('transport', error.message);
    this.startReject?.(failure);
    this.clearStart();
    this.rejectAll(failure);
    this.child?.kill();
    this.child = undefined;
    this.currentStatus = { state: 'unavailable', reason: failure.code };
    const now = Date.now();
    this.restarts = this.restarts.filter((time) => now - time < this.restartWindowMs);
    if (this.restarts.length >= this.restartDelaysMs.length) {
      this.currentStatus.state = 'failed';
      return;
    }
    const delay = this.restartDelaysMs[this.restarts.length];
    this.restarts.push(now);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      this.start().catch(() => {}); // fail() owns retry accounting.
    }, delay);
  }

  rejectAll(error) {
    for (const entry of [this.active, this.waiting, ...this.resets]) {
      if (entry) { clearTimeout(entry.timer); this.settle(entry, error); }
    }
    this.active = this.waiting = undefined;
    this.resets = [];
  }

  async dispose() {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    ++this.generation;
    clearTimeout(this.restartTimer);
    clearTimeout(this.readyTimer);
    const error = new ImeEngineError('disposed');
    this.startReject?.(error);
    this.clearStart();
    this.rejectAll(error);
    this.currentStatus = { state: 'stopped' };
    const child = this.child;
    this.child = undefined;
    this.disposePromise = new Promise((resolve) => {
      if (!child || child.exitCode !== null || child.signalCode) return resolve();
      const timer = setTimeout(() => { child.kill(); resolve(); }, this.shutdownTimeoutMs);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      try {
        child.stdin.end(`${JSON.stringify({ v: VERSION, type: 'shutdown', id: this.nextId++ })}\n`);
      } catch { child.kill(); clearTimeout(timer); resolve(); }
    });
    return this.disposePromise;
  }
}
