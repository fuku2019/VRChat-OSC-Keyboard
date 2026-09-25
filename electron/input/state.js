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
  // or { mode: 'press' } / { mode: 'hold', lastU, lastV } per the hovered element's data-vr-click
  // またはホバー中の要素の data-vr-click に応じて { mode: 'press' } / { mode: 'hold', lastU, lastV }
  triggerDragState: {},
  // Per-controller click mode of the hovered element ('press' / 'hold'), as
  // reported by the renderer from data-vr-click. Absent = click on release.
  // コントローラーごとの、ホバー中の要素のクリック方式 ('press' / 'hold')。
  // レンダラーが data-vr-click から報告する。無ければ離したときにクリックする。
  hoverClickMode: {},
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
