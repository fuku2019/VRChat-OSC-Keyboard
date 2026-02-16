/**
 * IPC Handlers Service - Registers all IPC handlers for renderer communication
 * IPCハンドラサービス - レンダラー通信用のすべてのIPCハンドラを登録
 */

import { app, ipcMain, shell } from 'electron';
import {
  updateOscClient,
  getOscPort,
  getActiveWsPort,
  sendTypingStatus,
} from './OscBridgeService.js';
import { resetOverlayPosition, updateRendererMetrics } from '../overlay.js';
import { updateWindowSize } from '../input_handler.js';
import {
  getOverlaySettings,
  setOverlaySettings,
  setSteamVrSettings,
} from './WindowManager.js';
import {
  getCurrentBindings,
  openBindingUI,
  STEAMVR_APP_KEY,
} from './vrOverlayService.js';
import {
  getSteamVrAutoLaunch,
  setSteamVrAutoLaunch,
} from './SteamVrSettingsService.js';
import {
  ensureSteamVrManifestRegistered,
  ensureSteamVrManifestUnregistered,
} from './SteamVrManifestService.js';

// GitHub repository info / GitHubリポジトリ情報
const GITHUB_API_URL =
  'https://api.github.com/repos/fuku2019/VRC-OSC-Keyboard/releases/latest';

/**
 * Helper for semantic version comparison / セマンティックバージョン比較用ヘルパー
 */
export function compareVersions(v1, v2) {
  // Handle non-string inputs / 文字列以外が渡された場合の対処
  if (typeof v1 !== 'string' || typeof v2 !== 'string') return 0;

  const clean = (v) =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((part) => {
        const num = parseInt(part, 10);
        return isNaN(num) ? 0 : num; // Treat non-numeric parts as 0 / 数値以外は0として扱う
      });

  const parts1 = clean(v1);
  const parts2 = clean(v2);
  const len = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < len; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * Register all IPC handlers / すべてのIPCハンドラを登録
 */
export function registerIpcHandlers(APP_VERSION) {
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

  // Check for updates / 更新を確認
  ipcMain.handle('check-for-update', async () => {
    try {
      // Disable cache to ensure fresh data / キャッシュを無効化して最新データを確保
      const response = await fetch(GITHUB_API_URL, {
        headers: {
          'Cache-Control': 'no-cache',
          'User-Agent': `VRC-OSC-Keyboard/${APP_VERSION}`, // Add User-Agent as per GitHub API requirements
        },
      });

      if (!response.ok) {
        console.error(
          `GitHub API Error: ${response.status} ${response.statusText}`,
        );
        throw new Error(
          `GitHub API Error: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      const latestVersion = data.tag_name;

      // Validate response data / レスポンスデータの検証
      if (!latestVersion) {
        throw new Error('Invalid response from GitHub: tag_name missing');
      }

      const currentVersion = APP_VERSION.startsWith('v')
        ? APP_VERSION
        : `v${APP_VERSION}`;

      // Compare versions using semver logic / セマンティックバージョニングロジックで比較
      // latest > current => update available
      const updateAvailable =
        compareVersions(latestVersion, currentVersion) > 0;

      return {
        success: true,
        updateAvailable,
        latestVersion,
        url: data.html_url,
      };
    } catch (error) {
      console.error('Failed to check for updates:', error);
      return { success: false, error: error.message };
    }
  });

  // Open external URL / 外部URLを開く
  ipcMain.handle('open-external', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Failed to open external URL:', error);
      return { success: false, error: error.message };
    }
  });

  // Log config change / 設定変更をログ出力
  ipcMain.handle('log-config-change', (event, { key, oldValue, newValue }) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ⚙️ Config Changed: ${key}`);
    console.log(`    Old: ${JSON.stringify(oldValue)}`);
    console.log(`    New: ${JSON.stringify(newValue)}`);
    console.log('----------------------------------------');
    return { success: true };
  });

  // Send typing status to VRChat chatbox / VRChatチャットボックスにタイピング状態を送信
  ipcMain.handle('send-typing-status', async (event, isTyping) => {
    return await sendTypingStatus(isTyping);
  });

  // Reset overlay position / オーバーレイ位置をリセット
  ipcMain.handle('reset-overlay-position', () => {
    resetOverlayPosition();
    return { success: true };
  });

  ipcMain.handle('restart-app', () => {
    try {
      app.relaunch();
      app.exit(0);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
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
    if (metrics && Number.isFinite(metrics.width) && Number.isFinite(metrics.height)) {
      updateWindowSize(metrics.width, metrics.height, metrics.devicePixelRatio, zoomFactor);
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

  ipcMain.handle('get-steamvr-auto-launch', () => {
    return getSteamVrAutoLaunch(STEAMVR_APP_KEY);
  });

  ipcMain.handle('set-steamvr-auto-launch', (event, enabled) => {
    if (typeof enabled !== 'boolean') {
      return { success: false, error: 'enabled must be a boolean' };
    }

    if (enabled) {
      const registerResult = ensureSteamVrManifestRegistered();
      if (!registerResult.success) {
        return registerResult;
      }
      const result = setSteamVrAutoLaunch(STEAMVR_APP_KEY, true);
      if (result?.success) {
        setSteamVrSettings({ autoLaunch: true });
      }
      return result;
    }

    // OFF: remove autolaunch flag and unregister from SteamVR app list.
    const launchResult = setSteamVrAutoLaunch(STEAMVR_APP_KEY, false);
    if (!launchResult.success) {
      return launchResult;
    }
    const unregisterResult = ensureSteamVrManifestUnregistered();
    if (!unregisterResult.success) {
      return unregisterResult;
    }
    setSteamVrSettings({ autoLaunch: false });
    return { success: true, enabled: false };
  });

  ipcMain.handle('get-steamvr-bindings', () => {
    try {
      const bindings = getCurrentBindings();
      return { success: true, bindings };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('open-steamvr-binding-ui', () => {
    try {
      // Keep app key explicit so SteamVR opens the intended app bindings page.
      console.log(`[SteamVR Input] opening binding UI for ${STEAMVR_APP_KEY}`);
      openBindingUI(false);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
