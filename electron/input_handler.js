import {
  addCaptureFrameListener,
  getActiveOverlayHandle,
  getOverlayManager,
} from './overlay.js';
import { CURSOR_MOVE_EPSILON } from './input/constants.js';
import {
  sendCursorEvent,
  sendCursorHideEvent,
  sendMouseEnterEvent,
  sendMouseLeaveEvent,
  sendMouseMoveEvent,
  sendTriggerStateEvent,
} from './input/events.js';
import { computeHitFromPose, processController } from './input/controllers.js';
import { endDrag } from './input/drag.js';
import { state } from './input/state.js';
import { PointerStabilizer } from './input/smoothing.js';
import { releaseTriggerForController } from './input/trigger.js';

export { updateWindowSize } from './input/mapping.js';

/**
 * Start the input handling loop
 * @param {number} fps - Input polling rate (default: 120)
 * @param {Electron.WebContents} webContents - Target webContents for input events
 */
export function startInputLoop(fps = 120, webContents = null, options = {}) {
  state.overlayManager = getOverlayManager();
  state.targetWebContents = webContents;

  if (!state.overlayManager) {
    console.warn('Overlay manager not available for input handling');
    return;
  }

  stopInputLoop();

  const syncWithCapture = options.syncWithCapture !== false;
  if (syncWithCapture && typeof addCaptureFrameListener === 'function') {
    state.captureSyncUnsubscribe = addCaptureFrameListener(() => {
      state.lastCaptureFrameAt = Date.now();
      if (state.inputInProgress) return;
      state.inputInProgress = true;
      try {
        updateInput();
      } finally {
        state.inputInProgress = false;
      }
    });
    console.log('Input loop synced to capture frames');

    const fallbackFps = Number.isFinite(options.fallbackFps)
      ? Math.max(1, options.fallbackFps)
      : Math.max(1, Math.min(30, fps));
    const fallbackIntervalMs = Math.floor(1000 / fallbackFps);
    state.lastCaptureFrameAt = Date.now();
    state.inputFallbackInterval = setInterval(() => {
      const now = Date.now();
      if (now - state.lastCaptureFrameAt < fallbackIntervalMs * 2) {
        return;
      }
      if (state.inputInProgress) return;
      state.inputInProgress = true;
      try {
        updateInput();
      } finally {
        state.inputInProgress = false;
      }
    }, fallbackIntervalMs);

    return;
  }

  const intervalMs = Math.floor(1000 / fps);
  console.log(`Starting input loop at ${fps} FPS`);

  state.inputInterval = setInterval(() => {
    if (state.inputInProgress) return;
    state.inputInProgress = true;
    try {
      updateInput();
    } finally {
      state.inputInProgress = false;
    }
  }, intervalMs);
}

/**
 * Stop the input handling loop
 */
export function stopInputLoop() {
  if (state.inputInterval) {
    clearInterval(state.inputInterval);
    state.inputInterval = null;
  }
  if (state.inputFallbackInterval) {
    clearInterval(state.inputFallbackInterval);
    state.inputFallbackInterval = null;
  }
  if (state.captureSyncUnsubscribe) {
    state.captureSyncUnsubscribe();
    state.captureSyncUnsubscribe = null;
  }
  if (state.lastMouseHit) {
    sendMouseLeaveEvent(state.lastMousePosition);
  }
  const knownControllerIds = new Set([
    ...Object.keys(state.lastCursorHitState),
    ...Object.keys(state.lastHitByController),
    ...Object.keys(state.lastMoveAtByController),
    ...Object.keys(state.lastTriggerPressedState),
    ...Object.keys(state.triggerDragState),
    ...Object.keys(state.inputSmoothers),
  ]);
  for (const key of knownControllerIds) {
    const controllerId = Number(key);
    if (!Number.isFinite(controllerId)) continue;
    cleanupControllerRuntimeState(controllerId);
  }
  state.inputInProgress = false;
  state.lastCaptureFrameAt = 0;
  state.lastCursorHitState = {};
  state.lastHitByController = {};
  state.lastMoveAtByController = {};
  state.lastTriggerPressedState = {};
  state.triggerDragState = {};
  state.inputSmoothers = {};
  state.lastMouseHit = false;
  state.lastMouseControllerId = null;
  state.lastMousePosition = { x: 0, y: 0 };
  state.suppressMouseHover = false;
  console.log('Input loop stopped');
}

/**
 * Update input state every frame
 */
