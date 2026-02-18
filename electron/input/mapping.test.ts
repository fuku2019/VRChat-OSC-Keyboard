import { beforeEach, describe, expect, it } from 'vitest';

describe('mapUvToClient', () => {
  beforeEach(async () => {
    const { state } = await import('./state.js');
    state.windowSize = { width: 0, height: 0 };
    state.windowScale = { zoomFactor: 1 };
    state.targetWebContents = null;
  });

  it('uses content bounds fallback when renderer metrics are unavailable', async () => {
    const { state } = await import('./state.js');
    const { mapUvToClient } = await import('./mapping.js');

    state.targetWebContents = {
      isDestroyed: () => false,
      getOwnerBrowserWindow: () => ({
        getContentBounds: () => ({ width: 1000, height: 500 }),
      }),
    } as unknown as Electron.WebContents;

    const point = mapUvToClient(0.5, 0.5);

    expect(point).toEqual({ x: 500, y: 250 });
  });
});
