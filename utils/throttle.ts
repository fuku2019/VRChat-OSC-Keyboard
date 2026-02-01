/**
 * Throttle options interface
 * スロットルオプションのインターフェース
 */
export interface ThrottleSettings {
  leading?: boolean;
  trailing?: boolean;
}

/**
 * Throttled function interface with cancel method
 * キャンセルメソッドを持つスロットル関数のインターフェース
 */
export interface ThrottledFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

/**
 * Creates a throttled function that only invokes `func` at most once per every `wait` milliseconds.
 * 指定された時間（waitミリ秒）ごとに最大1回だけ `func` を実行するスロットル関数を作成します。
 * Supports leading and trailing options and cancellation.
 * leading/trailingオプションとキャンセルをサポートします。
 *
 * @param func The function to throttle / スロットルする関数
 * @param wait The number of milliseconds to throttle invocations to / 実行間隔（ミリ秒）
 * @param options The options object / オプションオブジェクト
 * @returns A throttled function with cancel method / cancelメソッドを持つスロットルされた関数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options: ThrottleSettings = {},
): ThrottledFunction<T> {
  let lastArgs: Parameters<T> | null = null;
  let lastThis: any = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let lastInvokeTime = 0;

  const leading = options.leading !== false;
  const trailing = options.trailing !== false;

  const invokeFunc = (time: number) => {
    lastInvokeTime = time;
    if (lastArgs) {
      func.apply(lastThis, lastArgs);
      lastArgs = null;
      lastThis = null;
    }
  };

  const trailingEdge = () => {
    maxWaitTimer = null;
    if (trailing && lastArgs) {
      invokeFunc(Date.now());
    } else {
      lastArgs = null;
      lastThis = null;
    }
  };

  const throttled = function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    if (!lastInvokeTime && !leading) {
      lastInvokeTime = now;
    }

    lastArgs = args;
    lastThis = this;

    const remaining = wait - (now - lastInvokeTime);

    if (remaining <= 0 || remaining > wait) {
      if (maxWaitTimer) {
        clearTimeout(maxWaitTimer);
        maxWaitTimer = null;
      }
      lastInvokeTime = now;
      invokeFunc(now);
    } else if (!maxWaitTimer && trailing) {
      maxWaitTimer = setTimeout(trailingEdge, remaining);
    }
  };

  throttled.cancel = () => {
    if (maxWaitTimer) {
      clearTimeout(maxWaitTimer);
    }
    lastInvokeTime = 0;
    maxWaitTimer = null;
    lastArgs = null;
    lastThis = null;
  };

  return throttled;
}
