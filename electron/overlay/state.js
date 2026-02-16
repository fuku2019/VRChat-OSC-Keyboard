// Shared overlay state / 共有オーバーレイ状態
export const state = {
  // Config
  backOverlayEnabled: false, // Backside overlay enabled state / 背面オーバーレイの有効状態
  debug: false, // Debug mode / デバッグモード

  overlayManager: null,
  overlayHandle: null,
  overlayHandleBack: null,
  splashHandle: null,
  splashTimer: null,
  overlayVisible: false,
  captureTimer: null,
  paintHandler: null,
  captureWebContents: null,
  captureInProgress: false,
  destroyedHandler: null,
  renderGoneHandler: null,
  lastSizeMismatchTime: 0,
  lastFrameBuffer: null,
  lastFrameImage: null,
  frameRetention: [],
  rendererMetrics: {
    cssWidth: 0,
    cssHeight: 0,
    devicePixelRatio: 1,
    zoomFactor: 1,
    pixelWidth: 0,
    pixelHeight: 0,
    updatedAt: 0,
  },
};
