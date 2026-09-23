import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useVrScrollSelectionGuard } from './useVrScrollSelectionGuard';

let scrollHandler: ((payload: { deltaY: number }) => void) | null = null;

beforeEach(() => {
  scrollHandler = null;
  window.electronAPI = {
    onInputScroll: (handler: (payload: { deltaY: number }) => void) => {
      scrollHandler = handler;
    },
    removeInputScrollListener: vi.fn(),
  } as unknown as Window['electronAPI'];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  // Other tests (useIME) rely on electronAPI being absent / 他のテスト(useIME)はelectronAPIが無い前提
  delete window.electronAPI;
});

const spyRemoveAllRanges = () =>
  vi.spyOn(window.getSelection()!, 'removeAllRanges');

describe('useVrScrollSelectionGuard', () => {
  it('leaves the selection alone while the textarea has focus', () => {
    // Clearing it makes Chromium report the caret as 0, and the next key then
    // lands at the left edge. / 消すと Chromium がキャレットを 0 と報告し、次のキーが
    // 左端に入る。
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    const spy = spyRemoveAllRanges();
    renderHook(() => useVrScrollSelectionGuard());

    scrollHandler!({ deltaY: 10 });

    expect(spy).not.toHaveBeenCalled();
    expect(
      document.documentElement.classList.contains('vr-scroll-select-lock'),
    ).toBe(true);
  });

  it('clears a stray page selection when no text field has focus', () => {
    const spy = spyRemoveAllRanges();
    renderHook(() => useVrScrollSelectionGuard());

    scrollHandler!({ deltaY: 10 });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
