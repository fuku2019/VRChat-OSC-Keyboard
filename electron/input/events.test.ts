/**
 * events tests - with offscreen rendering, every cursor event the renderer
 * receives redraws the page and therefore produces an overlay frame. A merely
 * pointing controller must not keep that pipeline running.
 * events のテスト - オフスクリーン描画では、レンダラーが受け取るカーソルイベントの
 * たびにページが描き直され、そのままオーバーレイのフレームになる。向けているだけの
 * コントローラーがそのパイプラインを回し続けてはならない。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CURSOR_SEND_EPSILON } from './constants.js';
import { state } from './state.js';
import { sendCursorEvent, sendCursorHideEvent, resetCursorThrottle } from './events.js';

const send = vi.fn();

const sentCursorEvents = () =>
  send.mock.calls.filter(([channel]) => channel === 'input-cursor-move');

beforeEach(() => {
  send.mockClear();
  resetCursorThrottle();
  state.targetWebContents = { isDestroyed: () => false, send } as never;
});

describe('sendCursorEvent throttling', () => {
  it('sends the first position for a controller', () => {
    sendCursorEvent(1, 0.5, 0.5);
    expect(sentCursorEvents()).toHaveLength(1);
  });

  it('drops a move smaller than the epsilon', () => {
    sendCursorEvent(1, 0.5, 0.5);
    sendCursorEvent(1, 0.5 + CURSOR_SEND_EPSILON / 2, 0.5);
    expect(sentCursorEvents()).toHaveLength(1);
  });

  it.each([
    ['u', CURSOR_SEND_EPSILON * 2, 0],
    ['v', 0, CURSOR_SEND_EPSILON * 2],
  ])('sends a move that crosses the epsilon on %s', (_axis, du, dv) => {
    sendCursorEvent(1, 0.5, 0.5);
    sendCursorEvent(1, 0.5 + du, 0.5 + dv);
    expect(sentCursorEvents()).toHaveLength(2);
  });

  it('does not let a still controller accumulate sub-epsilon drift into silence', () => {
    // The comparison is against the last SENT position, so a slow drift still
    // gets through once it adds up. / 比較対象は最後に送った位置なので、ゆっくり
    // したドリフトも積み重なれば通る。
    sendCursorEvent(1, 0.5, 0.5);
    for (let i = 1; i <= 4; i += 1) {
      sendCursorEvent(1, 0.5 + (CURSOR_SEND_EPSILON * i) / 2, 0.5);
    }
    expect(sentCursorEvents().length).toBeGreaterThan(1);
  });

  it('tracks controllers independently', () => {
    sendCursorEvent(1, 0.5, 0.5);
    sendCursorEvent(2, 0.5, 0.5);
    expect(sentCursorEvents()).toHaveLength(2);
  });

  it('forgets the position when the cursor hides, so it reappears', () => {
    sendCursorEvent(1, 0.5, 0.5);
    sendCursorHideEvent(1);
    sendCursorEvent(1, 0.5, 0.5);
    expect(sentCursorEvents()).toHaveLength(2);
  });

  it('only forgets the controller that hid', () => {
    sendCursorEvent(1, 0.5, 0.5);
    sendCursorEvent(2, 0.5, 0.5);
    sendCursorHideEvent(1);
    send.mockClear();

    sendCursorEvent(2, 0.5, 0.5);
    expect(sentCursorEvents()).toHaveLength(0);
  });
});
