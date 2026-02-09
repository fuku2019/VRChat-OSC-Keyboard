/**
 * Window Manager Service - Handles Electron window management logic
 * ウィンドウマネージャーサービス - Electronウィンドウ管理ロジックを処理
 */

import { BrowserWindow, screen, app } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Module state / モジュール状態
let mainWindow = null;
let APP_TITLE = '';
let savePositionTimer = null;

// Initialize electron-store for window position persistence / ウィンドウ位置の永続化用にelectron-storeを初期化
const store = new Store({
  projectName: 'vrchat-osc-keyboard',
  name: 'window-state',
  defaults: {
    windowPosition: null, // { x: number, y: number } or null
    overlaySettings: {
      useOffscreenCapture: false,
      forceOpaqueAlpha: false,
      disableOverlay: false,
    },
  },
});

/**
 * Set app title / アプリタイトルを設定
 */
export function setAppTitle(title) {
  APP_TITLE = title;
}

/**
 * Get main window instance / メインウィンドウインスタンスを取得
 */
export function getMainWindow() {
  return mainWindow;
}

/**
 * Get overlay settings / オーバーレイ設定を取得
 */
export function getOverlaySettings() {
  const settings = store.get('overlaySettings');
  const useOffscreenCapture =
    settings && typeof settings.useOffscreenCapture === 'boolean'
      ? settings.useOffscreenCapture
      : false;
  const forceOpaqueAlpha =
    settings && typeof settings.forceOpaqueAlpha === 'boolean'
      ? settings.forceOpaqueAlpha
      : false;
  const disableOverlay =
    settings && typeof settings.disableOverlay === 'boolean'
      ? settings.disableOverlay
      : false;
  return { useOffscreenCapture, forceOpaqueAlpha, disableOverlay };
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

/**
 * Save window position / ウィンドウ位置を保存
 */
function saveWindowPosition() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    store.set('windowPosition', { x: bounds.x, y: bounds.y });
  }
}

function scheduleSaveWindowPosition() {
  if (savePositionTimer) {
    clearTimeout(savePositionTimer);
  }
  savePositionTimer = setTimeout(() => {
    savePositionTimer = null;
    saveWindowPosition();
  }, 250);
}

/**
 * Get saved window position or null / 保存されたウィンドウ位置を取得（存在しない場合はnull）
 */
function getSavedWindowPosition() {
  const position = store.get('windowPosition');
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
 * Create main window / メインウィンドウを作成
 */
export function createWindow() {
  // Get saved window position / 保存されたウィンドウ位置を取得
  const savedPosition = getSavedWindowPosition();
  const overlaySettings = getOverlaySettings();

  const windowOptions = {
    title: APP_TITLE,
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 700,
    frame: true,
    transparent: false,
    backgroundColor: '#020617', // Match slate-950
    icon: path.join(__dirname, '../../dist/icon.ico'), // Try to load icon if available / 利用可能な場合はアイコンをロードしようとする
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload.js'), // Add preload script / プリロードスクリプトを追加
      devTools: !app.isPackaged,
      backgroundThrottling: false, // Keep rendering stable for VR capture / VRキャプチャのため描画スロットリングを無効化
      offscreen: overlaySettings.useOffscreenCapture, // Optional offscreen rendering / オフスクリーンレンダリング
    },
  };

  // Apply saved position if available / 保存された位置があれば適用
  if (savedPosition) {
    windowOptions.x = savedPosition.x;
    windowOptions.y = savedPosition.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Hide menu bar for cleaner look / 見た目をすっきりさせるためにメニューバーを隠す
  mainWindow.setMenuBarVisibility(false);

  // Prevent window title overwrite by HTML title tag / HTMLのtitleタグによるウィンドウタイトルの上書きを防ぐ
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  // Save window position when moved / ウィンドウ移動時に位置を保存
  mainWindow.on('move', () => {
    scheduleSaveWindowPosition();
  });

  // In development, load from Vite server. In production, load built file. / 開発中はViteサーバーからロードする。本番環境ではビルドされたファイルをロードする。
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools(); // Open DevTools in debug mode. / デバックモード中にDevToolsを開く
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  return mainWindow;
}
