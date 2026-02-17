import {
  TRIGGER_CLICK_CANCEL_THRESHOLD,
  TRIGGER_DRAG_THRESHOLD,
  TRIGGER_SCROLL_MAX,
  TRIGGER_SCROLL_MULTIPLIER,
} from './constants.js';
import { sendClickEvent, sendScrollEvent } from './events.js';
import { state } from './state.js';

function releaseTriggerState(existing, clickCountOverride = null) {
  if (!existing || !existing.downSent) return;
  if (!Number.isFinite(existing.lastU) || !Number.isFinite(existing.lastV)) {
    return;
  }
  const clickCount =
    clickCountOverride ??
    (existing.dragging || existing.moved ? 0 : 1);
  sendClickEvent(existing.lastU, existing.lastV, 'mouseUp', clickCount);
}

export function handleTriggerInput(controllerId, controllerState, hit) {
  if (!controllerState) return;
  const pressed = !!controllerState.triggerPressed;
  const existing = state.triggerDragState[controllerId];

  if (pressed) {
    if (!existing) {
      if (!hit) return;
      sendClickEvent(hit.u, hit.v, 'mouseDown');
      sendClickEvent(hit.u, hit.v, 'mouseUp', 1);
      state.triggerDragState[controllerId] = {
        startU: hit.u,
        startV: hit.v,
        lastU: hit.u,
        lastV: hit.v,
        dragging: false,
        moved: false,
        downSent: false,
      };
      return;
    }

    if (!hit) {
      existing.moved = true;
      return;
    }
    const totalU = hit.u - existing.startU;
    const totalV = hit.v - existing.startV;
    if (
      !existing.moved &&
      Math.abs(totalU) + Math.abs(totalV) > TRIGGER_CLICK_CANCEL_THRESHOLD
    ) {
      existing.moved = true;
    }
    const deltaV = hit.v - existing.lastV;
    if (!existing.dragging && Math.abs(totalV) > TRIGGER_DRAG_THRESHOLD) {
      // End pressed state as soon as scroll-drag starts to avoid selection conflicts.
      if (existing.downSent) {
        sendClickEvent(hit.u, hit.v, 'mouseUp', 0);
        existing.downSent = false;
      }
      existing.dragging = true;
      existing.moved = true;
    }
    if (existing.dragging) {
      const height = state.windowSize.height > 0 ? state.windowSize.height : 700;
      const rawDelta = deltaV * height * TRIGGER_SCROLL_MULTIPLIER;
      const clamped = Math.max(
        -TRIGGER_SCROLL_MAX,
        Math.min(TRIGGER_SCROLL_MAX, rawDelta),
      );
      if (clamped !== 0) {
        sendScrollEvent(clamped);
      }
    }
    existing.lastU = hit.u;
    existing.lastV = hit.v;
    return;
  }

  if (existing) {
    delete state.triggerDragState[controllerId];
  }
}

export function releaseTriggerForController(
  controllerId,
  clickCountOverride = null,
) {
  const existing = state.triggerDragState[controllerId];
  releaseTriggerState(existing, clickCountOverride);
  delete state.triggerDragState[controllerId];
}
