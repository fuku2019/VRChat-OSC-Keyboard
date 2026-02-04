import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve native module path / ネイティブモジュールのパスを解決
const getNativeModulePath = () => {
  if (app.isPackaged) {
    // In production, use resourcesPath (because of asarUnpack) / 本番環境ではresourcesPathを使用（asarUnpackのため）
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'index.node');
  }
  // In development / 開発環境
  return path.resolve(__dirname, '../native/index.node');
};

/**
 * Resolve path for external assets (images, etc) that need to be accessed by native code
 * ネイティブコードからアクセスする必要がある外部アセット（画像など）のパスを解決
 */
const getAssetPath = (relativePath) => {
    if (app.isPackaged) {
        // Native OpenVR cannot read from inside ASAR, so we use the unpacked directory
        // ASAR内からは読み込めないため、unpackedディレクトリを使用
        return path.join(process.resourcesPath, 'app.asar.unpacked', relativePath);
    }
    return path.resolve(__dirname, '..', relativePath);
};

// Load native module with DLL handling / DLL処理付きでネイティブモジュールを読み込み
let OverlayManager;
try {
  const nativePath = getNativeModulePath();
  const nativeDir = path.dirname(nativePath);
  
  // Temporarily change CWD to native directory to find DLLs / DLLを見つけるために一時的にCWDをnativeディレクトリに変更
  const originalCwd = process.cwd();
  process.chdir(nativeDir);
  
  ({ OverlayManager } = require(nativePath));
  
  // Restore CWD / CWDを復元
  process.chdir(originalCwd);
  console.log('Native module loaded from:', nativePath);
} catch (error) {
  console.error('Failed to load native module:', error);
}

let overlayManager = null;
// Store overlay handle / オーバーレイハンドルを保持
let overlayHandle = null;
let updateInterval = null;

/**
 * Initialize VR overlay / VRオーバーレイを初期化
 * @returns {number|null} Overlay handle or null on failure
 */
import { mat4, quat, vec3 } from 'gl-matrix';

/**
 * Calculate spawn position relative to HMD
 * HMDに対して相対的なスポーン位置を計算
 */
function getSpawnTransform(hmdPose) {
    // Configuration for "Ideal Position"
    const OFFSET_Y = -0.3; // 30cm down
    const OFFSET_Z = -0.5; // 50cm forward
    const PITCH_ANGLE = 30 * (Math.PI / 180); // 30 degrees tilt up

    // Input is Row-Major (OpenVR), gl-matrix needs Column-Major
    // Treat input array as flattened Row-Major 4x4
    const hmdMatRow = mat4.clone(hmdPose);
    const hmdMat = mat4.create();
    mat4.transpose(hmdMat, hmdMatRow); // Row-Major -> Column-Major

    // Check if valid rotation (sometimes it's all zeros)
    // 0,0,0,0 quaternion is invalid
    const hmdRot = quat.create();
    mat4.getRotation(hmdRot, hmdMat);
    if (hmdRot[0] === 0 && hmdRot[1] === 0 && hmdRot[2] === 0 && hmdRot[3] === 0) {
        throw new Error("Invalid HMD rotation");
    }
    
    // 1. Calculate position
    const hmdPos = vec3.create();
    mat4.getTranslation(hmdPos, hmdMat);

    // Create offset vector (in HMD local space)
    // HMDローカル空間でのオフセットベクトルを作成
    const offset = vec3.fromValues(0, OFFSET_Y, OFFSET_Z);
    
    // Rotate offset by HMD rotation to get World offset
    // HMDの回転でオフセットを回転させ、ワールドオフセットを取得
    vec3.transformQuat(offset, offset, hmdRot);
    
    // Add to HMD position to get Target World Position
    // HMD位置に加算してターゲットワールド位置を取得
    const targetPos = vec3.create();
    vec3.add(targetPos, hmdPos, offset);

    // 2. Calculate Rotation
    const targetRot = quat.clone(hmdRot);
    
    // Local X axis rotation for Tilt
    const tilt = quat.create();
    quat.setAxisAngle(tilt, vec3.fromValues(1, 0, 0), PITCH_ANGLE);
    
    // Apply tilt: NewRot = HMD_Rot * Tilt
    quat.multiply(targetRot, targetRot, tilt);

    // 3. Compose Matrix (Column-Major)
    const targetMatCol = mat4.create();
    mat4.fromRotationTranslation(targetMatCol, targetRot, targetPos);
    
    // 4. Convert back to Row-Major for OpenVR
    const targetMatRow = mat4.create();
    mat4.transpose(targetMatRow, targetMatCol); // Column-Major -> Row-Major
    
    return targetMatRow;
}

