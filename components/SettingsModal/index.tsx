/**
 * Settings Modal - Application settings interface
 * 設定モーダル - アプリケーション設定インターフェース
 */

import { useState, FC } from 'react';
import { X, Settings, Palette, Link, Volume2 } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';
import { useOverlayScrollForward } from '../../hooks/useOverlayScrollForward';
import { useSettingsDraft } from '../../hooks/useSettingsDraft';
import { useSteamVrSettings } from '../../hooks/useSteamVrSettings';
import { useUpdateCheckStatus } from '../../hooks/useUpdateCheckStatus';
import { reloadWindow } from '../../utils/windowUtils';
import { ConfirmDialog } from '../ConfirmDialog';
import { UpdateInfo } from '../../hooks/useUpdateChecker';
import GeneralTab from './GeneralTab';
import AppearanceTab from './AppearanceTab';
import ConnectivityTab from './ConnectivityTab';
import SoundTab from './SoundTab';

const SETTINGS_MODAL_TITLE_ID = 'settings-modal-title';

// Static tab definitions (labels are hardcoded, not translated) / 静的なタブ定義(ラベルは翻訳対象外の固定文字列)
const TABS = [
  { id: 'general', label: 'General / 一般', icon: Settings },
  { id: 'appearance', label: 'Appearance / 外観', icon: Palette },
  { id: 'connectivity', label: 'Connectivity / 接続', icon: Link },
  { id: 'sound', label: 'Sound / サウンド', icon: Volume2 },
] as const;

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowTutorial: () => void;
  onUpdateAvailable?: (
    version: string | null,
    url?: string,
    isInstaller?: boolean,
    installerUrl?: string
  ) => void;
  updateAvailable?: UpdateInfo | null;
  isDownloading?: boolean;
  downloadProgress?: number;
  downloadError?: string | null;
  downloadedPath?: string | null;
  startDownload?: () => Promise<void>;
  cancelDownload?: () => Promise<void>;
  installUpdate?: () => Promise<void>;
  onClearHistory?: () => void; // Clear send history callback / 送信履歴削除コールバック
}

