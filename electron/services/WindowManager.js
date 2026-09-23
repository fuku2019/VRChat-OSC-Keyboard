/**
 * Window Manager Service - Handles Electron window management logic
 * ウィンドウマネージャーサービス - Electronウィンドウ管理ロジックを処理
 *
 * Two windows can exist. The keyboard window is the one the VR overlay
 * captures; in VR mode it renders offscreen and is therefore invisible on the
 * desktop. The settings window is an ordinary desktop window that exists so the
 * app stays usable and closable while the keyboard is only visible in VR.
 * ウィンドウは2つ存在しうる。キーボードウィンドウはVRオーバーレイがキャプチャする
 * 対象で、VRモードではオフスクリーン描画になるためデスクトップには表示されない。
 * 設定ウィンドウは通常のデスクトップウィンドウで、キーボードがVR内にしか見えない
 * 状態でもアプリを操作し終了できるようにするために存在する。
 */

import { BrowserWindow, screen, app } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @typedef {'keyboard'|'settings'} WindowRole */

// Module state / モジュール状態
let keyboardWindow = null;
let settingsWindow = null;
let APP_TITLE = '';
/** @type {Map<WindowRole, ReturnType<typeof setTimeout>>} */
const savePositionTimers = new Map();

// Initialize electron-store for window position persistence / ウィンドウ位置の永続化用にelectron-storeを初期化
const store = new Store({
  projectName: 'vrchat-osc-keyboard',
  name: 'window-state',
  defaults: {
    windowPosition: null, // Legacy single-window key / 旧: 単一ウィンドウ時代のキー
    windowPositions: {
      keyboard: null, // { x: number, y: number } or null
      settings: null,
    },
    overlaySettings: {
      disableOverlay: false,
      vrOsrMode: 'auto',
    },
    steamVrSettings: {
      autoLaunch: false,
    },
  },
});

// Carry a pre-split position over to the keyboard slot once. The legacy key is
// deliberately left in place so that downgrading restores the old position.
// 分割前の位置をキーボード側へ一度だけ引き継ぐ。ダウングレード時に旧バージョンが
// 位置を復元できるよう、旧キーはあえて残す。
(function migrateWindowPosition() {
  const legacy = store.get('windowPosition');
  if (!legacy) return;
  const positions = store.get('windowPositions') ?? {};
  if (positions.keyboard) return;
  store.set('windowPositions', { ...positions, keyboard: legacy });
})();

// Earlier builds remembered the last window mode here and trusted it on the
// next launch, which made one --vr run turn every later launch into a VR
// launch. Nothing reads it any more; drop it so nobody starts trusting it again.
// 以前のビルドはここに前回のウィンドウモードを記憶して次回起動で信用しており、
// 一度の --vr 起動が以降のすべての起動をVRにしていた。今は誰も読まないので、
// 再び信用されないよう削除しておく。
store.delete('launchMode');

/**
 * Set app title / アプリタイトルを設定
 */
export function setAppTitle(title) {
  APP_TITLE = title;
}

/**
 * Get the window the VR overlay captures / VRオーバーレイがキャプチャするウィンドウを取得
 */
export function getKeyboardWindow() {
  return keyboardWindow;
}

/**
 * Get the desktop settings window / デスクトップ設定ウィンドウを取得
 */
export function getSettingsWindow() {
  return settingsWindow;
}

/**
 * Every live app window, for broadcasting to all renderers.
 * 生存している全アプリウィンドウ。全レンダラーへのブロードキャスト用。
 */
export function getAllAppWindows() {
  return [keyboardWindow, settingsWindow].filter(
    (win) => win && !win.isDestroyed(),
  );
}

/**
 * Get main window instance / メインウィンドウインスタンスを取得
 *
 * Kept for callers that predate the split. Prefer getKeyboardWindow() when the
 * caller specifically needs the capture and input target.
 * 分割前からの呼び出し元のために残している。キャプチャや入力の対象が必要な場合は
 * getKeyboardWindow() を使うこと。
 */
export function getMainWindow() {
  return keyboardWindow ?? settingsWindow;
}

/**
 * Get overlay settings / オーバーレイ設定を取得
 */
export function getOverlaySettings() {
  const settings = store.get('overlaySettings');
  const disableOverlay =
    settings && typeof settings.disableOverlay === 'boolean'
      ? settings.disableOverlay
      : false;
  const vrOsrMode =
    settings &&
    (settings.vrOsrMode === 'auto' ||
      settings.vrOsrMode === 'always' ||
      settings.vrOsrMode === 'never')
      ? settings.vrOsrMode
      : 'auto';
  return { disableOverlay, vrOsrMode };
}

/**
 * Update overlay settings / オーバーレイ設定を更新
 */
export function setOverlaySettings(partial) {
  const current = getOverlaySettings();
  const next = { ...current, ...partial };
  store.set('overlaySettings', next);
}

/**
 * Get SteamVR settings / SteamVR設定を取得
 */
