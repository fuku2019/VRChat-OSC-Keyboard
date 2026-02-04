import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const require = createRequire(import.meta.url);
// Load native module
const { OverlayManager } = require('../native/index.node');

// Get __dirname equivalent for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let overlayManager = null;
// Store handles for double buffering: [primary, secondary]
// ダブルバッファリング用にハンドルを配列で保持: [プライマリ, セカンダリ]
let overlayHandles = [null, null];
let activeOverlayIndex = 0; // 0 or 1
let updateInterval = null;
let tempFilePaths = [];

/**
 * Initialize VR overlay / VRオーバーレイを初期化
 * Creates two overlays for double buffering to prevent flickering
 * 点滅を防ぐためにダブルバッファリング用の2つのオーバーレイを作成
 * @returns {Array<number>|null} Overlay handles or null on failure
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

        // Apply to ALL handles
        overlayHandles.forEach(handle => {
            if (handle) {
                respawnOverlay(handle, hmdPose);
            }
        });
        
        console.log("Overlay position reset.");
    } catch (e) {
        console.error("Error resetting overlay position:", e);
    }
}

/**
 * Initialize VR overlay / VRオーバーレイを初期化
 * Creates two overlays for double buffering to prevent flickering
 * 点滅を防ぐためにダブルバッファリング用の2つのオーバーレイを作成
 * @returns {Array<number>|null} Overlay handles or null on failure
 */
export function initOverlay() {
  try {
    console.log('Initializing VR Overlay (Double Buffering)...');
    overlayManager = new OverlayManager();
    console.log('VR System Initialized');
    
    // Get HMD pose for initial spawn
    let hmdPose = null;
    try {
        hmdPose = overlayManager.getControllerPose(0);
    } catch (e) {
        console.warn("Could not get HMD pose for initial spawn:", e);
    }

    // Create two overlays with suffixes
    // サフィックス付きで2つのオーバーレイを作成
    for (let i = 0; i < 2; i++) {
        const key = `vrchat-osc-keyboard-overlay-${i}`;
        const name = `VRC Keyboard ${i}`;
        overlayHandles[i] = overlayManager.createOverlay(key, name);
        console.log(`Overlay ${i} Created with handle: ${overlayHandles[i]}`);
        
        // Initial setup for both
        // 両方の初期設定
        overlayManager.setOverlayWidth(overlayHandles[i], 0.5);
        
        // Initial Placement: World Fixed (Absolute)
        if (hmdPose && hmdPose.length > 0) {
            respawnOverlay(overlayHandles[i], hmdPose);
        } else {
             // Fallback: Relative to HMD (Device 0) if pose missing
             // ポーズがない場合のフォールバック: HMD相対
             console.log("HMD Pose missing, falling back to relative attachment");
             overlayManager.setOverlayTransformHmd(overlayHandles[i], 0.5); // Use 0.5m (closer)
        }
        
        // Set initial texture
        const texturePath = path.resolve(__dirname, '..', 'docs', 'fake_logo_3.png');
        overlayManager.setOverlayFromFile(overlayHandles[i], texturePath);
    }
    
    console.log('Overlay Initial Props Set');
    
    // Show only the first overlay initially
    // 最初は1つ目のオーバーレイのみ表示
    overlayManager.showOverlay(overlayHandles[0]);
    activeOverlayIndex = 0;
    console.log('Overlay 0 Shown');
    
    // Create temp file paths
    tempFilePaths = [
      path.join(os.tmpdir(), 'vrc-keyboard-overlay-0.png'),
      path.join(os.tmpdir(), 'vrc-keyboard-overlay-1.png')
    ];
    
    return overlayHandles;
  } catch (error) {
    console.error('Failed to init VR Overlay:', error);
    return null;
  }
}

/**
 * Start capturing and updating overlay texture with double buffering
 * ダブルバッファリングでオーバーレイテクスチャのキャプチャと更新を開始
 * @param {Electron.WebContents} webContents - The webContents to capture
 * @param {number} fps - Update frequency in FPS
 */
export function startCapture(webContents, fps = 60) {
  if (!overlayManager || overlayHandles[0] === null) {
    console.warn('Overlay not initialized, skipping capture');
    return;
  }
  
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  
  const intervalMs = Math.floor(1000 / fps);
  console.log(`Starting capture at ${fps} FPS (${intervalMs}ms interval) with Double Overlay Swap`);
  
  let isProcessing = false;
  
  updateInterval = setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    
    try {
      // Capture the page
      const image = await webContents.capturePage();
      const size = image.getSize();
      
      if (size.width === 0 || size.height === 0) {
        isProcessing = false;
        return;
      }
      
      // We will prepare the INACTIVE overlay ("back buffer")
      // 非アクティブなオーバーレイ（バックバッファ）を準備する
      const backBufferIndex = 1 - activeOverlayIndex;
      const backBufferHandle = overlayHandles[backBufferIndex];
      const targetPath = tempFilePaths[backBufferIndex];
      
      // Write to file
      const pngData = image.toPNG();
      fs.writeFileSync(targetPath, pngData);
      
      // Set texture to backend overlay
      // 裏側のオーバーレイにテクスチャを設定
      overlayManager.setOverlayFromFile(backBufferHandle, targetPath);
      
      // SWAP: Show back buffer, Hide front buffer
      // スワップ: バックを表示、フロントを非表示
      // This order prevents flickering (momentary overlap is better than black flash)
      // この順序で点滅を防ぐ（一瞬の重なりは黒点滅よりマシ）
      overlayManager.showOverlay(backBufferHandle);
      // Keep old overlay visible to prevent black flash - OpenVR will bring new one to front
      // 黒点滅を防ぐため古い方は表示したまま - OpenVRが新しい方を前面に出す
      // overlayManager.hideOverlay(overlayHandles[activeOverlayIndex]);
      
      // Update index
      activeOverlayIndex = backBufferIndex;
      
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
 * Stop capturing
 */
export function stopCapture() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
    console.log('Capture stopped');
  }
}

/**
 * Get the overlay manager instance
 */
export function getOverlayManager() {
  return overlayManager;
}

/**
 * Wrapper to set width for both overlays (sync)
 */
export function setOverlayWidth(width) {
    if(!overlayManager) return;
    overlayHandles.forEach(h => overlayManager.setOverlayWidth(h, width));
}

/**
 * Wrapper to set transform for both overlays (sync)
 */
export function setOverlayTransformHmd(distance) {
    overlayHandles.forEach(h => overlayManager.setOverlayTransformHmd(h, distance));
}

/**
 * Get the current overlay handle / 現在のオーバーレイハンドルを取得
 */
export function getOverlayHandle() {
  return overlayHandles[activeOverlayIndex];
}

/**
 * Get the currently active overlay handle
 */
export function getActiveOverlayHandle() {
    return overlayHandles[activeOverlayIndex];
}

/**
 * Get all overlay handles
 */
export function getAllOverlayHandles() {
    return overlayHandles;
}

