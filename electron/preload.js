// Preload script for Electron IPC communication / Electron IPC通信用のプリロードスクリプト
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process via contextBridge
// contextBridge経由でレンダラープロセスに保護されたメソッドを公開
contextBridge.exposeInMainWorld('electronAPI', {
  // Update OSC port in main process / メインプロセスでOSCポートを更新
  updateOscPort: (port) => ipcRenderer.invoke('update-osc-port', port),
  
  // Get current OSC port / 現在のOSCポートを取得
  getOscPort: () => ipcRenderer.invoke('get-osc-port'),

  // Check for updates / 更新を確認
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),

  // Open external URL / 外部URLを開く
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Log config change / 設定変更をログ出力
  logConfigChange: (key, oldValue, newValue) => ipcRenderer.invoke('log-config-change', { key, oldValue, newValue }),

  // Send typing status to VRChat chatbox / VRChatチャットボックスにタイピング状態を送信
  sendTypingStatus: (isTyping) => ipcRenderer.invoke('send-typing-status', isTyping),

  // Get current WebSocket bridge port / 現在のWebSocketブリッジポートを取得
  getBridgePort: () => ipcRenderer.invoke('get-bridge-port'),

  // Send window size to main process / メインプロセスにウィンドウサイズを送信
  sendWindowSize: (width, height) => ipcRenderer.send('window-size', { width, height }),
  // Send renderer metrics to main process / レンダラーメトリクスをメインプロセスに送信
  sendRendererMetrics: (metrics) => ipcRenderer.send('renderer-metrics', metrics),

  // VR Controller cursor events / VRコントローラーカーソルイベント
  onCursorMove: (callback) => {
    ipcRenderer.on('input-cursor-move', (event, data) => callback(data));
  },
  removeCursorMoveListener: (callback) => {
    ipcRenderer.removeListener('input-cursor-move', callback);
  },
  onCursorHide: (callback) => {
    ipcRenderer.on('input-cursor-hide', (event, data) => callback(data));
  },
  removeCursorHideListener: (callback) => {
    ipcRenderer.removeListener('input-cursor-hide', callback);
  },
  onTriggerState: (callback) => {
    ipcRenderer.on('input-trigger-state', (event, data) => callback(data));
  },
  removeTriggerStateListener: (callback) => {
    ipcRenderer.removeListener('input-trigger-state', callback);
  },

  // VR Controller scroll events / VRコントローラスクロールイベント
  onInputScroll: (callback) => {
    ipcRenderer.on('input-scroll', (event, data) => callback(data));
  },
  removeInputScrollListener: (callback) => {
    ipcRenderer.removeListener('input-scroll', callback);
  },
  
  // Reset overlay position
  resetOverlayPosition: () => ipcRenderer.invoke('reset-overlay-position'),
  // Overlay settings
  getOverlaySettings: () => ipcRenderer.invoke('get-overlay-settings'),
  setOverlaySettings: (settings) => ipcRenderer.invoke('set-overlay-settings', settings),
  getSteamVrBindings: () => ipcRenderer.invoke('get-steamvr-bindings'),
  openSteamVrBindingUi: () => ipcRenderer.invoke('open-steamvr-binding-ui'),
});
