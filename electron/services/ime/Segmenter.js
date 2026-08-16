// Greedy longest-match segmenter for kana reading input / かな読みの貪欲最長一致セグメンター
import { toHiragana } from './textUtils.js';

// Splits a kana reading into segments using a dictionary provider.
// Only segment boundaries are decided here; candidate lookup is left to the
// caller (JapaneseConversionService), which needs the fallback chain anyway.
// Building candidates here too meant every conversion queried the dictionary
// and the learning store twice.
// 辞書プロバイダーを使用してかな読みをセグメントに分割する。
// ここで決めるのは区切り位置のみで、候補の取得はフォールバック連鎖を持つ
// 呼び出し側（JapaneseConversionService）に任せる。
// ここでも候補を作ると、1回の変換で辞書と学習ストアを2度引くことになる。
export class Segmenter {
  constructor(provider, options = {}) {
    this.provider = provider;
    this.maxLength = options.maxLength || 8; // Max characters per segment / セグメントあたりの最大文字数
  }

  // Segment reading string into dictionary-matched chunks / 読み文字列を辞書一致チャンクに分割
  segment(reading, _context = {}) {
    const normalized = toHiragana(reading);
    if (!normalized) return [];

    const segments = [];
    let cursor = 0;

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

      segments.push({ raw: normalized.slice(cursor, cursor + matchedLength) });
      cursor += matchedLength;
    }

    return segments;
  }
}
