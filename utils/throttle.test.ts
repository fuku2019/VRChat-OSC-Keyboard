/**
 * throttle utility tests / throttleユーティリティテスト
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from './throttle';

describe('throttle / スロットル', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic throttling / 基本的なスロットリング', () => {
    it('executes function immediately on first call (leading: true)', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('throttles subsequent calls within wait period', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled(); // Immediate execution / 即時実行
      throttled(); // Should be throttled / スロットルされるべき
      throttled(); // Should be throttled / スロットルされるべき

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('executes trailing call after wait period', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('first');
      throttled('second');
      throttled('third');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenLastCalledWith('first');

      // Advance time to trigger trailing call / 時間を進めてtrailing呼び出しをトリガー
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith('third');
    });

    it('allows execution after wait period expires', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('leading option / leadingオプション', () => {
    it('does not execute immediately when leading: false', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100, { leading: false });

      throttled();
      expect(fn).toHaveBeenCalledTimes(0);

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('executes immediately when leading: true (default)', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100, { leading: true });

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('trailing option / trailingオプション', () => {
    it('does not execute trailing call when trailing: false', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100, { trailing: false });

      throttled('first');
      throttled('second');
      throttled('third');

      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);

      // Should NOT execute trailing call / trailing呼び出しは実行されないべき
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('executes trailing call when trailing: true (default)', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100, { trailing: true });

      throttled('first');
      throttled('second');

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancel method / cancelメソッド', () => {
    it('cancels pending trailing execution', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('first');
      throttled('second');

      expect(fn).toHaveBeenCalledTimes(1);

      throttled.cancel();

      vi.advanceTimersByTime(100);

      // Trailing call should NOT execute / trailing呼び出しは実行されないべき
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('allows new execution after cancel', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('first');
      throttled.cancel();

      // Should be able to execute immediately after cancel / cancel後は即実行可能
      throttled('new');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('arguments and context / 引数とコンテキスト', () => {
    it('passes arguments correctly', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('arg1', 'arg2', 123);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2', 123);
    });

    it('preserves this context', () => {
      const obj = {
        value: 42,
        fn: vi.fn(function (this: { value: number }) {
          return this.value;
        }),
      };

      const throttled = throttle(obj.fn, 100);
      throttled.call(obj);

      expect(obj.fn).toHaveBeenCalled();
    });
  });
});