export function getSteamVrSettings() {
  const settings = store.get('steamVrSettings');
  const autoLaunch =
    settings && typeof settings.autoLaunch === 'boolean'
      ? settings.autoLaunch
      : false;
  return { autoLaunch };
}

/**
 * Update SteamVR settings / SteamVR設定を更新
 */
export function setSteamVrSettings(partial) {
  const current = getSteamVrSettings();
  const next = { ...current, ...partial };
  store.set('steamVrSettings', next);
}

/**
 * Check if position is visible on any screen / 位置がいずれかの画面に表示されるかチェック
 */
function isPositionOnScreen(x, y) {
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const { x: dx, y: dy, width, height } = display.bounds;
    // Check if position is within display bounds with some margin / 位置がディスプレイ境界内にあるかマージン付きでチェック
    return x >= dx - 100 && x < dx + width && y >= dy - 100 && y < dy + height;
  });
}

function windowForRole(role) {
  return role === 'settings' ? settingsWindow : keyboardWindow;
}

/**
 * Save window position / ウィンドウ位置を保存
 * @param {WindowRole} role
 */
function saveWindowPosition(role) {
  const win = windowForRole(role);
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const positions = store.get('windowPositions') ?? {};
  store.set('windowPositions', {
    ...positions,
    [role]: { x: bounds.x, y: bounds.y },
  });
}

/**
 * @param {WindowRole} role
 */
function scheduleSaveWindowPosition(role) {
  const pending = savePositionTimers.get(role);
  if (pending) clearTimeout(pending);
  savePositionTimers.set(
    role,
    setTimeout(() => {
      savePositionTimers.delete(role);
      saveWindowPosition(role);
    }, 250),
  );
}

/**
 * Get saved window position or null / 保存されたウィンドウ位置を取得（存在しない場合はnull）
 * @param {WindowRole} role
 */
function getSavedWindowPosition(role) {
  const positions = store.get('windowPositions') ?? {};
  const position = positions[role];
  if (
    position &&
    typeof position.x === 'number' &&
    typeof position.y === 'number'
  ) {
    // Validate position is on a visible screen / 位置が表示可能な画面上にあるか検証
    if (isPositionOnScreen(position.x, position.y)) {
      return position;
    }
  }
  return null;
}

/**
 * Wire the debounced position persistence for a real desktop window.
 * 実際のデスクトップウィンドウに、デバウンス付きの位置永続化を接続する。
 * @param {WindowRole} role
 */
function attachPositionPersistence(win, role) {
  // Save window position when moved / ウィンドウ移動時に位置を保存
  win.on('move', () => {
    scheduleSaveWindowPosition(role);
  });

  // Flush the debounced save before the window is gone, so a move right before
  // closing is not lost with the pending timer.
  // ウィンドウが破棄される前に保留中の保存を確定させ、閉じる直前の移動が
  // タイマーごと失われないようにする。
  win.on('close', () => {
    const pending = savePositionTimers.get(role);
    if (pending) {
      clearTimeout(pending);
      savePositionTimers.delete(role);
    }
    saveWindowPosition(role);
  });
}

/**
 * Point a window at the renderer, optionally selecting a render mode.
 * ウィンドウをレンダラーへ向ける。必要に応じて描画モードを指定する。
 */
function loadRenderer(win, query = null) {
  // In development, load from Vite server. In production, load built file. / 開発中はViteサーバーからロードする。本番環境ではビルドされたファイルをロードする。
  if (!app.isPackaged) {
    const search = query ? '?' + new URLSearchParams(query).toString() : '';
    win.loadURL('http://localhost:5173/' + search);
    return;
  }
  const indexPath = path.join(__dirname, '../../dist/index.html');
  if (query) {
    win.loadFile(indexPath, { query });
    return;
  }
  win.loadFile(indexPath);
}

/**
 * Create the keyboard window / キーボードウィンドウを作成
 *
 * @param {Object} [options]
 * @param {boolean} [options.offscreen] - Render offscreen for the VR overlay / VRオーバーレイ向けにオフスクリーン描画する
 */
