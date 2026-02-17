import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./events.js', () => ({
  sendClickEvent: vi.fn(),
  sendScrollEvent: vi.fn(),
}));

describe('handleTriggerInput', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('sends mouseDown + mouseUp(clickCount=1) on initial press with hit', async () => {
    const { handleTriggerInput } = await import('./trigger.js');
    const { state } = await import('./state.js');
    const { sendClickEvent } = await import('./events.js');

    handleTriggerInput(1, { triggerPressed: true }, { u: 0.1, v: 0.2 });

    expect(sendClickEvent).toHaveBeenCalledTimes(2);
    expect(sendClickEvent).toHaveBeenNthCalledWith(1, 0.1, 0.2, 'mouseDown');
    expect(sendClickEvent).toHaveBeenNthCalledWith(2, 0.1, 0.2, 'mouseUp', 1);
    expect(state.triggerDragState[1]).toMatchObject({
      startU: 0.1,
      startV: 0.2,
      lastU: 0.1,
      lastV: 0.2,
      moved: false,
      dragging: false,
      downSent: false,
    });
  });

  it('does not send additional click event on release after short press', async () => {
    const { handleTriggerInput } = await import('./trigger.js');
    const { sendClickEvent } = await import('./events.js');

    handleTriggerInput(2, { triggerPressed: true }, { u: 0.25, v: 0.35 });
    handleTriggerInput(2, { triggerPressed: false }, null);

    expect(sendClickEvent).toHaveBeenCalledTimes(2);
    expect(sendClickEvent).toHaveBeenNthCalledWith(1, 0.25, 0.35, 'mouseDown');
    expect(sendClickEvent).toHaveBeenNthCalledWith(
      2,
      0.25,
      0.35,
      'mouseUp',
      1,
    );
  });

  it('does not send additional click event when movement exceeds click cancel threshold', async () => {
    const { handleTriggerInput } = await import('./trigger.js');
    const { sendClickEvent } = await import('./events.js');

    handleTriggerInput(3, { triggerPressed: true }, { u: 0.2, v: 0.2 });
    handleTriggerInput(3, { triggerPressed: true }, { u: 0.24, v: 0.2 });
    handleTriggerInput(3, { triggerPressed: false }, null);

    expect(sendClickEvent).toHaveBeenCalledTimes(2);
    expect(sendClickEvent).toHaveBeenNthCalledWith(1, 0.2, 0.2, 'mouseDown');
    expect(sendClickEvent).toHaveBeenNthCalledWith(2, 0.2, 0.2, 'mouseUp', 1);
  });

  it('starts drag/scroll without sending additional click events', async () => {
    const { handleTriggerInput } = await import('./trigger.js');
    const { state } = await import('./state.js');
    const { sendClickEvent, sendScrollEvent } = await import('./events.js');
    state.windowSize.height = 1000;

    handleTriggerInput(4, { triggerPressed: true }, { u: 0.3, v: 0.3 });
    handleTriggerInput(4, { triggerPressed: true }, { u: 0.3, v: 0.35 });

    expect(sendScrollEvent).toHaveBeenCalled();
    expect(sendClickEvent).toHaveBeenCalledTimes(2);
    expect(sendClickEvent).toHaveBeenNthCalledWith(1, 0.3, 0.3, 'mouseDown');
    expect(sendClickEvent).toHaveBeenNthCalledWith(2, 0.3, 0.3, 'mouseUp', 1);
    expect(state.triggerDragState[4]).toMatchObject({
      dragging: true,
      moved: true,
      downSent: false,
    });

    handleTriggerInput(4, { triggerPressed: false }, null);
    expect(sendClickEvent).toHaveBeenCalledTimes(2);
  });

  it('does not send mouseDown when initial press has no hit', async () => {
    const { handleTriggerInput } = await import('./trigger.js');
    const { state } = await import('./state.js');
    const { sendClickEvent } = await import('./events.js');

    handleTriggerInput(5, { triggerPressed: true }, null);
    handleTriggerInput(5, { triggerPressed: false }, null);

    expect(sendClickEvent).not.toHaveBeenCalled();
    expect(state.triggerDragState[5]).toBeUndefined();
  });

  it('does not send additional click event when hit is lost while pressed', async () => {
    const { handleTriggerInput } = await import('./trigger.js');
    const { sendClickEvent } = await import('./events.js');

    handleTriggerInput(6, { triggerPressed: true }, { u: 0.4, v: 0.4 });
    handleTriggerInput(6, { triggerPressed: true }, null);
    handleTriggerInput(6, { triggerPressed: false }, null);

    expect(sendClickEvent).toHaveBeenCalledTimes(2);
    expect(sendClickEvent).toHaveBeenNthCalledWith(1, 0.4, 0.4, 'mouseDown');
    expect(sendClickEvent).toHaveBeenNthCalledWith(2, 0.4, 0.4, 'mouseUp', 1);
  });

  it('does not send duplicate mouseUp when releasing controller with downSent=false', async () => {
    const { handleTriggerInput, releaseTriggerForController } = await import('./trigger.js');
    const { state } = await import('./state.js');
    const { sendClickEvent } = await import('./events.js');
    state.windowSize.height = 1000;

    handleTriggerInput(7, { triggerPressed: true }, { u: 0.45, v: 0.45 });
    handleTriggerInput(7, { triggerPressed: true }, { u: 0.45, v: 0.5 });
    expect(state.triggerDragState[7]?.downSent).toBe(false);
    expect(sendClickEvent).toHaveBeenCalledTimes(2);

    releaseTriggerForController(7, 0);

    expect(sendClickEvent).toHaveBeenCalledTimes(2);
    expect(state.triggerDragState[7]).toBeUndefined();
  });
});
