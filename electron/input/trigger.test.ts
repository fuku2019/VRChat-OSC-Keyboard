import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleTriggerInput,
  releaseTriggerForController,
  resolveTriggerClickMode,
} from './trigger.js';
import { sendClickEvent, sendClickModeRequest, sendScrollEvent } from './events.js';
import { TRIGGER_CLICK_MODE_TIMEOUT_MS } from './constants.js';
import { state } from './state.js';

vi.mock('./events.js', () => ({
  sendClickEvent: vi.fn(),
  sendClickModeRequest: vi.fn(() => true),
  sendScrollEvent: vi.fn(),
}));

type Hit = { u: number; v: number } | null;
const press = (hit: Hit) => handleTriggerInput(1, { triggerPressed: true }, hit);
const release = (hit: Hit) => handleTriggerInput(1, { triggerPressed: false }, hit);

// The renderer's answer to the request the last press sent.
// 直前の押下が送った問い合わせへのレンダラーの答え。
const answer = (mode: 'press' | 'hold' | null) => {
  const [controllerId, requestId] = vi.mocked(sendClickModeRequest).mock.lastCall!;
  resolveTriggerClickMode(controllerId, requestId, mode);
};
const clicks = () => vi.mocked(sendClickEvent).mock.calls;
const CLICK = (u: number, v: number) => [
  [u, v, 'mouseDown'],
  [u, v, 'mouseUp', 1],
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  state.triggerDragState = {};
  state.windowSize = { width: 800, height: 700 };
});

afterEach(() => {
  vi.useRealTimers();
});

it('asks the renderer at the press point and sends nothing until it answers', () => {
  press({ u: 0.3, v: 0.4 });

  expect(sendClickModeRequest).toHaveBeenCalledWith(1, expect.any(Number), 0.3, 0.4);
  expect(sendClickEvent).not.toHaveBeenCalled();
});

describe("'press' (keys and candidates)", () => {
  it('clicks when the answer arrives and not again on release', () => {
    press({ u: 0.5, v: 0.5 });
    answer('press');
    expect(clicks()).toEqual(CLICK(0.5, 0.5));

    press({ u: 0.5, v: 0.7 });
    release({ u: 0.5, v: 0.7 });
    expect(clicks()).toEqual(CLICK(0.5, 0.5));
    expect(sendScrollEvent).not.toHaveBeenCalled();
    expect(state.triggerDragState[1]).toBeUndefined();
  });

  it('still clicks once when released before the answer', () => {
    press({ u: 0.5, v: 0.5 });
    release({ u: 0.5, v: 0.5 });
    answer('press');

    expect(clicks()).toEqual(CLICK(0.5, 0.5));
    expect(state.triggerDragState[1]).toBeUndefined();
  });
});

describe("'hold' (keys with a long press)", () => {
  // Down and up must be split across press and release, or the page's long
  // press timer never runs (Shift -> CapsLock).
  // down と up を押下と解放に分けないと、ページの長押しタイマーが動かない (Shift→CapsLock)。
  it('goes down on press and up on release', () => {
    press({ u: 0.5, v: 0.5 });
    answer('hold');
    expect(clicks()).toEqual([[0.5, 0.5, 'mouseDown']]);

    press({ u: 0.5, v: 0.52 });
    release({ u: 0.5, v: 0.52 });
    expect(clicks()).toEqual([
      [0.5, 0.5, 'mouseDown'],
      [0.5, 0.52, 'mouseUp', 1],
    ]);
    expect(sendScrollEvent).not.toHaveBeenCalled();
  });

  it('treats a release before the answer as a short tap', () => {
    press({ u: 0.5, v: 0.5 });
    release({ u: 0.5, v: 0.5 });
    answer('hold');

    expect(clicks()).toEqual(CLICK(0.5, 0.5));
  });

  it('releases the button when the controller vanishes mid-hold', () => {
    press({ u: 0.5, v: 0.5 });
    answer('hold');
    releaseTriggerForController(1);

    expect(clicks()).toEqual(CLICK(0.5, 0.5));
    expect(state.triggerDragState[1]).toBeUndefined();
  });
});

