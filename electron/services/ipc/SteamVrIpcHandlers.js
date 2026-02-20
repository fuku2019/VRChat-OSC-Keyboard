import { ipcMain } from 'electron';
import {
  getCurrentBindings,
  openBindingUI,
  STEAMVR_APP_KEY,
} from '../vrOverlayService.js';
import {
  getSteamVrAutoLaunch,
  setSteamVrAutoLaunch,
} from '../SteamVrSettingsService.js';
import {
  ensureSteamVrManifestRegistered,
  ensureSteamVrManifestUnregistered,
} from '../SteamVrManifestService.js';
import { setSteamVrSettings } from '../WindowManager.js';

/**
 * Register SteamVR related IPC handlers / SteamVR関連のIPCハンドラを登録
 */
export function registerSteamVrIpcHandlers() {
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
