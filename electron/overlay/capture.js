import { state } from './state.js';

const DEFAULT_CAPTURE_FPS = 60;
const MIN_CAPTURE_FPS = 1;
const MAX_CAPTURE_FPS = 120;
const SIZE_MISMATCH_LOG_INTERVAL_MS = 5000;
const MAX_FRAME_RETENTION = 3;
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

  const approxWidth = Math.max(1, Math.round(Math.sqrt(actualPixels * aspectRatio)));
  let width = approxWidth;
  let height = Math.max(1, Math.round(actualPixels / width));

  if (width * height * 4 !== bufferLength) {
    const heightFloor = Math.max(1, Math.floor(actualPixels / width));
    if (width * heightFloor * 4 === bufferLength) {
      height = heightFloor;
    } else {
      const widthFloor = Math.max(1, Math.floor(Math.sqrt(actualPixels * aspectRatio)));
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

function applyOpaqueAlpha(buffer) {
  if (!buffer || buffer.length < 4 || buffer.length % 4 !== 0) return;
  const view = new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  for (let i = 0; i < view.length; i++) {
    view[i] |= 0xff000000;
  }
}

function retainFrame(buffer, image) {
  state.frameRetention.push({ buffer, image });
  if (state.frameRetention.length > MAX_FRAME_RETENTION) {
    state.frameRetention.shift();
  }
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

  const size = image.getSize();
  if (!size || size.width === 0 || size.height === 0) return false;

  const bgraBuffer = getBitmapBuffer(image);
  if (!bgraBuffer || bgraBuffer.length === 0) return false;

  let width = size.width;
  let height = size.height;

  if (state.rendererMetrics.pixelWidth > 0 && state.rendererMetrics.pixelHeight > 0) {
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

  if (state.forceOpaqueAlpha) {
    applyOpaqueAlpha(bgraBuffer);
  }

  // Keep references alive in case native side reads asynchronously
  state.lastFrameBuffer = bgraBuffer;
  state.lastFrameImage = image;
  retainFrame(bgraBuffer, image);

  // Update texture directly via D3D11 shared texture / D3D11共有テクスチャ経由で直接テクスチャを更新
  // Uses GPU memory sharing - no file I/O, minimal flickering / GPUメモリ共有を使用 - ファイルI/Oなし、点滅最小化
  state.overlayManager.setOverlayTexturesD3D11(
    state.overlayHandle,
    state.overlayHandleBack ?? 0,
    bgraBuffer,
    width,
    height,
  );
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
      }
    };

    webContents.on('paint', state.paintHandler);
    return;
  }

  async function tick() {
    if (!state.captureWebContents || state.captureWebContents.isDestroyed()) {
      stopCapture();
      return;
    }
    if (state.captureInProgress) {
      scheduleNext(intervalMs);
      return;
    }
    state.captureInProgress = true;
    const startedAt = Date.now();
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
      if (!error.message?.includes('destroyed')) {
        console.error('Capture error:', error);
      } else {
        stopCapture();
      }
    } finally {
      state.captureInProgress = false;
      if (state.captureWebContents) {
        const elapsed = Date.now() - startedAt;
        scheduleNext(Math.max(0, intervalMs - elapsed));
      }
    }
  }

  function scheduleNext(delayMs) {
    state.captureTimer = setTimeout(tick, delayMs);
  }

  scheduleNext(0);
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
        state.captureWebContents.removeListener('destroyed', state.destroyedHandler);
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
  state.lastFrameBuffer = null;
  state.lastFrameImage = null;
  state.frameRetention.length = 0;
  console.log('Capture stopped');
}
