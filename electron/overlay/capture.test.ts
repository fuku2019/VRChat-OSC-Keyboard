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
  requestCaptureFrame,
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
  state.backOverlayEnabled = false;
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

describe('settling after the page goes quiet', () => {
  it('forces one more frame so a dropped last frame cannot stick', async () => {
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);

    // A frame that gets dropped is exactly the case that leaves the overlay
    // holding a stale image. / 取りこぼされたフレームこそが、オーバーレイに古い絵を
    // 残す当のケースである。
    wc.emit('paint', {}, {}, makeImage(0, 0));
    expect(setOverlayTexturesD3D11).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(wc.invalidate).toHaveBeenCalledTimes(1);
  });

  it('does not let the forced frame trigger another one', async () => {
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);

    wc.emit('paint', {}, {}, makeImage(8, 4));
    await vi.advanceTimersByTimeAsync(200);
    expect(wc.invalidate).toHaveBeenCalledTimes(1);

    // The repaint the forced frame produces must not arm another one.
    // 強制フレームが生む描画が、さらにもう1回を呼んではならない。
    wc.emit('paint', {}, {}, makeImage(8, 4));
    await vi.advanceTimersByTimeAsync(1000);
    expect(wc.invalidate).toHaveBeenCalledTimes(1);
  });

  it('settles again once real activity resumes', async () => {
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);

    wc.emit('paint', {}, {}, makeImage(8, 4));
    await vi.advanceTimersByTimeAsync(200);
    wc.emit('paint', {}, {}, makeImage(8, 4)); // the forced frame
    await vi.advanceTimersByTimeAsync(200);
    expect(wc.invalidate).toHaveBeenCalledTimes(1);

    wc.emit('paint', {}, {}, makeImage(8, 4)); // real activity again
    await vi.advanceTimersByTimeAsync(200);
    expect(wc.invalidate).toHaveBeenCalledTimes(2);
  });

  it('does not force frames while the overlay is hidden', async () => {
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);
    wc.emit('paint', {}, {}, makeImage(8, 4));
    pauseCapture();

    await vi.advanceTimersByTimeAsync(1000);
    expect(wc.invalidate).not.toHaveBeenCalled();
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

describe('submitting to the back overlay', () => {
  const backHandleOf = (call: number) =>
    setOverlayTexturesD3D11.mock.calls[call][1];

  const paintOnce = (wc: ReturnType<typeof makeWebContents>) =>
    wc.emit('paint', {}, {}, makeImage(8, 4));

  it('skips the back overlay while it is disabled', () => {
    state.overlayHandleBack = 2 as never;
    state.backOverlayEnabled = false;
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);

    paintOnce(wc);

    // An invalid handle is how the native side is told to skip the second
    // SetOverlayTexture. / 無効なハンドルが、2回目のSetOverlayTextureを省く合図になる。
    expect(backHandleOf(0)).toBe(0);
  });

  it('submits to the back overlay once it is enabled', () => {
    state.overlayHandleBack = 2 as never;
    state.backOverlayEnabled = true;
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);

    paintOnce(wc);

    expect(backHandleOf(0)).toBe(2);
  });

  it('still skips it when enabled without a handle', () => {
    state.overlayHandleBack = null;
    state.backOverlayEnabled = true;
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);

    paintOnce(wc);

    expect(backHandleOf(0)).toBe(0);
  });
});

describe('requestCaptureFrame', () => {
  it('forces a repaint so a newly enabled surface gets a real frame', () => {
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);

    requestCaptureFrame();

    expect(wc.invalidate).toHaveBeenCalledTimes(1);
  });

  it('does nothing while capture is paused', () => {
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);
    pauseCapture();

    requestCaptureFrame();

    expect(wc.invalidate).not.toHaveBeenCalled();
  });

  it('leaves the polling path alone, which produces frames on its own', async () => {
    const wc = makeWebContents({ offscreen: false });
    startCapture(wc as never, 90);

    requestCaptureFrame();

    expect(wc.invalidate).not.toHaveBeenCalled();
  });

  it('does nothing when no capture is running', () => {
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);
    stopCapture();

    expect(() => requestCaptureFrame()).not.toThrow();
    expect(wc.invalidate).not.toHaveBeenCalled();
  });
});

describe('frame retention', () => {
  it('keeps only the current frame alive', () => {
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);

    // The native submit is synchronous, so retaining anything older than the
    // frame being submitted serves no purpose.
    // ネイティブ側の転送は同期的なので、転送中のフレームより古いものを保持しても
    // 意味はない。
    for (let i = 0; i < 5; i += 1) wc.emit('paint', {}, {}, makeImage(8, 4));

    expect(state.frameRetention.length).toBe(1);
  });

  it('drops every retained frame on stopCapture', () => {
    const wc = makeWebContents({ offscreen: true });
    startCapture(wc as never, 90);
    wc.emit('paint', {}, {}, makeImage(8, 4));

    stopCapture();

    expect(state.frameRetention.length).toBe(0);
    expect(state.lastFrameBuffer).toBe(null);
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
