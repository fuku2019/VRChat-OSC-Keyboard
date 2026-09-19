/**
 * Settings Modal - General tab
 * 設定モーダル - 一般タブ
 */

import { FC } from 'react';
import { CircleHelp, History } from 'lucide-react';
import { OscConfig, UpdateConfigFn } from '../../types';
import { TranslationStrings } from '../../constants';
import { UpdateInfo } from '../../hooks/useUpdateChecker';
import packageJson from '../../package.json';
import { SECTION_LABEL_CLASS, selectedBtnClass, SettingLabel, ToggleRow } from './settingsRows';

const APP_VERSION = packageJson.version;

// Update download UI state passed through from the modal / モーダルから受け取る更新ダウンロードUIの状態
interface UpdateUiProps {
  updateAvailable?: UpdateInfo | null;
  isDownloading?: boolean;
  downloadProgress?: number;
  downloadError?: string | null;
  downloadedPath?: string | null;
  startDownload?: () => Promise<void>;
  cancelDownload?: () => Promise<void>;
  installUpdate?: () => Promise<void>;
}

interface GeneralTabProps {
  t: TranslationStrings['settings'];
  localConfig: OscConfig;
  updateConfig: UpdateConfigFn;
  historyMaxCountInput: string;
  onHistoryMaxCountInputChange: (value: string) => void;
  onHistoryMaxCountCommit: () => void;
  onHistoryMaxCountKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  checkStatus: string;
  updateUrl: string;
  onCheckNow: () => void;
  onShowTutorial: () => void;
  onRequestReset: () => void;
  onRequestHistoryClear: () => void;
  hasClearHistory: boolean;
  updateUi: UpdateUiProps;
}

