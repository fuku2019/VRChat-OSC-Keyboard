import { validateRequest, normalizeCandidates } from './ConversionEngine.js';

// Transport failures remain errors. The facade chooses the kana fallback;
// dictionary fallback is reported by the helper as engine: 'azookey'.
export class ZenzaiEngine {
  constructor(client) { this.client = client; }
  get status() { return this.client.status; }

  async convert(request) {
    validateRequest(request);
    const result = await this.client.convert(request);
    return { ...result, candidates: normalizeCandidates(result.candidates, request.text) };
  }

  async reset(sessionId) { await this.client.reset(sessionId); }
  async dispose() { await this.client.dispose(); }
}
