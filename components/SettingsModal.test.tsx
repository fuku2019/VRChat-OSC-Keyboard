import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsModal from './SettingsModal';

const { mockSetConfig, mockConfig } = vi.hoisted(() => ({
  mockSetConfig: vi.fn(),
  mockConfig: {
    bridgeUrl: 'ws://127.0.0.1:8080',
    oscPort: 9000,
    autoSend: false,
    language: 'ja' as const,
    theme: 'dark' as const,
    accentColor: 'cyan',
    updateCheckInterval: 'weekly' as const,
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
  ConfirmDialog: () => null,
}));

describe('SettingsModal oscPort input behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