/**
 * Respawn overlay at ideal position relative to HMD
 * HMDに対する理想的な位置にオーバーレイを再スポーン
 */
function respawnOverlay(handle, hmdPose) {
    try {
        const targetMat = getSpawnTransform(hmdPose);
        overlayManager.setOverlayTransformAbsolute(handle, Array.from(targetMat));
    } catch (e) {
        console.error("Failed to respawn overlay:", e);
    }
}

/**
 * Reset overlay position to ideal spot
 * オーバーレイ位置を理想的な場所にリセット
 */
export function resetOverlayPosition() {
    if (!overlayManager) return;
    
    try {
        // Get HMD Pose (Device 0)
        let hmdPose = overlayManager.getControllerPose(0);
        
        // If HMD pose invalid, try to find it again or wait? 
        // If completely lost, maybe just set to identity or skip.
        if (!hmdPose || hmdPose.length === 0) {
            console.warn("HMD Pose not found, cannot reset position.");
            return;
        }

        // Apply to overlay handle / オーバーレイハンドルに適用
        if (overlayHandle) {
            respawnOverlay(overlayHandle, hmdPose);
        }
        
        console.log("Overlay position reset.");
    } catch (e) {
        console.error("Error resetting overlay position:", e);
    }
}

/**
 * Initialize VR overlay / VRオーバーレイを初期化
 * @returns {number|null} Overlay handle or null on failure
 */
export function initOverlay() {
  try {
    console.log('Initializing VR Overlay...');
    overlayManager = new OverlayManager();
    console.log('VR System Initialized');
    
    // Debug: Log available methods /デバッグ: 利用可能なメソッドをログ出力
    console.log('Available methods on OverlayManager:', Object.getOwnPropertyNames(Object.getPrototypeOf(overlayManager)));
    
    // Get HMD pose for initial spawn / 初期スポーン用のHMDポーズを取得
    let hmdPose = null;
    try {
        hmdPose = overlayManager.getControllerPose(0);
    } catch (e) {
        console.warn("Could not get HMD pose for initial spawn:", e);
    }

    // Create single overlay / 単一のオーバーレイを作成
    const key = 'vrchat-osc-keyboard-overlay';
    const name = 'VRC Keyboard';
    overlayHandle = overlayManager.createOverlay(key, name);
    console.log(`Overlay Created with handle: ${overlayHandle}`);
    
    // Set overlay width / オーバーレイの幅を設定
    overlayManager.setOverlayWidth(overlayHandle, 0.5);
    
    // Initial Placement: World Fixed (Absolute) / 初期配置: ワールド固定（絶対）
    if (hmdPose && hmdPose.length > 0) {
        respawnOverlay(overlayHandle, hmdPose);
    } else {
         // Fallback: Relative to HMD (Device 0) if pose missing
         // ポーズがない場合のフォールバック: HMD相対
         console.log("HMD Pose missing, falling back to relative attachment");
         overlayManager.setOverlayTransformHmd(overlayHandle, 0.5);
    }
    
    // Set initial texture / 初期テクスチャを設定
    const texturePath = getAssetPath(path.join('docs', 'fake_logo_3.png'));
    console.log(`Setting overlay texture from: ${texturePath}`);
    overlayManager.setOverlayFromFile(overlayHandle, texturePath);
    
    console.log('Overlay Initial Props Set');
    
    // Show overlay / オーバーレイを表示
    overlayManager.showOverlay(overlayHandle);
    console.log('Overlay Shown');
    
    return overlayHandle;
  } catch (error) {
    console.error('Failed to init VR Overlay:', error);
    return null;
  }
}

