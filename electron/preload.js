// Preload script for Electron IPC communication / Electron IPC通信用のプリロードスクリプト
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process via contextBridge
// contextBridge経由でレンダラープロセスに保護されたメソッドを公開
contextBridge.exposeInMainWorld('electronAPI', {
  // Update OSC port in main process / メインプロセスでOSCポートを更新
  updateOscPort: (port) => ipcRenderer.invoke('update-osc-port', port),
  
  // Get current OSC port / 現在のOSCポートを取得
  getOscPort: () => ipcRenderer.invoke('get-osc-port'),
});
