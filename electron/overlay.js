import path from 'path';

import { createOverlayManager, getAssetPath } from './overlay/native.js';
import { state } from './overlay/state.js';
import {
  addCaptureFrameListener,
  startCapture,
  stopCapture,
} from './overlay/capture.js';
import {
  computeBackTransform,
  getSpawnTransform,
} from './overlay/transform.js';

// Constants / 定数
const OVERLAY_DEFAULT_WIDTH_M = 0.5;
const SPLASH_WIDTH_M = 0.3;
const SPLASH_DISTANCE_M = 1.5;
const SPLASH_DURATION_MS = 3000;

// Helper: Normalize Pose Matrix / ポーズ行列の正規化
function normalizePoseMatrix(pose) {
  if (!pose) return null;
  // Check for TypedArray or Array with 16 elements / TypedArrayまたは16要素の配列をチェック
  if ((Array.isArray(pose) || ArrayBuffer.isView(pose)) && pose.length === 16) {
    return Array.from(pose);
  }
  return null;
}

// Helper: Assert Overlay Manager API / オーバーレイマネージャーAPIの検証
function assertOverlayApi(manager) {
  const required = [
    'createOverlay',
    'destroyOverlay',
    'setOverlayWidth',
    'setOverlayFromFile',
    'showOverlay',
    'hideOverlay',
    'setOverlayTransformAbsolute',
    'setOverlayTransformHmd',
    'getControllerPose',
  ];
  for (const k of required) {
    if (typeof manager[k] !== 'function') {
      throw new Error(`OverlayManager missing API: ${k}`);
    }
  }
}

// Helper: Centralized Visibility State Update / 可視性状態更新の一元化
function setOverlayVisible(visible) {
  state.overlayVisible = visible;
}

export { addCaptureFrameListener, startCapture, stopCapture };

export function updateRendererMetrics(metrics) {
  if (!metrics) return;
  // Prioritize cssWidth/cssHeight, fallback to width/height
  const cssWidth = Number(metrics.cssWidth ?? metrics.width);
  const cssHeight = Number(metrics.cssHeight ?? metrics.height);
  const devicePixelRatio = Number(metrics.devicePixelRatio ?? metrics.dpr);
  const zoomFactor = Number(metrics.zoomFactor ?? 1);

  if (Number.isFinite(cssWidth) && cssWidth > 0) {
    state.rendererMetrics.cssWidth = cssWidth;
  }
  if (Number.isFinite(cssHeight) && cssHeight > 0) {
    state.rendererMetrics.cssHeight = cssHeight;
  }
  if (Number.isFinite(devicePixelRatio) && devicePixelRatio > 0) {
    state.rendererMetrics.devicePixelRatio = devicePixelRatio;
  }
  if (Number.isFinite(zoomFactor) && zoomFactor > 0) {
    state.rendererMetrics.zoomFactor = zoomFactor;
  }

  const effectiveScale =
    state.rendererMetrics.devicePixelRatio * state.rendererMetrics.zoomFactor;
  state.rendererMetrics.pixelWidth = Math.max(
    0,
    Math.round(state.rendererMetrics.cssWidth * effectiveScale),
  );
  state.rendererMetrics.pixelHeight = Math.max(
    0,
    Math.round(state.rendererMetrics.cssHeight * effectiveScale),
  );
  state.rendererMetrics.updatedAt = Date.now();
}

export function setOverlayPreferences(preferences) {
  if (!preferences) return;
  if (typeof preferences.forceOpaqueAlpha === 'boolean') {
    state.forceOpaqueAlpha = preferences.forceOpaqueAlpha;
  }
}

/**
 * Respawn specific overlay handle at ideal position relative to HMD
 * HMDに対する理想的な位置に指定のオーバーレイを再スポーン
 */
function respawnOverlay(handle, hmdPose) {
  try {
    const targetMat = getSpawnTransform(hmdPose);
    state.overlayManager.setOverlayTransformAbsolute(
      handle,
      Array.from(targetMat),
    );

    // Also move back overlay
    // 背面ハンドルも移動
    if (state.overlayHandleBack !== null) {
      const backMat = computeBackTransform(targetMat);
      state.overlayManager.setOverlayTransformAbsolute(
        state.overlayHandleBack,
        Array.from(backMat),
      );
    }
  } catch (e) {
    console.error('Failed to respawn overlay:', e);
  }
}

