// Preload script for Electron IPC communication / Electron IPC通信用のプリロードスクリプト
const { contextBridge, ipcRenderer } = require('electron');
const cursorMoveListenerMap = new WeakMap();
const cursorHideListenerMap = new WeakMap();
const triggerStateListenerMap = new WeakMap();
const inputScrollListenerMap = new WeakMap();

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
  logConfigChange: (key, oldValue, newValue) =>
    ipcRenderer.invoke('log-config-change', { key, oldValue, newValue }),

  // Send typing status to VRChat chatbox / VRChatチャットボックスにタイピング状態を送信
  sendTypingStatus: (isTyping) =>
    ipcRenderer.invoke('send-typing-status', isTyping),

  // Get current WebSocket bridge port / 現在のWebSocketブリッジポートを取得
  getBridgePort: () => ipcRenderer.invoke('get-bridge-port'),

  // Send window size to main process / メインプロセスにウィンドウサイズを送信
  sendWindowSize: (width, height) => ipcRenderer.send('window-size', { width, height }),
  // Send renderer metrics to main process / レンダラーメトリクスをメインプロセスに送信
  sendRendererMetrics: (metrics) => ipcRenderer.send('renderer-metrics', metrics),

  // VR Controller cursor events / VRコントローラーカーソルイベント
  onCursorMove: (callback) => {
    if (typeof callback !== 'function') return;
    const previous = cursorMoveListenerMap.get(callback);
    if (previous) {
      ipcRenderer.removeListener('input-cursor-move', previous);
    }
    const wrapped = (_event, data) => callback(data);
    cursorMoveListenerMap.set(callback, wrapped);
    ipcRenderer.on('input-cursor-move', wrapped);
  },
  removeCursorMoveListener: (callback) => {
    if (typeof callback !== 'function') return;
    const wrapped = cursorMoveListenerMap.get(callback);
    if (!wrapped) return;
    ipcRenderer.removeListener('input-cursor-move', wrapped);
    cursorMoveListenerMap.delete(callback);
  },
  onCursorHide: (callback) => {
    if (typeof callback !== 'function') return;
    const previous = cursorHideListenerMap.get(callback);
    if (previous) {
      ipcRenderer.removeListener('input-cursor-hide', previous);
    }
    const wrapped = (_event, data) => callback(data);
    cursorHideListenerMap.set(callback, wrapped);
    ipcRenderer.on('input-cursor-hide', wrapped);
  },
  removeCursorHideListener: (callback) => {
    if (typeof callback !== 'function') return;
    const wrapped = cursorHideListenerMap.get(callback);
    if (!wrapped) return;
    ipcRenderer.removeListener('input-cursor-hide', wrapped);
    cursorHideListenerMap.delete(callback);
  },
  onTriggerState: (callback) => {
    if (typeof callback !== 'function') return;
    const previous = triggerStateListenerMap.get(callback);
    if (previous) {
      ipcRenderer.removeListener('input-trigger-state', previous);
    }
    const wrapped = (_event, data) => callback(data);
    triggerStateListenerMap.set(callback, wrapped);
    ipcRenderer.on('input-trigger-state', wrapped);
  },
  removeTriggerStateListener: (callback) => {
    if (typeof callback !== 'function') return;
    const wrapped = triggerStateListenerMap.get(callback);
    if (!wrapped) return;
    ipcRenderer.removeListener('input-trigger-state', wrapped);
    triggerStateListenerMap.delete(callback);
  },

  // VR Controller scroll events / VRコントローラスクロールイベント
  onInputScroll: (callback) => {
    if (typeof callback !== 'function') return;
    const wrapped = (event, data) => callback(data);
    inputScrollListenerMap.set(callback, wrapped);
    ipcRenderer.on('input-scroll', wrapped);
  },
  removeInputScrollListener: (callback) => {
    if (typeof callback !== 'function') return;
    const wrapped = inputScrollListenerMap.get(callback);
    if (!wrapped) return;
    ipcRenderer.removeListener('input-scroll', wrapped);
    inputScrollListenerMap.delete(callback);
  },
  
  // Reset overlay position
  resetOverlayPosition: () => ipcRenderer.invoke('reset-overlay-position'),
  restartApp: () => ipcRenderer.invoke('restart-app'),
  // Overlay settings
  getOverlaySettings: () => ipcRenderer.invoke('get-overlay-settings'),
  setOverlaySettings: (settings) => ipcRenderer.invoke('set-overlay-settings', settings),
  getSteamVrAutoLaunch: () => ipcRenderer.invoke('get-steamvr-auto-launch'),
  setSteamVrAutoLaunch: (enabled) =>
    ipcRenderer.invoke('set-steamvr-auto-launch', enabled),
  getSteamVrBindings: () => ipcRenderer.invoke('get-steamvr-bindings'),
  openSteamVrBindingUi: () => ipcRenderer.invoke('open-steamvr-binding-ui'),
});
