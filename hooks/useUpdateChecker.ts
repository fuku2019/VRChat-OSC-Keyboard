import { useState, useEffect } from 'react';
import { STORAGE_KEYS } from '../constants';
import { useConfigStore } from '../stores/configStore';

declare const APP_VERSION: string;

export interface UpdateInfo {
  version: string;
  url: string;
}

interface UseUpdateCheckerReturn {
  updateAvailable: UpdateInfo | null;
  setUpdateAvailable: (info: UpdateInfo | null) => void;
}

// Hook for checking updates / アップデート確認用フック
export const useUpdateChecker = (): UseUpdateCheckerReturn => {
  const config = useConfigStore((state) => state.config);
  // Load persisted update info on mount / マウント時に永続化された更新情報を読み込む
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.UPDATE_AVAILABLE);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Check if the persisted update matches current version (already updated) / 保存された更新が現在のバージョンと一致するか確認（更新済み）
        // Normalize versions to handle 'v' prefix logic / 'v'プレフィックスを処理するためにバージョンを正規化
        const normalize = (v: string) => v.replace(/^v/, '');
        
        // APP_VERSION is defined in vite config
        if (parsed.version && normalize(parsed.version) === normalize(APP_VERSION)) {
           // Already updated to this version, clear persistence / 既にこのバージョンに更新済みなので、永続化情報をクリア
           localStorage.removeItem(STORAGE_KEYS.UPDATE_AVAILABLE);
           return null;
        }
        return parsed;
      } catch {
        return null;
      }
    }
    return null;
  });

  // Update Check Logic - runs only once on mount / 更新確認ロジック - マウント時に1回のみ実行
  useEffect(() => {
    const checkUpdate = async () => {
      if (!window.electronAPI) return;
      
      // Get current interval from localStorage to ensure we use the latest value / 最新の値を使用するためlocalStorageから取得
      const savedConfig = localStorage.getItem(STORAGE_KEYS.OSC_CONFIG);
      const currentInterval = savedConfig ? JSON.parse(savedConfig).updateCheckInterval : config.updateCheckInterval;
      
      if (!currentInterval || currentInterval === 'manual') return;

      const lastCheck = localStorage.getItem(STORAGE_KEYS.LAST_UPDATE_CHECK);
      const now = Date.now();
      let shouldCheck = false;

      if (currentInterval === 'startup') {
        shouldCheck = true;
      } else if (currentInterval === 'daily') {
        // Check if 24 hours passed / 24時間経過したか確認
        if (!lastCheck || now - parseInt(lastCheck) > 24 * 60 * 60 * 1000) {
          shouldCheck = true;
        }
      } else if (currentInterval === 'weekly') {
        // Check if 7 days passed / 7日経過したか確認
        if (!lastCheck || now - parseInt(lastCheck) > 7 * 24 * 60 * 60 * 1000) {
          shouldCheck = true;
        }
      }

      if (shouldCheck) {
        try {
          const result = await window.electronAPI.checkForUpdate();
          localStorage.setItem(STORAGE_KEYS.LAST_UPDATE_CHECK, now.toString());
          
          
          if (result.success && result.updateAvailable && result.latestVersion) {
            const updateInfo: UpdateInfo = {
              version: result.latestVersion,
              url: result.url || 'https://github.com/fuku2019/VRC-OSC-Keyboard/releases'
            };
            setUpdateAvailable(updateInfo);
            // Persist to localStorage / localStorageに永続化
            localStorage.setItem(STORAGE_KEYS.UPDATE_AVAILABLE, JSON.stringify(updateInfo));
          } else if (result.success && !result.updateAvailable) {
            // No update available, clear persisted info / 更新なし、保存情報をクリア
            setUpdateAvailable(null);
            localStorage.removeItem(STORAGE_KEYS.UPDATE_AVAILABLE);
          }
        } catch (e) {
          console.error("Auto update check failed:", e);
        }
      }
    };

    checkUpdate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount / マウント時に1回のみ実行

  return {
    updateAvailable,
    setUpdateAvailable,
  };
};
