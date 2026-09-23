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
  createKeyboardWindow,
  createSettingsWindow,
  getKeyboardWindow,
  getSettingsWindow,
  setAppTitle,
  getSteamVrSettings,
} from './services/WindowManager.js';
import { registerIpcHandlers } from './services/IpcHandlers.js';
import { broadcastVrStatus } from './services/ipc/WindowIpcHandlers.js';
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
  getOverlayManager,
  initOverlay,
  initSplash,
  shutdownOverlay,
  startCapture,
  stopCapture,
} from './overlay.js';
import {
  setCursorEpsilon,
  setFilterIdleControllers,
  setPointerFilter,
  setPoseAheadSeconds,
  startInputLoop,
  stopInputLoop,
} from './input_handler.js';
import { isSteamVrRunningAsync } from './overlay/native.js';
import { parseLaunchArgs } from './cli.js';
import { loadDebugConfig } from './debugConfig.js';
import { setPerfLogEnabled } from './overlay/perf.js';
import { resolveWindowMode } from './services/launchMode.js';
import { VR_STATUS, watchForSteamVr } from './services/steamVrWatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load version info from package.json / package.jsonからバージョン情報を読み込む
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const APP_VERSION = packageJson.version;

// Parse launch arguments first: everything below may depend on them.
// 以降の処理が参照しうるので、起動引数を最初に解析する。
const launchArgs = parseLaunchArgs(process.argv);

// Load debug config  デバッグ設定ファイルを読み込む
// app.getPath('userData') is available before app.whenReady().
// app.getPath('userData') は app.whenReady() より前でも利用できる。
const debugConfig = loadDebugConfig({
  userDataDir: app.getPath('userData'),
  appDir: path.join(__dirname, '..'),
  launchArgs,
});

// Capture instrumentation is off unless --perf-log was passed.
// --perf-log が渡されない限りキャプチャ計測は無効のままにする。
setPerfLogEnabled(launchArgs.perfLog);

// Pointer smoothing keeps its defaults unless --pointer-filter overrides them.
// ポインタ平滑化は --pointer-filter で上書きされない限り既定値のままにする。
if (launchArgs.pointerFilter) {
  setPointerFilter(launchArgs.pointerFilter);
}
if (launchArgs.cursorEpsilon !== null) {
  setCursorEpsilon(launchArgs.cursorEpsilon);
}
if (launchArgs.poseAheadSec !== null) {
  setPoseAheadSeconds(launchArgs.poseAheadSec);
}
if (launchArgs.keepIdleCursors) {
  setFilterIdleControllers(false);
}

let APP_TITLE = `VRChat OSC Keyboard v${APP_VERSION}`;
if (debugConfig.enableDebugMode) {
  APP_TITLE = `[DEBUG] ${APP_TITLE}`;
}

// Set app title for window manager / ウィンドウマネージャー用にアプリタイトルを設定
setAppTitle(APP_TITLE);

// Register IPC handlers / IPCハンドラを登録
// The launch info is read lazily: the window mode is not decided until
// app.whenReady(), well after this call.
// 起動情報は遅延して読む。ウィンドウモードが決まるのは app.whenReady() のときで、
// この呼び出しよりずっと後になる。
registerIpcHandlers(APP_VERSION, debugConfig, {
  getLaunchInfo: () => ({
    windowMode: currentWindowMode,
    isOsr: currentWindowMode === 'vr',
    debug: debugConfig.enableDebugMode === true,
  }),
  getVrStatus: () => vrStatus,
});

// Disable Chromium background throttling for consistent VR Overlay FPS
// VRオーバーレイのFPSを安定させるため、Chromiumのバックグラウンド最適化および隠蔽保護を無効化
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// The window mode currently in effect / 現在適用されているウィンドウモード
let currentWindowMode = 'desktop';

// Settings windows that already carry the quit hook / 終了フックを設置済みの設定ウィンドウ
const settingsQuitHooked = new WeakSet();

// Where the SteamVR overlay stands. Starts as 'starting' because the first
// check is already on its way by the time any window can ask.
// SteamVR オーバーレイの状態。ウィンドウが問い合わせられる頃には最初の確認が
// 既に始まっているため、'starting' から始める。
let vrStatus = VR_STATUS.STARTING;
let stopWatchingSteamVr = null;

function setVrStatus(status) {
  vrStatus = status;
  console.log('[vr] SteamVR overlay: ' + status);
  broadcastVrStatus(status);
}

/**
 * Build the window set for a mode, replacing whatever is already open.
 * あるモードに対応するウィンドウ一式を作る。既に開いているものは置き換える。
 */
