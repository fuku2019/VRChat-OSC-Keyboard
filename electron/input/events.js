import { state } from './state.js';
import { mapUvToClient } from './mapping.js';

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
  try {
    // console.log(`Sending cursor to renderer: ${u.toFixed(2)}, ${v.toFixed(2)}`);
    target.send('input-cursor-move', { controllerId, u, v });
  } catch (e) {
    console.error('Failed to send cursor event', e);
  }
}

export function sendCursorHideEvent(controllerId) {
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
