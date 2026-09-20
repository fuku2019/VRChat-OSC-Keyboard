import { state } from './state.js';
import {
  perfNow,
  recordDrop,
  recordFrame,
  recordStage,
} from './perf.js';

const DEFAULT_CAPTURE_FPS = 60;
const MIN_CAPTURE_FPS = 1;
const MAX_CAPTURE_FPS = 120;
const SIZE_MISMATCH_LOG_INTERVAL_MS = 5000;
const MAX_FRAME_RETENTION = 3;
const SETTLE_DELAY_MS = 120;
const INVALID_OVERLAY_HANDLE = 0;
const captureFrameListeners = new Set();

function normalizeFps(fps) {
  const parsed = Number.isFinite(fps) ? fps : Number(fps);
  if (!Number.isFinite(parsed)) return DEFAULT_CAPTURE_FPS;
  return Math.max(MIN_CAPTURE_FPS, Math.min(parsed, MAX_CAPTURE_FPS));
}

function getBitmapBuffer(image) {
  return image.toBitmap();
}

function deriveSizeFromBuffer(size, bufferLength) {
  if (bufferLength % 4 !== 0) return null;
  const actualPixels = bufferLength / 4;
  if (!Number.isFinite(actualPixels) || actualPixels <= 0) return null;

  const aspectRatio = size.width / size.height;
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return null;

  const approxWidth = Math.max(
    1,
    Math.round(Math.sqrt(actualPixels * aspectRatio)),
  );
  let width = approxWidth;
  let height = Math.max(1, Math.round(actualPixels / width));

  if (width * height * 4 !== bufferLength) {
    const heightFloor = Math.max(1, Math.floor(actualPixels / width));
    if (width * heightFloor * 4 === bufferLength) {
      height = heightFloor;
    } else {
      const widthFloor = Math.max(
        1,
        Math.floor(Math.sqrt(actualPixels * aspectRatio)),
      );
      const heightAlt = Math.max(1, Math.floor(actualPixels / widthFloor));
      if (widthFloor * heightAlt * 4 === bufferLength) {
        width = widthFloor;
        height = heightAlt;
      } else {
        return null;
      }
    }
  }

  return { width, height };
}

function retainFrame(buffer, image) {
  state.frameRetention.push({ buffer, image });
  if (state.frameRetention.length > MAX_FRAME_RETENTION) {
    state.frameRetention.shift();
  }
}

/**
 * Force one more frame once the page goes quiet.
 * ページが静かになったら、もう1枚だけフレームを強制する。
 *
 * Offscreen rendering only paints on damage, so the last paint of a burst is
 * the one the overlay is left holding. If that frame is dropped - an empty
 * image, a size mismatch, a paint that arrives while the previous one is still
 * being uploaded - the overlay keeps showing the frame before it until
 * something else on the page happens to change. That is how a cursor that the
 * renderer has already removed stays on screen. One forced repaint after the
 * activity stops closes that window, and it is bounded: a forced frame does not
 * itself trigger another.
 * オフスクリーン描画は変化があったときしか描かないため、一連の描画の最後の1枚が
 * そのままオーバーレイに残る絵になる。その1枚が落ちると (画像が空、サイズ不一致、
 * 前の1枚を転送中に届いた等)、ページに次の変化が起きるまでオーバーレイは1つ前の
 * 絵を表示し続ける。レンダラーが既に消したカーソルが画面に残るのはこれが理由である。
 * 活動が止まった後に1枚だけ強制的に描き直せばこの隙間は塞がる。強制した1枚が
 * さらに次を呼ぶことはないので、回数は増えない。
 */
function armSettleTimer() {
  if (!state.captureWebContents || state.capturePaused) return;
  if (state.settleTimer) clearTimeout(state.settleTimer);
  state.settleTimer = setTimeout(runSettle, SETTLE_DELAY_MS);
}

function runSettle() {
  state.settleTimer = null;
  const webContents = state.captureWebContents;
  if (!webContents || webContents.isDestroyed() || state.capturePaused) return;
  // Nothing new since the last forced frame, so there is nothing to settle.
  // 前回の強制フレーム以降に新しいものがないので、確定させる対象がない。
  if (!state.sawRealFrameSinceSettle) return;

  state.sawRealFrameSinceSettle = false;
  state.settleFramePending = true;
  if (typeof webContents.invalidate === 'function') {
    webContents.invalidate();
  }
}

