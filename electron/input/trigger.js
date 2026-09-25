import {
  TRIGGER_CLICK_CANCEL_THRESHOLD,
  TRIGGER_CLICK_MODE_TIMEOUT_MS,
  TRIGGER_DRAG_THRESHOLD,
  TRIGGER_SCROLL_MAX,
  TRIGGER_SCROLL_MULTIPLIER,
} from './constants.js';
import {
  sendClickEvent,
  sendClickModeRequest,
  sendScrollEvent,
} from './events.js';
import { state } from './state.js';

let nextClickModeRequestId = 1;

// How a press is clicked depends on the element under it (data-vr-click), which
// only the renderer knows. So a press first asks the renderer at the exact point
// the click would land, and waits for the answer in a `pending` state:
//   'press' - keyboard keys and conversion candidates click the moment the
//             trigger goes down, for typing speed.
//   'hold'  - keys with a long press (Shift -> CapsLock) go down on press and up
//             on release, so the page can time the hold.
//   none    - everything else clicks on release, so that a trigger-drag used
//             for scrolling does not also click whatever sat under the press.
// Asking at the press point, rather than trusting a hover state reported
// earlier, keeps the decision exact even right after crossing an edge.
// 押下をどうクリックするかはその下の要素 (data-vr-click) で決まり、それを知って
// いるのはレンダラーだけである。そこで押下はまずクリックが入るちょうどその位置を
// レンダラーへ問い合わせ、答えを `pending` 状態で待つ:
//   'press' - キーボードのキーと変換候補。打鍵の速さのため押した瞬間にクリックする。
//   'hold'  - 長押しを持つキー (Shift→CapsLock)。押下で押し、離したときに離すので、
//             ページが押下時間を測れる。
//   なし    - それ以外は離したときにクリックする。スクロール目的のトリガードラッグで
//             押下位置の要素までクリックされないようにするためである。
// 以前に報告されたホバー状態を信じるのではなく押下位置で問い合わせるので、
// 境界を越えた直後でも判定が正確になる。

function releaseClick(existing) {
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

function applyClickMode(controllerId, existing, mode) {
  const { startU: u, startV: v, released } = existing;
  if (mode === 'press') {
    sendClickEvent(u, v, 'mouseDown');
    sendClickEvent(u, v, 'mouseUp', 1);
    if (released) {
      delete state.triggerDragState[controllerId];
    } else {
      state.triggerDragState[controllerId] = { mode };
    }
    return;
  }
  if (mode === 'hold') {
    sendClickEvent(u, v, 'mouseDown');
    if (released) {
      // Released before the answer came back: a short tap.
      // 答えが返る前に離された: 短いタップとして扱う。
      sendClickEvent(u, v, 'mouseUp', 1);
      delete state.triggerDragState[controllerId];
    } else {
      state.triggerDragState[controllerId] = { mode, lastU: u, lastV: v };
    }
    return;
  }
  // Click on release (also the fallback for a timeout or a missing renderer).
  // 離したときにクリックする (タイムアウトやレンダラー不在時のフォールバックでもある)。
  delete existing.pending;
  delete existing.requestId;
  delete existing.requestedAt;
  delete existing.released;
  if (released) {
    delete state.triggerDragState[controllerId];
    releaseClick(existing);
  }
}

/**
 * The renderer's answer to sendClickModeRequest. A stale answer (the press it
 * was for has already been resolved or dropped) is ignored.
 * sendClickModeRequest へのレンダラーの答え。古い答え (対象の押下が既に確定
 * または破棄済み) は無視する。
 */
export function resolveTriggerClickMode(controllerId, requestId, mode) {
  const existing = state.triggerDragState[controllerId];
  if (!existing?.pending || existing.requestId !== requestId) return;
  applyClickMode(controllerId, existing, mode);
}

export function handleTriggerInput(controllerId, controllerState, hit) {
  if (!controllerState) return;
  const pressed = !!controllerState.triggerPressed;
  let existing = state.triggerDragState[controllerId];

  // No answer in time, or a new press on top of a release still waiting for
  // one: settle it as a release click before going on.
  // 答えが時間内に来ない、または答え待ちの解放の上に新しい押下が来た: 先に
  // 離したときのクリックとして確定させてから進む。
  if (
    existing?.pending &&
    (Date.now() - existing.requestedAt > TRIGGER_CLICK_MODE_TIMEOUT_MS ||
      (pressed && existing.released))
  ) {
    applyClickMode(controllerId, existing, null);
    existing = state.triggerDragState[controllerId];
  }

  if (pressed) {
    if (!existing) {
      if (!hit) return;
      const pressState = {
        startU: hit.u,
        startV: hit.v,
        lastU: hit.u,
        lastV: hit.v,
        dragging: false,
        moved: false,
      };
      const requestId = nextClickModeRequestId++;
      if (sendClickModeRequest(controllerId, requestId, hit.u, hit.v)) {
        Object.assign(pressState, {
          pending: true,
          requestId,
          requestedAt: Date.now(),
          released: false,
        });
      }
      state.triggerDragState[controllerId] = pressState;
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
    // Nothing may scroll until it is known that this press does not click on
    // press. The drag is measured from the start point, so it catches up.
    // この押下が押した瞬間のクリックでないと分かるまではスクロールしない。
    // ドラッグ量は開始点から測るので、確定後に追いつく。
    if (existing.pending) {
      existing.lastU = hit.u;
      existing.lastV = hit.v;
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

  if (!existing) return;
  if (existing.pending) {
    // Keep waiting; the answer decides what this release means.
    // 待ち続ける。この解放の意味は答えが決める。
    existing.released = true;
    return;
  }
  delete state.triggerDragState[controllerId];
  if (existing.mode === 'hold') {
    sendClickEvent(existing.lastU, existing.lastV, 'mouseUp', 1);
    return;
  }
  if (existing.mode) return;
  releaseClick(existing);
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
