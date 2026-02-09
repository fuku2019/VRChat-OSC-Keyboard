import { create } from 'zustand';
import { OscConfig } from '../types';
import { STORAGE_KEYS, DEFAULT_CONFIG } from '../constants';

const BRIDGE_PORT_SYNC_MAX_RETRIES = 20;
const BRIDGE_PORT_SYNC_RETRY_INTERVAL_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isValidPort = (port: unknown): port is number =>
  typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;

// Store state type / ストアの状態型
interface ConfigStore {
  config: OscConfig;
  setConfig: (config: OscConfig) => void;
  updateConfig: <K extends keyof OscConfig>(
    key: K,
    value: OscConfig[K],
  ) => void;
  syncOscPort: (port: number) => void;
}

// Load config from localStorage / localStorageから設定を読み込む
const loadConfigFromStorage = (): OscConfig => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.OSC_CONFIG);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Ensure all required fields exist / 必須フィールドが存在することを確認
      return {
        bridgeUrl: parsed.bridgeUrl || DEFAULT_CONFIG.BRIDGE_URL,
        oscPort: parsed.oscPort || DEFAULT_CONFIG.OSC_PORT,
        autoSend: parsed.autoSend ?? DEFAULT_CONFIG.AUTO_SEND,
        copyMode: parsed.copyMode ?? DEFAULT_CONFIG.COPY_MODE,
        autoSendBeforeCopyMode:
          parsed.autoSendBeforeCopyMode ??
          DEFAULT_CONFIG.AUTO_SEND_BEFORE_COPY_MODE,
        language: parsed.language || DEFAULT_CONFIG.LANGUAGE,
        theme: parsed.theme || DEFAULT_CONFIG.THEME,
        accentColor: parsed.accentColor || DEFAULT_CONFIG.ACCENT_COLOR,
        updateCheckInterval:
          parsed.updateCheckInterval || DEFAULT_CONFIG.UPDATE_CHECK_INTERVAL,
        useOffscreenCapture:
          parsed.useOffscreenCapture ?? DEFAULT_CONFIG.USE_OFFSCREEN_CAPTURE,
        forceOpaqueAlpha:
          parsed.forceOpaqueAlpha ?? DEFAULT_CONFIG.FORCE_OPAQUE_ALPHA,
        disableOverlay:
          parsed.disableOverlay ?? DEFAULT_CONFIG.DISABLE_OVERLAY,
        steamVrAutoLaunch:
          parsed.steamVrAutoLaunch ?? DEFAULT_CONFIG.STEAMVR_AUTO_LAUNCH,
      };
    }
  } catch (error) {
    console.error('Failed to load config from localStorage:', error);
  }

  // Return default config / デフォルト設定を返す
  return {
    bridgeUrl: DEFAULT_CONFIG.BRIDGE_URL,
    oscPort: DEFAULT_CONFIG.OSC_PORT,
    autoSend: DEFAULT_CONFIG.AUTO_SEND,
    copyMode: DEFAULT_CONFIG.COPY_MODE,
    autoSendBeforeCopyMode: DEFAULT_CONFIG.AUTO_SEND_BEFORE_COPY_MODE,
    language: DEFAULT_CONFIG.LANGUAGE,
    theme: DEFAULT_CONFIG.THEME,
    accentColor: DEFAULT_CONFIG.ACCENT_COLOR,
    updateCheckInterval: DEFAULT_CONFIG.UPDATE_CHECK_INTERVAL,
    useOffscreenCapture: DEFAULT_CONFIG.USE_OFFSCREEN_CAPTURE,
    forceOpaqueAlpha: DEFAULT_CONFIG.FORCE_OPAQUE_ALPHA,
    disableOverlay: DEFAULT_CONFIG.DISABLE_OVERLAY,
    steamVrAutoLaunch: DEFAULT_CONFIG.STEAMVR_AUTO_LAUNCH,
  };
};