/**
 * Respawn all overlays (main + back)
 * 全てのオーバーレイ（メイン+背面）を再スポーン
 */
function respawnOverlayAll(hmdPose) {
  try {
    const targetMat = getSpawnTransform(hmdPose);
    setOverlayTransformAbsoluteAll(targetMat);
  } catch (e) {
    console.error('Failed to respawn all overlays:', e);
  }
}

/**
 * Reset overlay position to ideal spot
 * オーバーレイ位置を理想的な場所にリセット
 */
export function resetOverlayPosition() {
  if (!state.overlayManager) {
    console.warn(
      'Cannot reset overlay position: Manager is null (overlay disabled?)',
    );
    return;
  }

  try {
    // Get HMD Pose (Device 0)
    // Get HMD Pose (Device 0)
    let hmdPoseRaw = state.overlayManager.getControllerPose(0);
    const hmdPose = normalizePoseMatrix(hmdPoseRaw);

    // If HMD pose invalid, try to find it again or wait?
    // If completely lost, maybe just set to identity or skip.
    if (!hmdPose) {
      console.warn('HMD Pose not found, cannot reset position.');
      return;
    }

    // Apply to overlay handle / オーバーレイハンドルに適用
    respawnOverlayAll(hmdPose);

    console.log('Overlay position reset.');
  } catch (e) {
    console.error('Error resetting overlay position:', e);
  }
}

/**
 * Ensure overlay manager exists
 */
function ensureOverlayManager() {
  if (!state.overlayManager) {
    console.log('Initializing VR Overlay Manager...');
    state.overlayManager = createOverlayManager();
    // Verify required API / 必須APIの検証
    try {
      assertOverlayApi(state.overlayManager);
    } catch (e) {
      console.error('OverlayManager API check failed:', e);
      state.overlayManager = null; // Invalidate
      throw e;
    }
    console.log('VR System Initialized');

    // Debug: Log available methods
    if (state.debug) {
      console.log(
        'Available methods on OverlayManager:',
        Object.getOwnPropertyNames(Object.getPrototypeOf(state.overlayManager)),
      );
    }
  } else {
    // console.log('VR System already initialized, reusing manager');
  }
  return state.overlayManager;
}

/**
 * Initialize VR overlay / VRオーバーレイを初期化
 * @returns {number|null} Overlay handle or null on failure
 */