function clearSettleState() {
  if (state.settleTimer) {
    clearTimeout(state.settleTimer);
    state.settleTimer = null;
  }
  state.settleFramePending = false;
  state.sawRealFrameSinceSettle = false;
}

/**
 * Note that the pipeline did some work, whether or not a frame got through.
 * A dropped frame counts, because a drop is exactly what leaves a stale image.
 * フレームが通ったかどうかにかかわらず、パイプラインが動いたことを記録する。
 * 取りこぼしも数える。古い絵が残る原因はまさに取りこぼしだからである。
 */
function noteFrameActivity() {
  if (state.settleFramePending) {
    state.settleFramePending = false;
  } else {
    state.sawRealFrameSinceSettle = true;
  }
  armSettleTimer();
}

function notifyCaptureFrame(info) {
  if (captureFrameListeners.size === 0) return;
  for (const listener of captureFrameListeners) {
    try {
      listener(info);
    } catch (e) {
      console.warn('Capture frame listener error:', e);
    }
  }
}

export function addCaptureFrameListener(listener) {
  if (typeof listener !== 'function') return () => {};
  captureFrameListeners.add(listener);
  return () => captureFrameListeners.delete(listener);
}

function updateOverlayFromImage(image) {
  if (!state.overlayManager || state.overlayHandle === null) return false;

  const frameStartedAt = perfNow();

  const size = image.getSize();
  if (!size || size.width === 0 || size.height === 0) {
    recordDrop('empty-size');
    return false;
  }

  const bitmapStartedAt = perfNow();
  const bgraBuffer = getBitmapBuffer(image);
  recordStage('bitmap', bitmapStartedAt);
  if (!bgraBuffer || bgraBuffer.length === 0) {
    recordDrop('empty-buffer');
    return false;
  }

  let width = size.width;
  let height = size.height;

  if (
    state.rendererMetrics.pixelWidth > 0 &&
    state.rendererMetrics.pixelHeight > 0
  ) {
    const metricsExpected =
      state.rendererMetrics.pixelWidth * state.rendererMetrics.pixelHeight * 4;
    if (bgraBuffer.length === metricsExpected) {
      width = state.rendererMetrics.pixelWidth;
      height = state.rendererMetrics.pixelHeight;
    }
  }

  const expectedSize = width * height * 4;
  if (bgraBuffer.length !== expectedSize) {
    const derived = deriveSizeFromBuffer(size, bgraBuffer.length);
    if (!derived) {
      const now = Date.now();
      if (now - state.lastSizeMismatchTime > SIZE_MISMATCH_LOG_INTERVAL_MS) {
        console.warn(
          `Size mismatch: getSize()=${size.width}x${size.height}, buffer=${bgraBuffer.length} bytes (expected ${expectedSize}), skipping frame`,
        );
        state.lastSizeMismatchTime = now;
      }
      recordDrop('size-mismatch');
      return false;
    }

    width = derived.width;
    height = derived.height;

    const now = Date.now();
    if (now - state.lastSizeMismatchTime > SIZE_MISMATCH_LOG_INTERVAL_MS) {
      console.warn(
        `Size mismatch: getSize()=${size.width}x${size.height}, buffer=${bgraBuffer.length} bytes (expected ${expectedSize}), using calculated ${width}x${height}`,
      );
      state.lastSizeMismatchTime = now;
    }
  }

  // Keep references alive in case native side reads asynchronously
  state.lastFrameBuffer = bgraBuffer;
  state.lastFrameImage = image;
  retainFrame(bgraBuffer, image);

  // Update texture directly via D3D11 shared texture / D3D11共有テクスチャ経由で直接テクスチャを更新
  // Uses GPU memory sharing - no file I/O, minimal flickering / GPUメモリ共有を使用 - ファイルI/Oなし、点滅最小化
  const submitStartedAt = perfNow();
  state.overlayManager.setOverlayTexturesD3D11(
    state.overlayHandle,
    state.overlayHandleBack ?? INVALID_OVERLAY_HANDLE,
    bgraBuffer,
    width,
    height,
  );
  recordStage('submit', submitStartedAt);
  recordStage('total', frameStartedAt);
  recordFrame();
  notifyCaptureFrame({ width, height, timestamp: Date.now() });
  return true;
}

