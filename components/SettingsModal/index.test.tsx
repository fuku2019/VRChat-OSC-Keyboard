/**
 * SettingsModal variant tests - the desktop settings window fills a window of
 * its own, so the panel variant must stay mounted and drop the modal scrim that
 * only makes sense when floating over the keyboard.
 * SettingsModal の variant のテスト - デスクトップ設定ウィンドウは専用ウィンドウ
 * 全体を占めるため、panel は常にマウントされ続け、キーボードの上に浮かぶときにしか
 * 意味を持たない暗幕を外す必要がある。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import SettingsModal from './index';

const baseProps = {
  onClose: vi.fn(),
  onShowTutorial: vi.fn(),
};

const scrim = () => screen.getByRole('dialog').parentElement;

beforeEach(() => {
  vi.stubGlobal('electronAPI', undefined);
  window.electronAPI = undefined;
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('variant="panel"', () => {
  it('renders even though isOpen animation state would hide a modal', () => {
    render(<SettingsModal {...baseProps} variant='panel' isOpen={false} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('drops the modal scrim and blur', () => {
    render(<SettingsModal {...baseProps} variant='panel' isOpen />);
    const classes = scrim()?.className ?? '';
    expect(classes).not.toContain('bg-black/60');
    expect(classes).not.toContain('backdrop-blur-sm');
  });

  it('fills the window instead of sitting in a centred card', () => {
    render(<SettingsModal {...baseProps} variant='panel' isOpen />);
    const classes = screen.getByRole('dialog').className;
    expect(classes).toContain('h-full');
    expect(classes).not.toContain('max-w-4xl');
    expect(classes).not.toContain('rounded-2xl');
  });
});

describe('variant="modal" (default)', () => {
  it('renders nothing while closed', () => {
    render(<SettingsModal {...baseProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the scrim and the centred card when open', () => {
    render(<SettingsModal {...baseProps} isOpen />);
    expect(scrim()?.className ?? '').toContain('bg-black/60');
    expect(screen.getByRole('dialog').className).toContain('max-w-4xl');
  });
});
