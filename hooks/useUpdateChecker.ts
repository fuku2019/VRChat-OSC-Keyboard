import { useState, useEffect } from 'react';
import { STORAGE_KEYS } from '../constants';
import { useConfigStore } from '../stores/configStore';

export interface UpdateInfo {
  version: string;
  url: string;
  isInstaller?: boolean;
  installerUrl?: string;
}

interface UseUpdateCheckerReturn {
  updateAvailable: UpdateInfo | null;
  setUpdateAvailable: (info: UpdateInfo | null) => void;
  isDownloading: boolean;
  downloadProgress: number;
  downloadError: string | null;
  downloadedPath: string | null;
  startDownload: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  installUpdate: () => Promise<void>;
}

// Hook for checking updates / アップデート確認用フック
export const useUpdateChecker = (): UseUpdateCheckerReturn => {
  const config = useConfigStore((state) => state.config);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Load persisted update info on mount / マウント時に永続化された更新情報を読み込む
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(
    () => {
      const saved = localStorage.getItem(STORAGE_KEYS.UPDATE_AVAILABLE);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Check if the persisted update matches current version (already updated) / 保存された更新が現在のバージョンと一致するか確認（更新済み）
          // Normalize versions to handle 'v' prefix logic / 'v'プレフィックスを処理するためにバージョンを正規化
          const normalize = (v: string) => v.replace(/^v/, '');

          // APP_VERSION is defined in vite config
          if (
            parsed.version &&
            normalize(parsed.version) === normalize(APP_VERSION)
          ) {
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
    },
  );

  const [downloadedPath, setDownloadedPath] = useState<string | null>(null);

  // Update Check Logic - runs only once on mount / 更新確認ロジック - マウント時に1回のみ実行
  useEffect(() => {
    const checkUpdate = async () => {
      if (!window.electronAPI) return;

      // Get current interval from localStorage to ensure we use the latest value / 最新の値を使用するためlocalStorageから取得
      const savedConfig = localStorage.getItem(STORAGE_KEYS.OSC_CONFIG);
      let currentInterval = config.updateCheckInterval;
      if (savedConfig) {
        try {
          currentInterval =
            JSON.parse(savedConfig).updateCheckInterval || currentInterval;
        } catch (e) {
          // Ignore parse error - use default / パースエラーを無視 - デフォルトを使用
          console.warn('[UpdateChecker] Failed to parse saved config:', e);
        }
      }

      if (!currentInterval || currentInterval === 'manual') return;

      const lastCheck = localStorage.getItem(STORAGE_KEYS.LAST_UPDATE_CHECK);
      const now = Date.now();
      const lastCheckTime = Number.isFinite(Number(lastCheck))
        ? Number(lastCheck)
        : 0;
      let shouldCheck = false;

      if (currentInterval === 'startup') {
        shouldCheck = true;
      } else if (currentInterval === 'daily') {
        // Check if 24 hours passed / 24時間経過したか確認
        if (!lastCheckTime || now - lastCheckTime > 24 * 60 * 60 * 1000) {
          shouldCheck = true;
        }
      } else if (currentInterval === 'weekly') {
        // Check if 7 days passed / 7日経過したか確認
        if (!lastCheckTime || now - lastCheckTime > 7 * 24 * 60 * 60 * 1000) {
          shouldCheck = true;
        }
      }

      if (shouldCheck) {
        try {
          const result = await window.electronAPI.checkForUpdate();
          localStorage.setItem(STORAGE_KEYS.LAST_UPDATE_CHECK, now.toString());

          if (
            result.success &&
            result.updateAvailable &&
            result.latestVersion
          ) {
            const updateInfo: UpdateInfo = {
              version: result.latestVersion,
              url:
                result.url ||
                'https://github.com/fuku2019/VRC-OSC-Keyboard/releases',
              isInstaller: result.isInstaller,
              installerUrl: result.installerUrl,
            };
            setUpdateAvailable(updateInfo);
            // Persist to localStorage / localStorageに永続化
            localStorage.setItem(
              STORAGE_KEYS.UPDATE_AVAILABLE,
              JSON.stringify(updateInfo),
            );
          } else if (result.success && !result.updateAvailable) {
            // No update available, clear persisted info / 更新なし、保存情報をクリア
            setUpdateAvailable(null);
            localStorage.removeItem(STORAGE_KEYS.UPDATE_AVAILABLE);
          }
        } catch (e) {
          console.error('Auto update check failed:', e);
        }
      }
    };

    checkUpdate();
    // Intentionally run only once on mount to check update on app startup.
    // config.updateCheckInterval changes don't trigger recheck - app restart required.
    // マウント時に一度だけ実行するため、意図的に依存配列を空にしている。
    // config.updateCheckIntervalの変更は再チェックをトリガーしない - アプリの再起動が必要。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount / マウント時に1回のみ実行

  // Listen for download progress / ダウンロード進捗をリッスン
  useEffect(() => {
    if (!window.electronAPI) return;

    const handleProgress = (data: { progress: number }) => {
      if (data && typeof data.progress === 'number') {
        setDownloadProgress(data.progress);
      }
    };

    window.electronAPI.onUpdateDownloadProgress(handleProgress);

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeUpdateDownloadProgress(handleProgress);
      }
    };
  }, []);

  const startDownload = async () => {
    if (!window.electronAPI || !updateAvailable?.installerUrl || isDownloading) return;

    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadError(null);
    setDownloadedPath(null);

    try {
      const result = await window.electronAPI.downloadUpdate(updateAvailable.installerUrl);
      if (!result.success) {
        setIsDownloading(false);
        // Do not set error if it was a cancellation / キャンセルによる終了であればエラーをセットしない
        if (!result.cancelled) {
          setDownloadError(result.error || 'Download failed');
        }
      } else {
        if (result.isDebug) {
          console.log('[DEBUG] テスト成功 (Download completed)');
        }
        setIsDownloading(false);
        if (result.destPath) {
          setDownloadedPath(result.destPath);
        }
      }
    } catch (e) {
      console.error('Download failed:', e);
      setIsDownloading(false);
      setDownloadError(e instanceof Error ? e.message : 'Download failed');
    }
  };

  const cancelDownload = async () => {
    if (!window.electronAPI || !isDownloading) return;
    try {
      await window.electronAPI.cancelUpdateDownload();
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadError(null);
    } catch (e) {
      console.error('Cancel failed:', e);
    }
  };

  const installUpdate = async () => {
    if (!window.electronAPI || !downloadedPath) return;
    try {
      const result = await window.electronAPI.installUpdate(downloadedPath);
      if (result?.success && result?.isDebug) {
        // Show test success alert in debug mode / デバッグモードでのテスト成功アラートを表示
        setTimeout(() => alert('テスト成功 (Debug Mode)'), 100);
      }
    } catch (e) {
      console.error('Install failed:', e);
    }
  };

  return {
    updateAvailable,
    setUpdateAvailable,
    isDownloading,
    downloadProgress,
    downloadError,
    downloadedPath,
    startDownload,
    cancelDownload,
    installUpdate,
  };
};