const SettingsModal: FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onShowTutorial,
  onUpdateAvailable,
  updateAvailable,
  isDownloading,
  downloadProgress,
  downloadError,
  downloadedPath,
  startDownload,
  cancelDownload,
  installUpdate,
  onClearHistory,
}) => {
  const {
    localConfig,
    updateConfig,
    oscPortInput,
    setOscPortInput,
    historyMaxCountInput,
    setHistoryMaxCountInput,
    lastCustomAccentColor,
    handleAccentColorChange,
    handleCustomAccentSelect,
    handleOscPortCommit,
    handleOscPortKeyDown,
    handleHistoryMaxCountCommit,
    handleHistoryMaxCountKeyDown,
  } = useSettingsDraft(isOpen);
  const { shouldRender, animationClass, modalAnimationClass } =
    useModalAnimation(isOpen);
  const { modalRef } = useModalFocusTrap(isOpen, shouldRender, onClose);
  const { contentRef } = useOverlayScrollForward(isOpen);

  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isHistoryClearConfirmOpen, setIsHistoryClearConfirmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'connectivity' | 'sound'>('general');

  const t = TRANSLATIONS[localConfig.language || 'ja'].settings;
  const { checkStatus, updateUrl, handleCheckNow } = useUpdateCheckStatus(
    isOpen,
    localConfig.language,
    t,
    updateAvailable,
    onUpdateAvailable,
  );
  const steamVr = useSteamVrSettings(isOpen, t, updateConfig);

  // Reset configuration to default / 設定を初期値にリセットする
  const handleResetConfig = () => {
    localStorage.clear();

    const restart = async () => {
      try {
        if (window.electronAPI?.restartApp) {
          const result = await window.electronAPI.restartApp();
          if (result?.success) {
            return;
          }
        }
      } catch {
        // fallback below
      }

      reloadWindow();
    };

    void restart();
  };

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${animationClass}`}
    >
      <div
        ref={modalRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby={SETTINGS_MODAL_TITLE_ID}
        tabIndex={-1}
        className={`dark:bg-slate-900/80 pure-black:bg-black/80 bg-white/80 w-full max-w-4xl h-[85vh] flex rounded-2xl border dark:border-white/10 pure-black:border-slate-800 border-black/10 shadow-2xl overflow-hidden backdrop-blur-2xl transition-colors duration-300 ${modalAnimationClass}`}
      >
        {/* Sidebar */}
        <div className='w-64 border-r dark:border-white/10 border-black/10 flex flex-col bg-slate-100/30 dark:bg-slate-950/30'>
          <div className='p-6 pb-2'>
            <h2 id={SETTINGS_MODAL_TITLE_ID} className='text-2xl font-bold dark:text-primary-400 text-primary-600 drop-shadow-sm'>
              {t.title}
            </h2>
          </div>
          <nav className='flex-1 overflow-y-auto p-4 space-y-2'>
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    isActive 
                      ? 'bg-primary-500/20 text-primary-700 dark:text-primary-300 font-bold shadow-sm' 
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon size={18} />
                  <span className='text-sm'>{tab.label}</span>
                  {isActive && <div className='absolute left-0 w-1 h-6 bg-primary-500 rounded-r-full' />}
                </button>
              );
            })}
          </nav>
          <div className='p-4 border-t dark:border-white/10 border-black/10'>
            <button onClick={onClose} className='w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-bold transition-all shadow-md active:scale-95'>
              <X size={18} />
              {t.save}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div ref={contentRef} className='flex-1 overflow-y-auto p-8 bg-transparent'>
          {activeTab === 'general' && (
            <GeneralTab
              t={t}
              localConfig={localConfig}
              updateConfig={updateConfig}
              historyMaxCountInput={historyMaxCountInput}
              onHistoryMaxCountInputChange={setHistoryMaxCountInput}
              onHistoryMaxCountCommit={handleHistoryMaxCountCommit}
              onHistoryMaxCountKeyDown={handleHistoryMaxCountKeyDown}
              checkStatus={checkStatus}
              updateUrl={updateUrl}
              onCheckNow={handleCheckNow}
              onShowTutorial={onShowTutorial}
              onRequestReset={() => setIsResetConfirmOpen(true)}
              onRequestHistoryClear={() => setIsHistoryClearConfirmOpen(true)}
              hasClearHistory={Boolean(onClearHistory)}
              updateUi={{
                updateAvailable,
                isDownloading,
                downloadProgress,
                downloadError,
                downloadedPath,
                startDownload,
                cancelDownload,
                installUpdate,
              }}
            />
          )}

          {activeTab === 'appearance' && (
            <AppearanceTab
              t={t}
              localConfig={localConfig}
              updateConfig={updateConfig}
              lastCustomAccentColor={lastCustomAccentColor}
              onAccentColorChange={handleAccentColorChange}
              onCustomAccentSelect={handleCustomAccentSelect}
            />
          )}

          {activeTab === 'connectivity' && (
            <ConnectivityTab
              t={t}
              localConfig={localConfig}
              oscPortInput={oscPortInput}
              onOscPortInputChange={setOscPortInput}
              onOscPortCommit={handleOscPortCommit}
              onOscPortKeyDown={handleOscPortKeyDown}
              steamVr={steamVr}
            />
          )}

          {activeTab === 'sound' && (
            <SoundTab t={t} localConfig={localConfig} updateConfig={updateConfig} />
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        onConfirm={handleResetConfig}
        title={t.resetConfirmTitle}
        message={t.resetConfirmMessage}
        confirmText={t.resetConfirmButton}
        cancelText={t.cancel}
        isDanger={true}
      />

      {onClearHistory && (
        <ConfirmDialog
          isOpen={isHistoryClearConfirmOpen}
          onClose={() => setIsHistoryClearConfirmOpen(false)}
          onConfirm={() => {
            onClearHistory();
            setIsHistoryClearConfirmOpen(false);
          }}
          title={t.historyClearConfirmTitle}
          message={t.historyClearConfirmMessage}
          confirmText={t.historyClearConfirmButton}
          cancelText={t.cancel}
          isDanger={true}
        />
      )}
    </div>
  );
};

export default SettingsModal;