function applyWindowMode(mode) {
  const offscreen = mode === 'vr';

  // Capture and the input loop are bound to a specific webContents, so they
  // have to be torn down before the window they point at goes away.
  // キャプチャと入力ループは特定の webContents に結び付いているため、参照先の
  // ウィンドウが消える前に停止しなければならない。
  const existing = getKeyboardWindow();
  if (existing && !existing.isDestroyed()) {
    stopCapture();
    stopInputLoop();
    existing.destroy();
  }

  currentWindowMode = mode;
  createKeyboardWindow({ offscreen });

  if (!offscreen) {
    const settings = getSettingsWindow();
    if (settings && !settings.isDestroyed()) settings.destroy();
    return;
  }

  const settings = createSettingsWindow();
  // In VR mode this is the only window the user can see or click, and
  // window-all-closed never fires while the offscreen keyboard window is alive.
  // Closing it therefore has to mean quitting, or the app becomes unkillable
  // short of the task manager.
  // VRモードではこれがユーザーに見えて操作できる唯一のウィンドウであり、
  // オフスクリーンのキーボードウィンドウが生きている間 window-all-closed は
  // 発火しない。そのため閉じる操作は終了を意味する必要がある。さもないと
  // タスクマネージャー以外でアプリを終了できなくなる。
  if (settings && !settingsQuitHooked.has(settings)) {
    settingsQuitHooked.add(settings);
    settings.once('closed', () => {
      if (currentWindowMode === 'vr') app.quit();
    });
  }
}

// Let pending IPC and renderer work run between blocking startup steps.
// ブロッキングな起動処理の合間に、保留中のIPCやレンダラーの処理を進めさせる。
const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Register the SteamVR manifest and sync auto-launch. Runs once at start-up,
 * whether or not SteamVR is running - it only writes files and registry state.
 * SteamVRマニフェストの登録と自動起動設定の同期を行う。SteamVR が動いているかに
 * 関わらず起動時に一度だけ実行する。ファイルとレジストリの状態を書くだけである。
 */
async function registerSteamVrApp() {
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
}

/**
 * Bring up the VR overlay and point capture and input at the keyboard window.
 * Returns the overlay handles, or null so the watcher retries later.
 * VRオーバーレイを立ち上げ、キャプチャと入力をキーボードウィンドウへ向ける。
 * オーバーレイハンドルを返す。null を返すと監視側が後で再試行する。
 */
function startVrOverlay() {
  // Main overlay first (it is created hidden). Doing the splash first would
  // flash the logo on every retry while vrserver is still coming up.
  // メインオーバーレイを先に作る (非表示で作られる)。スプラッシュを先にすると、
  // vrserver の起動待ちで再試行するたびにロゴが出てしまう。
  const overlayHandles = initOverlay();
  if (overlayHandles === null) return null;

  initSplash();
  initVrOverlayService();
  startVrOverlayPolling(60);
  logSteamVrBindings();

  const window = getKeyboardWindow();
  if (window && !window.isDestroyed()) {
    // Start capturing window content to VR overlay / ウィンドウ内容のVRオーバーレイへのキャプチャを開始
    startCapture(window.webContents, 90); // 90 FPS target for smoother rendering
    startInputLoop(120, window.webContents, { syncWithCapture: false }); // Decouple input from capture for lowest latency
    console.log('VR overlay capture started');
  }
  return overlayHandles;
}

/**
 * Report which SteamVR Input bindings actually resolved.
 * SteamVR Input のバインディングが実際にどう解決されたかを報告する。
 *
 * Every OpenVR call in init_input is error checked, so a silent start means the
 * action manifest was accepted and the handles are valid. That still leaves the
 * case where SteamVR resolved no bindings for those handles, which looks
 * identical from the app's side - the toggle simply never fires - and is
 * otherwise invisible without the headset.
 * init_input の各OpenVR呼び出しはすべてエラー検査されているので、何も出ずに起動した
 * なら、アクションマニフェストは受理されハンドルも有効である。しかしそれでも、
 * SteamVR がそのハンドルに対してバインディングを1つも解決していない場合が残る。
 * これはアプリ側からは区別が付かず (単にトグルが発火しないだけ)、ヘッドセットなしでは
 * 見ることもできない。
 *
 * Delayed because SteamVR resolves bindings asynchronously after the manifest
 * is registered. / マニフェスト登録後、SteamVR は非同期にバインディングを解決する
 * ため遅延させている。
 */
