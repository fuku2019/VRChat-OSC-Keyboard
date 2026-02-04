import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIME } from './useIME';
import { InputMode } from '../types';

describe('useIME', () => {
  // Basic initialization / 基本的な初期化
  describe('initialization / 初期化', () => {
    it('initializes with default values', () => {
      const { result } = renderHook(() => useIME());
      expect(result.current.input).toBe('');
      expect(result.current.buffer).toBe('');
      expect(result.current.mode).toBe(InputMode.HIRAGANA);
      expect(result.current.displayText).toBe('');
    });

    it('initializes with custom mode', () => {
      const { result } = renderHook(() => useIME(InputMode.ENGLISH));
      expect(result.current.mode).toBe(InputMode.ENGLISH);
    });

    it('initializes with custom maxLength', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA, 10));
      // maxLength is internal, tested via input blocking behavior
      // maxLengthは内部的なもので、入力ブロック動作でテスト
      expect(result.current.input).toBe('');
    });
  });

  // Mode switching / モード切り替え
  describe('mode switching / モード切り替え', () => {
    it('switches to English mode', () => {
      const { result } = renderHook(() => useIME());
      act(() => {
        result.current.setMode(InputMode.ENGLISH);
      });
      expect(result.current.mode).toBe(InputMode.ENGLISH);
    });

    it('switches to Katakana mode', () => {
      const { result } = renderHook(() => useIME());
      act(() => {
        result.current.setMode(InputMode.KATAKANA);
      });
      expect(result.current.mode).toBe(InputMode.KATAKANA);
    });
  });

  // handleCharInput in English mode / Englishモードでの文字入力
  describe('handleCharInput - English mode / Englishモード', () => {
    it('inputs characters directly in English mode', () => {
      const { result } = renderHook(() => useIME(InputMode.ENGLISH));
      act(() => {
        result.current.handleCharInput('a');
      });
      expect(result.current.input).toBe('a');
      expect(result.current.buffer).toBe('');
    });

    it('inputs multiple characters in sequence', () => {
      const { result } = renderHook(() => useIME(InputMode.ENGLISH));
      // Each handleCharInput needs its own act() for state updates / 状態更新のため各handleCharInputに個別のact()が必要
      act(() => { result.current.handleCharInput('h'); });
      act(() => { result.current.handleCharInput('e'); });
      act(() => { result.current.handleCharInput('l'); });
      act(() => { result.current.handleCharInput('l'); });
      act(() => { result.current.handleCharInput('o'); });
      expect(result.current.input).toBe('hello');
    });
  });

  // handleCharInput in Hiragana mode / ひらがなモードでの文字入力
  describe('handleCharInput - Hiragana mode / ひらがなモード', () => {
    it('converts romaji to hiragana', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => {
        result.current.handleCharInput('a');
      });
      expect(result.current.input).toBe('あ');
      expect(result.current.buffer).toBe('');
    });

    it('buffers consonant and converts with vowel', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => {
        result.current.handleCharInput('k');
      });
      expect(result.current.buffer).toBe('k');
      expect(result.current.input).toBe('');

      act(() => {
        result.current.handleCharInput('a');
      });
      expect(result.current.input).toBe('か');
      expect(result.current.buffer).toBe('');
    });

    it('converts "nn" to "ん"', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => {
        result.current.handleCharInput('n');
      });
      expect(result.current.buffer).toBe('n');

      act(() => {
        result.current.handleCharInput('n');
      });
      expect(result.current.input).toBe('ん');
      expect(result.current.buffer).toBe('');
    });

    it('converts "n" + consonant to "ん" + consonant', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => { result.current.handleCharInput('n'); });
      act(() => { result.current.handleCharInput('k'); });
      act(() => { result.current.handleCharInput('a'); });
      expect(result.current.input).toBe('んか');
      expect(result.current.buffer).toBe('');
    });

    it('passes through uppercase letters directly', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => {
        result.current.handleCharInput('A');
      });
      expect(result.current.input).toBe('A');
      expect(result.current.buffer).toBe('');
    });

    it('passes through numbers directly', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => {
        result.current.handleCharInput('1');
      });
      expect(result.current.input).toBe('1');
    });

    // Buffer preservation test / バッファ保持テスト
    // Reproduces: k → 1 input should result in "k1", not "1" / 再現: k → 1 の入力は "k1" になるべき、"1" ではない
    it('preserves buffer when non-IME character is input (buffer → non-IME)', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      
      // Input 'k' (goes to buffer) / 'k' を入力（バッファに入る）
      act(() => {
        result.current.handleCharInput('k');
      });
      expect(result.current.buffer).toBe('k');
      expect(result.current.input).toBe('');

      // Input '1' (non-IME character) / '1' を入力（非IME文字）
      act(() => {
        result.current.handleCharInput('1');
      });
      
      // Buffer 'k' should be committed before '1' is added / バッファの 'k' が確定されてから '1' が追加されるべき
      expect(result.current.buffer).toBe('');
      expect(result.current.input).toBe('k1');
    });

    it('preserves buffer when uppercase letter is input (buffer → uppercase)', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      
      // Input 'k' (goes to buffer) / 'k' を入力（バッファに入る）
      act(() => {
        result.current.handleCharInput('k');
      });
      expect(result.current.buffer).toBe('k');

      // Input 'A' (non-IME uppercase) / 'A' を入力（非IME大文字）
      act(() => {
        result.current.handleCharInput('A');
      });
      
      // Buffer 'k' should be committed before 'A' is added / バッファの 'k' が確定されてから 'A' が追加されるべき
      expect(result.current.buffer).toBe('');
      expect(result.current.input).toBe('kA');
    });

    it('preserves converted kana when followed by non-IME character', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      
      // Input 'ka' → 'か' / 'ka' を入力 → 'か'
      act(() => { result.current.handleCharInput('k'); });
      act(() => { result.current.handleCharInput('a'); });
      expect(result.current.input).toBe('か');
      
      // Input 'k' (goes to buffer) / 'k' を入力（バッファに入る）
      act(() => { result.current.handleCharInput('k'); });
      expect(result.current.buffer).toBe('k');
      
      // Input '1' (non-IME) / '1' を入力（非IME）
      act(() => { result.current.handleCharInput('1'); });
      
      // Should be 'かk1' / 'かk1' になるべき
      expect(result.current.input).toBe('かk1');
      expect(result.current.buffer).toBe('');
    });
  });

  // handleCharInput in Katakana mode / カタカナモードでの文字入力
  describe('handleCharInput - Katakana mode / カタカナモード', () => {
    it('converts romaji to katakana', () => {
      const { result } = renderHook(() => useIME(InputMode.KATAKANA));
      act(() => {
        result.current.handleCharInput('a');
      });
      expect(result.current.input).toBe('ア');
    });

    it('converts "ka" to "カ"', () => {
      const { result } = renderHook(() => useIME(InputMode.KATAKANA));
      act(() => { result.current.handleCharInput('k'); });
      act(() => { result.current.handleCharInput('a'); });
      expect(result.current.input).toBe('カ');
    });

    it('converts contracted sounds to katakana', () => {
      const { result } = renderHook(() => useIME(InputMode.KATAKANA));
      act(() => { result.current.handleCharInput('k'); });
      act(() => { result.current.handleCharInput('y'); });
      act(() => { result.current.handleCharInput('a'); });
      expect(result.current.input).toBe('キャ');
    });
  });

  // handleBackspace / バックスペース
  describe('handleBackspace / バックスペース', () => {
    it('removes buffer character first', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => {
        result.current.handleCharInput('k');
      });
      expect(result.current.buffer).toBe('k');

      act(() => {
        result.current.handleBackspace();
      });
      expect(result.current.buffer).toBe('');
      expect(result.current.input).toBe('');
    });

    it('removes input character when buffer is empty', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => {
        result.current.handleCharInput('a');
      });
      expect(result.current.input).toBe('あ');

      act(() => {
        result.current.handleBackspace();
      });
      expect(result.current.input).toBe('');
    });

    it('removes character at cursor position', () => {
      const { result } = renderHook(() => useIME(InputMode.ENGLISH));
      act(() => {
        result.current.setInput('abc');
      });
      
      act(() => {
        result.current.handleBackspace(2); // Delete at position 2 (the 'b')
      });
      expect(result.current.input).toBe('ac');
    });
  });

  // handleSpace / スペース
  describe('handleSpace / スペース', () => {
    it('adds space to input', () => {
      const { result } = renderHook(() => useIME(InputMode.ENGLISH));
      act(() => { result.current.handleCharInput('a'); });
      act(() => { result.current.handleSpace(); });
      expect(result.current.input).toBe('a ');
    });

    it('commits buffer before adding space', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => {
        result.current.handleCharInput('k');
      });
      expect(result.current.buffer).toBe('k');

      act(() => {
        result.current.handleSpace();
      });
      // Buffer 'k' is committed (flushed), then space added
      // バッファ'k'が確定（フラッシュ）され、スペースが追加される
      expect(result.current.buffer).toBe('');
      expect(result.current.input).toContain(' ');
    });
  });

  // handleClear / クリア
  describe('handleClear / クリア', () => {
    it('clears all input and buffer', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => { result.current.handleCharInput('k'); });
      act(() => { result.current.handleCharInput('a'); });
      act(() => { result.current.handleCharInput('n'); });
      expect(result.current.input).toBe('か');
      expect(result.current.buffer).toBe('n');

      act(() => {
        result.current.handleClear();
      });
      expect(result.current.input).toBe('');
      expect(result.current.buffer).toBe('');
    });
  });

  // commitBuffer / バッファ確定
  describe('commitBuffer / バッファ確定', () => {
    it('commits buffer to input', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => {
        result.current.handleCharInput('k');
      });
      expect(result.current.buffer).toBe('k');

      act(() => {
        result.current.commitBuffer();
      });
      expect(result.current.buffer).toBe('');
      expect(result.current.input).toBe('k');
    });

    it('does nothing when buffer is empty', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => {
        result.current.handleCharInput('a');
      });
      const inputBefore = result.current.input;

      act(() => {
        result.current.commitBuffer();
      });
      expect(result.current.input).toBe(inputBefore);
    });
  });

  // maxLength enforcement / 文字数制限
  describe('maxLength enforcement / 文字数制限', () => {
    it('blocks input when maxLength is reached', () => {
      const { result } = renderHook(() => useIME(InputMode.ENGLISH, 3));
      act(() => { result.current.handleCharInput('a'); });
      act(() => { result.current.handleCharInput('b'); });
      act(() => { result.current.handleCharInput('c'); });
      expect(result.current.input).toBe('abc');

      act(() => {
        result.current.handleCharInput('d');
      });
      expect(result.current.input).toBe('abc'); // Should not change / 変わらないはず
    });

    it('does not add space when maxLength is already reached', () => {
      const { result } = renderHook(() => useIME(InputMode.ENGLISH, 3));
      act(() => { result.current.handleCharInput('a'); });
      act(() => { result.current.handleCharInput('b'); });
      act(() => { result.current.handleCharInput('c'); });
      expect(result.current.input).toBe('abc');
      expect(result.current.input.length).toBe(3);

      act(() => {
        result.current.handleSpace();
      });
      // Space is not added because we're at maxLength
      // maxLengthに達しているのでスペースは追加されない
      expect(result.current.input.length).toBe(3);
    });
  });

  // displayText calculation / 表示テキストの計算
  describe('displayText calculation / 表示テキストの計算', () => {
    it('shows input + buffer as displayText', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => { result.current.handleCharInput('a'); });
      act(() => { result.current.handleCharInput('k'); });
      // input: 'あ', buffer: 'k'
      expect(result.current.displayText).toContain('あ');
      expect(result.current.displayText).toContain('k');
    });
  });

  // overwriteInput / 入力の上書き
  describe('overwriteInput / 入力の上書き', () => {
    it('overwrites input from external source', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA));
      act(() => {
        result.current.overwriteInput('テスト');
      });
      expect(result.current.input).toBe('テスト');
      expect(result.current.buffer).toBe('');
    });

    it('truncates input that exceeds maxLength', () => {
      const { result } = renderHook(() => useIME(InputMode.HIRAGANA, 5));
      act(() => {
        result.current.overwriteInput('あいうえおかきくけこ');
      });
      expect(result.current.input).toBe('あいうえお');
    });
  });
});
