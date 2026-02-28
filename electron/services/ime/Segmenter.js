import { toHiragana } from './textUtils.js';

export class Segmenter {
  constructor(provider, options = {}) {
    this.provider = provider;
    this.maxLength = options.maxLength || 8;
  }

  segment(reading, context = {}) {
    const normalized = toHiragana(reading);
    if (!normalized) return [];

    const segments = [];
    let cursor = 0;
    let previousWord = context.previousWord || '';

    while (cursor < normalized.length) {
      const remaining = normalized.length - cursor;
      const maxLen = Math.min(this.maxLength, remaining);
      let matchedLength = 1;

      for (let len = maxLen; len >= 1; len -= 1) {
        const chunk = normalized.slice(cursor, cursor + len);
        if (this.provider.hasReading(chunk)) {
          matchedLength = len;
          break;
        }
      }

      const raw = normalized.slice(cursor, cursor + matchedLength);
      const candidates = this.provider.getCandidates(raw, {
        ...context,
        previousWord,
      });
      const safeCandidates =
        candidates.length > 0
          ? candidates
          : [{ text: raw, reading: raw, source: 'fallback', dictSource: 'fallback', score: 0 }];

      segments.push({
        raw,
        candidates: safeCandidates,
        selectedIndex: 0,
      });

      previousWord = safeCandidates[0].text;
      cursor += matchedLength;
    }

    return segments;
  }
}
