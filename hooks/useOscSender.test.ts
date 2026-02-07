import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOscSender } from './useOscSender';

const { mockSendOscMessage, mockStoreState } = vi.hoisted(() => ({
  mockSendOscMessage: vi.fn(),
  mockStoreState: {
    config: {
      bridgeUrl: 'ws://127.0.0.1:8080',
      oscPort: 9000,
      autoSend: false,
      copyMode: false,
      autoSendBeforeCopyMode: false,
      language: 'en' as const,
      theme: 'dark' as const,
      accentColor: 'cyan',
      updateCheckInterval: 'weekly' as const,
    },
  },
}));

vi.mock('../services/oscService', () => ({
  sendOscMessage: mockSendOscMessage,
}));

vi.mock('../stores/configStore', () => ({
  useConfigStore: Object.assign(
    (selector: any) => selector(mockStoreState),
    { getState: () => mockStoreState },
  ),
}));

describe('useOscSender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendOscMessage.mockResolvedValue({ success: true });
  });

  it('sends displayText as-is (including pending IME text position)', async () => {
    const setInput = vi.fn();
    const sendTypingStatus = vi.fn();
    const cancelTypingTimeout = vi.fn();
    const commitBuffer = vi.fn();
    const textarea = document.createElement('textarea');

    const { result } = renderHook(() =>
      useOscSender(
        'abck',
        setInput,
        sendTypingStatus,
        cancelTypingTimeout,
        commitBuffer,
      ),
    );

    await act(async () => {
      await result.current.handleSend({
        current: textarea,
      } as { current: HTMLTextAreaElement | null });
    });

    expect(mockSendOscMessage).toHaveBeenCalledWith(
      'abck',
      'ws://127.0.0.1:8080',
    );
    expect(commitBuffer).toHaveBeenCalledTimes(1);
    expect(setInput).toHaveBeenCalledWith('');
  });

  it('does not send when displayText is empty/whitespace', async () => {
    const setInput = vi.fn();
    const sendTypingStatus = vi.fn();
    const cancelTypingTimeout = vi.fn();
    const commitBuffer = vi.fn();

    const { result } = renderHook(() =>
      useOscSender(
        '   ',
        setInput,
        sendTypingStatus,
        cancelTypingTimeout,
        commitBuffer,
      ),
    );

    await act(async () => {
      await result.current.handleSend({
        current: document.createElement('textarea'),
      } as { current: HTMLTextAreaElement | null });
    });

    expect(mockSendOscMessage).not.toHaveBeenCalled();
    expect(commitBuffer).not.toHaveBeenCalled();
  });
});
