import { describe, it, expect } from 'vitest';
import { toKana, convertToKatakana } from './ime';

describe('toKana', () => {
  // Basic vowels / 基本母音
  describe('basic vowels / 基本母音', () => {
    it('converts "a" to "あ"', () => {
      const result = toKana('a', '');
      expect(result).toEqual({ output: 'あ', newBuffer: '' });
    });

    it('converts "i" to "い"', () => {
      const result = toKana('i', '');
      expect(result).toEqual({ output: 'い', newBuffer: '' });
    });

    it('converts "u" to "う"', () => {
      const result = toKana('u', '');
      expect(result).toEqual({ output: 'う', newBuffer: '' });
    });

    it('converts "e" to "え"', () => {
      const result = toKana('e', '');
      expect(result).toEqual({ output: 'え', newBuffer: '' });
    });

    it('converts "o" to "お"', () => {
      const result = toKana('o', '');
      expect(result).toEqual({ output: 'お', newBuffer: '' });
    });
  });

  // Basic consonant + vowel / 基本子音 + 母音
  describe('basic consonant + vowel / 基本子音 + 母音', () => {
    it('converts "ka" to "か"', () => {
      let result = toKana('k', '');
      expect(result).toEqual({ output: '', newBuffer: 'k' });
      result = toKana('a', result.newBuffer);
      expect(result).toEqual({ output: 'か', newBuffer: '' });
    });

    it('converts "shi" to "し"', () => {
      let result = toKana('s', '');
      result = toKana('h', result.newBuffer);
      result = toKana('i', result.newBuffer);
      expect(result).toEqual({ output: 'し', newBuffer: '' });
    });

    it('converts "tsu" to "つ"', () => {
      let result = toKana('t', '');
      result = toKana('s', result.newBuffer);
      result = toKana('u', result.newBuffer);
      expect(result).toEqual({ output: 'つ', newBuffer: '' });
    });

    it('converts "chi" to "ち"', () => {
      let result = toKana('c', '');
      result = toKana('h', result.newBuffer);
      result = toKana('i', result.newBuffer);
      expect(result).toEqual({ output: 'ち', newBuffer: '' });
    });
  });

  // N conversion / ん変換
  describe('n conversion / ん変換', () => {
    it('converts "nn" to "ん"', () => {
      let result = toKana('n', '');
      expect(result).toEqual({ output: '', newBuffer: 'n' });
      result = toKana('n', result.newBuffer);
      expect(result).toEqual({ output: 'ん', newBuffer: '' });
    });

    it('converts "n" + consonant to "ん" + consonant (e.g., "nk" -> "ん" + "k")', () => {
      let result = toKana('n', '');
      expect(result).toEqual({ output: '', newBuffer: 'n' });
      result = toKana('k', result.newBuffer);
      expect(result).toEqual({ output: 'ん', newBuffer: 'k' });
    });

    it('converts "n" + "t" to "ん" + "t"', () => {
      let result = toKana('n', '');
      result = toKana('t', result.newBuffer);
      expect(result).toEqual({ output: 'ん', newBuffer: 't' });
    });

    it('converts "n" + "s" to "ん" + "s"', () => {
      let result = toKana('n', '');
      result = toKana('s', result.newBuffer);
      expect(result).toEqual({ output: 'ん', newBuffer: 's' });
    });

    it('does NOT convert "na" - should be "な"', () => {
      let result = toKana('n', '');
      result = toKana('a', result.newBuffer);
      expect(result).toEqual({ output: 'な', newBuffer: '' });
    });

    it('does NOT convert "ny" - should buffer for "nya" etc.', () => {
      let result = toKana('n', '');
      result = toKana('y', result.newBuffer);
      expect(result).toEqual({ output: '', newBuffer: 'ny' });
    });

    it('converts "nya" to "にゃ"', () => {
      let result = toKana('n', '');
      result = toKana('y', result.newBuffer);
      result = toKana('a', result.newBuffer);
      expect(result).toEqual({ output: 'にゃ', newBuffer: '' });
    });
  });

  // Small tsu (double consonant) / 促音（二重子音）
  describe('small tsu (double consonant) / 促音', () => {
    it('converts "tt" to "っ" + "t"', () => {
      let result = toKana('t', '');
      expect(result).toEqual({ output: '', newBuffer: 't' });
      result = toKana('t', result.newBuffer);
      expect(result).toEqual({ output: 'っ', newBuffer: 't' });
    });

    it('converts "kk" to "っ" + "k"', () => {
      let result = toKana('k', '');
      result = toKana('k', result.newBuffer);
      expect(result).toEqual({ output: 'っ', newBuffer: 'k' });
    });

    it('converts "ss" to "っ" + "s"', () => {
      let result = toKana('s', '');
      result = toKana('s', result.newBuffer);
      expect(result).toEqual({ output: 'っ', newBuffer: 's' });
    });

    it('converts "pp" to "っ" + "p"', () => {
      let result = toKana('p', '');
      result = toKana('p', result.newBuffer);
      expect(result).toEqual({ output: 'っ', newBuffer: 'p' });
    });
  });

  // Sokuon intermediate state - past bug / 促音の中間状態（過去バグ対象）
  describe('sokuon intermediate state - switch to different conversion / 促音の中間状態で別の変換', () => {
    it('converts "t" then "a" to "た" (not sokuon)', () => {
      let result = toKana('t', '');
      expect(result).toEqual({ output: '', newBuffer: 't' });
      result = toKana('a', result.newBuffer);
      expect(result).toEqual({ output: 'た', newBuffer: '' });
    });

    it('converts "k" then "i" to "き" (not sokuon)', () => {
      let result = toKana('k', '');
      result = toKana('i', result.newBuffer);
      expect(result).toEqual({ output: 'き', newBuffer: '' });
    });

    it('converts "s" then "u" to "す" (not sokuon)', () => {
      let result = toKana('s', '');
      result = toKana('u', result.newBuffer);
      expect(result).toEqual({ output: 'す', newBuffer: '' });
    });

    it('full sequence: "tta" should be "った"', () => {
      let result = toKana('t', '');
      result = toKana('t', result.newBuffer);
      expect(result).toEqual({ output: 'っ', newBuffer: 't' });
      result = toKana('a', result.newBuffer);
      expect(result).toEqual({ output: 'た', newBuffer: '' });
    });
  });

  // Contracted sounds (youon) / 拗音
  describe('contracted sounds (youon) / 拗音', () => {
    it('converts "kya" to "きゃ"', () => {
      let result = toKana('k', '');
      result = toKana('y', result.newBuffer);
      result = toKana('a', result.newBuffer);
      expect(result).toEqual({ output: 'きゃ', newBuffer: '' });
    });

    it('converts "cha" to "ちゃ"', () => {
      let result = toKana('c', '');
      result = toKana('h', result.newBuffer);
      result = toKana('a', result.newBuffer);
      expect(result).toEqual({ output: 'ちゃ', newBuffer: '' });
    });

    it('converts "sha" to "しゃ"', () => {
      let result = toKana('s', '');
      result = toKana('h', result.newBuffer);
      result = toKana('a', result.newBuffer);
      expect(result).toEqual({ output: 'しゃ', newBuffer: '' });
    });

    it('converts "ja" to "じゃ"', () => {
      let result = toKana('j', '');
      result = toKana('a', result.newBuffer);
      expect(result).toEqual({ output: 'じゃ', newBuffer: '' });
    });

    it('converts "ryu" to "りゅ"', () => {
      let result = toKana('r', '');
      result = toKana('y', result.newBuffer);
      result = toKana('u', result.newBuffer);
      expect(result).toEqual({ output: 'りゅ', newBuffer: '' });
    });
  });

  // V-sound (vu series) / ゔ系
  describe('v-sound (vu series) / ゔ系', () => {
    it('converts "va" to "ゔぁ"', () => {
      let result = toKana('v', '');
      result = toKana('a', result.newBuffer);
      expect(result).toEqual({ output: 'ゔぁ', newBuffer: '' });
    });

    it('converts "vi" to "ゔぃ"', () => {
      let result = toKana('v', '');
      result = toKana('i', result.newBuffer);
      expect(result).toEqual({ output: 'ゔぃ', newBuffer: '' });
    });

    it('converts "vu" to "ゔ"', () => {
      let result = toKana('v', '');
      result = toKana('u', result.newBuffer);
      expect(result).toEqual({ output: 'ゔ', newBuffer: '' });
    });

    it('converts "ve" to "ゔぇ"', () => {
      let result = toKana('v', '');
      result = toKana('e', result.newBuffer);
      expect(result).toEqual({ output: 'ゔぇ', newBuffer: '' });
    });

    it('converts "vo" to "ゔぉ"', () => {
      let result = toKana('v', '');
      result = toKana('o', result.newBuffer);
      expect(result).toEqual({ output: 'ゔぉ', newBuffer: '' });
    });
  });

  // Small characters / 小文字系
  describe('small characters / 小文字系', () => {
    it('converts "la" to "ぁ"', () => {
      let result = toKana('l', '');
      result = toKana('a', result.newBuffer);
      expect(result).toEqual({ output: 'ぁ', newBuffer: '' });
    });

    it('converts "xa" to "ぁ"', () => {
      let result = toKana('x', '');
      result = toKana('a', result.newBuffer);
      expect(result).toEqual({ output: 'ぁ', newBuffer: '' });
    });

    it('converts "ltu" to "っ"', () => {
      let result = toKana('l', '');
      result = toKana('t', result.newBuffer);
      result = toKana('u', result.newBuffer);
      expect(result).toEqual({ output: 'っ', newBuffer: '' });
    });

    it('converts "xtu" to "っ"', () => {
      let result = toKana('x', '');
      result = toKana('t', result.newBuffer);
      result = toKana('u', result.newBuffer);
      expect(result).toEqual({ output: 'っ', newBuffer: '' });
    });

    it('converts "lya" to "ゃ"', () => {
      let result = toKana('l', '');
      result = toKana('y', result.newBuffer);
      result = toKana('a', result.newBuffer);
      expect(result).toEqual({ output: 'ゃ', newBuffer: '' });
    });
  });

  // Hyphen / 長音符
  describe('hyphen / 長音符', () => {
    it('converts "-" to "ー"', () => {
      const result = toKana('-', '');
      expect(result).toEqual({ output: 'ー', newBuffer: '' });
    });
  });

  // Invalid input handling / 無効な入力の処理
  describe('invalid input handling / 無効な入力の処理', () => {
    it('flushes invalid prefix when no match possible', () => {
      let result = toKana('q', '');
      expect(result).toEqual({ output: 'q', newBuffer: '' });
    });

    it('handles xx as sokuon (double x)', () => {
      let result = toKana('x', '');
      result = toKana('x', result.newBuffer);
      // 'xx' is treated as double consonant -> sokuon
      // 'xx'は二重子音として促音になる
      expect(result.output).toBe('っ');
      expect(result.newBuffer).toBe('x');
    });
  });
});