const GeneralTab: FC<GeneralTabProps> = ({
  t,
  localConfig,
  updateConfig,
  historyMaxCountInput,
  onHistoryMaxCountInputChange,
  onHistoryMaxCountCommit,
  onHistoryMaxCountKeyDown,
  checkStatus,
  updateUrl,
  onCheckNow,
  onShowTutorial,
  onRequestReset,
  onRequestHistoryClear,
  hasClearHistory,
  updateUi,
}) => {
  const {
    updateAvailable,
    isDownloading,
    downloadProgress,
    downloadError,
    downloadedPath,
    startDownload,
    cancelDownload,
    installUpdate,
  } = updateUi;

  return (
    <div className='space-y-8 animate-fade-in'>
      <section>
        <label className={SECTION_LABEL_CLASS}>{t.language}</label>
        <div className='flex gap-2'>
          <button onClick={() => updateConfig('language', 'ja')} className={selectedBtnClass(localConfig.language === 'ja')}>日本語</button>
          <button onClick={() => updateConfig('language', 'en')} className={selectedBtnClass(localConfig.language === 'en')}>English</button>
        </div>
      </section>

      <section className='pt-6 border-t dark:border-white/10 border-black/10'>
        <label className={SECTION_LABEL_CLASS}>{t.checkInterval}</label>
        <div className='bg-gray-100/50 dark:bg-slate-900/50 rounded-xl p-1 mb-3 flex gap-1 overflow-x-auto border dark:border-white/10 border-black/10 backdrop-blur-sm'>
          {[
            { id: 'startup' as const, label: t.intervalStartup },
            { id: 'daily' as const, label: t.intervalDaily },
            { id: 'weekly' as const, label: t.intervalWeekly },
            { id: 'manual' as const, label: t.intervalManual },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => updateConfig('updateCheckInterval', option.id)}
              className={`flex-1 py-2 px-2 text-xs rounded-lg transition-all whitespace-nowrap ${
                localConfig.updateCheckInterval === option.id
                  ? 'bg-white dark:bg-primary-600 text-primary-600 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className='flex items-start justify-between gap-4'>
          <div className='flex flex-col gap-2 w-full'>
            <div className='flex items-center gap-2'>
              <button
                onClick={onCheckNow}
                disabled={isDownloading}
                className='text-sm px-4 py-2 bg-slate-200/80 dark:bg-slate-700/80 hover:bg-slate-300 dark:hover:bg-slate-600 dark:text-white text-slate-900 rounded-lg transition-colors font-medium border dark:border-white/10 border-black/10 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {t.checkNow}
              </button>
              {updateAvailable?.isInstaller && updateAvailable.installerUrl ? (
                downloadedPath && installUpdate ? (
                  <button
                    onClick={() => installUpdate()}
                    className='text-sm px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-medium shadow-sm'
                  >
                    {t.installUpdate}
                  </button>
                ) : (
                  <button
                    onClick={() => startDownload && startDownload()}
                    disabled={isDownloading}
                    className='text-sm px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed'
                  >
                    {isDownloading ? t.downloading : t.downloadAndUpdate}
                  </button>
                )
              ) : updateUrl ? (
                <button
                  onClick={() => {
                    if (window.electronAPI && updateUrl) {
                      window.electronAPI.openExternal(updateUrl);
                    }
                  }}
                  className='text-sm px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors font-medium shadow-sm'
                >
                  {t.openReleasePage}
                </button>
              ) : null}
            </div>

            {/* Download Progress Bar */}
            {isDownloading && (
              <div className='w-full mt-2 p-3 rounded-lg dark:bg-slate-900/50 bg-slate-100/50 border dark:border-white/10 border-black/10'>
                <div className='flex justify-between items-center text-xs mb-1.5 dark:text-slate-300 text-slate-600 font-medium'>
                  <span>{t.downloading}</span>
                  <div className='flex items-center gap-2'>
                    {downloadProgress !== undefined && downloadProgress >= 0 && (
                      <span>{downloadProgress}%</span>
                    )}
                    {cancelDownload && (
                      <button
                        onClick={() => cancelDownload()}
                        className='px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 rounded text-[10px] transition-colors'
                      >
                        {t.cancel}
                      </button>
                    )}
                  </div>
                </div>
                <div className='w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden'>
                  {downloadProgress !== undefined && downloadProgress >= 0 ? (
                    <div
                      className='bg-primary-500 h-1.5 rounded-full transition-all duration-300 ease-out'
                      style={{ width: `${downloadProgress}%` }}
                    ></div>
                  ) : (
                    <div className='bg-primary-500 h-1.5 rounded-full animate-pulse w-full'></div>
                  )}
                </div>
              </div>
            )}
            {downloadError && !isDownloading && (
              <p className='text-xs text-red-500 dark:text-red-400 mt-1'>{t.downloadError}: {downloadError}</p>
            )}
            {checkStatus && (
              <span className='text-sm text-primary-600 dark:text-primary-400 font-medium whitespace-pre-line mt-2'>
                {checkStatus}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className='pt-6 border-t dark:border-white/10 border-black/10'>
        <button
          onClick={onShowTutorial}
          className='w-full flex items-center justify-between p-4 dark:bg-slate-800/50 bg-white/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-xl border dark:border-white/10 border-black/10 dark:text-slate-200 text-slate-700 transition-all group shadow-sm'
        >
          <div className='flex items-center gap-3'>
            <CircleHelp size={20} className='text-primary-500' />
            <span className='font-medium text-sm'>{t.resetWelcome}</span>
          </div>
          <span className='text-slate-500 group-hover:translate-x-1 transition-transform'>
            →
          </span>
        </button>
      </section>

      <section className='pt-6 border-t dark:border-white/10 border-black/10'>
        <h3 className='text-sm font-bold text-slate-900 dark:text-slate-100 mb-2'>
          {t.resetTitle}
        </h3>
        <div className='flex items-center justify-between p-4 bg-red-50/50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-900/30 backdrop-blur-sm'>
          <p className='text-xs sm:text-sm text-red-600 dark:text-red-400 mr-4'>
            {t.resetDesc}
          </p>
          <button
            onClick={() => onRequestReset()}
            className='whitespace-nowrap px-4 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-xs sm:text-sm font-bold transition-colors'
          >
            {t.resetButton}
          </button>
        </div>
      </section>

      <section className='pt-6 border-t dark:border-white/10 border-black/10'>
        <label className={`${SECTION_LABEL_CLASS} !mb-2`}>
          <span className='flex items-center gap-2'>
            <History size={14} className='text-primary-500' />
            {t.historyTitle}
          </span>
        </label>
        <div className='p-4 rounded-xl border dark:border-white/10 border-black/10 dark:bg-slate-800/30 bg-white/50 shadow-sm space-y-4'>
          <div className='flex items-center justify-between gap-4'>
            <SettingLabel label={t.historyMaxCount} description={t.historyMaxCountDesc} />
            <input
              type='number'
              min={10}
              max={100}
              value={historyMaxCountInput}
              onChange={(e) => onHistoryMaxCountInputChange(e.target.value)}
              onBlur={onHistoryMaxCountCommit}
              onKeyDown={onHistoryMaxCountKeyDown}
              className='w-20 px-3 py-2 rounded-lg text-sm border dark:bg-slate-900/80 bg-white/80 dark:border-white/10 border-black/10 dark:text-slate-100 text-slate-800 focus:ring-1 focus:ring-primary-500/50 outline-none transition-all shadow-inner text-center'
            />
          </div>
          <div className='h-px w-full bg-black/5 dark:bg-white/5' />
          <ToggleRow
            label={t.historyPersist}
            description={t.historyPersistDesc}
            enabled={localConfig.historyPersistEnabled}
            onToggle={(value) => updateConfig('historyPersistEnabled', value)}
          />
          {hasClearHistory && (
            <>
              <div className='h-px w-full bg-black/5 dark:bg-white/5' />
              <div className='flex items-center justify-end'>
                <button
                  type='button'
                  onClick={() => onRequestHistoryClear()}
                  className='px-4 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-xs font-bold transition-colors'
                >
                  {t.historyClear}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className='text-center pt-8 opacity-60'>
        <p className='text-xs text-slate-500 font-mono'>v{APP_VERSION}</p>
      </section>
    </div>
  );
};

export default GeneralTab;
