import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';
import { execFile, execFileSync } from 'child_process';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const isPackaged = Boolean(app?.isPackaged);

// Resolve native module path / ネイティブモジュールのパスを解決
const getNativeModulePath = () => {
  if (isPackaged) {
    // In production, use resourcesPath (because of asarUnpack) / 本番環境ではresourcesPathを使用（asarUnpackのため）
    return path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'native',
      'index.node',
    );
  }
  // In development / 開発環境
  return path.resolve(projectRoot, 'native', 'index.node');
};

/**
 * Resolve path for external assets (images, etc) that need to be accessed by native code
 * ネイティブコードからアクセスする必要がある外部アセット（画像など）のパスを解決
 */
export const getAssetPath = (relativePath) => {
  if (isPackaged) {
    // Native OpenVR cannot read from inside ASAR, so we use the unpacked directory
    // ASAR内からは読み込めないため、unpackedディレクトリを使用
    return path.join(process.resourcesPath, 'app.asar.unpacked', relativePath);
  }
  return path.resolve(projectRoot, relativePath);
};

const STEAMVR_PROCESS_NAMES = new Set([
  'vrserver.exe',
  'vrmonitor.exe',
  'vrcompositor.exe',
  'vrserver',
  'vrmonitor',
  'vrcompositor',
]);

const PROCESS_LIST_COMMAND =
  process.platform === 'win32'
    ? {
        file: 'tasklist',
        args: ['/FO', 'CSV', '/NH'],
        options: { encoding: 'utf-8', windowsHide: true },
      }
    : { file: 'ps', args: ['-A', '-o', 'comm='], options: { encoding: 'utf-8' } };

function parseProcessNames(output) {
  if (process.platform === 'win32') {
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const cleaned = line.replace(/^"+|"+$/g, '');
        const firstColumn = cleaned.split('","')[0];
        return firstColumn.trim().toLowerCase();
      })
      .filter(Boolean);
  }

  return output
    .split(/\r?\n/)
    .map((line) => path.basename(line.trim()).toLowerCase())
    .filter(Boolean);
}

function getRunningProcessNames() {
  try {
    const { file, args, options } = PROCESS_LIST_COMMAND;
    return parseProcessNames(execFileSync(file, args, options));
  } catch (error) {
    console.warn('Failed to query running processes:', error);
    return [];
  }
}

function getRunningProcessNamesAsync() {
  const { file, args, options } = PROCESS_LIST_COMMAND;
  return new Promise((resolve) => {
    execFile(file, args, options, (error, stdout) => {
      if (error) {
        console.warn('Failed to query running processes:', error);
        resolve([]);
        return;
      }
      resolve(parseProcessNames(stdout));
    });
  });
}

// Listing processes costs ~1s on Windows and the startup path asks twice (main.js
// gate + createOverlayManager guard). Cache briefly so the second lookup is free.
// Windowsではプロセス一覧の取得に約1秒かかり、起動経路では2回問い合わせる
// (main.js の判定 + createOverlayManager のガード)。2回目が無料になるよう短時間キャッシュする。
const STEAMVR_RUNNING_TTL_MS = 5000;
let steamVrRunningCache = null;

function readSteamVrRunningCache() {
  if (
    steamVrRunningCache &&
    Date.now() - steamVrRunningCache.at < STEAMVR_RUNNING_TTL_MS
  ) {
    return steamVrRunningCache.running;
  }
  return null;
}

function storeSteamVrRunning(processNames) {
  const running = processNames.some((name) => STEAMVR_PROCESS_NAMES.has(name));
  steamVrRunningCache = { at: Date.now(), running };
  return running;
}

export function isSteamVrRunning() {
  const cached = readSteamVrRunningCache();
  return cached !== null ? cached : storeSteamVrRunning(getRunningProcessNames());
}

/**
 * Non-blocking variant. Use this on startup so the main process can keep serving the
 * renderer's IPC while the process list is being collected.
 * ノンブロッキング版。プロセス一覧の収集中もメインプロセスがレンダラーのIPCに
 * 応答できるよう、起動時はこちらを使う。
 */
export async function isSteamVrRunningAsync() {
  const cached = readSteamVrRunningCache();
  return cached !== null
    ? cached
    : storeSteamVrRunning(await getRunningProcessNamesAsync());
}

// Load native module with DLL handling / DLL処理付きでネイティブモジュールを読み込み
let OverlayManager;
try {
  const nativePath = getNativeModulePath();
  const nativeDir = path.dirname(nativePath);

  // Temporarily change CWD to native directory to find DLLs / DLLを見つけるために一時的にCWDをnativeディレクトリに変更
  const originalCwd = process.cwd();
  try {
    process.chdir(nativeDir);

    ({ OverlayManager } = require(nativePath));
    console.log('Native module loaded from:', nativePath);
  } finally {
    // Restore CWD / CWDを復元
    process.chdir(originalCwd);
  }
} catch (error) {
  console.error('Failed to load native module:', error);
}

export function createOverlayManager() {
  if (!OverlayManager) {
    throw new Error('OverlayManager is not available (native module failed to load)');
  }
  if (!isSteamVrRunning()) {
    throw new Error('SteamVR is not running');
  }
  return new OverlayManager();
}
