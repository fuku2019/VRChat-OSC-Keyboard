import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

// Resolve native module path / ネイティブモジュールのパスを解決
const getNativeModulePath = () => {
  if (app.isPackaged) {
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
  if (app.isPackaged) {
    // Native OpenVR cannot read from inside ASAR, so we use the unpacked directory
    // ASAR内からは読み込めないため、unpackedディレクトリを使用
    return path.join(process.resourcesPath, 'app.asar.unpacked', relativePath);
  }
  return path.resolve(projectRoot, relativePath);
};

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
  return new OverlayManager();
}
