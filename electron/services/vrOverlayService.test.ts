import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const manager = {
  initInput: vi.fn(),
  pollToggleClicked: vi.fn(),
  getCurrentBindings: vi.fn(),
  openBindingUi: vi.fn(),
};

vi.mock('../overlay.js', () => ({
  getOverlayManager: vi.fn(() => manager),
  toggleOverlayAll: vi.fn(),
}));

vi.mock('../overlay/native.js', () => ({
  getAssetPath: vi.fn(() => 'E:/VRKB/steamvr/actions.json'),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
  },
}));

describe('vrOverlayService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    const service = await import('./vrOverlayService.js');
    service.stop();
    service._resetForTests();
    vi.useRealTimers();
  });

  it('toggles overlay when poll reports click', async () => {
    const overlay = await import('../overlay.js');
    const service = await import('./vrOverlayService.js');

    manager.pollToggleClicked.mockReturnValue(true);

    service.init();
    service.startPolling(60);

    vi.advanceTimersByTime(20);

    expect(overlay.toggleOverlayAll).toHaveBeenCalledTimes(1);
  });

  it('returns binding info from native manager', async () => {
    const service = await import('./vrOverlayService.js');
    manager.getCurrentBindings.mockReturnValue({
      initialized: true,
      toggleOverlay: ['Right Hand A Button'],
      triggerBindings: ['Right Trigger Click'],
      gripBindings: ['Right Grip Click'],
      triggerBound: true,
      gripBound: true,
    });

    service.init();
    const result = service.getCurrentBindings();

    expect(result.initialized).toBe(true);
    expect(result.toggleOverlay).toEqual(['Right Hand A Button']);
    expect(result.triggerBindings).toEqual(['Right Trigger Click']);
    expect(result.gripBindings).toEqual(['Right Grip Click']);
    expect(result.triggerBound).toBe(true);
    expect(result.gripBound).toBe(true);
  });

  it('opens binding UI with explicit app key', async () => {
    const service = await import('./vrOverlayService.js');

    service.init();
    service.openBindingUI(true);

    expect(manager.openBindingUi).toHaveBeenCalledWith(
      'com.vrchat.osc.keyboard',
      true,
    );
  });

  it('returns safe defaults when SteamVR input init fails', async () => {
    const service = await import('./vrOverlayService.js');
    manager.initInput.mockImplementationOnce(() => {
      throw new Error('init failed');
    });

    const result = service.getCurrentBindings();

    expect(result).toEqual({
      initialized: false,
      toggleOverlay: [],
      triggerBindings: [],
      gripBindings: [],
      triggerBound: false,
      gripBound: false,
    });
  });
});
