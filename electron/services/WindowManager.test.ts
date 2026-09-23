/**
 * WindowManager tests - an offscreen window has no native window, so the
 * position persistence and show() paths that are correct for the desktop
 * window would be meaningless (and misleading) for it.
 * WindowManager のテスト - オフスクリーンウィンドウはネイティブウィンドウを持たない
 * ため、デスクトップウィンドウでは正しい位置永続化や show() の経路が、こちらでは
 * 無意味 (かつ誤解を招くもの) になる。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Listener = (...args: unknown[]) => void;

class FakeWebContents {
  openDevTools = vi.fn();
  send = vi.fn();
  on = vi.fn();
}

class FakeBrowserWindow {
  static instances: FakeBrowserWindow[] = [];

  options: Record<string, any>;
  listeners = new Map<string, Listener[]>();
  onceListeners = new Map<string, Listener[]>();
  webContents = new FakeWebContents();
  setMenuBarVisibility = vi.fn();
  show = vi.fn();
  focus = vi.fn();
  loadURL = vi.fn();
  loadFile = vi.fn();
  isDestroyed = () => false;
  getBounds = () => ({ x: 10, y: 20, width: 1100, height: 700 });

  constructor(options: Record<string, any>) {
    this.options = options;
    FakeBrowserWindow.instances.push(this);
  }

  on(event: string, listener: Listener) {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }

  once(event: string, listener: Listener) {
    const list = this.onceListeners.get(event) ?? [];
    list.push(listener);
    this.onceListeners.set(event, list);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
    for (const listener of this.onceListeners.get(event) ?? []) listener(...args);
  }

  hasListener(event: string) {
    return (
      (this.listeners.get(event)?.length ?? 0) +
        (this.onceListeners.get(event)?.length ?? 0) >
      0
    );
  }
}

const appMock = { isPackaged: false };

vi.mock('electron', () => ({
  BrowserWindow: FakeBrowserWindow,
  screen: {
    getAllDisplays: () => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }],
  },
  app: appMock,
}));

const storeData = new Map<string, unknown>();

vi.mock('electron-store', () => ({
  default: class {
    constructor({ defaults }: { defaults: Record<string, unknown> }) {
      for (const [key, value] of Object.entries(defaults)) {
        if (!storeData.has(key)) storeData.set(key, value);
      }
    }
    get(key: string) {
      return storeData.get(key);
    }
    set(key: string, value: unknown) {
      storeData.set(key, value);
    }
    delete(key: string) {
      storeData.delete(key);
    }
  },
}));

// Seed the legacy single-window key before the module loads, so the one-shot
// migration in its top-level body has something to carry over.
// モジュール読み込み前に旧来の単一ウィンドウ用キーを仕込み、トップレベルで一度だけ
// 走るマイグレーションに引き継ぐ対象を与える。
storeData.set('windowPosition', { x: 77, y: 88 });
// ...and the remembered window mode an earlier build left behind.
// ...あわせて、以前のビルドが残した前回のウィンドウモードも仕込む。
storeData.set('launchMode', 'vr');
// ...and the display settings the app no longer has.
// ...あわせて、アプリにもう存在しない表示設定も仕込む。
storeData.set('overlaySettings', { disableOverlay: true, vrOsrMode: 'never' });

const {
  createKeyboardWindow,
  createSettingsWindow,
  getKeyboardWindow,
  getSettingsWindow,
  getAllAppWindows,
} = await import('./WindowManager.js');

// Snapshot the migration result now: beforeEach() rewrites windowPositions for
// the window tests. / マイグレーション結果をここで控える。beforeEach() が
// ウィンドウ側のテストのために windowPositions を書き換えるため。
const migratedPositions = storeData.get('windowPositions') as Record<string, unknown>;
const migratedLegacy = storeData.get('windowPosition');
const leftoverLaunchMode = storeData.has('launchMode');
const leftoverOverlaySettings = storeData.has('overlaySettings');

const latestWindow = () =>
  FakeBrowserWindow.instances[FakeBrowserWindow.instances.length - 1];

beforeEach(() => {
  // The module keeps its window references in module scope, so a window created
  // by a previous test would otherwise still be live for the next one.
  // モジュールはウィンドウ参照をモジュールスコープに持つため、前のテストで作った
  // ウィンドウが次のテストでも生き続けてしまう。
  (getKeyboardWindow() as FakeBrowserWindow | null)?.emit('closed');
  (getSettingsWindow() as FakeBrowserWindow | null)?.emit('closed');
  FakeBrowserWindow.instances = [];
  storeData.set('windowPositions', {
    keyboard: { x: 300, y: 400 },
    settings: { x: 500, y: 600 },
  });
  appMock.isPackaged = false;
});

describe('window-state migration', () => {
  it('carries the legacy position into the keyboard slot without deleting it', () => {
    // Asserted against the value seeded before the import above.
    // 上のインポート前に仕込んだ値に対して検証する。
    expect(migratedPositions.keyboard).toEqual({ x: 77, y: 88 });
    // The legacy key stays so a downgrade still finds its position.
    // ダウングレードしても位置を見つけられるよう旧キーは残す。
    expect(migratedLegacy).toEqual({ x: 77, y: 88 });
  });

  // An earlier build trusted this on the next launch, turning one --vr run into
  // VR mode for every later launch. / 以前のビルドは次回起動でこれを信用し、一度の
  // --vr 起動で以降の起動をすべてVRにしていた。
  it('drops the remembered window mode left by earlier builds', () => {
    expect(leftoverLaunchMode).toBe(false);
  });

  // The app is VR-only: a stored disableOverlay: true would hide the only
  // keyboard there is. / アプリはVR専用なので、保存された disableOverlay: true は
  // 唯一のキーボードを隠してしまう。
  it('drops the display settings left by earlier builds', () => {
    expect(leftoverOverlaySettings).toBe(false);
  });
});

describe('createKeyboardWindow', () => {
  it('creates a normal desktop window by default', () => {
    createKeyboardWindow();
    const win = latestWindow();
    expect(win.options.webPreferences.offscreen).toBeUndefined();
    expect(win.options.show).toBe(false);
  });

  it('marks the window offscreen when asked', () => {
    createKeyboardWindow({ offscreen: true });
    expect(latestWindow().options.webPreferences.offscreen).toBe(true);
  });

  it('restores the saved position for a desktop window', () => {
    createKeyboardWindow();
    const win = latestWindow();
    expect(win.options.x).toBe(300);
    expect(win.options.y).toBe(400);
  });

  it('ignores the saved position for an offscreen window', () => {
    createKeyboardWindow({ offscreen: true });
    const win = latestWindow();
    expect(win.options.x).toBeUndefined();
    expect(win.options.y).toBeUndefined();
  });

  it('shows a desktop window once its content is ready', () => {
    createKeyboardWindow();
    const win = latestWindow();
    win.emit('ready-to-show');
    expect(win.show).toHaveBeenCalled();
  });

  it('never shows an offscreen window', () => {
    createKeyboardWindow({ offscreen: true });
    const win = latestWindow();
    expect(win.hasListener('ready-to-show')).toBe(false);
    expect(win.show).not.toHaveBeenCalled();
  });

  it.each(['move', 'close'])(
    'does not register the %s position listener for an offscreen window',
    (event) => {
      createKeyboardWindow({ offscreen: true });
      expect(latestWindow().hasListener(event)).toBe(false);
    },
  );

  it('still persists the position of a desktop window on close', () => {
    createKeyboardWindow();
    const win = latestWindow();
    win.emit('close');
    expect(
      (storeData.get('windowPositions') as Record<string, unknown>).keyboard,
    ).toEqual({ x: 10, y: 20 });
  });

  it('opens detached DevTools for an offscreen window in development', () => {
    createKeyboardWindow({ offscreen: true });
    expect(latestWindow().webContents.openDevTools).toHaveBeenCalledWith({
      mode: 'detach',
    });
  });

  it.each([
    ['a desktop window in development', false, false],
    ['an offscreen window in a packaged build', true, true],
  ])('does not open DevTools for %s', (_label, offscreen, isPackaged) => {
    appMock.isPackaged = isPackaged;
    createKeyboardWindow({ offscreen });
    expect(latestWindow().webContents.openDevTools).not.toHaveBeenCalled();
  });

  it('clears the reference once the window is closed', () => {
    createKeyboardWindow();
    const win = latestWindow();
    expect(getKeyboardWindow()).toBe(win);
    win.emit('closed');
    expect(getKeyboardWindow()).toBeNull();
  });
});

describe('createSettingsWindow', () => {
  it('loads the shared entry with the settings render mode in development', () => {
    createSettingsWindow();
    expect(latestWindow().loadURL).toHaveBeenCalledWith(
      'http://localhost:5173/?mode=settings',
    );
  });

  it('passes the render mode as a query in a packaged build', () => {
    appMock.isPackaged = true;
    createSettingsWindow();
    const win = latestWindow();
    expect(win.loadFile).toHaveBeenCalledWith(expect.stringContaining('index.html'), {
      query: { mode: 'settings' },
    });
  });

  it('keeps its own saved position, separate from the keyboard window', () => {
    createSettingsWindow();
    const win = latestWindow();
    expect(win.options.x).toBe(500);
    expect(win.options.y).toBe(600);
  });

  it('persists its position under its own role on close', () => {
    createSettingsWindow();
    latestWindow().emit('close');
    const positions = storeData.get('windowPositions') as Record<string, unknown>;
    expect(positions.settings).toEqual({ x: 10, y: 20 });
    expect(positions.keyboard).toEqual({ x: 300, y: 400 });
  });

  it('is shown once its content is ready', () => {
    createSettingsWindow();
    const win = latestWindow();
    win.emit('ready-to-show');
    expect(win.show).toHaveBeenCalled();
  });

  it('focuses the existing window instead of opening a second one', () => {
    const first = createSettingsWindow();
    const again = createSettingsWindow();
    expect(again).toBe(first);
    expect(FakeBrowserWindow.instances).toHaveLength(1);
    expect(latestWindow().focus).toHaveBeenCalled();
  });
});

describe('window accessors', () => {
  it('keeps the two windows addressable separately', () => {
    const keyboard = createKeyboardWindow();
    const settings = createSettingsWindow();
    expect(getKeyboardWindow()).toBe(keyboard);
    expect(getSettingsWindow()).toBe(settings);
    expect(getAllAppWindows()).toEqual([keyboard, settings]);
  });

  it('keeps the settings window once the keyboard window is gone', () => {
    createKeyboardWindow();
    const settings = createSettingsWindow();
    getKeyboardWindow()!.emit('closed');
    expect(getKeyboardWindow()).toBeNull();
    expect(getAllAppWindows()).toEqual([settings]);
  });
});
