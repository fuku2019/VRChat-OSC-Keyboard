/**
 * capture tests - the offscreen 'paint' branch existed for a long time without
 * ever running, because no window was created with offscreen rendering on.
 * These lock in that it is reachable and that it feeds the same overlay update.
 * capture のテスト - オフスクリーンの 'paint' 経路は、オフスクリーン描画を有効に
 * したウィンドウが作られなかったため、長らく一度も実行されないまま存在していた。
 * ここではその経路に到達できることと、同じオーバーレイ更新に流れ込むことを固定する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { state } from './state.js';
import {
  pauseCapture,
  resumeCapture,
  startCapture,
  stopCapture,
} from './capture.js';

type Listener = (...args: unknown[]) => void;

const setOverlayTexturesD3D11 = vi.fn();

function makeImage(width: number, height: number) {
  return {
    getSize: () => ({ width, height }),
    toBitmap: () => Buffer.alloc(width * height * 4),
  };
}

function makeWebContents({ offscreen }: { offscreen: boolean }) {
  const listeners = new Map<string, Listener[]>();
  return {
    isOffscreen: () => offscreen,
    isDestroyed: () => false,
    setBackgroundThrottling: vi.fn(),
    setFrameRate: vi.fn(),
    startPainting: vi.fn(),
    stopPainting: vi.fn(),
    invalidate: vi.fn(),
    capturePage: vi.fn(async () => makeImage(8, 4)),
    on(event: string, listener: Listener) {
      const list = listeners.get(event) ?? [];
      list.push(listener);
      listeners.set(event, list);
    },
    once(event: string, listener: Listener) {
      this.on(event, listener);
    },
    removeListener: vi.fn((event: string, listener: Listener) => {
      const list = listeners.get(event) ?? [];
      listeners.set(
        event,
        list.filter((entry) => entry !== listener),
      );
    }),
    emit(event: string, ...args: unknown[]) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener(...args);
    },
    listenerCount: (event: string) => listeners.get(event)?.length ?? 0,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  setOverlayTexturesD3D11.mockClear();
  state.overlayManager = { setOverlayTexturesD3D11 } as never;
  state.overlayHandle = 1 as never;
  state.overlayHandleBack = null;
  state.rendererMetrics.pixelWidth = 0;
  state.rendererMetrics.pixelHeight = 0;
  // Capture only runs for a visible overlay; the hidden case has its own test.
  // キャプチャは表示中のオーバーレイに対してのみ回る。非表示の場合は別テストで見る。
  state.overlayVisible = true;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  stopCapture();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('startCapture on an offscreen webContents', () => {
  it('drives the overlay from paint events instead of polling capturePage', () => {
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);

    expect(wc.setFrameRate).toHaveBeenCalledWith(90);
    expect(wc.startPainting).toHaveBeenCalled();
    expect(wc.listenerCount('paint')).toBe(1);

    // No polling timer should have been scheduled. / ポーリングのタイマーは積まれない。
    vi.advanceTimersByTime(200);
    expect(wc.capturePage).not.toHaveBeenCalled();
  });

  it('pushes each painted frame to the overlay', () => {
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);

    wc.emit('paint', {}, { x: 0, y: 0, width: 8, height: 4 }, makeImage(8, 4));

    expect(setOverlayTexturesD3D11).toHaveBeenCalledTimes(1);
    const [handle, backHandle, buffer, width, height] =
      setOverlayTexturesD3D11.mock.calls[0];
    expect(handle).toBe(1);
    expect(backHandle).toBe(0);
    expect(buffer.length).toBe(8 * 4 * 4);
    expect(width).toBe(8);
    expect(height).toBe(4);
  });

  it('clamps the requested frame rate to the supported range', () => {
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 999);
    expect(wc.setFrameRate).toHaveBeenCalledWith(120);
  });

  it('stops painting and unsubscribes on stopCapture', () => {
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);
    stopCapture();

    expect(wc.stopPainting).toHaveBeenCalled();
    expect(wc.removeListener).toHaveBeenCalledWith('paint', expect.any(Function));
    expect(wc.listenerCount('paint')).toBe(0);
  });
});

describe('pausing while the overlay is hidden', () => {
  it.each([
    ['offscreen', true],
    ['polling', false],
  ])('starts idle in %s mode when the overlay is not visible', async (_label, offscreen) => {
    state.overlayVisible = false;
    const wc = makeWebContents({ offscreen });
    startCapture(wc as never, 90);

    await vi.advanceTimersByTimeAsync(200);
    expect(wc.capturePage).not.toHaveBeenCalled();
    if (offscreen) expect(wc.stopPainting).toHaveBeenCalled();
  });

  it('repaints on resume so the overlay does not show a stale frame', () => {
    state.overlayVisible = false;
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);

    resumeCapture();
    expect(wc.startPainting).toHaveBeenCalledTimes(2);
    expect(wc.invalidate).toHaveBeenCalled();
  });

  it('stops delivering frames once paused', () => {
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);
    pauseCapture();

    expect(wc.stopPainting).toHaveBeenCalled();
    expect(state.capturePaused).toBe(true);
  });

  it('resumes polling after a pause', async () => {
    const wc = makeWebContents({ offscreen: false });
    startCapture(wc as never, 90);
    pauseCapture();
    wc.capturePage.mockClear();

    await vi.advanceTimersByTimeAsync(200);
    expect(wc.capturePage).not.toHaveBeenCalled();

    resumeCapture();
    await vi.advanceTimersByTimeAsync(1);
    expect(wc.capturePage).toHaveBeenCalled();
  });
});

describe('startCapture on a normal webContents', () => {
  it('falls back to polling capturePage', async () => {
    const wc = makeWebContents({ offscreen: false });
    startCapture(wc as never, 90);

    expect(wc.setFrameRate).not.toHaveBeenCalled();
    expect(wc.startPainting).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(wc.capturePage).toHaveBeenCalled();
    expect(setOverlayTexturesD3D11).toHaveBeenCalled();
  });
});