describe('convertToKatakana', () => {
  // Basic conversion / 基本変換
  describe('basic conversion / 基本変換', () => {
    it('converts "あ" to "ア"', () => {
      expect(convertToKatakana('あ')).toBe('ア');
    });

    it('converts "か" to "カ"', () => {
      expect(convertToKatakana('か')).toBe('カ');
    });

    it('converts "ん" to "ン"', () => {
      expect(convertToKatakana('ん')).toBe('ン');
    });
  });

  // Contracted sounds (youon) / 拗音変換
  describe('contracted sounds (youon) / 拗音変換', () => {
    it('converts "きゃ" to "キャ"', () => {
      expect(convertToKatakana('きゃ')).toBe('キャ');
    });

    it('converts "しゅ" to "シュ"', () => {
      expect(convertToKatakana('しゅ')).toBe('シュ');
    });

    it('converts "ちょ" to "チョ"', () => {
      expect(convertToKatakana('ちょ')).toBe('チョ');
    });
  });

  // V-sound / ゔ系変換
  describe('v-sound / ゔ系変換', () => {
    it('converts "ゔ" to "ヴ"', () => {
      expect(convertToKatakana('ゔ')).toBe('ヴ');
    });

    // Note: convertToKatakana converts character by character
    // 注意: convertToKatakanaは文字単位で変換する
    it('converts "ゔぁ" to "ヴァ" (char by char)', () => {
      // ゔ -> ヴ, ぁ -> ァ (each converted separately)
      // ゔ -> ヴ, ぁ -> ァ (それぞれ別々に変換)
      expect(convertToKatakana('ゔぁ')).toBe('ヴァ');
    });
  });

  // Small characters / 小文字変換
  describe('small characters / 小文字変換', () => {
    it('converts "っ" to "ッ"', () => {
      expect(convertToKatakana('っ')).toBe('ッ');
    });

    it('converts "ぁ" to "ァ"', () => {
      expect(convertToKatakana('ぁ')).toBe('ァ');
    });

    it('converts "ゃ" to "ャ"', () => {
      expect(convertToKatakana('ゃ')).toBe('ャ');
    });
  });

  // Long vowel mark stays the same / 長音符はそのまま
  describe('long vowel mark / 長音符', () => {
    it('keeps "ー" as "ー"', () => {
      expect(convertToKatakana('ー')).toBe('ー');
    });
  });

  // Mixed text / 混合テキスト
  describe('mixed text / 混合テキスト', () => {
    it('converts "こんにちは" to "コンニチハ"', () => {
      expect(convertToKatakana('こんにちは')).toBe('コンニチハ');
    });

    it('does not convert non-hiragana characters', () => {
      expect(convertToKatakana('hello')).toBe('hello');
    });

    it('converts mixed hiragana and other chars', () => {
      expect(convertToKatakana('あいうABC')).toBe('アイウABC');
    });
  });
});
