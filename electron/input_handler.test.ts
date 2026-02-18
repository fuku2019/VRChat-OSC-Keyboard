import { beforeEach, describe, expect, it, vi } from 'vitest';

let captureFrameListener: (() => void) | null = null;
const unsubscribeMock = vi.fn();

const overlayManagerMock = {
  getControllerIds: vi.fn(),
  getControllerPose: vi.fn(),
  getControllerState: vi.fn(),
};

vi.mock('./overlay.js', () => ({
  addCaptureFrameListener: vi.fn((listener: () => void) => {
    captureFrameListener = listener;
    return unsubscribeMock;
  }),
  getActiveOverlayHandle: vi.fn(() => 100),
  getOverlayManager: vi.fn(() => overlayManagerMock),
}));

vi.mock('./input/controllers.js', () => ({
  computeHitFromPose: vi.fn(),
  processController: vi.fn(),
}));

vi.mock('./input/drag.js', () => ({
  endDrag: vi.fn(),
}));

vi.mock('./input/events.js', () => ({
  sendClickEvent: vi.fn(),
  sendCursorEvent: vi.fn(),
  sendCursorHideEvent: vi.fn(),
  sendMouseEnterEvent: vi.fn(),
  sendMouseLeaveEvent: vi.fn(),
  sendMouseMoveEvent: vi.fn(() => ({ x: 10, y: 20 })),
  sendScrollEvent: vi.fn(),
  sendTriggerStateEvent: vi.fn(),
}));

describe('input_handler cleanup behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    captureFrameListener = null;
    unsubscribeMock.mockClear();
  });

  it('hides cursor and cleans per-controller state when controller disappears', async () => {
    const { state } = await import('./input/state.js');
    const { startInputLoop, stopInputLoop } = await import('./input_handler.js');
    const { computeHitFromPose } = await import('./input/controllers.js');
    const { sendCursorHideEvent, sendTriggerStateEvent } = await import('./input/events.js');

    let activeControllers = [1];
    overlayManagerMock.getControllerIds.mockImplementation(() => activeControllers);
    overlayManagerMock.getControllerPose.mockImplementation(() => [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
    overlayManagerMock.getControllerState.mockImplementation(() => ({
      triggerPressed: false,
      gripPressed: false,
    }));
    vi.mocked(computeHitFromPose).mockReturnValue({ u: 0.2, v: 0.3 });

    startInputLoop(120, {} as Electron.WebContents);
    expect(captureFrameListener).toBeTypeOf('function');
    captureFrameListener?.();

    expect(state.lastCursorHitState[1]).toBe(true);
    expect(state.lastHitByController[1]).toBeTruthy();
    state.lastTriggerPressedState[1] = true;

    activeControllers = [];
    captureFrameListener?.();

    expect(sendCursorHideEvent).toHaveBeenCalledWith(1);
    expect(sendTriggerStateEvent).toHaveBeenCalledWith(1, false);
    expect(state.lastCursorHitState[1]).toBeUndefined();
    expect(state.lastHitByController[1]).toBeUndefined();
    expect(state.lastMoveAtByController[1]).toBeUndefined();
    expect(state.lastTriggerPressedState[1]).toBeUndefined();
    expect(state.triggerDragState[1]).toBeUndefined();
    expect(state.inputSmoothers[1]).toBeUndefined();

    stopInputLoop();
  });

  it('stopInputLoop sends mouse leave, releases pressed state, and resets runtime state', async () => {
    const { state } = await import('./input/state.js');
    const { stopInputLoop } = await import('./input_handler.js');
    const { sendMouseLeaveEvent, sendTriggerStateEvent } = await import('./input/events.js');
    const { endDrag } = await import('./input/drag.js');

    state.lastMouseHit = true;
    state.lastMousePosition = { x: 30, y: 40 };
    state.lastMouseControllerId = 2;
    state.suppressMouseHover = true;
    state.lastCursorHitState = { 2: true };
    state.lastHitByController = { 2: { u: 0.1, v: 0.2 } };
    state.lastMoveAtByController = { 2: Date.now() };
    state.lastTriggerPressedState = { 2: true };
    state.triggerDragState = {
      2: {
        startU: 0.1,
        startV: 0.2,
        lastU: 0.1,
        lastV: 0.2,
        dragging: true,
        moved: true,
      },
    };
    state.inputSmoothers = {
      2: { reset: vi.fn() },
    };
    state.captureSyncUnsubscribe = unsubscribeMock;
    state.drag.isDragging = true;
    state.drag.draggingControllerId = 2;

    stopInputLoop();

    expect(sendMouseLeaveEvent).toHaveBeenCalledWith({ x: 30, y: 40 });
    expect(sendTriggerStateEvent).toHaveBeenCalledWith(2, false);
    expect(endDrag).toHaveBeenCalledTimes(1);
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(state.lastMouseHit).toBe(false);
    expect(state.lastMouseControllerId).toBeNull();
    expect(state.suppressMouseHover).toBe(false);
    expect(state.lastCursorHitState).toEqual({});
    expect(state.lastHitByController).toEqual({});
    expect(state.lastMoveAtByController).toEqual({});
    expect(state.lastTriggerPressedState).toEqual({});
    expect(state.triggerDragState).toEqual({});
    expect(state.inputSmoothers).toEqual({});
  });

  it('cleans controller runtime state when pose is temporarily unavailable', async () => {
    const { state } = await import('./input/state.js');
    const { startInputLoop, stopInputLoop } = await import('./input_handler.js');
    const { computeHitFromPose } = await import('./input/controllers.js');
    const { sendCursorHideEvent, sendTriggerStateEvent } = await import('./input/events.js');

    let poseAvailable = true;
    overlayManagerMock.getControllerIds.mockReturnValue([1]);
    overlayManagerMock.getControllerPose.mockImplementation(() =>
      poseAvailable
        ? [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
          ]
        : null,
    );
    overlayManagerMock.getControllerState.mockReturnValue({
      triggerPressed: true,
      gripPressed: false,
    });
    vi.mocked(computeHitFromPose).mockReturnValue({ u: 0.2, v: 0.3 });

    startInputLoop(120, {} as Electron.WebContents);
    captureFrameListener?.();
    expect(state.lastCursorHitState[1]).toBe(true);
    expect(state.lastTriggerPressedState[1]).toBe(true);

    poseAvailable = false;
    captureFrameListener?.();

    expect(sendCursorHideEvent).toHaveBeenCalledWith(1);
    expect(sendTriggerStateEvent).toHaveBeenCalledWith(1, false);
    expect(state.lastCursorHitState[1]).toBeUndefined();
    expect(state.lastTriggerPressedState[1]).toBeUndefined();

    stopInputLoop();
  });
});
