/**
 * vrOverlayService tests - the service latches itself off permanently on a
 * failed init, so what may and may not set that latch is the whole story here.
 * vrOverlayService のテスト - このサービスは初期化に失敗すると自分を永久に
 * 無効化するため、何がそのラッチを立ててよくて何が立ててはならないかが要点である。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getOverlayManager = vi.fn();
const toggleOverlayAll = vi.fn();
const ensureSteamVrManifestRegistered = vi.fn(() => ({ success: true }));
const ensureSteamVrInputFiles = vi.fn(() => ({ actionsPath: 'C:/fake/actions.json' }));

vi.mock('../overlay.js', () => ({
  getOverlayManager: () => getOverlayManager(),
  toggleOverlayAll: () => toggleOverlayAll(),
}));

vi.mock('./SteamVrManifestService.js', () => ({
  ensureSteamVrManifestRegistered: () => ensureSteamVrManifestRegistered(),
  ensureSteamVrInputFiles: () => ensureSteamVrInputFiles(),
  getSteamVrAppKey: () => 'system.generated.test.exe',
}));

vi.mock('fs', () => ({
  default: { existsSync: () => true },
  existsSync: () => true,
}));

const makeManager = () => ({
  initInput: vi.fn(),
  pollToggleClicked: vi.fn(() => false),
  getCurrentBindings: vi.fn(() => ({
    initialized: true,
    toggleOverlay: ['trigger'],
    triggerBindings: [],
    gripBindings: [],
    triggerBound: true,
    gripBound: false,
  })),
});

// The module keeps its state at module scope, so every test needs a fresh copy.
// モジュールは状態をモジュールスコープに持つため、テストごとに読み込み直す。
const loadService = async () => {
  vi.resetModules();
  return import('./vrOverlayService.js');
};

beforeEach(() => {
  getOverlayManager.mockReset();
  toggleOverlayAll.mockReset();
  ensureSteamVrManifestRegistered.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('init before the overlay manager exists', () => {
  it('reports failure without latching the service off', async () => {
    const service = await loadService();
    getOverlayManager.mockReturnValue(null);

    expect(service.init()).toBe(false);

    // The bootstrap creates the manager on a later tick; this has to still work.
    // マネージャーは後のティックで初期化処理が作る。その後も動かねばならない。
    const manager = makeManager();
    getOverlayManager.mockReturnValue(manager);

    expect(service.init()).toBe(true);
    expect(manager.initInput).toHaveBeenCalledTimes(1);
  });

  // This is the bug that killed SteamVR input for a whole session in VR mode:
  // the settings window opens at startup and asks for bindings immediately.
  // これがVRモードでセッション中ずっとSteamVR入力を殺していたバグである。
  // 設定ウィンドウが起動時に開き、即座にバインディングを問い合わせる。
  it('survives a bindings query that arrives before the manager', async () => {
    const service = await loadService();
    getOverlayManager.mockReturnValue(null);

    const early = service.getCurrentBindings();
    expect(early.initialized).toBe(false);

    const manager = makeManager();
    getOverlayManager.mockReturnValue(manager);

    expect(service.init()).toBe(true);
    expect(service.getCurrentBindings().initialized).toBe(true);
  });

  it('still starts polling once the manager appears', async () => {
    const service = await loadService();
    getOverlayManager.mockReturnValue(null);
    service.getCurrentBindings();

    const manager = makeManager();
    getOverlayManager.mockReturnValue(manager);
    vi.useFakeTimers();
    try {
      service.startPolling(60);
      vi.advanceTimersByTime(100);
      expect(manager.pollToggleClicked).toHaveBeenCalled();
    } finally {
      service.stop();
      vi.useRealTimers();
    }
  });
});

describe('init with a real failure', () => {
  it('latches off when initInput throws', async () => {
    const service = await loadService();
    const manager = makeManager();
    manager.initInput.mockImplementation(() => {
      throw new Error('SetActionManifestPath failed');
    });
    getOverlayManager.mockReturnValue(manager);

    expect(service.init()).toBe(false);

    // A genuine failure must not be retried on every frame.
    // 本物の失敗は毎フレーム再試行してはならない。
    manager.initInput.mockImplementation(() => {});
    expect(service.init()).toBe(false);
    expect(manager.initInput).toHaveBeenCalledTimes(1);
  });
});

describe('init when it succeeds', () => {
  it('does not re-run initInput on a second call', async () => {
    const service = await loadService();
    const manager = makeManager();
    getOverlayManager.mockReturnValue(manager);

    expect(service.init()).toBe(true);
    expect(service.init()).toBe(true);
    expect(manager.initInput).toHaveBeenCalledTimes(1);
  });

  it('toggles the overlay when the action fires', async () => {
    const service = await loadService();
    const manager = makeManager();
    manager.pollToggleClicked.mockReturnValue(true);
    getOverlayManager.mockReturnValue(manager);

    vi.useFakeTimers();
    try {
      service.startPolling(60);
      vi.advanceTimersByTime(20);
      expect(toggleOverlayAll).toHaveBeenCalled();
    } finally {
      service.stop();
      vi.useRealTimers();
    }
  });
});
