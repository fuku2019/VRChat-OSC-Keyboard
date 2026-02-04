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
export function initOverlay() {
  try {
    console.log('Initializing VR Overlay (Double Buffering)...');
    overlayManager = new OverlayManager();
    console.log('VR System Initialized');
    
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
        overlayManager.setOverlayTransformHmd(overlayHandles[i], 1.5);
        
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
export function startCapture(webContents, fps = 10) {
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
      // Try not hiding the old one immediately to prevent flickering
      // 点滅を防ぐため、古い方をすぐには非表示にしない（Showだけで前面に来ることを期待）
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

