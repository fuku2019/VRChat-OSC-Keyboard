/**
 * Update Check Section - Update check configuration UI for settings modal
 * 更新確認セクション - 設定モーダル用の更新確認設定UI
 */

import { FC } from 'react';
import { OscConfig, UpdateCheckInterval } from '../../types';
import { STORAGE_KEYS, GITHUB } from '../../constants';

interface UpdateCheckSectionProps {
  localConfig: OscConfig;
  t: {
    checkInterval: string;
    intervalStartup: string;
    intervalDaily: string;
    intervalWeekly: string;
    intervalManual: string;
    checkNow: string;
    checking: string;
    updateAvailable: string;
    latestVersion: string;
    updateError: string;
    openReleasePage: string;
  };
  checkStatus: string;
  updateUrl: string;
  onIntervalChange: (interval: UpdateCheckInterval) => void;
  setCheckStatus: (status: string) => void;
  setUpdateUrl: (url: string) => void;
  onUpdateAvailable?: (version: string | null, url?: string) => void;
}

export const UpdateCheckSection: FC<UpdateCheckSectionProps> = ({
  localConfig,
  t,
  checkStatus,
  updateUrl,
  onIntervalChange,
  setCheckStatus,
  setUpdateUrl,
  onUpdateAvailable,
}) => {
  const handleCheckNow = async () => {
    if (!window.electronAPI) {
      setCheckStatus(t.updateError);
      return;
    }
    setCheckStatus(t.checking);
    const now = Date.now();
    try {
      const result = await window.electronAPI.checkForUpdate();
      if (result.success) {
        localStorage.setItem(STORAGE_KEYS.LAST_UPDATE_CHECK, now.toString());
        if (result.updateAvailable) {
          const msg = t.updateAvailable.replace(
            '{version}',
            result.latestVersion || '',
          );
          setCheckStatus(msg);
          const url = result.url || GITHUB.RELEASES_URL;
          setUpdateUrl(url);
          // Persist to localStorage / localStorageに永続化
          localStorage.setItem(
            STORAGE_KEYS.UPDATE_AVAILABLE,
            JSON.stringify({
              version: result.latestVersion,
              url,
            }),
          );
          // Notify parent to show toast/badge / 親に通知してトースト/バッジを表示
          if (onUpdateAvailable && result.latestVersion) {
            onUpdateAvailable(result.latestVersion, url);
          }
        } else {
          setCheckStatus(t.latestVersion);
          setUpdateUrl('');
          // Clear persisted update info / 永続化された更新情報をクリア
          localStorage.removeItem(STORAGE_KEYS.UPDATE_AVAILABLE);
          // Notify parent to clear state / 親に通知して状態をクリア
          if (onUpdateAvailable) {
            onUpdateAvailable(null);
          }
        }
      } else {
        setCheckStatus(t.updateError);
      }
    } catch {
      setCheckStatus(t.updateError);
    }
  };

  const intervalOptions = [
    { id: 'startup' as const, label: t.intervalStartup },
    { id: 'daily' as const, label: t.intervalDaily },
    { id: 'weekly' as const, label: t.intervalWeekly },
    { id: 'manual' as const, label: t.intervalManual },
  ];

  return (
    <section className='pt-4 border-t dark:border-slate-700/50 border-slate-200'>
      <label className='block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider'>
        {t.checkInterval}
      </label>
      <div className='bg-gray-100 dark:bg-slate-900 rounded-xl p-1 mb-3 flex gap-1 overflow-x-auto'>
        {intervalOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => onIntervalChange(option.id)}
            className={`flex-1 py-2 px-2 text-xs rounded-lg transition-all whitespace-nowrap ${
              localConfig.updateCheckInterval === option.id
                ? 'bg-white dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <button
            onClick={handleCheckNow}
            className='text-sm px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 dark:text-white text-slate-900 rounded-lg transition-colors font-medium'
          >
            {t.checkNow}
          </button>
          {updateUrl && (
            <button
              onClick={() => {
                if (window.electronAPI && updateUrl) {
                  window.electronAPI.openExternal(updateUrl);
                }
              }}
              className='text-sm px-4 py-2 bg-primary-600 hover:bg-primary-500 text-[rgb(var(--rgb-on-primary))] rounded-lg transition-colors font-medium shadow-primary-900/20 shadow-lg'
            >
              {t.openReleasePage}
            </button>
          )}
        </div>
        {checkStatus && (
          <span className='text-sm text-primary-600 dark:text-primary-400 font-medium'>
            {checkStatus}
          </span>
        )}
      </div>
    </section>
  );
};
