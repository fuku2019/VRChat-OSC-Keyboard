import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';
import { execFileSync } from 'child_process';

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

function getRunningProcessNames() {
  try {
    if (process.platform === 'win32') {
      const output = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], {
        encoding: 'utf-8',
        windowsHide: true,
      });
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

    const output = execFileSync('ps', ['-A', '-o', 'comm='], {
      encoding: 'utf-8',
    });
    return output
      .split(/\r?\n/)
      .map((line) => path.basename(line.trim()).toLowerCase())
      .filter(Boolean);
  } catch (error) {
    console.warn('Failed to query running processes:', error);
    return [];
  }
}

export function isSteamVrRunning() {
  const running = getRunningProcessNames();
  return running.some((name) => STEAMVR_PROCESS_NAMES.has(name));
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
