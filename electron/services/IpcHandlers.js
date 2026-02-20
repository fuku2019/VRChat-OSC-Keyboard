/**
 * IPC Handlers Service - Registers all IPC handlers for renderer communication
 * IPCハンドラサービス - レンダラー通信用のすべてのIPCハンドラを登録
 */

import { registerOscIpcHandlers } from './ipc/OscIpcHandlers.js';
import { registerSystemIpcHandlers } from './ipc/SystemIpcHandlers.js';
import { registerOverlayIpcHandlers } from './ipc/OverlayIpcHandlers.js';
import { registerSteamVrIpcHandlers } from './ipc/SteamVrIpcHandlers.js';

export { isSafeExternalUrl, compareVersions } from './ipc/SystemIpcHandlers.js';

/**
 * Register all IPC handlers / すべてのIPCハンドラを登録
 */
export function registerIpcHandlers(APP_VERSION) {
  registerOscIpcHandlers();
  registerSystemIpcHandlers(APP_VERSION);
  registerOverlayIpcHandlers();
  registerSteamVrIpcHandlers();
}
