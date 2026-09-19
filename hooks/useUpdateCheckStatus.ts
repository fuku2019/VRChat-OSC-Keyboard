import { useState, useEffect } from 'react';
import { Language } from '../types';
import { TRANSLATIONS, GITHUB, STORAGE_KEYS } from '../constants';
import type { TranslationStrings } from '../constants';
import type { UpdateInfo } from './useUpdateChecker';

type UpdateAvailableHandler = (
  version: string | null,
  url?: string,
  isInstaller?: boolean,
  installerUrl?: string,
) => void;

interface UseUpdateCheckStatusReturn {
  checkStatus: string;
  updateUrl: string;
  handleCheckNow: () => Promise<void>;
}

/**
 * Custom hook for the settings modal's manual update check and its status text.
 * 設定モーダルの手動アップデート確認とそのステータス表示を扱うカスタムフック。
 *
 * @param isOpen - Whether the modal is open / モーダルが開いているかどうか
 * @param language - Draft language of the settings modal / 設定モーダルのドラフト言語
 * @param t - Settings translation strings / 設定用の翻訳文字列
 * @param updateAvailable - Update info already known to the app / アプリが既に把握している更新情報
 * @param onUpdateAvailable - Notifies the app of a manual check result / 手動確認の結果をアプリへ通知するコールバック
 * @returns Status text, release URL and the manual check handler / ステータス文言、リリースURL、手動確認ハンドラー
 */
export const useUpdateCheckStatus = (
  isOpen: boolean,
  language: Language,
  t: TranslationStrings['settings'],
  updateAvailable?: UpdateInfo | null,
  onUpdateAvailable?: UpdateAvailableHandler,
): UseUpdateCheckStatusReturn => {
  const [checkStatus, setCheckStatus] = useState<string>('');
  const [updateUrl, setUpdateUrl] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    if (updateAvailable?.version) {
      const statusLanguage = language || 'ja';
      setCheckStatus(
        TRANSLATIONS[statusLanguage].settings.updateAvailable.replace(
          '{version}',
          updateAvailable.version,
        ),
      );
      setUpdateUrl(updateAvailable.url || GITHUB.RELEASES_URL);
      return;
    }
    setCheckStatus('');
    setUpdateUrl('');
  }, [isOpen, language, updateAvailable]);

  // Check for updates manually / 手動でアップデートを確認する
  const handleCheckNow = async () => {
    if (!window.electronAPI) {
      setCheckStatus(t.updateError);
      return;
    }

    setCheckStatus(t.checking);
    const now = Date.now();

    try {
      const result = await window.electronAPI.checkForUpdate();
      if (!result.success) {
        setCheckStatus(t.updateError);
        return;
      }

      localStorage.setItem(STORAGE_KEYS.LAST_UPDATE_CHECK, now.toString());

      if (result.updateAvailable) {
        const version = result.latestVersion || '';
        setCheckStatus(t.updateAvailable.replace('{version}', version));
        const url = result.url || GITHUB.RELEASES_URL;
        setUpdateUrl(url);
        localStorage.setItem(
          STORAGE_KEYS.UPDATE_AVAILABLE,
          JSON.stringify({
            version,
            url,
            isInstaller: result.isInstaller,
            installerUrl: result.installerUrl,
          }),
        );
        if (onUpdateAvailable && result.latestVersion) {
          onUpdateAvailable(
            result.latestVersion,
            url,
            result.isInstaller,
            result.installerUrl,
          );
        }
        return;
      }

      setCheckStatus(t.latestVersion);
      setUpdateUrl('');
      localStorage.removeItem(STORAGE_KEYS.UPDATE_AVAILABLE);
      if (onUpdateAvailable) {
        onUpdateAvailable(null);
      }
    } catch {
      setCheckStatus(t.updateError);
    }
  };

  return { checkStatus, updateUrl, handleCheckNow };
};