const BINDING_REPORT_DELAY_MS = 2000;
function logSteamVrBindings() {
  const timer = setTimeout(() => {
    try {
      const manager = getOverlayManager();
      const bindings = manager?.getCurrentBindings?.();
      if (!bindings) return;
      console.log(
        `[SteamVR Input] initialized=${bindings.initialized} ` +
          `toggle=[${bindings.toggleOverlay.join(' | ')}] ` +
          `triggerBound=${bindings.triggerBound} gripBound=${bindings.gripBound}`,
      );
    } catch (error) {
      console.warn('[SteamVR Input] could not read bindings:', error);
    }
  }, BINDING_REPORT_DELAY_MS);
  timer.unref?.();
}

/**
 * Register with SteamVR, then wait for it and bring the overlay up when it
 * appears. Runs on the next event-loop tick, after applyWindowMode() has
 * returned, so the renderer's startup IPC interleaves with the blocking steps
 * (each yields via yieldToEventLoop) instead of queuing behind them.
 * SteamVR へ登録し、その後 SteamVR を待って、現れたらオーバーレイを立ち上げる。
 * applyWindowMode() が制御を返した直後の次のティックで実行するため、レンダラーの
 * 起動時IPCはブロッキング処理 (それぞれ yieldToEventLoop で制御を返す) の後ろに
 * 並ばず、交互に処理される。
 *
 * The window mode does not depend on any of this. The keyboard window already
 * exists; only the overlay waits. / ウィンドウモードはこの処理に一切依存しない。
 * キーボードウィンドウは既に存在しており、待つのはオーバーレイだけである。
 */
function startSteamVrLifecycle() {
  const run = async () => {
    try {
      await registerSteamVrApp();
    } catch (error) {
      console.error('SteamVR registration failed:', error);
    }
    await yieldToEventLoop();
    if (servicesShutdown) return;

    stopWatchingSteamVr = watchForSteamVr({
      isRunning: isSteamVrRunningAsync,
      start: startVrOverlay,
      onStatus: setVrStatus,
    });
  };

  setImmediate(run);
}

/**
 * Release VR overlay handles, input loop and bridge sockets.
 * Idempotent, so it is safe to run from both window-all-closed and before-quit.
 * VRオーバーレイのハンドル、入力ループ、ブリッジのソケットを解放する。
 * 冪等なので window-all-closed と before-quit の両方から呼んで問題ない。
 */
let servicesShutdown = false;
function shutdownServices() {
  if (servicesShutdown) return;
  servicesShutdown = true;
  if (stopWatchingSteamVr) {
    stopWatchingSteamVr();
    stopWatchingSteamVr = null;
  }
  stopInputLoop();
  stopCapture();
  stopVrOverlayService();
  shutdownOverlay();
  // Close bridge connections / ブリッジ接続を閉じる
  cleanupBridge();
}

// Single instance lock / 単一インスタンスロック
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window. / 誰かが2つ目のインスタンスを実行しようとしたので、ウィンドウにフォーカスする必要がある。
    // Prefer the settings window: in VR mode the keyboard window is offscreen
    // and cannot be focused at all.
    // 設定ウィンドウを優先する。VRモードではキーボードウィンドウはオフスクリーンで、
    // そもそもフォーカスできない。
    const target = getSettingsWindow() ?? getKeyboardWindow();
    if (target && !target.isDestroyed()) {
      if (target.isMinimized()) target.restore();
      target.focus();
    }
  });

  app.whenReady().then(() => {
    startBridge();

    // The app is VR-only; the desktop keyboard is a debugging aid. The mode is
    // settled here, once, and never rebuilt.
    // このアプリはVR専用で、デスクトップのキーボードはデバッグ用である。モードは
    // ここで一度だけ決まり、作り直されることはない。
    applyWindowMode(
      resolveWindowMode({
        launchArgs,
        debug: debugConfig.enableDebugMode === true,
      }),
    );

    // The SteamVR work spawns external processes synchronously (vrpathreg,
    // tasklist) and calls VR_Init. Running it inline would block the main
    // process for seconds while the renderer is mounting and awaiting its
    // startup IPC, which is what made the window appear long before its content.
    // SteamVR まわりの処理は外部プロセスを同期的に起動し (vrpathreg, tasklist)、
    // VR_Init も呼ぶ。ここで直接実行するとレンダラーのマウント中および起動時IPCの
    // 待機中にメインプロセスを数秒ブロックし、ウィンドウだけ先に出て中身が遅れる
    // 原因になる。
    startSteamVrLifecycle();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        applyWindowMode(currentWindowMode);
      }
    });
  });

  // Also covers quit paths that never close a window (e.g. restart / installer).
  // ウィンドウを閉じずに終了する経路（再起動やインストーラ実行など）もここで拾う。
  app.on('before-quit', () => {
    shutdownServices();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      shutdownServices();
      app.quit();
    }
  });
}
