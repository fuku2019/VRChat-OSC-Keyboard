import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIME } from './useIME';
import { InputMode } from '../types';

describe('useIME', () => {
  describe('initialization / 初期化', () => {
    it('initializes with default state', () => {
      const { result } = renderHook(() => useIME());
      expect(result.current.input).toBe('');
      expect(result.current.buffer).toBe('');
      expect(result.current.rawKana).toBe('');
      expect(result.current.isConverting).toBe(false);
      expect(result.current.candidates).toEqual([]);
      expect(result.current.mode).toBe(InputMode.HIRAGANA);
    });
  });

  describe('english mode / 英字モード', () => {
    it('inputs characters directly', () => {
      const { result } = renderHook(() => useIME(InputMode.ENGLISH));
      act(() => result.current.handleCharInput('h'));
      act(() => result.current.handleCharInput('i'));
      expect(result.current.input).toBe('hi');
      expect(result.current.rawKana).toBe('');
    });
  });

  describe('hiragana preedit / ひらがな未確定', () => {
    it('starts conversion automatically when kana is formed', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => result.current.handleCharInput('a'));
      expect(result.current.input).toBe('');
      expect(result.current.rawKana).toBe('あ');
      expect(result.current.isConverting).toBe(true);
      expect(result.current.candidates.length).toBeGreaterThan(0);
      expect(result.current.displayText).toBe('あ');
    });

    it('handles consonant buffer then kana output', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => result.current.handleCharInput('k'));
      expect(result.current.buffer).toBe('k');
      act(() => result.current.handleCharInput('a'));
      expect(result.current.buffer).toBe('');
      expect(result.current.rawKana).toBe('か');
      expect(result.current.isConverting).toBe(true);
    });

    it('commits candidate then accepts non-ime character on next key', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => result.current.handleCharInput('k'));
      act(() => result.current.handleCharInput('a'));
      expect(result.current.isConverting).toBe(true);

      // First non-IME key commits current candidate.
      act(() => result.current.handleCharInput('0'));
      expect(result.current.input).toBe('か');
      expect(result.current.isConverting).toBe(false);

      // Next key is inserted normally.
      act(() => result.current.handleCharInput('0'));
      expect(result.current.input).toBe('か0');
    });
  });

  describe('conversion state / 変換状態', () => {
    it('starts conversion without pressing space', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => result.current.handleCharInput('t'));
      act(() => result.current.handleCharInput('e'));
      act(() => result.current.handleCharInput('s'));
      act(() => result.current.handleCharInput('u'));
      act(() => result.current.handleCharInput('t'));
      act(() => result.current.handleCharInput('o'));
      expect(result.current.rawKana).toBe('てすと');
      expect(result.current.isConverting).toBe(true);
      expect(result.current.candidates.length).toBeGreaterThan(0);
      expect(result.current.candidateIndex).toBe(0);
    });

    it('continues romaji input while converting without forced commit', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => result.current.handleCharInput('k'));
      act(() => result.current.handleCharInput('a'));
      expect(result.current.rawKana).toBe('か');
      expect(result.current.isConverting).toBe(true);

      act(() => result.current.handleCharInput('n'));
      expect(result.current.isConverting).toBe(false);
      expect(result.current.buffer).toBe('n');
      expect(result.current.rawKana).toBe('か');

      act(() => result.current.handleCharInput('a'));
      expect(result.current.rawKana).toBe('かな');
      expect(result.current.isConverting).toBe(true);
      expect(result.current.candidates.length).toBeGreaterThan(0);
    });

    it('cycles candidates with space', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => result.current.handleCharInput('t'));
      act(() => result.current.handleCharInput('e'));
      act(() => result.current.handleCharInput('s'));
      act(() => result.current.handleCharInput('u'));
      act(() => result.current.handleCharInput('t'));
      act(() => result.current.handleCharInput('o'));
      const initial = result.current.candidateIndex;

      act(() => result.current.handleSpace());
      expect(result.current.candidateIndex).toBe(
        (initial + 1) % result.current.candidates.length,
      );
    });

    it('commits selected candidate with enter path', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => result.current.handleCharInput('t'));
      act(() => result.current.handleCharInput('e'));
      act(() => result.current.handleCharInput('s'));
      act(() => result.current.handleCharInput('u'));
      act(() => result.current.handleCharInput('t'));
      act(() => result.current.handleCharInput('o'));
      const selected = result.current.candidates[result.current.candidateIndex].text;

      act(() => result.current.handleCommitCandidate());
      expect(result.current.input).toBe(selected);
      expect(result.current.isConverting).toBe(false);
      expect(result.current.rawKana).toBe('');
    });

    it('supports direct candidate selection with numeric key', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => result.current.handleCharInput('t'));
      act(() => result.current.handleCharInput('e'));
      act(() => result.current.handleCharInput('s'));
      act(() => result.current.handleCharInput('u'));
      act(() => result.current.handleCharInput('t'));
      act(() => result.current.handleCharInput('o'));
      const first = result.current.candidates[0].text;

      act(() => result.current.handleCharInput('1'));
      expect(result.current.input).toBe(first);
      expect(result.current.isConverting).toBe(false);
    });

    it('cancels conversion and keeps raw kana for edit', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => result.current.handleCharInput('t'));
      act(() => result.current.handleCharInput('e'));
      act(() => result.current.handleCharInput('s'));
      act(() => result.current.handleCharInput('u'));
      act(() => result.current.handleCharInput('t'));
      act(() => result.current.handleCharInput('o'));

      act(() => result.current.handleCancelConversion());
      expect(result.current.isConverting).toBe(false);
      expect(result.current.rawKana).toBe('てすと');
      expect(result.current.input).toBe('');
    });

  });

  describe('clear behavior / クリア動作', () => {
    it('cancel conversion on clear without erasing committed input', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => result.current.setInput('abc'));
      act(() => result.current.handleCharInput('t'));
      act(() => result.current.handleCharInput('e'));
      act(() => result.current.handleCharInput('s'));
      act(() => result.current.handleCharInput('u'));
      act(() => result.current.handleCharInput('t'));
      act(() => result.current.handleCharInput('o'));

      act(() => result.current.handleClear());
      expect(result.current.input).toBe('abc');
      expect(result.current.isConverting).toBe(false);
      expect(result.current.rawKana).toBe('てすと');
    });

    it('clears all text when not converting', () => {
      const { result } = renderHook(() => useIME(InputMode.ENGLISH));
      act(() => result.current.handleCharInput('a'));
      act(() => result.current.handleClear());
      expect(result.current.input).toBe('');
      expect(result.current.displayText).toBe('');
    });
  });

  describe('max length / 最大文字数', () => {
    it('blocks extra input at max length in english mode', () => {
      const { result } = renderHook(() => useIME(InputMode.ENGLISH, 3));
      act(() => result.current.handleCharInput('a'));
      act(() => result.current.handleCharInput('b'));
      act(() => result.current.handleCharInput('c'));
      act(() => result.current.handleCharInput('d'));
      expect(result.current.input).toBe('abc');
    });
  });
});