export function initOverlay() {
  let createdMain = null;
  let createdBack = null;

  try {
    console.log('Initializing VR Overlay...');
    ensureOverlayManager();

    // Get HMD pose for initial spawn / 初期スポーン用のHMDポーズを取得
    let hmdPose = null;
    try {
      hmdPose = normalizePoseMatrix(state.overlayManager.getControllerPose(0));
    } catch (e) {
      console.warn('Could not get HMD pose for initial spawn:', e);
    }

    // Create single overlay / 単一のオーバーレイを作成
    const key = 'vrchat-osc-keyboard-overlay';
    const name = 'VRC Keyboard';
    createdMain = state.overlayManager.createOverlay(key, name);

    // Create backside overlay for double-sided rendering
    const backKey = 'vrchat-osc-keyboard-overlay-back';
    const backName = 'VRC Keyboard (Back)';
    createdBack = state.overlayManager.createOverlay(backKey, backName);

    // Success - Commit to state / 成功 - 状態にコミット
    state.overlayHandle = createdMain;
    state.overlayHandleBack = createdBack;

    console.log(`Overlay Created with handle: ${state.overlayHandle}`);
    console.log(`Back Overlay Created with handle: ${state.overlayHandleBack}`);

    if (
      state.overlayHandleBack !== null &&
      typeof state.overlayManager.setOverlayTextureBounds === 'function'
    ) {
      // Mirror horizontally so the backside looks reversed
      state.overlayManager.setOverlayTextureBounds(
        state.overlayHandleBack,
        1.0,
        0.0,
        0.0,
        1.0,
      );
    }

    // Set overlay width / オーバーレイの幅を設定
    state.overlayManager.setOverlayWidth(
      state.overlayHandle,
      OVERLAY_DEFAULT_WIDTH_M,
    );
    if (state.overlayHandleBack !== null) {
      state.overlayManager.setOverlayWidth(
        state.overlayHandleBack,
        OVERLAY_DEFAULT_WIDTH_M,
      );
    }

    // Initial Placement: World Fixed (Absolute) / 初期配置: ワールド固定（絶対）
    if (hmdPose) {
      respawnOverlayAll(hmdPose);
    } else {
      // Fallback: Relative to HMD (Device 0) if pose missing
      // ポーズがない場合のフォールバック: HMD相対
      console.log('HMD Pose missing, falling back to relative attachment');
      state.overlayManager.setOverlayTransformHmd(state.overlayHandle, 0.5);
      // Disable back overlay in relative mode by default to avoid clipping
      if (state.overlayHandleBack !== null) {
        state.overlayManager.hideOverlay(state.overlayHandleBack);
        state.backOverlayEnabled = false;
      }
    }

    // Set initial texture / 初期テクスチャを設定
    const texturePath = getAssetPath(path.join('img', 'logo.png'));
    console.log(`Setting overlay texture from: ${texturePath}`);

    try {
      state.overlayManager.setOverlayFromFile(state.overlayHandle, texturePath);
    } catch (e) {
      console.error(`Failed to set initial texture from ${texturePath}:`, e);
    }

    if (state.overlayHandleBack !== null) {
      try {
        state.overlayManager.setOverlayFromFile(
          state.overlayHandleBack,
          texturePath,
        );
      } catch (e) {
        console.error(
          `Failed to set back initial texture from ${texturePath}:`,
          e,
        );
      }
    }

    console.log('Overlay Initial Props Set');

    return state.overlayHandle;
  } catch (error) {
    console.error('Failed to init VR Overlay:', error);

    // Rollback cleanup / ロールバック処理
    const m = state.overlayManager;
    if (m) {
      try {
        if (createdBack !== null) m.destroyOverlay(createdBack);
      } catch {}
      try {
        if (createdMain !== null) m.destroyOverlay(createdMain);
      } catch {}
    }

    state.overlayHandleBack = null;
    state.overlayHandle = null;

    return null;
  }
}

/**
 * Initialize Splash Overlay (Head-Locked)
 * スプラッシュオーバーレイ（ヘッドロック）を初期化
 */
export function initSplash() {
  try {
    ensureOverlayManager();

    // Clear existing splash if any
    if (state.splashHandle !== null) {
      destroySplash();
    }

    // Create splash overlay
    const key = 'vrchat-osc-keyboard-splash';
    const name = 'VRC Keyboard Start';
    state.splashHandle = state.overlayManager.createOverlay(key, name);
    console.log(`Splash Overlay Created with handle: ${state.splashHandle}`);

    // Set width (slightly smaller is usually good for splash)
    state.overlayManager.setOverlayWidth(state.splashHandle, SPLASH_WIDTH_M);

    // Head Locked (1.5m in front)
    state.overlayManager.setOverlayTransformHmd(
      state.splashHandle,
      SPLASH_DISTANCE_M,
    );

    // Set texture
    const texturePath = getAssetPath(path.join('img', 'logo.png'));
    state.overlayManager.setOverlayFromFile(state.splashHandle, texturePath);

    // Show
    state.overlayManager.showOverlay(state.splashHandle);

    // Clear previous timer if exists
    if (state.splashTimer) {
      clearTimeout(state.splashTimer);
      state.splashTimer = null;
    }

    // Auto destroy after 3 seconds
    state.splashTimer = setTimeout(() => {
      destroySplash();
    }, SPLASH_DURATION_MS);
  } catch (error) {
    console.error('Failed to init Splash Overlay:', error);
  }
}

export function destroySplash() {
  // Clear timer
  if (state.splashTimer) {
    clearTimeout(state.splashTimer);
    state.splashTimer = null;
  }

  if (state.splashHandle !== null && state.overlayManager) {
    try {
      state.overlayManager.hideOverlay(state.splashHandle);
      state.overlayManager.destroyOverlay(state.splashHandle);
      console.log('Splash overlay destroyed');
    } catch (e) {
      console.error('Error destroying splash:', e);
    }
    state.splashHandle = null;
  }
}

