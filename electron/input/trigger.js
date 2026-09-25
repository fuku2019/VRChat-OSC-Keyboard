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
      // Keyboard keys and conversion candidates ('press') click on press, for
      // typing speed. Keys with a long press ('hold', e.g. Shift -> CapsLock)
      // go down on press and up on release, so the page can time the hold -
      // the release-click path below sends down and up back to back, which no
      // long press timer can ever see. Neither is scrollable, so there is no
      // drag to protect and the rest of the press does not scroll.
      // キーボードのキーと変換候補 ('press') は打鍵の速さのため押した瞬間に
      // クリックする。長押しを持つキー ('hold'、例: Shift→CapsLock) は押下で押し、
      // 離したときに離すので、ページが押下時間を測れる - 下の「離したときの
      // クリック」は down と up を続けて送るので、長押しタイマーは決して動かない。
      // どちらもスクロールしないので守るべきドラッグがなく、押下中はスクロールしない。
      const mode = state.hoverClickMode[controllerId];
      if (mode === 'press') {
        sendClickEvent(hit.u, hit.v, 'mouseDown');
        sendClickEvent(hit.u, hit.v, 'mouseUp', 1);
        state.triggerDragState[controllerId] = { mode };
        return;
      }
      if (mode === 'hold') {
        sendClickEvent(hit.u, hit.v, 'mouseDown');
        state.triggerDragState[controllerId] = { mode, lastU: hit.u, lastV: hit.v };
        return;
      }
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

    if (existing.mode) {
      if (existing.mode === 'hold' && hit) {
        existing.lastU = hit.u;
        existing.lastV = hit.v;
      }
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
    if (existing.mode) {
      if (existing.mode === 'hold') {
        sendClickEvent(existing.lastU, existing.lastV, 'mouseUp', 1);
      }
      return;
    }
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
  const existing = state.triggerDragState[controllerId];
  delete state.triggerDragState[controllerId];
  // A controller that vanishes mid-hold must not leave the page's button down.
  // 押している途中で消えたコントローラーが、ページのボタンを押しっぱなしにしないようにする。
  if (existing?.mode === 'hold') {
    sendClickEvent(existing.lastU, existing.lastV, 'mouseUp', 1);
  }
}
