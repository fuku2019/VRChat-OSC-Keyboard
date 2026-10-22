/**
 * VirtualKeyboard tests - Shift locks on a double tap as on Gboard, and the Enter
 * key's face follows what it will do (commit, send or copy).
 * VirtualKeyboard のテスト - Gboard と同じく Shift はダブルタップでロックし、
 * Enter キーの表示はその動作(確定・送信・コピー)に従う。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import VirtualKeyboard from './VirtualKeyboard';
import { TIMEOUTS, TRANSLATIONS } from '../constants';
import { InputMode } from '../types';

const t = TRANSLATIONS.ja;

const renderKeyboard = (overrides: Partial<Parameters<typeof VirtualKeyboard>[0]> = {}) => {
  const onChar = vi.fn();
  render(
    <VirtualKeyboard
      onChar={onChar}
      onBackspace={vi.fn()}
      onClear={vi.fn()}
      onSend={vi.fn()}
      onSpace={vi.fn()}
      mode={InputMode.ENGLISH}
      onToggleMode={vi.fn()}
      candidates={[]}
      candidateIndex={0}
      isConverting={false}
      copyMode={false}
      onCommitCandidate={vi.fn()}
      language='ja'
      keySoundEnabled={false}
      keySoundVariant='soft'
      {...overrides}
    />,
  );
  return { onChar };
};

// Both Shift keys share the label; the left one is enough.
// 左右の Shift は同じラベルなので、左だけを使う。
const shiftKey = () => screen.getAllByRole('button', { name: 'Shift' })[0];
// A letter key's label follows Shift ('a' becomes 'A'), so match either case.
// 文字キーのラベルは Shift に従う('a' が 'A' になる)ので、大文字小文字を問わず探す。
const tap = (letter: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${letter}$`, 'i') }));
const typed = (onChar: ReturnType<typeof vi.fn>) => onChar.mock.calls.map(([c]) => c);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Shift', () => {
  it('shifts a single character after one tap', () => {
    const { onChar } = renderKeyboard();
    fireEvent.click(shiftKey());
    tap('a');
    tap('a');
    expect(typed(onChar)).toEqual(['A', 'a']);
  });

  it('locks on a double tap and unlocks on the next tap', () => {
    const { onChar } = renderKeyboard();
    fireEvent.click(shiftKey());
    fireEvent.click(shiftKey());
    tap('a');
    tap('a');
    fireEvent.click(shiftKey());
    tap('a');
    expect(typed(onChar)).toEqual(['A', 'A', 'a']);
    expect(shiftKey().getAttribute('aria-pressed')).toBe('false');
  });

  it('treats a slow second tap as turning Shift off, not as a lock', () => {
    vi.useFakeTimers();
    const { onChar } = renderKeyboard();
    fireEvent.click(shiftKey());
    vi.advanceTimersByTime(TIMEOUTS.SHIFT_DOUBLE_TAP + 1);
    fireEvent.click(shiftKey());
    expect(shiftKey().getAttribute('aria-pressed')).toBe('false');
    tap('a');
    expect(typed(onChar)).toEqual(['a']);
  });
});

describe('Enter key face', () => {
  it('reads Send while idle', () => {
    renderKeyboard();
    expect(screen.getByRole('button', { name: t.keys.send })).toBeTruthy();
  });

  it('becomes Enter while converting', () => {
    renderKeyboard({ isConverting: true });
    expect(screen.getByRole('button', { name: t.keys.enter })).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.keys.send })).toBeNull();
  });

  it('reads Copy in copy mode', () => {
    renderKeyboard({ copyMode: true });
    expect(screen.getByRole('button', { name: t.controls.copyOnShort })).toBeTruthy();
  });
});
