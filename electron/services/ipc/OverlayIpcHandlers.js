import { ipcMain } from 'electron';
import { resetOverlayPosition, updateRendererMetrics } from '../../overlay.js';
import {
  setInstantClickHover,
  updateWindowSize,
} from '../../input_handler.js';

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

  // Whether a controller hovers an element that clicks on trigger press
  // トリガー押下でクリックする要素にコントローラーが乗っているか
  ipcMain.on('vr-instant-hover', (_event, data) => {
    const controllerId = Number(data?.controllerId);
    if (!Number.isFinite(controllerId)) return;
    setInstantClickHover(controllerId, data?.instant === true);
  });

  // Backward-compatible window size updates / 互換用ウィンドウサイズ更新
  ipcMain.on('window-size', (event, { width, height }) => {
    if (Number.isFinite(width) && Number.isFinite(height)) {
      updateWindowSize(width, height);
    }
  });
}
