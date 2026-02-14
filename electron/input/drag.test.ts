import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../overlay.js', () => ({
  setOverlayTransformAbsoluteAll: vi.fn(),
}));

describe('startDrag', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not start dragging when pose matrix is not invertible', async () => {
    const { state } = await import('./state.js');
    const { startDrag } = await import('./drag.js');

    state.drag.isDragging = false;
    state.drag.draggingControllerId = null;
    state.overlayManager = {
      getOverlayTransformType: vi.fn(() => 0),
      getOverlayTransformAbsolute: vi.fn(() => [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]),
    };

    const singularPose = new Array(16).fill(0);
    startDrag(1, singularPose, 999);

    expect(state.drag.isDragging).toBe(false);
    expect(state.drag.draggingControllerId).toBeNull();
  });
});
