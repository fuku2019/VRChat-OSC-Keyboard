/**
 * @typedef {{sessionId: string, revision: number, text: string, leftContext?: string}} ConversionRequest
 * @typedef {{sessionId: string, revision: number, engine: 'zenzai'|'azookey'|'kana',
 *   candidates: Array<{text: string}>, elapsedMs: number}} ConversionResult
 * @typedef {{state: string, engine?: string, reason?: string}} EngineStatus
 * @typedef {{convert(request: ConversionRequest): Promise<ConversionResult>,
 *   reset(sessionId: string): Promise<void>, dispose(): Promise<void>,
 *   readonly status: EngineStatus}} ConversionEngine
 */

export class ImeEngineError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ImeEngineError';
    this.code = code;
  }
}

export function validateRequest(request) {
  if (!request || typeof request.sessionId !== 'string' || !request.sessionId ||
      request.sessionId.length > 128 || !Number.isSafeInteger(request.revision) ||
      request.revision < 0 || typeof request.text !== 'string' || request.text.length > 4096 ||
      (request.leftContext !== undefined &&
        (typeof request.leftContext !== 'string' || request.leftContext.length > 4096))) {
    throw new ImeEngineError('invalid-request');
  }
}

// Preserve ranking; never put the kana fallback ahead of an engine candidate.
export function normalizeCandidates(candidates, reading) {
  const seen = new Set();
  return [...candidates, { text: reading }].filter((candidate) => {
    if (!candidate.text || seen.has(candidate.text)) return false;
    seen.add(candidate.text);
    return true;
  }).map(({ text }) => ({ text }));
}
