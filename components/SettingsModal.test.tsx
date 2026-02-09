import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsModal from './SettingsModal';

const { mockSetConfig, mockConfig } = vi.hoisted(() => ({
  mockSetConfig: vi.fn(),
  mockConfig: {
    bridgeUrl: 'ws://127.0.0.1:8080',
    oscPort: 9000,
    autoSend: false,
    copyMode: false,
    autoSendBeforeCopyMode: false,
    language: 'ja' as const,
    theme: 'dark' as const,
    accentColor: 'cyan',
    updateCheckInterval: 'weekly' as const,
    steamVrAutoLaunch: false,
  },
}));

vi.mock('../stores/configStore', () => ({
  useConfigStore: (selector: any) =>
    selector({
      config: mockConfig,
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
});

describe('SettingsModal reset behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      expect(localStorage.getItem('test-key')).toBeNull();
    });
  });
});
