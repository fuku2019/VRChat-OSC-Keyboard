import { create } from 'zustand';
import { OscConfig } from '../types';
import { STORAGE_KEYS, DEFAULT_CONFIG } from '../constants';

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
        language: parsed.language || DEFAULT_CONFIG.LANGUAGE,
        theme: parsed.theme || DEFAULT_CONFIG.THEME,
        accentColor: parsed.accentColor || DEFAULT_CONFIG.ACCENT_COLOR,
        updateCheckInterval:
          parsed.updateCheckInterval || DEFAULT_CONFIG.UPDATE_CHECK_INTERVAL,
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
    language: DEFAULT_CONFIG.LANGUAGE,
    theme: DEFAULT_CONFIG.THEME,
    accentColor: DEFAULT_CONFIG.ACCENT_COLOR,
    updateCheckInterval: DEFAULT_CONFIG.UPDATE_CHECK_INTERVAL,
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

    // Get bridge port from Electron and update bridgeUrl / Electronからブリッジポートを取得してbridgeUrlを更新
    if (window.electronAPI!.getBridgePort) {
      try {
        const result = await window.electronAPI!.getBridgePort();
        if (result.port) {
          const newBridgeUrl = `ws://127.0.0.1:${result.port}`;
          const store = useConfigStore.getState();
          if (store.config.bridgeUrl !== newBridgeUrl) {
            // Update bridgeUrl without logging to avoid noise / ノイズを避けるためログなしでbridgeUrlを更新
            store.setConfig({ ...store.config, bridgeUrl: newBridgeUrl });
            console.log(`✅ Bridge URL synced to: ${newBridgeUrl}`);
          }
        }
      } catch (e) {
        console.warn('[Config] Failed to get bridge port:', e);
      }
    }
  }, 0);
}
