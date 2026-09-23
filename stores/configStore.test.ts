/**
 * configStore tests - a config change made in one window reaches the other
 * through the main process. Adopting it must not send it straight back, or the
 * two windows would echo the same value at each other forever.
 * configStore のテスト - 片方のウィンドウでの設定変更は、メインプロセス経由で
 * もう一方へ届く。取り込む際に送り返してはならない。送り返すと2つのウィンドウが
 * 同じ値を延々とエコーし合うことになる。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STORAGE_KEYS } from '../constants';
import type { OscConfig } from '../types';

const broadcastConfig = vi.fn();
let broadcastListener: ((config: OscConfig) => void) | null = null;

vi.stubGlobal('window', globalThis.window);
window.electronAPI = {
  broadcastConfig,
  onConfigBroadcast: (callback: (config: OscConfig) => void) => {
    broadcastListener = callback;
  },
  // Stubs for the startup sync the module runs on load. Leaving them out makes
  // that sync reject in the background and pollute the run.
  // モジュール読み込み時に走る起動同期用のスタブ。用意しないとその同期が背後で
  // reject し、実行結果を汚す。
  logConfigChange: vi.fn(),
  updateOscPort: vi.fn(),
  getSteamVrAutoLaunch: vi.fn(async () => ({ success: false })),
  getBridgePort: vi.fn(async () => ({ port: null })),
} as unknown as typeof window.electronAPI;

// A config saved by an older build, still carrying the display settings that
// were removed when the app became VR-only.
// 古いビルドが保存した設定。アプリがVR専用になったときに削除した表示設定を
// まだ含んでいる。
localStorage.setItem(
  STORAGE_KEYS.OSC_CONFIG,
  JSON.stringify({ language: 'ja', disableOverlay: true, vrOsrMode: 'never' }),
);

const { useConfigStore } = await import('./configStore');

const initialConfig = useConfigStore.getState().config;

beforeEach(() => {
  broadcastConfig.mockClear();
  localStorage.clear();
  useConfigStore.setState({ config: initialConfig, externalRevision: 0 });
});

describe('loading a config saved by an older build', () => {
  it('drops the removed display settings instead of carrying them forward', () => {
    expect(initialConfig).not.toHaveProperty('disableOverlay');
    expect(initialConfig).not.toHaveProperty('vrOsrMode');
    expect(initialConfig.language).toBe('ja');
  });
});

describe('local changes', () => {
  it('are persisted and broadcast to the other window', () => {
    useConfigStore.getState().updateConfig('language', 'en');
    expect(useConfigStore.getState().config.language).toBe('en');
    expect(broadcastConfig).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en' }),
    );
  });
});

describe('cross-window broadcast', () => {
  it('subscribes on module load', () => {
    expect(broadcastListener).toBeTypeOf('function');
  });

  it('adopts an incoming config and bumps externalRevision', () => {
    const incoming = { ...initialConfig, language: 'en' as const, theme: 'light' as const };
    broadcastListener!(incoming);

    const state = useConfigStore.getState();
    expect(state.config.language).toBe('en');
    expect(state.config.theme).toBe('light');
    expect(state.externalRevision).toBe(1);
  });

  it('persists the incoming config so a reload keeps it', () => {
    const incoming = { ...initialConfig, language: 'en' as const };
    broadcastListener!(incoming);

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.OSC_CONFIG) ?? '{}');
    expect(saved.language).toBe('en');
  });

  it('does not send the adopted config back to the other window', () => {
    broadcastListener!({ ...initialConfig, language: 'en' as const });
    expect(broadcastConfig).not.toHaveBeenCalled();
  });

  it('bumps externalRevision once per incoming change', () => {
    broadcastListener!({ ...initialConfig, language: 'en' as const });
    broadcastListener!({ ...initialConfig, language: 'ja' as const });
    expect(useConfigStore.getState().externalRevision).toBe(2);
  });
});
