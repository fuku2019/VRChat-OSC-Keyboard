/**
 * Electron Main Process - Application lifecycle management
 * Electronメインプロセス - アプリケーションライフサイクル管理
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Import services / サービスをインポート
import {
  startBridge,
  cleanup as cleanupBridge,
} from './services/OscBridgeService.js';
import {
  createWindow,
  getMainWindow,
  setAppTitle,
  getOverlaySettings,
} from './services/WindowManager.js';
import { registerIpcHandlers } from './services/IpcHandlers.js';
import {
  initOverlay,
  setOverlayPreferences,
  shutdownOverlay,
  startCapture,
} from './overlay.js';
import { startInputLoop } from './input_handler.js';
import { isSteamVrRunning } from './overlay/native.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load version info from package.json / package.jsonからバージョン情報を読み込む
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const APP_VERSION = packageJson.version;
const APP_TITLE = `VRChat OSC Keyboard v${APP_VERSION}`;

// Set app title for window manager / ウィンドウマネージャー用にアプリタイトルを設定
setAppTitle(APP_TITLE);

// Register IPC handlers / IPCハンドラを登録
registerIpcHandlers(APP_VERSION);

// Single instance lock / 単一インスタンスロック
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window. / 誰かが2つ目のインスタンスを実行しようとしたので、ウィンドウにフォーカスする必要がある。
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    startBridge();
    createWindow();
    setOverlayPreferences(getOverlaySettings());

    // Initialize VR overlay / VRオーバーレイを初期化
    const settings = getOverlaySettings();
    let overlayHandles = null;
    if (!settings.disableOverlay) {
      if (!isSteamVrRunning()) {
        console.log('SteamVR is not running. Skipping VR overlay initialization.');
      } else {
        overlayHandles = initOverlay();
      }
    } else {
      console.log('VR Overlay is disabled by settings.');
    }
    
    // Start capturing window content to VR overlay / ウィンドウ内容のVRオーバーレイへのキャプチャを開始
    if (overlayHandles !== null) {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        // Wait for window to be ready, then start capture / ウィンドウ準備完了を待ってからキャプチャ開始
        mainWindow.webContents.once('did-finish-load', () => {
          startCapture(mainWindow.webContents, 60); // 60 FPS target
          startInputLoop(60, mainWindow.webContents, { syncWithCapture: true }); // Sync input with capture
          console.log('VR overlay capture started');
        });
      }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      shutdownOverlay();
      // Close bridge connections / ブリッジ接続を閉じる
      cleanupBridge();
      app.quit();
    }
  });
}
