/**
 * VrStatusBanner tests - while SteamVR is not up, the settings window is the
 * only thing on screen, and this is what tells the user the app is waiting
 * rather than broken.
 * VrStatusBanner のテスト - SteamVR が動いていない間、画面にあるのは設定ウィンドウ
 * だけであり、アプリが壊れているのではなく待機中だと伝えるのはこれである。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, act, waitFor } from '@testing-library/react';
import VrStatusBanner from './VrStatusBanner';
import { TRANSLATIONS } from '../constants';
import { useConfigStore } from '../stores/configStore';
import type { VrStatus } from '../types';

let currentStatus: VrStatus = 'starting';
let statusListeners: ((status: VrStatus) => void)[] = [];

const emitStatus = (status: VrStatus) =>
  act(() => {
    statusListeners.forEach((listener) => listener(status));
  });

const t = () => TRANSLATIONS[useConfigStore.getState().config.language].settings;

beforeEach(() => {
  statusListeners = [];
  currentStatus = 'starting';
  window.electronAPI = {
    getVrStatus: async () => currentStatus,
    onVrStatusChanged: (listener: (status: VrStatus) => void) => {
      statusListeners.push(listener);
    },
    removeVrStatusChangedListener: (listener: (status: VrStatus) => void) => {
      statusListeners = statusListeners.filter((registered) => registered !== listener);
    },
  } as unknown as Window['electronAPI'];
});

afterEach(() => {
  cleanup();
  window.electronAPI = undefined;
});

describe('VrStatusBanner', () => {
  it('asks SteamVR to be started while waiting', async () => {
    currentStatus = 'waiting';
    render(<VrStatusBanner />);

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(t().vrStatusWaiting));
  });

  it('shows the failure message when the overlay could not start', async () => {
    currentStatus = 'failed';
    render(<VrStatusBanner />);

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(t().vrStatusFailed));
  });

  it('disappears once the overlay is running', async () => {
    currentStatus = 'running';
    render(<VrStatusBanner />);

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  // SteamVR started after the app - the whole point of waiting.
  // アプリの後に SteamVR が起動した場合。待機しているのはまさにこのためである。
  it('follows status changes pushed from the main process', async () => {
    currentStatus = 'waiting';
    render(<VrStatusBanner />);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(t().vrStatusWaiting));

    emitStatus('starting');
    expect(screen.getByRole('status').textContent).toBe(t().vrStatusStarting);

    emitStatus('running');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stops listening when unmounted', () => {
    const { unmount } = render(<VrStatusBanner />);
    expect(statusListeners).toHaveLength(1);

    unmount();

    expect(statusListeners).toHaveLength(0);
  });

  it('renders the starting message outside Electron without throwing', () => {
    window.electronAPI = undefined;
    render(<VrStatusBanner />);
    expect(screen.getByRole('status').textContent).toBe(t().vrStatusStarting);
  });
});
