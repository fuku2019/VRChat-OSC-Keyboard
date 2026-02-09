import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { InputMode } from './types';

const {
  mockUpdateConfig,
  mockOverwriteInput,
  mockSendTypingStatus,
  mockCancelTypingTimeout,
  mockHandleSend,
  mockState,
} = vi.hoisted(() => {
  const state = {
    config: {
      bridgeUrl: 'ws://127.0.0.1:8080',
      oscPort: 9000,
      autoSend: true,
      copyMode: false,
      autoSendBeforeCopyMode: false,
      language: 'en' as const,
      theme: 'dark' as const,
      accentColor: 'cyan',
      updateCheckInterval: 'weekly' as const,
    },
  };

  const updateConfig = vi.fn((key: string, value: unknown) => {
    (state.config as any)[key] = value;
  });

  return {
    mockUpdateConfig: updateConfig,
    mockOverwriteInput: vi.fn(),
    mockSendTypingStatus: vi.fn(),
    mockCancelTypingTimeout: vi.fn(),
    mockHandleSend: vi.fn(),
    mockState: state,
  };
});

vi.mock('./stores/configStore', () => ({
  useConfigStore: (selector: any) =>
    selector({
      config: mockState.config,
      updateConfig: mockUpdateConfig,
    }),
}));

vi.mock('./hooks/useTheme', () => ({
  useTheme: () => undefined,
}));

vi.mock('./hooks/useUpdateChecker', () => ({
  useUpdateChecker: () => ({
    updateAvailable: null,
    setUpdateAvailable: vi.fn(),
  }),
}));

vi.mock('./hooks/useTypingIndicator', () => ({
  useTypingIndicator: () => ({
    sendTypingStatus: mockSendTypingStatus,
    resetTypingTimeout: vi.fn(),
    cancelTypingTimeout: mockCancelTypingTimeout,
  }),
}));

vi.mock('./hooks/useOscSender', () => ({
  useOscSender: () => ({
    isSending: false,
    lastSent: null,
    error: null,
    throttledAutoSend: vi.fn(),
    handleSend: mockHandleSend,
  }),
}));

vi.mock('./hooks/useIME', () => ({
  useIME: () => ({
    input: '',
    buffer: '',
    displayText: 'Hello from test',
    mode: InputMode.ENGLISH,
    setMode: vi.fn(),
    setInput: vi.fn(),
    overwriteInput: mockOverwriteInput,
    handleCharInput: vi.fn(),
    handleBackspace: vi.fn(),
    handleClear: vi.fn(),
    handleSpace: vi.fn(),
    commitBuffer: vi.fn(),
  }),
}));

vi.mock('./hooks/useKeyboardController', () => ({
  useKeyboardController: ({ handlePrimaryAction }: any) => ({
    textareaRef: { current: document.createElement('textarea') },
    toggleMode: vi.fn(),
    handleKeyDown: vi.fn(),
    handleCompositionStart: vi.fn(),
    handleCompositionEnd: vi.fn(),
    handleTextareaChange: vi.fn(),
    handleSelect: vi.fn(),
    createVirtualKeyHandlers: () => ({
      onChar: vi.fn(),
      onBackspace: vi.fn(),
      onClear: vi.fn(),
      onSend: () => handlePrimaryAction(),
      onSpace: vi.fn(),
      onToggleMode: vi.fn(),
    }),
  }),
}));

vi.mock('./components/VirtualKeyboard', () => ({
  default: ({ onSend }: any) => (
    <button onClick={onSend} type='button'>
      vk-send
    </button>
  ),
}));

vi.mock('./components/TutorialOverlay', () => ({
  default: () => null,
}));

vi.mock('./components/SettingsModal', () => ({
  default: () => null,
}));

vi.mock('./components/NotificationToast', () => ({
  default: () => null,
}));

vi.mock('./components/StatusDisplay', () => ({
  default: () => null,
}));

vi.mock('./components/CursorOverlay', () => ({
  default: () => null,
}));

describe('App copy mode behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.config.autoSend = true;
    mockState.config.copyMode = false;
    mockState.config.autoSendBeforeCopyMode = false;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('disables auto send and restores it after copy mode toggle', () => {
    const { rerender } = render(<App />);

    fireEvent.click(screen.getByTitle('Copy Mode: OFF'));

    expect(mockUpdateConfig).toHaveBeenCalledWith('autoSendBeforeCopyMode', true);
    expect(mockUpdateConfig).toHaveBeenCalledWith('copyMode', true);
    expect(mockUpdateConfig).toHaveBeenCalledWith('autoSend', false);

    rerender(<App />);
    expect(
      screen
        .getByTitle('Auto Send is disabled while Copy Mode is on')
        .hasAttribute('disabled'),
    ).toBe(true);

    fireEvent.click(screen.getByTitle('Copy Mode: ON'));

    expect(mockUpdateConfig).toHaveBeenCalledWith('copyMode', false);
    expect(mockUpdateConfig).toHaveBeenCalledWith('autoSend', true);
  });

  it('copies display text and clears input on primary action in copy mode', async () => {
    mockState.config.copyMode = true;
    mockState.config.autoSend = false;

    render(<App />);
    fireEvent.click(screen.getByText('vk-send'));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'Hello from test',
      );
    });
    expect(mockOverwriteInput).toHaveBeenCalledWith('');
    expect(mockCancelTypingTimeout).toHaveBeenCalledTimes(1);
    expect(mockSendTypingStatus).toHaveBeenCalledWith(false);
  });

  it('does not send typing=true while copy mode is on', () => {
    mockState.config.copyMode = true;
    mockState.config.autoSend = false;

    render(<App />);
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'typing text' } });

    expect(mockSendTypingStatus).not.toHaveBeenCalledWith(true);
  });
});
