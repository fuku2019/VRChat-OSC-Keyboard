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
  // Per-controller trigger press state:
  // { startU, startV, lastU, lastV, dragging, moved }
  triggerDragState: {},
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
