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
  getStoredLaunchMode,
  setStoredLaunchMode,
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
import {
  resolveInitialWindowMode,
  resolveFinalWindowMode,
} from './services/launchMode.js';

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

/**
 * Apply --vr-osr / --no-vr-osr and refuse VR mode with the overlay disabled.
 *
 * Forcing offscreen on is the same request as VR mode, because an offscreen
 * keyboard always comes with a settings window - without one there would be no
 * visible window at all.
 * --vr-osr / --no-vr-osr を適用し、オーバーレイ無効でのVRモードを拒否する。
 *
 * オフスクリーンを強制することはVRモードの要求と同じ意味になる。オフスクリーンの
 * キーボードには必ず設定ウィンドウが伴うためで、これがないと可視ウィンドウが
 * 一切なくなってしまう。
 */
function resolveWindowMode(baseMode) {
  let mode = baseMode;
  if (launchArgs.osr === true) mode = 'vr';
  if (launchArgs.osr === false) mode = 'desktop';

  if (mode === 'vr' && getOverlaySettings().disableOverlay) {
    console.warn(
      '[vr] VR window mode ignored: the VR overlay is disabled in settings.',
    );
    return 'desktop';
  }
  return mode;
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
 * Run the SteamVR bootstrap on the next event-loop tick, after applyWindowMode() has
 * returned control. This still lets the renderer's startup IPC interleave with the
 * bootstrap's blocking steps (each yields via yieldToEventLoop), without pushing VR
 * init all the way out to did-finish-load.
 * applyWindowMode() が制御を返した直後、次のイベントループティックでSteamVR初期化を実行する。
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
    }

    // Now that the overlay has reported back, settle on the real mode. This is
    // also the safety net for the reverse case: if the window was opened
    // offscreen but the overlay never came up, it is rebuilt as a normal window
    // so the user is not left with an invisible app.
    // オーバーレイの結果が出たので本来のモードを確定する。ここは逆方向の安全網でも
    // ある。オフスクリーンで開いたのにオーバーレイが起動しなかった場合は通常
    // ウィンドウとして作り直し、ユーザーが見えないアプリを抱えないようにする。
    const finalMode = resolveWindowMode(
      resolveFinalWindowMode({
        launchArgs,
        vrOsrMode: getOverlaySettings().vrOsrMode,
        overlayStarted: overlayHandles !== null,
      }),
    );
    if (finalMode !== currentWindowMode) {
      console.log(
        '[vr] switching window mode: ' + currentWindowMode + ' -> ' + finalMode,
      );
      applyWindowMode(finalMode);
    }
    setStoredLaunchMode(finalMode);

    if (overlayHandles === null) {
      return;
    }

    const window = getKeyboardWindow();
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

    // Decide the starting mode from cheap synchronous inputs only. The VR
    // bootstrap that could answer this properly takes seconds, and the window
    // has to be on screen well before then.
    // 起動時のモードは安価な同期入力だけで決める。これを正しく判定できるVR初期化は
    // 数秒かかるが、ウィンドウはそれよりずっと早く画面に出す必要がある。
    applyWindowMode(
      resolveWindowMode(
        resolveInitialWindowMode({
          launchArgs,
          storedLaunchMode: getStoredLaunchMode(),
          overlaySettings: getOverlaySettings(),
        }),
      ),
    );

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
