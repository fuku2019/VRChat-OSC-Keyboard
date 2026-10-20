import { validateRequest, normalizeCandidates, ImeEngineError } from './ConversionEngine.js';

export class KanaFallbackEngine {
  constructor(reason = 'helper-unavailable') {
    this.reason = reason;
    this.disposed = false;
  }

  get status() {
    return { state: this.disposed ? 'stopped' : 'ready', engine: 'kana', reason: this.reason };
  }

  async convert(request) {
    validateRequest(request);
    if (this.disposed) throw new ImeEngineError('disposed');
    return {
      sessionId: request.sessionId, revision: request.revision, engine: 'kana',
      candidates: normalizeCandidates([], request.text), elapsedMs: 0,
    };
  }

  async reset() {}
  async dispose() { this.disposed = true; }
}
