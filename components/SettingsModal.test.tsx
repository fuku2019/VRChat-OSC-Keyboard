import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsModal from './SettingsModal';

const { mockSetConfig, getCurrentConfig, resetMockConfig, mockReloadWindow } =
  vi.hoisted(() => {
  const createInitialConfig = () => ({
    bridgeUrl: 'ws://127.0.0.1:8080',
    oscPort: 9000,
    autoSend: false,
    copyMode: false,
    autoSendBeforeCopyMode: false,
    language: 'ja' as const,
    theme: 'dark' as const,
    accentColor: 'cyan',
    updateCheckInterval: 'weekly' as const,
    disableOverlay: false,
    steamVrAutoLaunch: false,
  });

  let currentConfig = createInitialConfig();
  const mockSetConfig = vi.fn((newConfig: any) => {
    currentConfig = { ...newConfig };
  });
  const getCurrentConfig = () => currentConfig;
  const resetMockConfig = () => {
    currentConfig = createInitialConfig();
    mockSetConfig.mockClear();
  };

  return {
    mockSetConfig,
    getCurrentConfig,
    resetMockConfig,
    mockReloadWindow: vi.fn(),
  };
});

vi.mock('../stores/configStore', () => ({
  useConfigStore: (selector: any) =>
    selector({
      config: getCurrentConfig(),
      setConfig: mockSetConfig,
    }),
}));

vi.mock('../hooks/useModalAnimation', () => ({
  useModalAnimation: () => ({
    shouldRender: true,
    animationClass: '',
    modalAnimationClass: '',
  }),
}));

vi.mock('../utils/windowUtils', () => ({
  reloadWindow: mockReloadWindow,
}));

vi.mock('./ConfirmDialog', () => ({
  ConfirmDialog: ({
    isOpen,
    onConfirm,
  }: {
    isOpen: boolean;
    onConfirm: () => void;
  }) =>
    isOpen ? (
      <button type='button' data-testid='confirm-reset' onClick={onConfirm}>
        confirm-reset
      </button>
    ) : null,
}));

describe('SettingsModal oscPort input behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockConfig();
    delete (window as any).electronAPI;
  });

  const renderModal = () =>
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        onShowTutorial={vi.fn()}
      />,
    );

  it('allows clearing and retyping without immediate save', async () => {
    renderModal();
    const input = screen.getByPlaceholderText('9000') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(mockSetConfig).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '12345' } });
    expect(input.value).toBe('12345');
    expect(mockSetConfig).not.toHaveBeenCalled();

    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockSetConfig).toHaveBeenCalledWith(
        expect.objectContaining({ oscPort: 12345 }),
      );
    });
  });

  it('reverts invalid value on blur without saving', async () => {
    renderModal();
    const input = screen.getByPlaceholderText('9000') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '70000' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockSetConfig).not.toHaveBeenCalled();
      expect(input.value).toBe('9000');
    });
  });

  it('commits valid value on Enter key', async () => {
    renderModal();
    const input = screen.getByPlaceholderText('9000') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '9001' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(mockSetConfig).toHaveBeenCalledWith(
        expect.objectContaining({ oscPort: 9001 }),
      );
    });
  });

  it('keeps oscPort draft input when other settings are changed while open', () => {
    renderModal();
    const input = screen.getByPlaceholderText('9000') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'ライト' }));

    expect(input.value).toBe('1234');
  });
});