/**
 * Start capturing and updating overlay texture / オーバーレイテクスチャのキャプチャと更新を開始
 * @param {Electron.WebContents} webContents - The webContents to capture
 * @param {number} fps - Update frequency in FPS
 */
export function startCapture(webContents, fps = 60) {
  if (!overlayManager || overlayHandle === null) {
    console.warn('Overlay not initialized, skipping capture');
    return;
  }
  
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  
  const intervalMs = Math.floor(1000 / fps);
  console.log(`Starting capture at ${fps} FPS (${intervalMs}ms interval) with GPU direct transfer`);
  
  let isProcessing = false;
  
  updateInterval = setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    
    try {
      // Capture the page / ページをキャプチャ
      const image = await webContents.capturePage();
      const size = image.getSize();
      
      if (size.width === 0 || size.height === 0) {
        isProcessing = false;
        return;
      }
      
      // Get BGRA bitmap buffer from Electron / ElectronからBGRAビットマップバッファを取得
      const bgraBuffer = image.toBitmap();
      
      // Calculate expected buffer size / 期待されるバッファサイズを計算
      const expectedSize = size.width * size.height * 4; // BGRA = 4 bytes per pixel
      
      // Verify buffer size matches / バッファサイズが一致するか検証
      if (bgraBuffer.length !== expectedSize) {
        // Size mismatch - likely due to DPI scaling / サイズ不一致 - おそらくDPIスケーリングが原因
        // Calculate actual dimensions from buffer / バッファから実際のサイズを計算
        const actualPixels = bgraBuffer.length / 4;
        const aspectRatio = size.width / size.height;
        const actualHeight = Math.sqrt(actualPixels / aspectRatio);
        const actualWidth = actualPixels / actualHeight;
        
        console.warn(`Size mismatch: getSize()=${size.width}x${size.height}, buffer=${bgraBuffer.length} bytes (expected ${expectedSize}), using calculated ${Math.round(actualWidth)}x${Math.round(actualHeight)}`);
        
        size.width = Math.round(actualWidth);
        size.height = Math.round(actualHeight);
      }
      
      // Convert BGRA to RGBA (swap R and B channels) / BGRAからRGBAに変換（RとBチャンネルを入れ替え）
      const rgbaBuffer = Buffer.from(bgraBuffer);
      for (let i = 0; i < rgbaBuffer.length; i += 4) {
        const b = rgbaBuffer[i];     // B
        const r = rgbaBuffer[i + 2]; // R
        rgbaBuffer[i] = r;           // R -> position 0
        rgbaBuffer[i + 2] = b;       // B -> position 2
      }
      
      // Update texture directly via D3D11 shared texture / D3D11共有テクスチャ経由で直接テクスチャを更新
      // Uses GPU memory sharing - no file I/O, minimal flickering / GPUメモリ共有を使用 - ファイルI/Oなし、点滅最小化
      overlayManager.setOverlayTextureD3D11(overlayHandle, rgbaBuffer, size.width, size.height);
      
    } catch (error) {
      if (!error.message?.includes('destroyed')) {
        console.error('Capture error:', error);
      }
    } finally {
      isProcessing = false;
    }
  }, intervalMs);
}

/**
 * Stop capturing / キャプチャを停止
 */
export function stopCapture() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
    console.log('Capture stopped');
  }
}

/**
 * Get the overlay manager instance / オーバーレイマネージャーインスタンスを取得
 */
export function getOverlayManager() {
  return overlayManager;
}

/**
 * Set overlay width / オーバーレイの幅を設定
 */
export function setOverlayWidth(width) {
    if(!overlayManager || !overlayHandle) return;
    overlayManager.setOverlayWidth(overlayHandle, width);
}

/**
 * Set overlay transform relative to HMD / HMD相対でオーバーレイのトランスフォームを設定
 */
export function setOverlayTransformHmd(distance) {
    if(!overlayManager || !overlayHandle) return;
    overlayManager.setOverlayTransformHmd(overlayHandle, distance);
}

/**
 * Get the overlay handle / オーバーレイハンドルを取得
 */
export function getOverlayHandle() {
  return overlayHandle;
}

/**
 * Get the active overlay handle / アクティブなオーバーレイハンドルを取得
 */
export function getActiveOverlayHandle() {
    return overlayHandle;
}

