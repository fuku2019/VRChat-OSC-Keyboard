import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMEOUTS } from '../constants';
import { useVrScrollSelectionGuard } from './useVrScrollSelectionGuard';

describe('useVrScrollSelectionGuard', () => {
  let onInputScroll: ReturnType<typeof vi.fn>;
  let removeInputScrollListener: ReturnType<typeof vi.fn>;
  let registeredHandler: ((data: { deltaY: number }) => void) | null;

  beforeEach(() => {
    vi.useFakeTimers();
    registeredHandler = null;
    onInputScroll = vi.fn((handler: (data: { deltaY: number }) => void) => {
      registeredHandler = handler;
    });
    removeInputScrollListener = vi.fn(
      (handler: (data: { deltaY: number }) => void) => {
        if (registeredHandler === handler) {
          registeredHandler = null;
        }
      },
    );
    (window as any).electronAPI = {
      onInputScroll,
      removeInputScrollListener,
    };
    document.documentElement.classList.remove('vr-scroll-select-lock');
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as any).electronAPI;
    document.documentElement.classList.remove('vr-scroll-select-lock');
  });

  it('subscribes to input-scroll and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useVrScrollSelectionGuard());

    expect(onInputScroll).toHaveBeenCalledTimes(1);
    const handler = onInputScroll.mock.calls[0][0];

    unmount();

    expect(removeInputScrollListener).toHaveBeenCalledTimes(1);
    expect(removeInputScrollListener).toHaveBeenCalledWith(handler);
  });

  it('locks selection and clears current selection when scroll event arrives', () => {
    const removeAllRanges = vi.fn();
    vi.spyOn(window, 'getSelection').mockReturnValue({
      removeAllRanges,
    } as unknown as Selection);

    renderHook(() => useVrScrollSelectionGuard());
    act(() => {
      registeredHandler?.({ deltaY: 48 });
    });

    expect(
      document.documentElement.classList.contains('vr-scroll-select-lock'),
    ).toBe(true);
    expect(removeAllRanges).toHaveBeenCalledTimes(1);
  });

  it('releases selection lock after timeout', () => {
    renderHook(() => useVrScrollSelectionGuard());

    act(() => {
      registeredHandler?.({ deltaY: 24 });
    });
    expect(
      document.documentElement.classList.contains('vr-scroll-select-lock'),
    ).toBe(true);

    act(() => {
      vi.advanceTimersByTime(TIMEOUTS.VR_SCROLL_SELECTION_LOCK - 1);
    });
    expect(
      document.documentElement.classList.contains('vr-scroll-select-lock'),
    ).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      document.documentElement.classList.contains('vr-scroll-select-lock'),
    ).toBe(false);
  });

  it('extends lock while consecutive scroll events continue', () => {
    renderHook(() => useVrScrollSelectionGuard());

    act(() => {
      registeredHandler?.({ deltaY: 24 });
    });
    act(() => {
      vi.advanceTimersByTime(60);
    });
    act(() => {
      registeredHandler?.({ deltaY: 24 });
    });

    act(() => {
      vi.advanceTimersByTime(70);
    });
    expect(
      document.documentElement.classList.contains('vr-scroll-select-lock'),
    ).toBe(true);

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(
      document.documentElement.classList.contains('vr-scroll-select-lock'),
    ).toBe(false);
  });

  it('removes lock immediately on unmount even if timer is pending', () => {
    const { unmount } = renderHook(() => useVrScrollSelectionGuard());

    act(() => {
      registeredHandler?.({ deltaY: 24 });
    });
    expect(
      document.documentElement.classList.contains('vr-scroll-select-lock'),
    ).toBe(true);

    unmount();

    expect(
      document.documentElement.classList.contains('vr-scroll-select-lock'),
    ).toBe(false);
  });

  it('does not throw when electronAPI is unavailable', () => {
    delete (window as any).electronAPI;
    expect(() => renderHook(() => useVrScrollSelectionGuard())).not.toThrow();
  });
});
