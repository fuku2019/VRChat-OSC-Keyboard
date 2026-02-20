import { ipcMain } from 'electron';
import { resetOverlayPosition, updateRendererMetrics } from '../../overlay.js';
import { updateWindowSize } from '../../input_handler.js';
import { getOverlaySettings, setOverlaySettings } from '../WindowManager.js';

/**
 * Register Overlay related IPC handlers / オーバーレイ関連のIPCハンドラを登録
 */
export function registerOverlayIpcHandlers() {
  // Reset overlay position / オーバーレイ位置をリセット
  ipcMain.handle('reset-overlay-position', () => {
    resetOverlayPosition();
    return { success: true };
  });

  // Receive renderer metrics (size + DPR) / レンダラーメトリクスを受信
  ipcMain.on('renderer-metrics', (event, metrics) => {
    const zoomFactor =
      typeof event.sender.getZoomFactor === 'function'
        ? event.sender.getZoomFactor()
        : 1;
    const payload = {
      ...metrics,
      zoomFactor,
    };
    updateRendererMetrics(payload);
    if (
      metrics &&
      Number.isFinite(metrics.width) &&
      Number.isFinite(metrics.height)
    ) {
      updateWindowSize(
        metrics.width,
        metrics.height,
        metrics.devicePixelRatio,
        zoomFactor,
      );
    }
  });

  // Backward-compatible window size updates / 互換用ウィンドウサイズ更新
  ipcMain.on('window-size', (event, { width, height }) => {
    if (Number.isFinite(width) && Number.isFinite(height)) {
      updateWindowSize(width, height);
    }
  });

  // Overlay settings / オーバーレイ設定
  ipcMain.handle('get-overlay-settings', () => {
    return { success: true, settings: getOverlaySettings() };
  });

  ipcMain.handle('set-overlay-settings', (event, settings) => {
    setOverlaySettings(settings);
    return { success: true, settings: getOverlaySettings() };
  });
}
