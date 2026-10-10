import { KanaFallbackEngine } from './ime/KanaFallbackEngine.js';
import { ImeEngineError, normalizeCandidates, validateRequest } from './ime/ConversionEngine.js';
import { toHiragana } from './ime/textUtils.js';

const emptyState = (sessionId = '', revision = 0) => ({
  sessionId, revision, rawKana: '', segments: [], candidates: [],
  candidateIndex: 0, isConverting: false, preedit: '', selectedCandidate: '',
});

/** One keyboard composition; asynchronous results must match the current input. */
export class JapaneseConversionService {
  /** @param {import('./ime/ConversionEngine.js').ConversionEngine} engine */
  constructor(engine = new KanaFallbackEngine()) {
    this.engine = engine;
    this.fallback = new KanaFallbackEngine();
    this.state = emptyState();
    this.epoch = 0;
    this.disposed = false;
  }

  get status() {
    const status = this.engine.status;
    return this.fallbackReason
      ? { ...status, engine: 'kana', reason: this.fallbackReason } : status;
  }

  buildState() { return structuredClone(this.state); }

  checkTarget(target) {
    validateRequest({ ...target, text: '' });
    if (this.disposed) throw new ImeEngineError('disposed');
    if (target.sessionId !== this.state.sessionId || target.revision !== this.state.revision) {
      throw new ImeEngineError('stale-revision');
    }
  }

  async convert(kana, context) {
    const request = {
      sessionId: context?.sessionId, revision: context?.revision,
      text: typeof kana === 'string' ? toHiragana(kana) : kana,
      leftContext: context?.previousText ?? '',
    };
    validateRequest(request);
    if (this.disposed) throw new ImeEngineError('disposed');
    if (this.state.sessionId && (request.sessionId !== this.state.sessionId ||
        request.revision <= this.state.revision)) throw new ImeEngineError('stale-revision');
    const epoch = ++this.epoch;
    this.state = emptyState(request.sessionId, request.revision);
    if (!request.text) {
      await this.resetEngine(request.sessionId);
      if (epoch !== this.epoch) throw new ImeEngineError('superseded');
      return this.buildState();
    }
    let result;
    try {
      result = await this.engine.convert(request);
    } catch (error) {
      if (epoch !== this.epoch || this.disposed) throw new ImeEngineError('superseded');
      if (['superseded', 'cancelled', 'disposed', 'invalid-request'].includes(error.code)) throw error;
      this.fallbackReason = error.code ?? 'helper-unavailable';
      result = await this.fallback.convert(request);
    }
    if (epoch !== this.epoch || this.disposed) throw new ImeEngineError('superseded');
    if (result.sessionId !== request.sessionId || result.revision !== request.revision) {
      throw new ImeEngineError('invalid-result');
    }
    if (result.engine !== 'kana') this.fallbackReason = undefined;
    const candidates = normalizeCandidates(result.candidates, request.text);
    const selectedCandidate = candidates[0]?.text ?? request.text;
    this.state = {
      ...emptyState(request.sessionId, request.revision), rawKana: request.text,
      segments: [{ raw: request.text, candidates, selectedIndex: 0 }],
      candidates, isConverting: true, preedit: selectedCandidate, selectedCandidate,
      engine: result.engine, elapsedMs: result.elapsedMs,
    };
    return this.buildState();
  }

  async nextCandidate(target) {
    this.checkTarget(target);
    if (!this.state.isConverting) throw new ImeEngineError('no-candidates');
    this.select((this.state.candidateIndex + 1) % this.state.candidates.length);
    return this.buildState();
  }

  select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.state.candidates.length) {
      throw new ImeEngineError('invalid-candidate');
    }
    this.state.candidateIndex = index;
    this.state.segments[0].selectedIndex = index;
    this.state.selectedCandidate = this.state.preedit = this.state.candidates[index].text;
  }

  async commit(index, target) {
    this.checkTarget(target);
    if (!this.state.isConverting) throw new ImeEngineError('no-candidates');
    const selected = index === undefined ? this.state.candidateIndex : index;
    if (target.expectedText !== undefined &&
        target.expectedText !== this.state.candidates[selected]?.text) throw new ImeEngineError('stale-candidate');
    if (index !== undefined) this.select(index);
    const committed = this.state.selectedCandidate;
    ++this.epoch;
    this.state = emptyState(target.sessionId, target.revision);
    const state = this.buildState();
    await this.resetEngine(target.sessionId);
    return { committed, state };
  }

  async cancel(target) {
    validateRequest({ ...target, text: '' });
    if (this.disposed) throw new ImeEngineError('disposed');
    if (this.state.sessionId && (target.sessionId !== this.state.sessionId ||
        target.revision < this.state.revision)) throw new ImeEngineError('stale-revision');
    ++this.epoch;
    this.state = emptyState(target.sessionId, target.revision);
    const state = this.buildState();
    await this.resetEngine(target.sessionId);
    return state;
  }

  async resetEngine(sessionId) {
    const epoch = this.epoch;
    try { await this.engine.reset(sessionId); }
    catch (error) {
      if (epoch === this.epoch && !this.disposed) this.fallbackReason = error.code ?? 'helper-unavailable';
    }
  }

  releaseSession() {
    const sessionId = this.state.sessionId;
    ++this.epoch;
    this.state = emptyState();
    if (sessionId) return this.resetEngine(sessionId);
    return Promise.resolve();
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    ++this.epoch;
    this.state = emptyState();
    await Promise.allSettled([this.engine.dispose(), this.fallback.dispose()]);
  }
}

let instance;
export function getJapaneseConversionService() {
  return instance ??= new JapaneseConversionService();
}
export function configureJapaneseConversionService(engine) {
  if (instance) throw new Error('IME service already initialized');
  instance = new JapaneseConversionService(engine);
  return instance;
}
export function _resetJapaneseConversionServiceForTests() { instance = undefined; }