/**
 * Start capturing and updating overlay texture / オーバーレイテクスチャのキャプチャと更新を開始
 * @param {Electron.WebContents} webContents - The webContents to capture
 * @param {number} fps - Update frequency in FPS
 */
export function startCapture(webContents, fps = 60) {
  if (!state.overlayManager || state.overlayHandle === null) {
    console.warn('Overlay not initialized (or disabled), skipping capture');
    return;
  }

  if (!webContents) {
    console.warn('No webContents provided, skipping capture');
    return;
  }

  if (webContents.isDestroyed && webContents.isDestroyed()) {
    console.warn('webContents already destroyed, skipping capture');
    return;
  }

  stopCapture();

  const clampedFps = normalizeFps(fps);
  const intervalMs = Math.max(1, Math.floor(1000 / clampedFps));
  const isOffscreen =
    typeof webContents.isOffscreen === 'function' && webContents.isOffscreen();
  const modeLabel = isOffscreen ? 'offscreen paint' : 'polling';
  console.log(
    `Starting capture at ${clampedFps} FPS (${intervalMs}ms interval) with GPU direct transfer (${modeLabel})`,
  );

  state.captureWebContents = webContents;
  state.captureInProgress = false;

  if (typeof state.captureWebContents.setBackgroundThrottling === 'function') {
    state.captureWebContents.setBackgroundThrottling(false);
  }

  state.destroyedHandler = () => stopCapture();
  state.renderGoneHandler = (_event, details) => {
    console.warn('Render process gone, stopping capture:', details);
    stopCapture();
  };
  if (typeof state.captureWebContents.once === 'function') {
    state.captureWebContents.once('destroyed', state.destroyedHandler);
  }
  if (typeof state.captureWebContents.on === 'function') {
    state.captureWebContents.on('render-process-gone', state.renderGoneHandler);
  }

  if (isOffscreen) {
    if (typeof webContents.setFrameRate === 'function') {
      webContents.setFrameRate(Math.round(clampedFps));
    }
    if (typeof webContents.startPainting === 'function') {
      webContents.startPainting();
    }

    state.paintHandler = (_event, _dirty, image) => {
      if (!state.captureWebContents || state.captureWebContents.isDestroyed()) {
        stopCapture();
        return;
      }
      if (state.captureInProgress) return;
      state.captureInProgress = true;
      try {
        updateOverlayFromImage(image);
      } catch (error) {
        if (!error.message?.includes('destroyed')) {
          console.error('Capture error:', error);
        } else {
          stopCapture();
        }
      } finally {
        state.captureInProgress = false;
        noteFrameActivity();
      }
    };

    webContents.on('paint', state.paintHandler);
    pauseWhileHidden();
    return;
  }

  let nextCaptureTime = Date.now();

  async function tick() {
    if (!state.captureWebContents || state.captureWebContents.isDestroyed()) {
      stopCapture();
      return;
    }
    if (state.capturePaused) return;
    if (state.captureInProgress) {
      scheduleNext(1);
      return;
    }
    state.captureInProgress = true;
    try {
      // Capture the page / ページをキャプチャ
      const image = await state.captureWebContents.capturePage();
      // Verify webContents again after await check / await後に再度webContentsを確認
      if (!state.captureWebContents || state.captureWebContents.isDestroyed()) {
        stopCapture();
        return;
      }
      updateOverlayFromImage(image);
    } catch (error) {
      recordDrop('capture-error');
      if (!error.message?.includes('destroyed')) {
        console.error('Capture error:', error);
      } else {
        stopCapture();
      }
    } finally {
      state.captureInProgress = false;
      noteFrameActivity();
      if (state.captureWebContents) {
        const now = Date.now();
        while (nextCaptureTime <= now) {
          nextCaptureTime += intervalMs;
        }
        const delayMs = Math.max(1, nextCaptureTime - now);
        scheduleNext(delayMs);
      }
    }
  }

  function scheduleNext(delayMs) {
    state.captureTimer = setTimeout(tick, delayMs);
  }

  // The polling loop lives in these closures, so resuming it needs a handle
  // back into them. / ポーリングループはこのクロージャの中にあるため、再開には
  // ここへ戻る手がかりが要る。
  state.captureResume = () => scheduleNext(0);

  scheduleNext(0);
  pauseWhileHidden();
}