export function createKeyboardWindow(options = {}) {
  const offscreen = options.offscreen === true;

  // An offscreen window has no native window at all, so it cannot be shown,
  // focused or moved. Position persistence is meaningless for it.
  // オフスクリーンウィンドウはネイティブウィンドウを一切持たないため、表示・
  // フォーカス・移動ができない。位置の永続化はそもそも意味を持たない。
  const savedPosition = offscreen ? null : getSavedWindowPosition('keyboard');

  const windowOptions = {
    title: APP_TITLE,
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 700,
    frame: true,
    transparent: false,
    backgroundColor: '#020617', // Match slate-950
    show: false, // Wait for content to be ready before showing / コンテンツの準備ができるまで表示を待つ
    icon: path.join(__dirname, '../../dist/icon.ico'), // Try to load icon if available / 利用可能な場合はアイコンをロードしようとする
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload.js'), // Add preload script / プリロードスクリプトを追加
      devTools: !app.isPackaged,
      backgroundThrottling: false, // Keep rendering stable for VR capture / VRキャプチャのため描画スロットリングを無効化
      // Offscreen rendering drives the overlay from the 'paint' event instead of
      // polling capturePage(), which decouples the VR frame rate from the
      // desktop compositor's vsync and stops producing frames when the page is
      // idle. / オフスクリーン描画は capturePage() のポーリングではなく 'paint'
      // イベントでオーバーレイを駆動し、VRのフレームレートをデスクトップ
      // コンポジタの vsync から切り離す。ページが静止していればフレーム生成も止まる。
      ...(offscreen ? { offscreen: true } : {}),
    },
  };

  // Apply saved position if available / 保存された位置があれば適用
  if (savedPosition) {
    windowOptions.x = savedPosition.x;
    windowOptions.y = savedPosition.y;
  }

  keyboardWindow = new BrowserWindow(windowOptions);

  // Hide menu bar for cleaner look / 見た目をすっきりさせるためにメニューバーを隠す
  keyboardWindow.setMenuBarVisibility(false);

  // Prevent window title overwrite by HTML title tag / HTMLのtitleタグによるウィンドウタイトルの上書きを防ぐ
  keyboardWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  // Position tracking only applies to a real desktop window.
  // 位置の追跡は実際のデスクトップウィンドウにのみ適用する。
  if (!offscreen) {
    attachPositionPersistence(keyboardWindow, 'keyboard');
  }

  // Drop the reference so getMainWindow() never hands out a destroyed window
  // 破棄済みウィンドウを getMainWindow() が返さないよう参照を解放する
  keyboardWindow.on('closed', () => {
    keyboardWindow = null;
  });

  // Show only once content has rendered, avoiding a blank window on startup / コンテンツの描画後にのみ表示し、起動時の白い画面を防ぐ
  // An offscreen window is never shown; show() on it would be a no-op at best.
  // オフスクリーンウィンドウは表示しない。show() はよくても no-op にしかならない。
  if (!offscreen) {
    keyboardWindow.once('ready-to-show', () => {
      keyboardWindow.show();
    });
  }

  loadRenderer(keyboardWindow);

  if (offscreen && !app.isPackaged) {
    // An offscreen window has no window to attach DevTools to, and opening it
    // detached is not dependable here, so mirror the page's console into the
    // terminal. Without this the renderer half of the VR path is unobservable.
    // オフスクリーンウィンドウには DevTools を貼り付ける先のウィンドウがなく、
    // detach で開くのも当てにならない。そこでページのコンソールをターミナルへ
    // 流す。これがないとVR経路のレンダラー側が観測できない。
    keyboardWindow.webContents.on('console-message', (details) => {
      console.log('[renderer] ' + details.message);
    });
    keyboardWindow.webContents.openDevTools({ mode: 'detach' });
  }

  return keyboardWindow;
}

/**
 * Create main window / メインウィンドウを作成
 *
 * Thin alias kept so existing callers keep working. / 既存の呼び出し元が動き続けるよう残した薄い別名。
 */
export function createWindow(options = {}) {
  return createKeyboardWindow(options);
}

/**
 * Create the desktop settings window / デスクトップ設定ウィンドウを作成
 *
 * It loads the same index.html with ?mode=settings, so the renderer mounts the
 * settings panel alone instead of the keyboard. That separation matters because
 * the keyboard tree opens the OSC bridge and the IME IPC, and a second copy of
 * those would fight the first.
 * 同じ index.html を ?mode=settings で読み込み、レンダラーはキーボードではなく
 * 設定パネルだけをマウントする。キーボードのツリーは OSC ブリッジと IME IPC を
 * 開くため、2つ目のコピーが1つ目と衝突する。この分離はそのために必要である。
 */
export function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  const savedPosition = getSavedWindowPosition('settings');

  const windowOptions = {
    title: APP_TITLE + ' - Settings',
    width: 960,
    height: 760,
    minWidth: 820,
    minHeight: 600,
    frame: true,
    transparent: false,
    backgroundColor: '#020617', // Match slate-950
    show: false,
    icon: path.join(__dirname, '../../dist/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload.js'),
      devTools: !app.isPackaged,
      // Unlike the keyboard window this one is never captured, so letting
      // Chromium throttle it while it sits in the background costs nothing.
      // キーボードウィンドウと違いこちらはキャプチャされないため、背面にある間
      // Chromium にスロットリングさせても損はない。
      backgroundThrottling: true,
    },
  };

  if (savedPosition) {
    windowOptions.x = savedPosition.x;
    windowOptions.y = savedPosition.y;
  }

  settingsWindow = new BrowserWindow(windowOptions);
  settingsWindow.setMenuBarVisibility(false);

  settingsWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  attachPositionPersistence(settingsWindow, 'settings');

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  loadRenderer(settingsWindow, { mode: 'settings' });

  return settingsWindow;
}
