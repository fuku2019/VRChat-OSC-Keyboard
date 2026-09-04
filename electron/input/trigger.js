import {
  TRIGGER_CLICK_CANCEL_THRESHOLD,
  TRIGGER_DRAG_THRESHOLD,
  TRIGGER_SCROLL_MAX,
  TRIGGER_SCROLL_MULTIPLIER,
} from './constants.js';
import { sendClickEvent, sendScrollEvent } from './events.js';
import { state } from './state.js';

export function handleTriggerInput(controllerId, controllerState, hit) {
  if (!controllerState) return;
  const pressed = !!controllerState.triggerPressed;
  const existing = state.triggerDragState[controllerId];

  if (pressed) {
    if (!existing) {
      if (!hit) return;
      // Defer the click to release. Emitting it on press made the drag/cancel
      // tracking below unreachable, so a trigger-drag used for scrolling also
      // clicked whatever sat under the press point.
      // クリックはトリガーを離した時に送る。押下時に送ると以下のドラッグ判定が
      // 無意味になり、スクロール目的のドラッグでも押下位置の要素がクリックされていた。
      state.triggerDragState[controllerId] = {
        startU: hit.u,
        startV: hit.v,
        lastU: hit.u,
        lastV: hit.v,
        dragging: false,
        moved: false,
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
    // Released without dragging past the cancel threshold -> treat as a click.
    // A scroll drag (or a release while pointing off the overlay) sets `moved`
    // and is intentionally swallowed here.
    // 取り消ししきい値を超えずに離された場合のみクリックとして扱う。
    // スクロールドラッグやオーバーレイ外での解放は moved が立つため送らない。
    if (!existing.moved) {
      sendClickEvent(existing.lastU, existing.lastV, 'mouseDown');
      sendClickEvent(existing.lastU, existing.lastV, 'mouseUp', 1);
    }
  }
}

export function releaseTriggerForController(
  controllerId,
  _clickCountOverride = null,
) {
  delete state.triggerDragState[controllerId];
}
