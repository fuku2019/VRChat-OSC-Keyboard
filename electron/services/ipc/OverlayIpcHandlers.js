import { ipcMain } from 'electron';
import { resetOverlayPosition, updateRendererMetrics } from '../../overlay.js';
import {
  resolveTriggerClickMode,
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

  // Answer to input-click-mode-request: how the element at a trigger press
  // wants to be clicked / input-click-mode-request への答え: トリガー押下位置の
  // 要素がどうクリックされたいか
  ipcMain.on('vr-click-mode', (_event, data) => {
    const controllerId = Number(data?.controllerId);
    const requestId = Number(data?.requestId);
    if (!Number.isFinite(controllerId) || !Number.isFinite(requestId)) return;
    const mode = data?.mode === 'press' || data?.mode === 'hold' ? data.mode : null;
    resolveTriggerClickMode(controllerId, requestId, mode);
  });

  // Backward-compatible window size updates / 互換用ウィンドウサイズ更新
  ipcMain.on('window-size', (event, { width, height }) => {
    if (Number.isFinite(width) && Number.isFinite(height)) {
      updateWindowSize(width, height);
    }
  });
}
