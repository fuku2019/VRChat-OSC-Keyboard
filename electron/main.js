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
} from './services/SteamVrManifestService.js';
import {
  initOverlay,
  initSplash,
  shutdownOverlay,
  startCapture,
} from './overlay.js';
import { startInputLoop } from './input_handler.js';
import { isSteamVrRunningAsync } from './overlay/native.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load version info from package.json / package.jsonからバージョン情報を読み込む
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const APP_VERSION = packageJson.version;

// Load debug config  デバッグ設定ファイルを読み込む
let debugConfig = { enableDebugMode: false };
const debugConfigPath = path.join(__dirname, '../debug.config.json');
if (fs.existsSync(debugConfigPath)) {
  try {
    debugConfig = JSON.parse(fs.readFileSync(debugConfigPath, 'utf-8'));
  } catch (err) {
    console.warn('Failed to load debug.config.json:', err.message);
  }
}

let APP_TITLE = `VRChat OSC Keyboard v${APP_VERSION}`;
if (debugConfig.enableDebugMode) {
  APP_TITLE = `[DEBUG] ${APP_TITLE}`;
}

// Set app title for window manager / ウィンドウマネージャー用にアプリタイトルを設定
setAppTitle(APP_TITLE);

// Register IPC handlers / IPCハンドラを登録
registerIpcHandlers(APP_VERSION, debugConfig);

// Disable Chromium background throttling for consistent VR Overlay FPS
// VRオーバーレイのFPSを安定させるため、Chromiumのバックグラウンド最適化および隠蔽保護を無効化
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// Let pending IPC and renderer work run between blocking startup steps.
// ブロッキングな起動処理の合間に、保留中のIPCやレンダラーの処理を進めさせる。
const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Register the SteamVR manifest, sync auto-launch, and bring up the VR overlay.
 * Returns the overlay handles, or null when the overlay was not started.
 * SteamVRマニフェストの登録、自動起動設定の同期、VRオーバーレイの起動を行う。
 * オーバーレイハンドルを返す。起動しなかった場合は null。
 */
async function bootstrapSteamVr() {
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
  await yieldToEventLoop();

  const steamVrSettings = getSteamVrSettings();
  if (steamVrSettings.autoLaunch) {
    const steamVrAutoLaunchSync = setSteamVrAutoLaunch(STEAMVR_APP_KEY, true);
    if (!steamVrAutoLaunchSync.success) {
      console.warn(
        '[SteamVR] Failed to sync startup app setting on boot:',
        steamVrAutoLaunchSync.error,
      );
    }
  } else {
    // Keep AutoLaunch off without unregistering the app manifest. SteamVR Input
    // needs the manifest to save/apply bindings to the active app key.
    const steamVrAutoLaunchSync = setSteamVrAutoLaunch(STEAMVR_APP_KEY, false);
    if (!steamVrAutoLaunchSync.success) {
      console.warn(
        '[SteamVR] Failed to clear startup app setting on boot:',
        steamVrAutoLaunchSync.error,
      );
    }
  }
  await yieldToEventLoop();

  const settings = getOverlaySettings();
  if (settings.disableOverlay) {
    console.log('VR Overlay is disabled by settings.');
    return null;
  }

  if (!(await isSteamVrRunningAsync())) {
    console.log('SteamVR is not running. Skipping VR overlay initialization.');
    return null;
  }

  // Init Splash Overlay (Head-locked) first / 最初にスプラッシュオーバーレイ（ヘッドロック）を初期化する
  initSplash();

  // Init Main Overlay (Hidden by default) / メインオーバーレイを初期化する（デフォルトでは非表示）
  const overlayHandles = initOverlay();
  if (overlayHandles !== null) {
    initVrOverlayService();
    startVrOverlayPolling(60);
  }
  return overlayHandles;
}

/**
 * Run the SteamVR bootstrap on the next event-loop tick, after createWindow() has
 * returned control. This still lets the renderer's startup IPC interleave with the
 * bootstrap's blocking steps (each yields via yieldToEventLoop), without pushing VR
 * init all the way out to did-finish-load.
 * createWindow() が制御を返した直後、次のイベントループティックでSteamVR初期化を実行する。
 * bootstrap内の各ブロッキング処理はyieldToEventLoopで制御を返すため、レンダラーの
 * 起動時IPCとの間で処理が交互に進む。VR初期化をdid-finish-loadまで遅延させはしない。
 */
function scheduleSteamVrBootstrap() {
  const run = async () => {
    let overlayHandles = null;
    try {
      overlayHandles = await bootstrapSteamVr();
    } catch (error) {
      console.error('SteamVR bootstrap failed:', error);
      return;
    }
    if (overlayHandles === null) {
      return;
    }

    const window = getMainWindow();
    if (!window || window.isDestroyed()) {
      return;
    }

    // Start capturing window content to VR overlay / ウィンドウ内容のVRオーバーレイへのキャプチャを開始
    startCapture(window.webContents, 90); // 90 FPS target for smoother rendering
    startInputLoop(120, window.webContents, { syncWithCapture: false }); // Decouple input from capture for lowest latency
    console.log('VR overlay capture started');
  };

  setImmediate(run);
}

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

    // The SteamVR bootstrap below spawns several external processes synchronously
    // (vrpathreg, tasklist) and calls VR_Init. Running it inline would block the main
    // process for seconds while the renderer is mounting and awaiting its startup IPC,
    // which is what made the window appear long before its content. Push it to the
    // next tick and yield to the event loop between its blocking steps so the
    // renderer's startup IPC can interleave with it instead of queuing behind it.
    // 以下のSteamVR初期化は外部プロセスを同期的に複数起動し (vrpathreg, tasklist)、
    // VR_Init も呼ぶ。ここで直接実行するとレンダラーのマウント中および起動時IPCの待機中に
    // メインプロセスを数秒ブロックし、ウィンドウだけ先に出て中身が遅れる原因になる。
    // 次のティックへ回し、ブロッキング処理の合間にイベントループへ制御を返すことで、
    // レンダラーの起動時IPCがその後ろに並ばず交互に処理されるようにする。
    scheduleSteamVrBootstrap();

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