describe('SettingsModal reset behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockConfig();
    delete (window as any).electronAPI;
  });

  const renderModal = () =>
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        onShowTutorial={vi.fn()}
      />,
    );

  const triggerReset = () => {
    fireEvent.click(screen.getByRole('button', { name: '設定を初期化' }));
    fireEvent.click(screen.getByTestId('confirm-reset'));
  };

  it('clears localStorage and restarts app when restart API exists', async () => {
    const clearSpy = vi.spyOn(Storage.prototype, 'clear');
    const restartApp = vi.fn().mockResolvedValue({ success: true });
    (window as any).electronAPI = { restartApp };

    renderModal();
    localStorage.setItem('test-key', 'test-value');
    triggerReset();

    await waitFor(() => {
      expect(clearSpy).toHaveBeenCalled();
      expect(restartApp).toHaveBeenCalled();
      expect(mockReloadWindow).not.toHaveBeenCalled();
      expect(localStorage.getItem('test-key')).toBeNull();
    });
  });

  it('falls back to reload when restart API does not exist', async () => {
    const clearSpy = vi.spyOn(Storage.prototype, 'clear');

    renderModal();
    localStorage.setItem('test-key', 'test-value');
    triggerReset();

    await waitFor(() => {
      expect(clearSpy).toHaveBeenCalled();
      expect(mockReloadWindow).toHaveBeenCalled();
      expect(localStorage.getItem('test-key')).toBeNull();
    });
  });

  it('falls back to reload when restart API fails', async () => {
    const clearSpy = vi.spyOn(Storage.prototype, 'clear');
    const restartApp = vi.fn().mockResolvedValue({ success: false });
    (window as any).electronAPI = { restartApp };

    renderModal();
    localStorage.setItem('test-key', 'test-value');
    triggerReset();

    await waitFor(() => {
      expect(clearSpy).toHaveBeenCalled();
      expect(restartApp).toHaveBeenCalled();
      expect(mockReloadWindow).toHaveBeenCalled();
      expect(localStorage.getItem('test-key')).toBeNull();
    });
  });
});

describe('SettingsModal accent color behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockConfig();
    delete (window as any).electronAPI;
  });

  const renderModal = () =>
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        onShowTutorial={vi.fn()}
      />,
    );

  it('switches to custom accent and allows hex input changes', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'カスタム' }));
    await waitFor(() => {
      expect(mockSetConfig).toHaveBeenCalledWith(
        expect.objectContaining({ accentColor: '#ff0000' }),
      );
    });

    fireEvent.change(screen.getByLabelText('custom-accent-color-input'), {
      target: { value: '#123abc' },
    });

    await waitFor(() => {
      expect(mockSetConfig).toHaveBeenCalledWith(
        expect.objectContaining({ accentColor: '#123abc' }),
      );
    });
  });

  it('does not save invalid custom accent values', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'カスタム' }));
    await waitFor(() => {
      expect(mockSetConfig).toHaveBeenCalledWith(
        expect.objectContaining({ accentColor: '#ff0000' }),
      );
    });

    mockSetConfig.mockClear();
    fireEvent.change(screen.getByLabelText('custom-accent-color-input'), {
      target: { value: '#12' },
    });

    expect(mockSetConfig).not.toHaveBeenCalled();
  });
});

describe('SettingsModal async config updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockConfig();
  });

  it('does not overwrite newer settings when SteamVR auto-launch update resolves', async () => {
    let resolveSetSteamVrAutoLaunch:
      | ((result: { success: boolean }) => void)
      | undefined;
    const setSteamVrAutoLaunch = vi.fn(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          resolveSetSteamVrAutoLaunch = resolve;
        }),
    );
    (window as any).electronAPI = { setSteamVrAutoLaunch };

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        onShowTutorial={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '登録' }));
    fireEvent.click(screen.getByRole('button', { name: 'ライト' }));
    mockSetConfig.mockClear();

    resolveSetSteamVrAutoLaunch?.({ success: true });

    await waitFor(() => {
      expect(mockSetConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: 'light',
          steamVrAutoLaunch: true,
        }),
      );
    });
  });
});

describe('SettingsModal accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockConfig();
    delete (window as any).electronAPI;
  });

  it('is exposed as a dialog and supports Escape to close', () => {
    const onClose = vi.fn();
    render(
      <SettingsModal
        isOpen={true}
        onClose={onClose}
        onShowTutorial={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
