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
  getSteamVrSettings,
} from './services/WindowManager.js';
import { registerIpcHandlers } from './services/IpcHandlers.js';
import {
  init as initVrOverlayService,
  startPolling as startVrOverlayPolling,
  stop as stopVrOverlayService,
  STEAMVR_APP_KEY,
} from './services/vrOverlayService.js';
import { setSteamVrAutoLaunch } from './services/SteamVrSettingsService.js';
import {
  ensureSteamVrManifestRegistered,
  ensureSteamVrManifestUnregistered,
} from './services/SteamVrManifestService.js';
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
    const settings = getOverlaySettings();
    const steamVrSettings = getSteamVrSettings();
    setOverlayPreferences(settings);

    if (steamVrSettings.autoLaunch) {
      const manifestRegistration = ensureSteamVrManifestRegistered();
      if (!manifestRegistration.success) {
        console.warn(
          '[SteamVR] Failed to register app manifest:',
          manifestRegistration.error,
        );
      } else {
        console.log(
          '[SteamVR] App manifest registered:',
          manifestRegistration.manifestPath,
        );
      }

      const steamVrAutoLaunchSync = setSteamVrAutoLaunch(
        STEAMVR_APP_KEY,
        true,
      );
      if (!steamVrAutoLaunchSync.success) {
        console.warn(
          '[SteamVR] Failed to sync startup app setting on boot:',
          steamVrAutoLaunchSync.error,
        );
      }
    } else {
      // Keep OFF state strict by unregistering app and removing autolaunch entry.
      const steamVrAutoLaunchSync = setSteamVrAutoLaunch(
        STEAMVR_APP_KEY,
        false,
      );
      if (!steamVrAutoLaunchSync.success) {
        console.warn(
          '[SteamVR] Failed to clear startup app setting on boot:',
          steamVrAutoLaunchSync.error,
        );
      }
      const manifestUnregister = ensureSteamVrManifestUnregistered();
      if (!manifestUnregister.success) {
        console.warn(
          '[SteamVR] Failed to unregister app manifest:',
          manifestUnregister.error,
        );
      }
    }

    // Initialize VR overlay / VRオーバーレイを初期化
    let overlayHandles = null;
    if (!settings.disableOverlay) {
      if (!isSteamVrRunning()) {
        console.log('SteamVR is not running. Skipping VR overlay initialization.');
      } else {
        overlayHandles = initOverlay();
        if (overlayHandles !== null) {
          initVrOverlayService();
          startVrOverlayPolling(60);
        }
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
      stopVrOverlayService();
      shutdownOverlay();
      // Close bridge connections / ブリッジ接続を閉じる
      cleanupBridge();
      app.quit();
    }
  });
}
