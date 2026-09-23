/**
 * useSteamVrSettings tests - SteamVR input is not ready when the settings
 * window first opens, so "not initialized yet" must read as loading rather than
 * as a failure.
 * useSteamVrSettings のテスト - 設定ウィンドウが最初に開く時点でSteamVR入力は
 * まだ準備できていないため、「未初期化」は失敗ではなく読み込み中として見せねば
 * ならない。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSteamVrSettings } from './useSteamVrSettings';
import type { TranslationStrings } from '../constants';

const getSteamVrBindings = vi.fn();

const t = {
  steamVrBindingsUnavailable: 'unavailable',
  steamVrBindingsEmpty: 'none',
  steamVrAutoLaunchError: 'auto launch error',
} as unknown as TranslationStrings['settings'];

const notInitialized = {
  success: true,
  bindings: {
    initialized: false,
    toggleOverlay: [],
    triggerBindings: [],
    gripBindings: [],
    triggerBound: false,
    gripBound: false,
  },
};

const ready = {
  success: true,
  bindings: {
    initialized: true,
    toggleOverlay: ['trigger'],
    triggerBindings: ['trigger'],
    gripBindings: ['grip'],
    triggerBound: true,
    gripBound: true,
  },
};

// What SteamVR answers right after the action manifest is accepted: input is
// up, but the bindings have not been resolved yet.
// アクションマニフェストが受理された直後のSteamVRの答え: 入力は起動しているが、
// バインディングはまだ解決されていない。
const initializedButUnresolved = {
  success: true,
  bindings: {
    initialized: true,
    toggleOverlay: [],
    triggerBindings: [],
    gripBindings: [],
    triggerBound: false,
    gripBound: false,
  },
};

const render = () =>
  renderHook(() => useSteamVrSettings(true, t, vi.fn()));

beforeEach(() => {
  getSteamVrBindings.mockReset();
  window.electronAPI = {
    getSteamVrBindings,
  } as unknown as Window['electronAPI'];
});

afterEach(() => {
  window.electronAPI = undefined;
  vi.useRealTimers();
});

describe('waiting for the VR bootstrap', () => {
  it('reports loading, not unavailable, while input is still initializing', async () => {
    getSteamVrBindings.mockResolvedValue(notInitialized);
    const { result } = render();

    await waitFor(() => expect(getSteamVrBindings).toHaveBeenCalled());

    // This is the pair the tab renders on: loading wins over the unavailable
    // branch. / タブが分岐に使う組み合わせ。読み込み中が「利用できません」より優先される。
    expect(result.current.initialized).toBe(false);
    expect(result.current.loadingBindings).toBe(true);
    expect(result.current.bindingError).toBe('');
  });

  it('picks the bindings up once the bootstrap finishes', async () => {
    getSteamVrBindings
      .mockResolvedValueOnce(notInitialized)
      .mockResolvedValue(ready);
    const { result } = render();

    // The retry fires one interval later, past waitFor's default budget.
    // リトライは1インターバル後に走るため、waitFor の既定の待ち時間を超える。
    await waitFor(() => expect(result.current.initialized).toBe(true), {
      timeout: 4000,
    });

    expect(result.current.toggleBindings).toEqual(['trigger']);
    expect(result.current.loadingBindings).toBe(false);
  });

  // The bug from the screenshot: stopping at initialized=true left the tab on
  // "no bindings assigned" plus a warning to go and set them up, for bindings
  // that SteamVR delivered a moment later.
  // スクリーンショットのバグ: initialized=true で止めていたため、SteamVRが直後に
  // 届けるはずのバインディングに対して、タブに「現在の割り当てはありません」と
  // 設定を促す警告が出ていた。
  it('keeps waiting past initialization until the bindings are resolved', async () => {
    getSteamVrBindings
      .mockResolvedValueOnce(notInitialized)
      .mockResolvedValueOnce(initializedButUnresolved)
      .mockResolvedValue(ready);
    const { result } = render();

    await waitFor(() => expect(result.current.initialized).toBe(true), {
      timeout: 4000,
    });
    // Initialized but still empty is loading, not "nothing assigned".
    // 初期化済みでも空のうちは読み込み中であり、「割り当てなし」ではない。
    expect(result.current.toggleBindings).toEqual([]);
    expect(result.current.loadingBindings).toBe(true);

    await waitFor(() => expect(result.current.toggleBindings).toEqual(['trigger']), {
      timeout: 4000,
    });
    expect(result.current.loadingBindings).toBe(false);
  });

  it('stops asking once the bindings have arrived', async () => {
    getSteamVrBindings.mockResolvedValue(ready);
    const { result } = render();

    await waitFor(() => expect(result.current.initialized).toBe(true));
    const callsWhenReady = getSteamVrBindings.mock.calls.length;

    await new Promise((resolve) => setTimeout(resolve, 1200));

    expect(getSteamVrBindings.mock.calls.length).toBe(callsWhenReady);
  });

  // The retry budget is bounded so that a machine without SteamVR eventually
  // settles on the unavailable state. Waiting the whole budget out in real time
  // would cost more than the rest of the suite, so what is pinned here is the
  // property that actually carries risk: the retries are paced, not a runaway
  // loop hammering the main process.
  // リトライには上限があり、SteamVRのないマシンでは最終的に「利用できません」に
  // 落ち着く。上限いっぱいを実時間で待つとスイートの残り全体より高くつくため、
  // ここで固定するのは実際にリスクのある性質のほうである - リトライが一定間隔で
  // あり、メインプロセスを叩き続ける暴走ループではないこと。
  it('paces its retries instead of spinning', async () => {
    getSteamVrBindings.mockResolvedValue(notInitialized);
    render();

    await waitFor(() => expect(getSteamVrBindings).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const calls = getSteamVrBindings.mock.calls.length;
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThanOrEqual(4);
  });
});

describe('a failed query', () => {
  it('shows the error instead of retrying forever', async () => {
    getSteamVrBindings.mockResolvedValue({ success: false });
    const { result } = render();

    await waitFor(() =>
      expect(result.current.bindingError).toBe('unavailable'),
    );

    const callsAfterError = getSteamVrBindings.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 1200));

    expect(getSteamVrBindings.mock.calls.length).toBe(callsAfterError);
    expect(result.current.loadingBindings).toBe(false);
  });
});
