import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTypingIndicator } from './useTypingIndicator';
import { THROTTLE } from '../constants';

const sendTypingStatus = vi.fn();

// The hook only touches refs, so nothing here triggers a React re-render and
// act() is not needed. / このフックはrefしか触らないため再レンダーが起きず、act()は不要。
beforeEach(() => {
  vi.useFakeTimers();
  sendTypingStatus.mockClear();
  window.electronAPI = { sendTypingStatus } as unknown as Window['electronAPI'];
});

afterEach(() => {
  vi.useRealTimers();
  // Other tests (useIME) rely on electronAPI being absent / 他のテスト(useIME)はelectronAPIが無い前提
  delete window.electronAPI;
});

describe('useTypingIndicator', () => {
  describe('typing=true / 入力中の通知', () => {
    it('sends typing=true once per throttle window', () => {
      const { result } = renderHook(() => useTypingIndicator());

      result.current.sendTypingStatus(true);
      result.current.sendTypingStatus(true);
      result.current.sendTypingStatus(true);
      expect(sendTypingStatus.mock.calls).toEqual([[true]]);

      vi.advanceTimersByTime(THROTTLE.TYPING_INDICATOR);
      expect(sendTypingStatus.mock.calls).toEqual([[true], [true]]);
    });
  });

  describe('typing=false / 入力停止の通知', () => {
    it('does not send typing=false when typing never started', () => {
      const { result } = renderHook(() => useTypingIndicator());

      result.current.sendTypingStatus(false);

      expect(sendTypingStatus).not.toHaveBeenCalled();
      expect(result.current.isTypingRef.current).toBe(false);
    });

    it('sends typing=false once and suppresses the repeat', () => {
      const { result } = renderHook(() => useTypingIndicator());

      result.current.sendTypingStatus(true);
      result.current.sendTypingStatus(false);
      result.current.sendTypingStatus(false);

      expect(sendTypingStatus.mock.calls).toEqual([[true], [false]]);
      expect(result.current.isTypingRef.current).toBe(false);
    });

    it('cancels a pending typing=true when typing stops', () => {
      const { result } = renderHook(() => useTypingIndicator());

      result.current.sendTypingStatus(true); // Leading edge / leading側
      result.current.sendTypingStatus(true); // Queued as a trailing call / trailingとして保留
      result.current.sendTypingStatus(false);
      expect(sendTypingStatus.mock.calls).toEqual([[true], [false]]);

      // A queued true arriving after the stop would leave VRChat showing the
      // typing indicator forever. / 停止後に保留中のtrueが届くと、VRChat側の
      // タイピング表示が出たままになる。
      vi.advanceTimersByTime(THROTTLE.TYPING_INDICATOR);
      expect(sendTypingStatus.mock.calls).toEqual([[true], [false]]);
    });
  });

  describe('idle timeout / 無操作タイムアウト', () => {
    it('sends typing=false automatically after the idle timeout', () => {
      const { result } = renderHook(() => useTypingIndicator());

      result.current.sendTypingStatus(true);
      result.current.resetTypingTimeout();

      vi.advanceTimersByTime(THROTTLE.TYPING_TIMEOUT - 1);
      expect(sendTypingStatus.mock.calls).toEqual([[true]]);

      vi.advanceTimersByTime(1);
      expect(sendTypingStatus.mock.calls).toEqual([[true], [false]]);
      expect(result.current.isTypingRef.current).toBe(false);
    });

    it('cancels the scheduled typing=false', () => {
      const { result } = renderHook(() => useTypingIndicator());

      result.current.sendTypingStatus(true);
      result.current.resetTypingTimeout();
      result.current.cancelTypingTimeout();

      vi.advanceTimersByTime(THROTTLE.TYPING_TIMEOUT * 2);
      expect(sendTypingStatus.mock.calls).toEqual([[true]]);
      expect(result.current.isTypingRef.current).toBe(true);
    });

    it('sends nothing after unmount', () => {
      const { result, unmount } = renderHook(() => useTypingIndicator());

      result.current.sendTypingStatus(true);
      result.current.sendTypingStatus(true); // Trailing call pending / trailingが保留中
      result.current.resetTypingTimeout(); // Idle timeout pending / 無操作タイムアウトが保留中

      unmount();

      vi.advanceTimersByTime(THROTTLE.TYPING_TIMEOUT * 2);
      expect(sendTypingStatus.mock.calls).toEqual([[true]]);
    });
  });
});
