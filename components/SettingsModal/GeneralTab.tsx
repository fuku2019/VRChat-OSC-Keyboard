/**
 * Settings Modal - General tab
 * 設定モーダル - 一般タブ
 */

import { FC } from 'react';
import { ChevronRight, CircleHelp, RefreshCw } from 'lucide-react';
import { OscConfig, UpdateConfigFn } from '../../types';
import { TranslationStrings } from '../../constants';
import { UpdateInfo } from '../../hooks/useUpdateChecker';
import packageJson from '../../package.json';
import {
  DANGER_BTN_CLASS,
  FILLED_BTN_CLASS,
  INPUT_CLASS,
  OUTLINED_BTN_CLASS,
  SECTION_CLASS,
  SECTION_LABEL_CLASS,
  selectedBtnClass,
  SelectedMark,
  SettingLabel,
  ToggleRow,
} from './settingsRows';

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
          <button onClick={() => updateConfig('language', 'ja')} className={selectedBtnClass(localConfig.language === 'ja')}><SelectedMark active={localConfig.language === 'ja'} />日本語</button>
          <button onClick={() => updateConfig('language', 'en')} className={selectedBtnClass(localConfig.language === 'en')}><SelectedMark active={localConfig.language === 'en'} />English</button>
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <label className={SECTION_LABEL_CLASS}>{t.checkInterval}</label>
        <div className='mb-4 flex gap-2 overflow-x-auto'>
          {[
            { id: 'startup' as const, label: t.intervalStartup },
            { id: 'daily' as const, label: t.intervalDaily },
            { id: 'weekly' as const, label: t.intervalWeekly },
            { id: 'manual' as const, label: t.intervalManual },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => updateConfig('updateCheckInterval', option.id)}
              className={`${selectedBtnClass(localConfig.updateCheckInterval === option.id)} whitespace-nowrap`}
            >
              <SelectedMark active={localConfig.updateCheckInterval === option.id} />
              {option.label}
            </button>
          ))}
        </div>

        <div className='flex flex-col gap-2 w-full'>
          <div className='flex items-center gap-2'>
            <button
              onClick={onCheckNow}
              disabled={isDownloading}
              className={`${OUTLINED_BTN_CLASS} inline-flex items-center gap-2`}
            >
              <RefreshCw size={16} />
              {t.checkNow}
            </button>
            {updateAvailable?.isInstaller && updateAvailable.installerUrl ? (
              downloadedPath && installUpdate ? (
                <button
                  onClick={() => installUpdate()}
                  className={FILLED_BTN_CLASS}
                >
                  {t.installUpdate}
                </button>
              ) : (
                <button
                  onClick={() => startDownload && startDownload()}
                  disabled={isDownloading}
                  className={FILLED_BTN_CLASS}
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
                className={FILLED_BTN_CLASS}
              >
                {t.openReleasePage}
              </button>
            ) : null}
          </div>

          {/* Download Progress Bar */}
          {isDownloading && (
            <div className='w-full mt-2'>
              <div className='flex justify-between items-center text-[13px] mb-2 text-ink-muted'>
                <span>{t.downloading}</span>
                <div className='flex items-center gap-3'>
                  {downloadProgress !== undefined && downloadProgress >= 0 && (
                    <span className='tabular-nums'>{downloadProgress}%</span>
                  )}
                  {cancelDownload && (
                    <button
                      onClick={() => cancelDownload()}
                      className='px-3 py-1 rounded-full text-error text-[13px]'
                    >
                      {t.cancel}
                    </button>
                  )}
                </div>
              </div>
              {/* Indeterminate progress is a still full bar: a looping animation
                  would make the offscreen keyboard window paint every frame.
                  進捗不明のときは静止した満杯のバーにする。ループするアニメーションは
                  オフスクリーンのキーボードウィンドウに毎フレーム描画させるため。 */}
              <div className='w-full bg-key-fn rounded-full h-1 overflow-hidden'>
                <div
                  className={`bg-accent h-1 rounded-full ${
                    downloadProgress !== undefined && downloadProgress >= 0 ? '' : 'w-full opacity-50'
                  }`}
                  style={
                    downloadProgress !== undefined && downloadProgress >= 0
                      ? { width: `${downloadProgress}%` }
                      : undefined
                  }
                ></div>
              </div>
            </div>
          )}
          {downloadError && !isDownloading && (
            <p className='text-[13px] text-error mt-1'>{t.downloadError}: {downloadError}</p>
          )}
          {checkStatus && (
            <span className='text-sm text-ink whitespace-pre-line mt-2'>
              {checkStatus}
            </span>
          )}
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <button
          onClick={onShowTutorial}
          className='w-full flex items-center gap-4 -mx-3 px-3 py-3 rounded-2xl text-ink text-left'
        >
          <CircleHelp size={20} className='text-accent' />
          <span className='text-[15px]'>{t.resetWelcome}</span>
          <ChevronRight size={20} className='ml-auto text-ink-muted' />
        </button>
      </section>

      <section className={SECTION_CLASS}>
        <label className={SECTION_LABEL_CLASS}>{t.historyTitle}</label>
        <div className='space-y-5'>
          <div className='flex items-center justify-between gap-6'>
            <SettingLabel label={t.historyMaxCount} description={t.historyMaxCountDesc} />
            <input
              type='number'
              min={10}
              max={100}
              value={historyMaxCountInput}
              onChange={(e) => onHistoryMaxCountInputChange(e.target.value)}
              onBlur={onHistoryMaxCountCommit}
              onKeyDown={onHistoryMaxCountKeyDown}
              className={`w-24 text-center ${INPUT_CLASS}`}
            />
          </div>
          <ToggleRow
            label={t.historyPersist}
            description={t.historyPersistDesc}
            enabled={localConfig.historyPersistEnabled}
            onToggle={(value) => updateConfig('historyPersistEnabled', value)}
          />
          {hasClearHistory && (
            <div className='flex items-center justify-end'>
              <button
                type='button'
                onClick={() => onRequestHistoryClear()}
                className={DANGER_BTN_CLASS}
              >
                {t.historyClear}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <label className={SECTION_LABEL_CLASS}>{t.resetTitle}</label>
        <div className='flex items-center justify-between gap-6'>
          <p className='text-[13px] text-ink-muted leading-relaxed'>
            {t.resetDesc}
          </p>
          <button
            onClick={() => onRequestReset()}
            className={DANGER_BTN_CLASS}
          >
            {t.resetButton}
          </button>
        </div>
      </section>

      <section className='pt-4'>
        <p className='text-[13px] text-ink-muted tabular-nums'>VRChat OSC Keyboard v{APP_VERSION}</p>
      </section>
    </div>
  );
};

export default GeneralTab;