// Save config to localStorage / 設定をlocalStorageに保存
const saveConfigToStorage = (config: OscConfig) => {
  try {
    localStorage.setItem(STORAGE_KEYS.OSC_CONFIG, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save config to localStorage:', error);
  }
};

// Create Zustand store / Zustandストアを作成
export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: loadConfigFromStorage(),

  // Set entire config / 設定全体を設定
  setConfig: (config) => {
    const currentConfig = get().config;
    const electronAPI = window.electronAPI;

    // Check for changes and log them / 変更を確認してログ出力
    if (electronAPI?.logConfigChange) {
      Object.keys(config).forEach((key) => {
        const k = key as keyof OscConfig;
        if (config[k] !== currentConfig[k]) {
          electronAPI.logConfigChange(k, currentConfig[k], config[k]);
        }
      });
    }

    saveConfigToStorage(config);
    set({ config });

    // Sync OSC port with Electron only if changed / OSCポートが変更された場合のみElectronと同期
    if (
      electronAPI &&
      config.oscPort &&
      currentConfig.oscPort !== config.oscPort
    ) {
      electronAPI.updateOscPort(config.oscPort);
    }

    // Sync overlay settings with Electron / オーバーレイ設定をElectronに同期
    if (electronAPI?.setOverlaySettings) {
      electronAPI.setOverlaySettings({
        useOffscreenCapture: config.useOffscreenCapture,
        forceOpaqueAlpha: config.forceOpaqueAlpha,
        disableOverlay: config.disableOverlay,
      });
    }
  },

  // Update specific config field / 特定の設定フィールドを更新
  updateConfig: (key, value) => {
    const currentConfig = get().config;

    // Check if value actually changed / 値が実際に変更されたか確認
    if (currentConfig[key] === value) return;

    // Log change / 変更をログ出力
    if (window.electronAPI?.logConfigChange) {
      window.electronAPI.logConfigChange(key, currentConfig[key], value);
    }

    const newConfig = { ...currentConfig, [key]: value };
    saveConfigToStorage(newConfig);
    set({ config: newConfig });

    // Sync OSC port if changed / OSCポートが変更された場合のみ同期
    if (key === 'oscPort' && window.electronAPI) {
      window.electronAPI.updateOscPort(value as number);
    }

    // Sync overlay settings if changed / オーバーレイ設定を同期
    if (
      (key === 'useOffscreenCapture' ||
        key === 'forceOpaqueAlpha' ||
        key === 'disableOverlay') &&
      window.electronAPI?.setOverlaySettings
    ) {
      window.electronAPI.setOverlaySettings({ [key]: value });
    }
  },

  // Sync OSC port with Electron Main process / ElectronのMainプロセスとOSCポートを同期
  syncOscPort: (port) => {
    if (window.electronAPI) {
      window.electronAPI.updateOscPort(port);
    }
  },
}));

// Initialize OSC port sync once on module load / モジュール読み込み時に一度だけOSCポートを同期
if (typeof window !== 'undefined' && window.electronAPI) {
  // Use setTimeout to ensure this runs after store initialization / ストア初期化後に実行されるようsetTimeoutを使用
  setTimeout(async () => {
    const currentConfig = useConfigStore.getState().config;
    if (currentConfig.oscPort) {
      window.electronAPI!.updateOscPort(currentConfig.oscPort);
    }

    // Sync overlay settings on startup / 起動時にオーバーレイ設定を同期
    if (window.electronAPI?.setOverlaySettings) {
      window.electronAPI.setOverlaySettings({
        useOffscreenCapture: currentConfig.useOffscreenCapture,
        forceOpaqueAlpha: currentConfig.forceOpaqueAlpha,
        disableOverlay: currentConfig.disableOverlay,
      });
    }

    // Sync SteamVR startup registration from actual SteamVR settings on every app launch.
    if (window.electronAPI?.getSteamVrAutoLaunch) {
      try {
        const result = await window.electronAPI.getSteamVrAutoLaunch();
        if (result?.success && typeof result.enabled === 'boolean') {
          const store = useConfigStore.getState();
          if (store.config.steamVrAutoLaunch !== result.enabled) {
            const syncedConfig = {
              ...store.config,
              steamVrAutoLaunch: result.enabled,
            };
            // Persist without using setConfig to avoid extra side effects during boot.
            saveConfigToStorage(syncedConfig);
            useConfigStore.setState({ config: syncedConfig });
            console.log(
              `[Config] SteamVR startup registration synced: ${result.enabled}`,
            );
          }
        }
      } catch (e) {
        console.warn('[Config] Failed to sync SteamVR startup registration:', e);
      }
    }

    // Get bridge port from Electron and update bridgeUrl / Electronからブリッジポートを取得してbridgeUrlを更新
    if (window.electronAPI!.getBridgePort) {
      try {
        for (let i = 0; i < BRIDGE_PORT_SYNC_MAX_RETRIES; i++) {
          const result = await window.electronAPI!.getBridgePort();
          if (isValidPort(result.port)) {
            const newBridgeUrl = `ws://127.0.0.1:${result.port}`;
            const store = useConfigStore.getState();
            if (store.config.bridgeUrl !== newBridgeUrl) {
              // Update bridgeUrl without logging to avoid noise / ノイズを避けるためログなしでbridgeUrlを更新
              store.setConfig({ ...store.config, bridgeUrl: newBridgeUrl });
              console.log(`✅ Bridge URL synced to: ${newBridgeUrl}`);
            }
            break;
          }

          if (i < BRIDGE_PORT_SYNC_MAX_RETRIES - 1) {
            await sleep(BRIDGE_PORT_SYNC_RETRY_INTERVAL_MS);
          }
        }
      } catch (e) {
        console.warn('[Config] Failed to get bridge port:', e);
      }
    }
  }, 0);
}
