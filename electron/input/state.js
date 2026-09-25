import { mat4 } from 'gl-matrix';

export const state = {
  overlayManager: null,
  targetWebContents: null,
  inputInterval: null,
  inputFallbackInterval: null,
  captureSyncUnsubscribe: null,
  inputInProgress: false,
  lastCaptureFrameAt: 0,
  lastCursorHitState: {},
  lastMouseHit: false,
  lastMouseControllerId: null,
  lastMousePosition: { x: 0, y: 0 },
  suppressMouseHover: false,
  lastHitByController: {},
  lastMoveAtByController: {},
  lastTriggerPressedState: {},
  // Per-controller trigger press state: / コントローラーごとのトリガー押下状態:
  // { startU, startV, lastU, lastV, dragging, moved } // { 開始U, 開始V, 前回U, 前回V, ドラッグ中, 移動済み }
  // or { instant: true } once a press was clicked immediately / 押下で即クリック済みなら { instant: true }
  triggerDragState: {},
  // Per-controller: hovering an element that clicks on trigger press, as reported
  // by the renderer (data-vr-instant-click) / コントローラーごと: トリガー押下で
  // クリックする要素に乗っているか。レンダラーが報告する (data-vr-instant-click)
  instantClickHover: {},
  windowSize: { width: 0, height: 0 },
  windowScale: { zoomFactor: 1 },
  drag: {
    isDragging: false,
    draggingControllerId: null,
    startControllerInverse: mat4.create(),
    startOverlayTransform: mat4.create(),
  },
  inputSmoothers: {},
};