describe('click on release (everything else)', () => {
  it('clicks on release, not on press', () => {
    press({ u: 0.5, v: 0.5 });
    answer(null);
    expect(sendClickEvent).not.toHaveBeenCalled();

    release({ u: 0.5, v: 0.5 });
    expect(clicks()).toEqual(CLICK(0.5, 0.5));
  });

  it('clicks when released before the answer', () => {
    press({ u: 0.5, v: 0.5 });
    release({ u: 0.5, v: 0.5 });
    expect(sendClickEvent).not.toHaveBeenCalled();

    answer(null);
    expect(clicks()).toEqual(CLICK(0.5, 0.5));
  });

  it('scrolls on a drag and swallows the click', () => {
    press({ u: 0.5, v: 0.5 });
    answer(null);
    press({ u: 0.5, v: 0.6 });
    release({ u: 0.5, v: 0.6 });

    expect(sendScrollEvent).toHaveBeenCalled();
    expect(sendClickEvent).not.toHaveBeenCalled();
  });

  // Nothing may scroll before the answer, since 'press' would not scroll at all.
  // 答えの前にはスクロールしない。'press' ならまったくスクロールしないからである。
  it('holds the scroll back until the answer, then catches up', () => {
    press({ u: 0.5, v: 0.5 });
    press({ u: 0.5, v: 0.6 });
    expect(sendScrollEvent).not.toHaveBeenCalled();

    answer(null);
    press({ u: 0.5, v: 0.61 });
    expect(sendScrollEvent).toHaveBeenCalled();
  });

  it('falls back to this when the renderer does not answer in time', () => {
    press({ u: 0.5, v: 0.5 });
    const [controllerId, requestId] = vi.mocked(sendClickModeRequest).mock.lastCall!;
    vi.advanceTimersByTime(TRIGGER_CLICK_MODE_TIMEOUT_MS + 1);
    press({ u: 0.5, v: 0.5 });

    // A late 'press' answer must not click on top of the fallback.
    // 遅れて届いた 'press' の答えがフォールバックの上にクリックしてはならない。
    resolveTriggerClickMode(controllerId, requestId, 'press');
    expect(sendClickEvent).not.toHaveBeenCalled();

    release({ u: 0.5, v: 0.5 });
    expect(clicks()).toEqual(CLICK(0.5, 0.5));
  });

  it('does not wait when the renderer cannot be asked', () => {
    vi.mocked(sendClickModeRequest).mockReturnValueOnce(false);
    press({ u: 0.5, v: 0.5 });
    release({ u: 0.5, v: 0.5 });

    expect(clicks()).toEqual(CLICK(0.5, 0.5));
  });
});

it('ignores an answer for an earlier press', () => {
  press({ u: 0.5, v: 0.5 });
  const [controllerId, staleId] = vi.mocked(sendClickModeRequest).mock.lastCall!;
  release({ u: 0.5, v: 0.5 });
  // A new press on top of the unanswered release settles it as a release click.
  // 答えのない解放の上に来た新しい押下は、それを離したときのクリックとして確定させる。
  press({ u: 0.2, v: 0.2 });
  expect(clicks()).toEqual(CLICK(0.5, 0.5));

  resolveTriggerClickMode(controllerId, staleId, 'press');
  expect(clicks()).toEqual(CLICK(0.5, 0.5));

  answer('press');
  expect(clicks()).toEqual([...CLICK(0.5, 0.5), ...CLICK(0.2, 0.2)]);
});

it('does nothing when the press misses the overlay', () => {
  press(null);
  release(null);

  expect(sendClickModeRequest).not.toHaveBeenCalled();
  expect(sendClickEvent).not.toHaveBeenCalled();
});