export function shutdownOverlay() {
  const manager = state.overlayManager;
  if (!manager) {
    return;
  }

  // Ensure splash is gone
  destroySplash();

  if (state.overlayHandleBack !== null) {
    try {
      manager.destroyOverlay(state.overlayHandleBack);
    } catch (e) {
      console.error('Failed to destroy back overlay:', e);
    }
  }

  if (state.overlayHandle !== null) {
    try {
      manager.destroyOverlay(state.overlayHandle);
    } catch (e) {
      console.error('Failed to destroy overlay:', e);
    }
  }

  state.overlayHandleBack = null;
  state.overlayHandle = null;
  state.overlayManager = null;
  setOverlayVisible(false);
}

/**
 * Get the overlay manager instance / オーバーレイマネージャーインスタンスを取得
 */
export function getOverlayManager() {
  return state.overlayManager;
}

export function showOverlayAll() {
  if (!state.overlayManager || state.overlayHandle === null) return;
  state.overlayManager.showOverlay(state.overlayHandle);

  // Show back overlay only if it's supposed to be enabled (or we assume it follows main)
  // For now, logic: if it exists, show it. But we can use state.backOverlayEnabled if needed.
  // Using explicit check for back overlay handle.
  if (state.overlayHandleBack !== null) {
    // Determine if we should show back overlay.
    // If we are in World-Locked mode, usually yes.
    // If we are in HMD-Locked mode, usually no.
    // But we will assume 'All' means 'All available'.
    state.overlayManager.showOverlay(state.overlayHandleBack);
    state.backOverlayEnabled = true; // Mark as intuitively enabled
  }
  setOverlayVisible(true);
}

export function hideOverlayAll() {
  if (!state.overlayManager || state.overlayHandle === null) return;
  state.overlayManager.hideOverlay(state.overlayHandle);
  if (state.overlayHandleBack !== null) {
    state.overlayManager.hideOverlay(state.overlayHandleBack);
  }
  setOverlayVisible(false);
}

export function toggleOverlayAll() {
  if (!state.overlayManager || state.overlayHandle === null) return;
  if (state.overlayVisible) {
    hideOverlayAll();
  } else {
    resetOverlayPosition();
    showOverlayAll();
  }
}

/**
 * Set overlay width / オーバーレイの幅を設定
 */
export function setOverlayWidth(width) {
  if (!state.overlayManager || state.overlayHandle === null) return;
  state.overlayManager.setOverlayWidth(state.overlayHandle, width);
  if (state.overlayHandleBack !== null) {
    state.overlayManager.setOverlayWidth(state.overlayHandleBack, width);
  }
}

/**
 * Set overlay transform relative to HMD / HMD相対でオーバーレイのトランスフォームを設定
 */
export function setOverlayTransformHmd(distance) {
  if (!state.overlayManager || state.overlayHandle === null) return;
  state.overlayManager.setOverlayTransformHmd(state.overlayHandle, distance);
  if (state.overlayHandleBack !== null) {
    state.overlayManager.hideOverlay(state.overlayHandleBack);
    state.backOverlayEnabled = false; // Disable back in HMD mode / HMDモードでは背面無効
  }
}

export function setOverlayTransformAbsoluteAll(matrixRow) {
  if (!state.overlayManager || state.overlayHandle === null) return;
  state.overlayManager.setOverlayTransformAbsolute(
    state.overlayHandle,
    Array.from(matrixRow),
  );
  if (state.overlayHandleBack !== null) {
    const backMat = computeBackTransform(matrixRow);
    state.overlayManager.setOverlayTransformAbsolute(
      state.overlayHandleBack,
      Array.from(backMat),
    );
    // If we are setting absolute transform, we generally expect the back overlay to be active if the main is active.
    // However, if we were hidden, we remain hidden until showOverlayAll is called?
    // The original code did: checks visible.
    if (state.overlayVisible) {
      state.overlayManager.showOverlay(state.overlayHandleBack);
      state.backOverlayEnabled = true;
    }
  }
}

/**
 * Get the overlay handle / オーバーレイハンドルを取得
 */
export function getOverlayHandle() {
  return state.overlayHandle;
}

export function getOverlayBackHandle() {
  return state.overlayHandleBack;
}

/**
 * Get the active overlay handle / アクティブなオーバーレイハンドル（通常はメイン）を取得
 * Currently returns the main handle. / 現在はメインハンドルを返す。
 */
export function getActiveOverlayHandle() {
  return state.overlayHandle;
}
