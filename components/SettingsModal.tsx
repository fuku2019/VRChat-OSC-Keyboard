/**
 * Settings Modal - Application settings interface
 * 設定モーダル - アプリケーション設定インターフェース
 */

import { useState, useEffect, useRef, FC } from 'react';
import { X, CircleHelp } from 'lucide-react';
import { Language, UpdateCheckInterval } from '../types';
import { TRANSLATIONS, GITHUB } from '../constants';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { useConfigStore } from '../stores/configStore';
import packageJson from '../package.json';

// Import section components / セクションコンポーネントをインポート
import {
  LanguageSection,
  ThemeSection,
  AccentColorSection,
  OscPortSection,
  OverlaySection,
  UpdateCheckSection,
} from './settings';

const APP_VERSION = packageJson.version;

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowTutorial: () => void;
  onUpdateAvailable?: (version: string | null, url?: string) => void;
  updateAvailableVersion?: string;
}

const SettingsModal: FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onShowTutorial,
  onUpdateAvailable,
  updateAvailableVersion,
}) => {
  const config = useConfigStore((state) => state.config);
  const setConfig = useConfigStore((state) => state.setConfig);
  const [localConfig, setLocalConfig] = useState(config);
  const [checkStatus, setCheckStatus] = useState<string>(''); // For update check status / 更新確認ステータス用
  const [updateUrl, setUpdateUrl] = useState<string>(''); // Store update URL locally / 更新URLをローカルに保存
  const { shouldRender, animationClass, modalAnimationClass } =
    useModalAnimation(isOpen);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Sync local state when opening / 開くときにローカル状態を同期する
  useEffect(() => {
    if (isOpen) {
      setLocalConfig(config);
      // Initialize check status if update is already available from parent
      if (updateAvailableVersion) {
        setCheckStatus(
          TRANSLATIONS[
            config.language || 'ja'
          ].settings.updateAvailable.replace(
            '{version}',
            updateAvailableVersion,
          ),
        );
        setUpdateUrl(GITHUB.RELEASES_URL);
      } else {
        setCheckStatus('');
        setUpdateUrl('');
      }
    }
  }, [isOpen, config, updateAvailableVersion]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = ({ deltaY }: { deltaY: number }) => {
      const el = contentRef.current;
      if (!el) return;
      el.scrollBy({ top: deltaY, behavior: 'auto' });
    };
    if (window.electronAPI?.onInputScroll) {
      window.electronAPI.onInputScroll(handler);
    }
    return () => {
      if (window.electronAPI?.removeInputScrollListener) {
        window.electronAPI.removeInputScrollListener(handler);
      }
    };
  }, [isOpen]);

  if (!shouldRender) return null;

  // Use localConfig for translations to ensure immediate UI update within modal / モーダル内で即時UI更新を保証するために翻訳にlocalConfigを使用する
  const t = TRANSLATIONS[localConfig.language || 'ja'].settings;

  // Save config immediately / 設定を即時保存
  const saveConfigImmediately = (newConfig: typeof config) => {
    setLocalConfig(newConfig);
    setConfig(newConfig); // Store handles localStorage and Electron sync / ストアがlocalStorageとElectron同期を処理
  };

  const handleLanguageChange = (lang: Language) => {
    const newConfig = { ...localConfig, language: lang };
    saveConfigImmediately(newConfig);
  };

  const handleThemeChange = (theme: 'light' | 'dark' | 'pure-black') => {
    const newConfig = { ...localConfig, theme };
    saveConfigImmediately(newConfig);
  };

  const handleAccentColorChange = (color: string) => {
    const newConfig = { ...localConfig, accentColor: color };
    saveConfigImmediately(newConfig);
  };

  const handleOscPortChange = (value: string) => {
    const portNum = parseInt(value, 10);
    if (!isNaN(portNum) && portNum >= 1 && portNum <= 65535) {
      const newConfig = { ...localConfig, oscPort: portNum };
      saveConfigImmediately(newConfig);
    }
    // Allow empty for typing, but don't save / 入力中は空を許可するが保存しない
  };

  const handleIntervalChange = (interval: UpdateCheckInterval) => {
    const newConfig = { ...localConfig, updateCheckInterval: interval };
    saveConfigImmediately(newConfig);
  };

  const handleOffscreenCaptureToggle = (value: boolean) => {
    const newConfig = { ...localConfig, useOffscreenCapture: value };
    saveConfigImmediately(newConfig);
  };

  const handleForceOpaqueAlphaToggle = (value: boolean) => {
    const newConfig = { ...localConfig, forceOpaqueAlpha: value };
    saveConfigImmediately(newConfig);
  };

  return (
    <div
      className={`fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 ${animationClass}`}
    >
      <div
        className={`dark:bg-slate-800 pure-black:bg-black bg-white w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border dark:border-slate-600 pure-black:border-slate-800 border-slate-200 shadow-2xl overflow-hidden transition-colors duration-300 ${modalAnimationClass}`}
      >
        {/* Header / ヘッダー */}
        <div className='flex justify-between items-center p-6 border-b dark:border-slate-700 pure-black:border-slate-800 border-slate-200 dark:bg-slate-800 pure-black:bg-black bg-white transition-colors duration-300'>
          <h2 className='text-2xl font-bold dark:text-primary-400 text-primary-600'>
            {t.title}
          </h2>
          <button
            onClick={onClose}
            className='p-2 dark:hover:bg-slate-700 hover:bg-slate-100 rounded-full dark:text-slate-400 text-slate-500 dark:hover:text-[rgb(var(--rgb-on-primary))] hover:text-slate-900 transition-colors'
          >
            <X size={24} />
          </button>
        </div>

        {/* Content / コンテンツ */}
        <div ref={contentRef} className='flex-1 overflow-y-auto p-6 space-y-8'>
          <LanguageSection
            localConfig={localConfig}
            t={t}
            onLanguageChange={handleLanguageChange}
          />

          <ThemeSection
            localConfig={localConfig}
            t={t}
            onThemeChange={handleThemeChange}
          />

          <AccentColorSection
            localConfig={localConfig}
            t={t}
            onAccentColorChange={handleAccentColorChange}
          />

          {/* Tutorial Trigger / チュートリアル表示 */}
          <section className='pt-4 border-t dark:border-slate-700/50 border-slate-200'>
            <button
              onClick={onShowTutorial}
              className='w-full flex items-center justify-between p-4 dark:bg-slate-700/30 bg-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded-xl border dark:border-slate-600/50 border-slate-200 dark:text-slate-300 text-slate-700 dark:hover:text-[rgb(var(--rgb-on-primary))] hover:text-slate-900 transition-all group'
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

          <OscPortSection
            localConfig={localConfig}
            t={t}
            onOscPortChange={handleOscPortChange}
          />

          <OverlaySection
            localConfig={localConfig}
            t={t}
            onToggleOffscreenCapture={handleOffscreenCaptureToggle}
            onToggleForceOpaqueAlpha={handleForceOpaqueAlphaToggle}
          />

          <UpdateCheckSection
            localConfig={localConfig}
            t={t}
            checkStatus={checkStatus}
            updateUrl={updateUrl}
            onIntervalChange={handleIntervalChange}
            onCheckNow={() => {}} // Handled inside component / コンポーネント内で処理
            setCheckStatus={setCheckStatus}
            setUpdateUrl={setUpdateUrl}
            onUpdateAvailable={onUpdateAvailable}
          />

          {/* Version Info / バージョン情報 */}
          <section className='text-center'>
            <p className='text-xs text-slate-500'>Version: v{APP_VERSION}</p>
          </section>
        </div>

        {/* Footer / フッター */}
        <div className='p-6 border-t dark:border-slate-700 pure-black:border-slate-800 border-slate-200 dark:bg-slate-800/50 pure-black:bg-black bg-slate-50 transition-colors duration-300'>
          <button
            onClick={onClose}
            className='flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-[rgb(var(--rgb-on-primary))] px-8 py-4 rounded-xl font-bold shadow-lg shadow-primary-900/30 active:scale-95 transition-all w-full justify-center'
          >
            <X size={20} />
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
