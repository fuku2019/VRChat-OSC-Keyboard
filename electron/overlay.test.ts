import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./overlay/native.js', () => ({
  createOverlayManager: vi.fn(),
  getAssetPath: vi.fn(() => 'E:/VRKB/placeholder.png'),
}));

vi.mock('./overlay/capture.js', () => ({
  addCaptureFrameListener: vi.fn(),
  startCapture: vi.fn(),
  stopCapture: vi.fn(),
}));

vi.mock('./overlay/transform.js', () => ({
  computeBackTransform: vi.fn((matrix) => Array.from(matrix)),
  getSpawnTransform: vi.fn(() =>
    Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0)),
  ),
}));

import { state } from './overlay/state.js';
import { toggleOverlayAll } from './overlay.js';

describe('toggleOverlayAll', () => {
  let manager: {
    showOverlay: ReturnType<typeof vi.fn>;
    hideOverlay: ReturnType<typeof vi.fn>;
    setOverlayTransformAbsolute: ReturnType<typeof vi.fn>;
    getControllerPose: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    manager = {
      showOverlay: vi.fn(),
      hideOverlay: vi.fn(),
      setOverlayTransformAbsolute: vi.fn(),
      getControllerPose: vi.fn(() =>
        Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0)),
      ),
    };

    state.overlayManager = manager as unknown as typeof state.overlayManager;
    state.overlayHandle = 1;
    state.overlayHandleBack = 2;
    state.overlayVisible = false;
    state.backOverlayEnabled = false;
  });

  afterEach(() => {
    state.overlayManager = null;
    state.overlayHandle = null;
    state.overlayHandleBack = null;
    state.overlayVisible = false;
    state.backOverlayEnabled = false;
    vi.clearAllMocks();
  });

  it('resets position before showing when toggled from hidden', () => {
    toggleOverlayAll();

    expect(manager.getControllerPose).toHaveBeenCalledWith(0);
    expect(manager.setOverlayTransformAbsolute).toHaveBeenCalledTimes(2);
    expect(manager.showOverlay).toHaveBeenCalledTimes(2);
    expect(manager.hideOverlay).not.toHaveBeenCalled();
    expect(manager.setOverlayTransformAbsolute.mock.invocationCallOrder[0]).toBeLessThan(
      manager.showOverlay.mock.invocationCallOrder[0],
    );
  });

  it('hides without resetting when toggled from visible', () => {
    state.overlayVisible = true;

    toggleOverlayAll();

    expect(manager.hideOverlay).toHaveBeenCalledTimes(2);
    expect(manager.showOverlay).not.toHaveBeenCalled();
    expect(manager.getControllerPose).not.toHaveBeenCalled();
    expect(manager.setOverlayTransformAbsolute).not.toHaveBeenCalled();
  });
});
