import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTriggerInput } from './trigger.js';
import { sendClickEvent, sendScrollEvent } from './events.js';
import { state } from './state.js';

vi.mock('./events.js', () => ({
  sendClickEvent: vi.fn(),
  sendScrollEvent: vi.fn(),
}));

const press = (hit: { u: number; v: number } | null) =>
  handleTriggerInput(1, { triggerPressed: true }, hit);
const release = (hit: { u: number; v: number } | null) =>
  handleTriggerInput(1, { triggerPressed: false }, hit);

beforeEach(() => {
  vi.clearAllMocks();
  state.triggerDragState = {};
  state.instantClickHover = {};
  state.windowSize = { width: 800, height: 700 };
});

describe('instant click (keys and candidates)', () => {
  beforeEach(() => {
    state.instantClickHover[1] = true;
  });

  it('clicks on press and not again on release', () => {
    press({ u: 0.5, v: 0.5 });
    expect(vi.mocked(sendClickEvent).mock.calls).toEqual([
      [0.5, 0.5, 'mouseDown'],
      [0.5, 0.5, 'mouseUp', 1],
    ]);

    release({ u: 0.5, v: 0.5 });
    expect(sendClickEvent).toHaveBeenCalledTimes(2);
    expect(state.triggerDragState[1]).toBeUndefined();
  });

  it('does not scroll while the trigger stays held', () => {
    press({ u: 0.5, v: 0.5 });
    press({ u: 0.5, v: 0.7 });
    release({ u: 0.5, v: 0.7 });

    expect(sendScrollEvent).not.toHaveBeenCalled();
    expect(sendClickEvent).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the press misses the overlay', () => {
    press(null);
    release(null);

    expect(sendClickEvent).not.toHaveBeenCalled();
  });
});

describe('release click (everything else)', () => {
  it('clicks on release, not on press', () => {
    press({ u: 0.5, v: 0.5 });
    expect(sendClickEvent).not.toHaveBeenCalled();

    release({ u: 0.5, v: 0.5 });
    expect(vi.mocked(sendClickEvent).mock.calls).toEqual([
      [0.5, 0.5, 'mouseDown'],
      [0.5, 0.5, 'mouseUp', 1],
    ]);
  });

  it('scrolls on a drag and swallows the click', () => {
    press({ u: 0.5, v: 0.5 });
    press({ u: 0.5, v: 0.6 });
    release({ u: 0.5, v: 0.6 });

    expect(sendScrollEvent).toHaveBeenCalled();
    expect(sendClickEvent).not.toHaveBeenCalled();
  });
});