function updateInput() {
  if (!state.overlayManager) return;

  try {
    const activeHandle = getActiveOverlayHandle();
    if (!activeHandle) return;

    // 1. Get active controllers
    const controllerIds = state.overlayManager.getControllerIds();
    const hitCandidates = [];
    const observedControllerIds = new Set();
    const now = Date.now();
    // 2. Process each controller
    for (const id of controllerIds) {
      if (id === 0) continue; // Skip HMD
      observedControllerIds.add(id);

      const poseData = state.overlayManager.getControllerPose(id);

      if (!poseData || poseData.length === 0) {
        cleanupControllerRuntimeState(id);
        continue;
      }

      const controllerState = state.overlayManager.getControllerState(id);
      if (!controllerState) {
        cleanupControllerRuntimeState(id);
        continue;
      }
      const pressedNow = !!controllerState.triggerPressed;
      if (state.lastTriggerPressedState[id] !== pressedNow) {
        sendTriggerStateEvent(id, pressedNow);
        state.lastTriggerPressedState[id] = pressedNow;
      }
      // Use absolute tracking pose directly with ComputeOverlayIntersection
      // ComputeOverlayIntersectionは絶対座標を受け取るため、変換不要
      const hit = computeHitFromPose(poseData, activeHandle);
      processController(id, poseData, activeHandle, controllerState, hit);
      if (hit) {
        // --- Smoothing Logic Start ---
        if (!state.inputSmoothers[id]) {
          // Initialize smoothing filter for this controller
          // Parameters (minCutoff, beta, dcutoff) need tuning.
          // minCutoff=0.1: Very strong smoothing at low speed
          // beta=5.0: Quick response at high speed
          state.inputSmoothers[id] = new PointerStabilizer(0.1, 5.0, 1.0);
        }
        const smoothed = state.inputSmoothers[id].update(hit.u, hit.v, now);
        // Use smoothed coordinates for cursor events
        sendCursorEvent(id, smoothed.x, smoothed.y);
        hitCandidates.push({ controllerId: id, u: smoothed.x, v: smoothed.y });
        // --- Smoothing Logic End ---

        const previous = state.lastHitByController[id];
        if (
          !previous ||
          Math.abs(hit.u - previous.u) > CURSOR_MOVE_EPSILON ||
          Math.abs(hit.v - previous.v) > CURSOR_MOVE_EPSILON
        ) {
          state.lastMoveAtByController[id] = now;
        }
        state.lastHitByController[id] = { u: hit.u, v: hit.v };
        state.lastCursorHitState[id] = true;
      } else if (state.lastCursorHitState[id]) {
        sendCursorHideEvent(id);
        state.lastCursorHitState[id] = false;
        delete state.lastHitByController[id];
        delete state.lastMoveAtByController[id];
        // Reset smoother when invalid
        if (state.inputSmoothers[id]) {
          state.inputSmoothers[id].reset();
        }
      }
    }
    cleanupStaleControllers(observedControllerIds);

    const multiCursor = hitCandidates.length > 1;
    if (multiCursor) {
      if (!state.suppressMouseHover) {
        if (state.lastMouseHit) {
          sendMouseLeaveEvent(state.lastMousePosition);
        }
        state.lastMouseHit = false;
        state.lastMouseControllerId = null;
        state.suppressMouseHover = true;
      }
      return;
    }

    if (state.suppressMouseHover) {
      state.suppressMouseHover = false;
    }

    if (hitCandidates.length > 0) {
      let primary = null;
      let latestMoveAt = -1;
      for (const candidate of hitCandidates) {
        const movedAt =
          state.lastMoveAtByController[candidate.controllerId] ?? 0;
        if (movedAt > latestMoveAt) {
          latestMoveAt = movedAt;
          primary = candidate;
        }
      }
      if (!primary) {
        primary =
          hitCandidates.find(
            (candidate) =>
              candidate.controllerId === state.lastMouseControllerId,
          ) ?? hitCandidates[0];
      }
      const movePosition = sendMouseMoveEvent(primary.u, primary.v);
      if (movePosition) {
        if (!state.lastMouseHit) {
          sendMouseEnterEvent(movePosition);
        }
        state.lastMousePosition = movePosition;
        state.lastMouseHit = true;
        state.lastMouseControllerId = primary.controllerId;
      }
    } else if (state.lastMouseHit) {
      sendMouseLeaveEvent(state.lastMousePosition);
      state.lastMouseHit = false;
      state.lastMouseControllerId = null;
    }
  } catch (error) {
    // Suppress errors during shutdown
    if (!error.message?.includes('destroyed')) {
      console.error('Input update error:', error);
    }
  }
}

function cleanupStaleControllers(observedControllerIds) {
  const knownIds = new Set([
    ...Object.keys(state.lastCursorHitState),
    ...Object.keys(state.lastHitByController),
    ...Object.keys(state.lastMoveAtByController),
    ...Object.keys(state.lastTriggerPressedState),
    ...Object.keys(state.triggerDragState),
    ...Object.keys(state.inputSmoothers),
  ]);

  for (const key of knownIds) {
    const controllerId = Number(key);
    if (!Number.isFinite(controllerId)) continue;
    if (observedControllerIds.has(controllerId)) continue;
    cleanupControllerRuntimeState(controllerId);
  }
}

function cleanupControllerRuntimeState(controllerId) {
  if (state.lastCursorHitState[controllerId]) {
    sendCursorHideEvent(controllerId);
  }
  if (state.lastTriggerPressedState[controllerId]) {
    sendTriggerStateEvent(controllerId, false);
  }
  if (state.inputSmoothers[controllerId]) {
    state.inputSmoothers[controllerId].reset();
    delete state.inputSmoothers[controllerId];
  }
  if (controllerId === state.drag.draggingControllerId) {
    endDrag();
  }
  releaseTriggerForController(controllerId, 0);
  delete state.lastCursorHitState[controllerId];
  delete state.lastHitByController[controllerId];
  delete state.lastMoveAtByController[controllerId];
  delete state.lastTriggerPressedState[controllerId];
}
