import { state } from './state.js';
import { mapUvToClient } from './mapping.js';
import { CURSOR_SEND_EPSILON } from './constants.js';

// Last coordinates actually sent, per controller / コントローラーごとに実際に送った座標
const lastSentCursor = new Map();

let cursorSendEpsilon = CURSOR_SEND_EPSILON;

/**
 * Override the send threshold at runtime (--cursor-epsilon). The value that
 * actually silences a held-still controller depends on the tracking hardware,
 * so it has to be findable without a rebuild.
 * 送信しきい値を実行時に上書きする (--cursor-epsilon)。静止させたコントローラーを
 * 実際に黙らせられる値はトラッキング機材に依存するため、ビルドし直さずに
 * 探せる必要がある。
 */
export function setCursorEpsilon(value) {
  if (!Number.isFinite(value) || value < 0) return;
  cursorSendEpsilon = value;
  lastSentCursor.clear();
  console.log('[input] cursor send epsilon: ' + cursorSendEpsilon);
}

/**
 * Forget a controller's last sent position / コントローラーの最終送信位置を忘れる
 */
export function resetCursorThrottle(controllerId = null) {
  if (controllerId === null) {
    lastSentCursor.clear();
    return;
  }
  lastSentCursor.delete(controllerId);
}

function getTargetWebContents() {
  const target = state.targetWebContents;
  if (!target) return null;
  if (typeof target.isDestroyed === 'function' && target.isDestroyed()) {
    return null;
  }
  return target;
}

export function sendCursorEvent(controllerId, u, v) {
  const target = getTargetWebContents();
  if (!target) return;

  // Drop movements too small to see. The renderer redraws the cursor on every
  // one of these, and with offscreen rendering a redraw is what produces an
  // overlay frame - so without this gate a merely-pointing controller keeps the
  // whole pipeline at the full frame rate while nothing visibly changes.
  // 目に見えない微小な移動は捨てる。レンダラーはこれを受けるたびにカーソルを描き直し、
  // オフスクリーン描画では描き直しがそのままオーバーレイのフレーム生成になる。
  // このゲートがないと、向けているだけのコントローラーが、見た目は何も変わらないまま
  // パイプライン全体を最大フレームレートで回し続けてしまう。
  const previous = lastSentCursor.get(controllerId);
  if (
    previous &&
    Math.abs(u - previous.u) < cursorSendEpsilon &&
    Math.abs(v - previous.v) < cursorSendEpsilon
  ) {
    return;
  }
  lastSentCursor.set(controllerId, { u, v });

  try {
    // console.log(`Sending cursor to renderer: ${u.toFixed(2)}, ${v.toFixed(2)}`);
    target.send('input-cursor-move', { controllerId, u, v });
  } catch (e) {
    console.error('Failed to send cursor event', e);
  }
}

export function sendCursorHideEvent(controllerId) {
  resetCursorThrottle(controllerId);
  const target = getTargetWebContents();
  if (!target) return;
  try {
    target.send('input-cursor-hide', { controllerId });
  } catch (e) {
    console.error('Failed to send cursor hide event', e);
  }
}

export function sendTriggerStateEvent(controllerId, pressed) {
  const target = getTargetWebContents();
  if (!target) return;
  try {
    target.send('input-trigger-state', { controllerId, pressed });
  } catch (e) {
    console.error('Failed to send trigger state event', e);
  }
}

/**
 * Ask the renderer how the element at (u, v) wants a trigger click. Returns
 * false when nothing could be asked, so the caller does not wait for an answer.
 * (u, v) の要素がトリガーでどうクリックされたいかをレンダラーへ問い合わせる。
 * 問い合わせられなかったときは false を返し、呼び出し側が答えを待たないようにする。
 */
export function sendClickModeRequest(controllerId, requestId, u, v) {
  const target = getTargetWebContents();
  if (!target) return false;
  try {
    target.send('input-click-mode-request', { controllerId, requestId, u, v });
    return true;
  } catch (e) {
    console.error('Failed to send click mode request', e);
    return false;
  }
}

export function sendScrollEvent(deltaY) {
  const target = getTargetWebContents();
  if (!target) return;
  try {
    target.send('input-scroll', { deltaY });
  } catch (e) {
    console.error('Failed to send scroll event', e);
  }
}

export function sendMouseMoveEvent(u, v) {
  const target = getTargetWebContents();
  if (!target) return null;
  const position = mapUvToClient(u, v);
  if (!position) return null;
  try {
    target.sendInputEvent({
      type: 'mouseMove',
      x: position.x,
      y: position.y,
    });
  } catch (e) {
    console.error('Failed to send mouseMove event:', e);
  }
  return position;
}

export function sendMouseEnterEvent(position) {
  const target = getTargetWebContents();
  if (!target || !position) return;
  try {
    target.sendInputEvent({
      type: 'mouseEnter',
      x: position.x,
      y: position.y,
    });
  } catch (e) {
    console.error('Failed to send mouseEnter event:', e);
  }
}

export function sendMouseLeaveEvent(position) {
  const target = getTargetWebContents();
  if (!target || !position) return;
  try {
    target.sendInputEvent({
      type: 'mouseLeave',
      x: position.x,
      y: position.y,
    });
  } catch (e) {
    console.error('Failed to send mouseLeave event:', e);
  }
}

export function sendClickEvent(u, v, type, clickCount = 1) {
  const target = getTargetWebContents();
  if (!target) return;

  try {
    const position = mapUvToClient(u, v);
    if (!position) return;
    const { x, y } = position;
    console.log(
      `Sending ${type} at pixel (${x}, ${y}) from UV (${u.toFixed(2)}, ${v.toFixed(2)})`,
    );

    target.sendInputEvent({
      type,
      x,
      y,
      button: 'left',
      clickCount,
    });
  } catch (e) {
    console.error(`Failed to send ${type} event:`, e);
  }
}
