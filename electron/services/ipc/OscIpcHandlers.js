import { ipcMain } from 'electron';
import {
  updateOscClient,
  getOscPort,
  getActiveWsPort,
  sendTypingStatus,
} from '../OscBridgeService.js';

/**
 * Register OSC and Bridge related IPC handlers / OSCおよびブリッジ関連のIPCハンドラを登録
 */
export function registerOscIpcHandlers() {
  // Handle OSC port update from renderer / レンダラーからのOSCポート更新を処理
  ipcMain.handle('update-osc-port', (event, port) => {
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return { success: false, error: 'Invalid port number' };
    }
    updateOscClient(portNum);
    return { success: true, port: portNum };
  });

  // Get current OSC port / 現在のOSCポートを取得
  ipcMain.handle('get-osc-port', () => {
    return { port: getOscPort() };
  });

  // Get current WebSocket bridge port / 現在のWebSocketブリッジポートを取得
  ipcMain.handle('get-bridge-port', () => {
    return { port: getActiveWsPort() };
  });

  // Send typing status to VRChat chatbox / VRChatチャットボックスにタイピング状態を送信
  ipcMain.handle('send-typing-status', async (event, isTyping) => {
    return await sendTypingStatus(isTyping);
  });
}
