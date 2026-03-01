// Greedy longest-match segmenter for kana reading input / かな読みの貪欲最長一致セグメンター
import { toHiragana } from './textUtils.js';

// Splits a kana reading into segments using a dictionary provider.
// 辞書プロバイダーを使用してかな読みをセグメントに分割する。
export class Segmenter {
  constructor(provider, options = {}) {
    this.provider = provider;
    this.maxLength = options.maxLength || 8; // Max characters per segment / セグメントあたりの最大文字数
  }

  // Segment reading string into dictionary-matched chunks / 読み文字列を辞書一致チャンクに分割
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

      // Try longest match first, shrink until a dictionary entry is found
      // 最長一致を最初に試し、辞書エントリが見つかるまで縮小
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
      // Ensure at least one fallback candidate exists / フォールバック候補が最低1つ存在することを保証
      const safeCandidates =
        candidates.length > 0
          ? candidates
          : [
              {
                text: raw,
                reading: raw,
                source: 'fallback',
                dictSource: 'fallback',
                score: 0,
              },
            ];

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
