import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const sendOscMessage = vi.fn(async () => ({ success: true }));
vi.mock('../services/oscService', () => ({
  sendOscMessage: (...args: unknown[]) => sendOscMessage(...(args as [])),
}));

import { useOscSender } from './useOscSender';
import { useConfigStore } from '../stores/configStore';

describe('useOscSender - manual send vs pending auto-send', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendOscMessage.mockClear();
    useConfigStore.setState((state) => ({
      config: { ...state.config, autoSend: true, bridgeUrl: 'ws://127.0.0.1:8080' },
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not re-send the text after a manual send flushes the input', async () => {
    const textareaRef = { current: null } as React.RefObject<HTMLTextAreaElement>;
    const { result } = renderHook(() =>
      useOscSender('hello', vi.fn(), vi.fn(), vi.fn(), vi.fn()),
    );

    // Two auto-send calls inside the throttle window: the first sends
    // immediately, the second is queued as a trailing call.
    // スロットル窓内での2回の自動送信: 1回目は即時、2回目はtrailingとして保留される。
    act(() => {
      result.current.throttledAutoSend('hello', 'ws://127.0.0.1:8080');
      result.current.throttledAutoSend('hello', 'ws://127.0.0.1:8080');
    });
    expect(sendOscMessage).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.handleSend(textareaRef);
    });
    expect(sendOscMessage).toHaveBeenCalledTimes(2);

    // The queued trailing call must not fire once the text has been sent.
    // 送信済みのテキストで保留中のtrailing呼び出しが発火してはならない。
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(sendOscMessage).toHaveBeenCalledTimes(2);
  });
});
