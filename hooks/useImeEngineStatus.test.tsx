import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImeEngineStatus from '../components/ImeEngineStatus';
import { useImeEngineStatus } from './useImeEngineStatus';
import type { ImeEngineStatus as Status } from '../types/ime';

beforeEach(() => { vi.useFakeTimers(); delete window.electronAPI; });
afterEach(() => { cleanup(); delete window.electronAPI; vi.useRealTimers(); });
describe('IME engine status', () => {
  it('shows model absence and subsequent recovery without opening an editing session', async () => {
    const getStatus = vi.fn<() => Promise<Status>>()
      .mockResolvedValueOnce({ state: 'ready', engine: 'azookey', reason: 'model-unavailable' })
      .mockResolvedValue({ state: 'ready', engine: 'zenzai' });
    const convert = vi.fn();
    window.electronAPI = { imeGetStatus: getStatus, imeConvert: convert } as unknown as typeof window.electronAPI;
    render(<ImeEngineStatus language='ja' />);
    await act(async () => {});
    expect(screen.getByRole('status').textContent).toContain('Zenzaiモデルが未導入');
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole('status').textContent).toBe('日本語変換：Zenzai');
    expect(convert).not.toHaveBeenCalled();
  });
  it('does not overlap requests and stops polling after unmount', async () => {
    let finish!: (status: Status) => void;
    const getStatus = vi.fn(() => new Promise<Status>(resolve => { finish = resolve; }));
    window.electronAPI = { imeGetStatus: getStatus } as unknown as typeof window.electronAPI;
    const { unmount } = renderHook(() => useImeEngineStatus());
    act(() => vi.advanceTimersByTime(5000));
    expect(getStatus).toHaveBeenCalledOnce();
    unmount();
    await act(async () => { finish({ state: 'ready', engine: 'zenzai' }); });
    act(() => vi.advanceTimersByTime(5000));
    expect(getStatus).toHaveBeenCalledOnce();
  });
  it('shows kana fallback when the status request fails', async () => {
    window.electronAPI = { imeGetStatus: vi.fn().mockRejectedValue(new Error('closed')) } as unknown as typeof window.electronAPI;
    render(<ImeEngineStatus language='ja' />);
    await act(async () => {});
    expect(screen.getByRole('status').textContent).toContain('かな変換を使用');
  });
});
