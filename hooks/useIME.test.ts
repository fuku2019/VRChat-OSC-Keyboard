import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useIME } from './useIME';
import { InputMode } from '../types';

// No window.electronAPI in jsdom, so conversion falls back to the local
// candidate list (hiragana / katakana of the typed reading).
// jsdomではwindow.electronAPIが無いため、変換はローカル候補（かな/カタカナ）に
// フォールバックする。
describe('useIME - typing while conversion candidates are shown', () => {
  const typeInto = (result: { current: ReturnType<typeof useIME> }, char: string) => {
    act(() => {
      result.current.handleCharInput(char);
    });
  };

  it('keeps a symbol typed over an open candidate list', () => {
    const { result } = renderHook(() => useIME(InputMode.HIRAGANA));

    typeInto(result, 'a');
    expect(result.current.isConverting).toBe(true);
    expect(result.current.displayText).toBe('あ');

    typeInto(result, '!');
    expect(result.current.isConverting).toBe(false);
    expect(result.current.displayText).toBe('あ!');
  });

  it('keeps an uppercase letter typed over an open candidate list', () => {
    const { result } = renderHook(() => useIME(InputMode.HIRAGANA));

    typeInto(result, 'a');
    typeInto(result, 'A');

    expect(result.current.displayText).toBe('あA');
  });

  it('still selects a candidate by digit 1-9 instead of inserting it', () => {
    const { result } = renderHook(() => useIME(InputMode.HIRAGANA));

    typeInto(result, 'a');
    typeInto(result, '2'); // second candidate = katakana / 2番目の候補=カタカナ

    expect(result.current.displayText).toBe('ア');
  });
});
