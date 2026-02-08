import path from 'path';

import { createOverlayManager, getAssetPath } from './overlay/native.js';
import { state } from './overlay/state.js';
import {
  addCaptureFrameListener,
  startCapture,
  stopCapture,
} from './overlay/capture.js';
import { computeBackTransform, getSpawnTransform } from './overlay/transform.js';

export { addCaptureFrameListener, startCapture, stopCapture };

export function updateRendererMetrics(metrics) {
  if (!metrics) return;
  const cssWidth = Number(metrics.width ?? metrics.cssWidth);
  const cssHeight = Number(metrics.height ?? metrics.cssHeight);
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
 * Respawn overlay at ideal position relative to HMD
 * HMDに対する理想的な位置にオーバーレイを再スポーン
 */
function respawnOverlay(handle, hmdPose) {
  try {
    const targetMat = getSpawnTransform(hmdPose);
    setOverlayTransformAbsoluteAll(targetMat);
  } catch (e) {
    console.error('Failed to respawn overlay:', e);
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
    let hmdPose = state.overlayManager.getControllerPose(0);

    // If HMD pose invalid, try to find it again or wait?
    // If completely lost, maybe just set to identity or skip.
    if (!hmdPose || hmdPose.length === 0) {
      console.warn('HMD Pose not found, cannot reset position.');
      return;
    }

    // Apply to overlay handle / オーバーレイハンドルに適用
    if (state.overlayHandle !== null) {
      respawnOverlay(state.overlayHandle, hmdPose);
    }

    console.log('Overlay position reset.');
  } catch (e) {
    console.error('Error resetting overlay position:', e);
  }
}

/**
 * Initialize VR overlay / VRオーバーレイを初期化
 * @returns {number|null} Overlay handle or null on failure
 */
export function initOverlay() {
  try {
    console.log('Initializing VR Overlay...');
    state.overlayManager = createOverlayManager();
    console.log('VR System Initialized');

    // Debug: Log available methods /デバッグ: 利用可能なメソッドをログ出力
    console.log(
      'Available methods on OverlayManager:',
      Object.getOwnPropertyNames(
        Object.getPrototypeOf(state.overlayManager),
      ),
    );

    // Get HMD pose for initial spawn / 初期スポーン用のHMDポーズを取得
    let hmdPose = null;
    try {
      hmdPose = state.overlayManager.getControllerPose(0);
    } catch (e) {
      console.warn('Could not get HMD pose for initial spawn:', e);
    }

    // Create single overlay / 単一のオーバーレイを作成
    const key = 'vrchat-osc-keyboard-overlay';
    const name = 'VRC Keyboard';
    state.overlayHandle = state.overlayManager.createOverlay(key, name);
    console.log(`Overlay Created with handle: ${state.overlayHandle}`);

    // Create backside overlay for double-sided rendering
    const backKey = 'vrchat-osc-keyboard-overlay-back';
    const backName = 'VRC Keyboard (Back)';
    state.overlayHandleBack = state.overlayManager.createOverlay(backKey, backName);
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
    state.overlayManager.setOverlayWidth(state.overlayHandle, 0.5);
    if (state.overlayHandleBack !== null) {
      state.overlayManager.setOverlayWidth(state.overlayHandleBack, 0.5);
    }

    // Initial Placement: World Fixed (Absolute) / 初期配置: ワールド固定（絶対）
    if (hmdPose && hmdPose.length > 0) {
      respawnOverlay(state.overlayHandle, hmdPose);
    } else {
      // Fallback: Relative to HMD (Device 0) if pose missing
      // ポーズがない場合のフォールバック: HMD相対
      console.log('HMD Pose missing, falling back to relative attachment');
      state.overlayManager.setOverlayTransformHmd(state.overlayHandle, 0.5);
      if (state.overlayHandleBack !== null) {
        state.overlayManager.hideOverlay(state.overlayHandleBack);
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
        state.overlayManager.setOverlayFromFile(state.overlayHandleBack, texturePath);
      } catch (e) {
        console.error(`Failed to set back initial texture from ${texturePath}:`, e);
      }
    }

    console.log('Overlay Initial Props Set');

    // Show overlay / オーバーレイを表示
    state.overlayManager.showOverlay(state.overlayHandle);
    if (state.overlayHandleBack !== null) {
      state.overlayManager.showOverlay(state.overlayHandleBack);
    }
    console.log('Overlay Shown');

    return state.overlayHandle;
  } catch (error) {
    console.error('Failed to init VR Overlay:', error);
    return null;
  }
}

export function shutdownOverlay() {
  const manager = state.overlayManager;
  if (!manager) {
    return;
  }

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
}

/**
 * Get the overlay manager instance / オーバーレイマネージャーインスタンスを取得
 */
export function getOverlayManager() {
  return state.overlayManager;
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
    state.overlayManager.showOverlay(state.overlayHandleBack);
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
 * Get the active overlay handle / アクティブなオーバーレイハンドルを取得
 */
export function getActiveOverlayHandle() {
  return state.overlayHandle;
}