/**
 * The overlay is created hidden and only appears on the controller toggle, so
 * capture starts idle rather than burning frames for something off screen.
 * オーバーレイは非表示の状態で作られ、コントローラーのトグルで初めて現れる。
 * そのためキャプチャは停止状態から始め、画面に出ていないもののためにフレームを
 * 焼き続けないようにする。
 */
function pauseWhileHidden() {
  if (!state.overlayVisible) {
    pauseCapture();
  }
}

/**
 * Stop producing overlay frames while the overlay is hidden.
 * オーバーレイが非表示の間、フレーム生成を止める。
 *
 * The overlay spends most of a session hidden behind the controller toggle, and
 * until now it kept capturing and calling SetOverlayTexture the whole time for
 * something nobody could see.
 * オーバーレイはセッションの大半をコントローラーのトグルの向こう側で非表示のまま
 * 過ごすが、これまではその間もキャプチャと SetOverlayTexture を回し続けており、
 * 誰にも見えないものを描き続けていた。
 */
export function pauseCapture() {
  if (!state.captureWebContents || state.capturePaused) return;
  state.capturePaused = true;
  clearSettleState();

  if (state.captureTimer) {
    clearTimeout(state.captureTimer);
    state.captureTimer = null;
  }
  const webContents = state.captureWebContents;
  if (state.paintHandler && typeof webContents.stopPainting === 'function') {
    webContents.stopPainting();
  }
  console.log('Capture paused');
}

/**
 * Resume frame production when the overlay comes back.
 * オーバーレイが戻ったときにフレーム生成を再開する。
 */
export function resumeCapture() {
  if (!state.captureWebContents || !state.capturePaused) return;
  state.capturePaused = false;

  const webContents = state.captureWebContents;
  if (state.paintHandler) {
    if (typeof webContents.startPainting === 'function') {
      webContents.startPainting();
    }
    // Offscreen rendering only paints on damage, so without this the overlay
    // would come back holding the frame from before it was hidden until
    // something on the page happened to change.
    // オフスクリーン描画は変化があったときしか描かないため、これがないと
    // オーバーレイは非表示前のフレームを抱えたまま戻り、ページに何か変化が
    // 起きるまでそのままになる。
    if (typeof webContents.invalidate === 'function') {
      webContents.invalidate();
    }
  } else if (state.captureResume) {
    state.captureResume();
  }
  console.log('Capture resumed');
}

/**
 * Stop capturing / キャプチャを停止
 */
export function stopCapture() {
  if (state.captureTimer) {
    clearTimeout(state.captureTimer);
    state.captureTimer = null;
  }
  if (state.captureWebContents) {
    const isDestroyed =
      typeof state.captureWebContents.isDestroyed === 'function' &&
      state.captureWebContents.isDestroyed();
    try {
      if (state.destroyedHandler) {
        state.captureWebContents.removeListener(
          'destroyed',
          state.destroyedHandler,
        );
      }
    } catch (e) {
      // Ignore if destroyed
    }
    try {
      if (state.renderGoneHandler) {
        state.captureWebContents.removeListener(
          'render-process-gone',
          state.renderGoneHandler,
        );
      }
    } catch (e) {
      // Ignore if destroyed
    }
    try {
      if (state.paintHandler) {
        state.captureWebContents.removeListener('paint', state.paintHandler);
      }
      if (
        !isDestroyed &&
        typeof state.captureWebContents.stopPainting === 'function'
      ) {
        state.captureWebContents.stopPainting();
      }
    } catch (e) {
      // Ignore if destroyed
    }
  }
  state.paintHandler = null;
  state.destroyedHandler = null;
  state.renderGoneHandler = null;
  state.captureWebContents = null;
  state.captureInProgress = false;
  state.capturePaused = false;
  state.captureResume = null;
  clearSettleState();
  state.lastFrameBuffer = null;
  state.lastFrameImage = null;
  state.frameRetention.length = 0;
  console.log('Capture stopped');
}
