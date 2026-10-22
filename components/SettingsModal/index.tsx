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
  // 'panel' fills a window of its own instead of floating over the keyboard.
  // Used by the desktop settings window in VR mode, where the keyboard is
  // rendered offscreen and there is nothing to float over.
  // 'panel' はキーボードの上に浮かぶ代わりに、専用ウィンドウ全体を占める。
  // VRモードのデスクトップ設定ウィンドウが使う。キーボードはオフスクリーン描画
  // されており、浮かぶ相手が存在しないためである。
  variant?: 'modal' | 'panel';
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
  variant = 'modal',
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
  const isPanel = variant === 'panel';
  const animation = useModalAnimation(isOpen);
  // A panel owns its window, so it is always mounted and never animates in.
  // パネルは自身のウィンドウを占有するため、常にマウントされ、出現アニメーションも行わない。
  const shouldRender = isPanel ? true : animation.shouldRender;
  const animationClass = isPanel ? '' : animation.animationClass;
  const modalAnimationClass = isPanel ? '' : animation.modalAnimationClass;
  const { modalRef } = useModalFocusTrap(isOpen, shouldRender, onClose);
  // VR scroll forwarding only makes sense for the window the overlay captures.
  // VRスクロールの転送はオーバーレイがキャプチャするウィンドウでのみ意味を持つ。
  const { contentRef } = useOverlayScrollForward(!isPanel && isOpen);

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
      className={
        isPanel
          ? 'absolute inset-0 flex bg-canvas'
          : `fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 ${animationClass}`
      }
    >
      <div
        ref={modalRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby={SETTINGS_MODAL_TITLE_ID}
        tabIndex={-1}
        className={
          isPanel
            ? 'bg-canvas text-ink w-full h-full flex overflow-hidden'
            : `bg-canvas text-ink w-full max-w-4xl h-[85vh] flex rounded-[28px] pure-black:border pure-black:border-line overflow-hidden ${modalAnimationClass}`
        }
      >
        {/* Sidebar */}
        <div className='w-64 flex flex-col'>
          <div className='px-7 pt-7 pb-4'>
            <h2 id={SETTINGS_MODAL_TITLE_ID} className='text-2xl'>
              {t.title}
            </h2>
          </div>
          <nav className='flex-1 overflow-y-auto px-3 space-y-1'>
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-full text-sm ${
                    isActive ? 'bg-tonal text-on-tonal font-medium' : 'text-ink'
                  }`}
                >
                  <Icon size={20} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
          {/* Changes save as they are made, so closing is not a primary action. The
              panel has none: it is the settings window, whose title bar closes it and
              with it the app.
              変更は即座に保存されるので、閉じる操作は主ボタンにしない。panel には置かない。
              panel は設定ウィンドウそのもので、タイトルバーで閉じるとアプリも終了する。 */}
          {!isPanel && (
            <div className='p-4'>
              <button onClick={onClose} className='w-full flex items-center justify-center gap-2 px-4 py-3 border border-line text-ink rounded-full font-medium'>
                <X size={18} />
                {t.save}
              </button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div ref={contentRef} className='flex-1 overflow-y-auto my-3 mr-3 px-8 py-7 bg-key rounded-3xl pure-black:border pure-black:border-line'>
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
