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
});
