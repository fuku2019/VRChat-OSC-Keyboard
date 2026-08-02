/**
 * Settings Modal - Application settings interface
 * 設定モーダル - アプリケーション設定インターフェース
 */

import { useState, useEffect, useRef, useCallback, FC } from 'react';
import { X, CircleHelp, Info, Settings, Palette, Link, Volume2 } from 'lucide-react';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { KeySoundVariant, Language, UpdateCheckInterval } from '../types';
import { TRANSLATIONS, GITHUB, STORAGE_KEYS } from '../constants';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { useConfigStore } from '../stores/configStore';
import {
  isPresetAccentColor,
  isValidCustomAccentColor,
  normalizeCustomAccentColor,
} from '../utils/colorUtils';
import { reloadWindow } from '../utils/windowUtils';
import packageJson from '../package.json';
import { ConfirmDialog } from './ConfirmDialog';
import { UpdateInfo } from '../hooks/useUpdateChecker';

const APP_VERSION = packageJson.version;
const DEFAULT_CUSTOM_ACCENT_COLOR = '#ff0000';
const SETTINGS_MODAL_TITLE_ID = 'settings-modal-title';

// Shared CSS class constants / 共通CSSクラス定数
const SECTION_LABEL_CLASS = 'block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider';
const BTN_ACTIVE_CLASS = 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]';
const BTN_INACTIVE_CLASS = 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500';
const selectedBtnClass = (active: boolean) =>
  `flex-1 py-3 px-4 rounded-xl border transition-all ${active ? BTN_ACTIVE_CLASS : BTN_INACTIVE_CLASS}`;

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
}

// Shared label + description UI / 共通ラベル+説明文UI
const SettingLabel: FC<{ label: string; description: string }> = ({ label, description }) => (
  <div className='flex-1'>
    <p className='text-sm font-semibold dark:text-slate-200 text-slate-700'>{label}</p>
    <p className='text-xs text-slate-500 mt-1 flex items-start gap-2'>
      <Info size={14} className='text-slate-400 mt-0.5 flex-shrink-0' />
      <span>{description}</span>
    </p>
  </div>
);

const ToggleRow: FC<{
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  enabledText?: string;
  disabledText?: string;
}> = ({ label, description, enabled, onToggle, enabledText, disabledText }) => (
  <div className='flex items-center justify-between gap-4'>
    <SettingLabel label={label} description={description} />
    <button
      type='button'
      onClick={() => onToggle(!enabled)}
      aria-pressed={enabled}
      aria-label={enabled ? enabledText || label : disabledText || label}
      className={`relative inline-flex h-8 w-14 items-center rounded-full border transition-colors ${
        enabled
          ? 'bg-primary-500/80 border-primary-500'
          : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
      }`}
    >
      {(enabledText || disabledText) && (
        <span className='absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white pointer-events-none'>
          {enabled ? enabledText : disabledText}
        </span>
      )}
      <span
        className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

const TextSwitchRow: FC<{
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  enabledText: string;
  disabledText: string;
}> = ({ label, description, enabled, onToggle, enabledText, disabledText }) => (
  <div className='flex items-center justify-between gap-4'>
    <SettingLabel label={label} description={description} />
    <button
      type='button'
      onClick={() => onToggle(!enabled)}
      aria-pressed={enabled}
      aria-label={enabled ? enabledText : disabledText}
      className={`px-3 py-2 rounded-lg text-xs font-semibold border min-w-[92px] transition-colors ${
        enabled
          ? 'bg-primary-600 hover:bg-primary-500 border-primary-600 text-[rgb(var(--rgb-on-primary))]'
          : 'dark:bg-slate-700/40 bg-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600/60 dark:border-slate-500 border-slate-300 dark:text-slate-200 text-slate-700'
      }`}
    >
      {enabled ? enabledText : disabledText}
    </button>
  </div>
);

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
}) => {
  const config = useConfigStore((state) => state.config);
  const setConfig = useConfigStore((state) => state.setConfig);
  const [localConfig, setLocalConfig] = useState(config);
  const [oscPortInput, setOscPortInput] = useState(String(config.oscPort));
  const [checkStatus, setCheckStatus] = useState<string>('');
  const [updateUrl, setUpdateUrl] = useState<string>('');
  const { shouldRender, animationClass, modalAnimationClass } =
    useModalAnimation(isOpen);

  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const delayedRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const wasOpenRef = useRef(false);

  const [toggleBindings, setToggleBindings] = useState<string[]>([]);
  const [triggerBindings, setTriggerBindings] = useState<string[]>([]);
  const [gripBindings, setGripBindings] = useState<string[]>([]);
  const [initialized, setInitialized] = useState<boolean>(false);
  const [loadingBindings, setLoadingBindings] = useState<boolean>(false);
  const [bindingError, setBindingError] = useState<string>('');
  const [triggerBound, setTriggerBound] = useState<boolean>(false);
  const [gripBound, setGripBound] = useState<boolean>(false);
  const [steamVrAutoLaunchError, setSteamVrAutoLaunchError] = useState<string>('');
  const [lastCustomAccentColor, setLastCustomAccentColor] = useState<string>(
    DEFAULT_CUSTOM_ACCENT_COLOR,
  );
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'connectivity' | 'sound'>('general');

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Sync local state when opening / 開くときにローカル状態を同期する
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setLocalConfig(config);
      setOscPortInput(String(config.oscPort));
      setSteamVrAutoLaunchError('');
      if (
        !isPresetAccentColor(config.accentColor) &&
        isValidCustomAccentColor(config.accentColor)
      ) {
        setLastCustomAccentColor(normalizeCustomAccentColor(config.accentColor));
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, config]);

  useEffect(() => {
    if (!isOpen) return;
    if (updateAvailable?.version) {
      const language = localConfig.language || 'ja';
      setCheckStatus(
        TRANSLATIONS[language].settings.updateAvailable.replace(
          '{version}',
          updateAvailable.version,
        ),
      );
      setUpdateUrl(updateAvailable.url || GITHUB.RELEASES_URL);
      return;
    }
    setCheckStatus('');
    setUpdateUrl('');
  }, [isOpen, localConfig.language, updateAvailable]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (payload?: { deltaY?: number } | number) => {
      const deltaY =
        typeof payload === 'number'
          ? payload
          : typeof payload?.deltaY === 'number'
            ? payload.deltaY
            : 0;
      if (!deltaY) return;
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

  useEffect(() => {
    if (isOpen) return;
    if (delayedRefreshTimerRef.current) {
      clearTimeout(delayedRefreshTimerRef.current);
      delayedRefreshTimerRef.current = null;
    }
    // Cleanup on unmount / アンマウント時のクリーンアップ
    return () => {
      if (delayedRefreshTimerRef.current) {
        clearTimeout(delayedRefreshTimerRef.current);
        delayedRefreshTimerRef.current = null;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !shouldRender) return;
    const modalElement = modalRef.current;
    if (!modalElement) return;

    previousFocusedElementRef.current = document.activeElement as HTMLElement | null;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusableElements = () =>
      Array.from(modalElement.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute('aria-hidden'),
      );

    const focusableElements = getFocusableElements();
    (focusableElements[0] || modalElement).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const currentFocusableElements = getFocusableElements();
      if (currentFocusableElements.length === 0) {
        event.preventDefault();
        modalElement.focus();
        return;
      }

      const firstElement = currentFocusableElements[0];
      const lastElement = currentFocusableElements[currentFocusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstElement || !modalElement.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    modalElement.addEventListener('keydown', handleKeyDown);
    return () => {
      modalElement.removeEventListener('keydown', handleKeyDown);
      if (previousFocusedElementRef.current) {
        previousFocusedElementRef.current.focus();
        previousFocusedElementRef.current = null;
      }
    };
  }, [isOpen, shouldRender]);

  const t = TRANSLATIONS[localConfig.language || 'ja'].settings;
  const getLocalizedSteamVrBindingsError = () => t.steamVrBindingsUnavailable;

  const saveConfigImmediately = (
    update: (currentConfig: typeof localConfig) => typeof localConfig,
  ) => {
    setLocalConfig((currentConfig) => {
      const nextConfig = update(currentConfig);
      if (nextConfig === currentConfig) return currentConfig;
      setConfig(nextConfig);
      return nextConfig;
    });
  };

  // Generic single-field config updater / 汎用単一フィールド設定更新
  const updateConfig = <K extends keyof typeof localConfig>(key: K, value: (typeof localConfig)[K]) => {
    saveConfigImmediately((c) => (c[key] === value ? c : { ...c, [key]: value }));
  };

  // Handle language change / 言語変更の処理
  const handleLanguageChange = (lang: Language) => updateConfig('language', lang);
  // Handle theme change / テーマ変更の処理
  const handleThemeChange = (theme: 'light' | 'dark' | 'pure-black') => updateConfig('theme', theme);
  // Handle interval change / 更新間隔変更の処理
  const handleIntervalChange = (interval: UpdateCheckInterval) => updateConfig('updateCheckInterval', interval);

  // Handle accent color change / アクセントカラー変更の処理
  const handleAccentColorChange = (color: string) => {
    if (color === 'cyan' || color === 'purple') {
      updateConfig('accentColor', color);
      return;
    }
    if (!isValidCustomAccentColor(color)) return;
    const normalizedColor = normalizeCustomAccentColor(color);
    setLastCustomAccentColor(normalizedColor);
    updateConfig('accentColor', normalizedColor);
  };

  const handleCustomAccentSelect = () => {
    if (!isPresetAccentColor(localConfig.accentColor)) return;
    handleAccentColorChange(lastCustomAccentColor);
  };

  // Handle OSC port commit / OSCポート変更の確定処理
  const handleOscPortCommit = () => {
    const trimmedValue = oscPortInput.trim();
    const portNum = parseInt(trimmedValue, 10);
    if (!isNaN(portNum) && portNum >= 1 && portNum <= 65535) {
      if (portNum !== localConfig.oscPort) {
        updateConfig('oscPort', portNum);
      } else {
        setOscPortInput(String(localConfig.oscPort));
      }
      return;
    }
    // Revert invalid input back to current config value / 無効な入力は現在の設定値に戻す
    setOscPortInput(String(localConfig.oscPort));
  };

  const handleOscPortKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleOscPortCommit();
      e.currentTarget.blur();
    }
  };

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
            installerUrl: result.installerUrl
          }),
        );
        if (onUpdateAvailable && result.latestVersion) {
          onUpdateAvailable(
            result.latestVersion,
            url,
            result.isInstaller,
            result.installerUrl
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

  const handleToggleDisableOverlay = (value: boolean) => updateConfig('disableOverlay', value);
  const handleToggleKeySound = (value: boolean) => updateConfig('keySoundEnabled', value);
  const handleKeySoundVariantChange = (variant: KeySoundVariant) =>
    updateConfig('keySoundVariant', variant);

  const handleToggleSteamVrAutoLaunch = async (value: boolean) => {
    if (!window.electronAPI?.setSteamVrAutoLaunch) {
      setSteamVrAutoLaunchError(t.steamVrAutoLaunchError);
      return;
    }
    try {
      const result = await window.electronAPI.setSteamVrAutoLaunch(value);
      if (!result?.success) {
        setSteamVrAutoLaunchError(result?.error || t.steamVrAutoLaunchError);
        return;
      }
      setSteamVrAutoLaunchError('');
      updateConfig('steamVrAutoLaunch', value);
    } catch (e) {
      setSteamVrAutoLaunchError((e as Error)?.message || t.steamVrAutoLaunchError);
    }
  };

  useEffect(() => {
    if (!isOpen || !window.electronAPI?.getSteamVrAutoLaunch) return;
    const syncSteamVrAutoLaunch = async () => {
      try {
        const result = await window.electronAPI!.getSteamVrAutoLaunch();
        if (!result?.success || typeof result.enabled !== 'boolean') return;
        updateConfig('steamVrAutoLaunch', result.enabled);
      } catch {
        // no-op: this sync is best-effort only / この同期はベストエフォート
      }
    };
    void syncSteamVrAutoLaunch();
  }, [isOpen]);

  // Reset all binding states / バインディング状態を全てリセット
  const resetBindings = () => {
    setInitialized(false);
    setToggleBindings([]);
    setTriggerBindings([]);
    setGripBindings([]);
    setTriggerBound(false);
    setGripBound(false);
  };

  const loadBindings = useCallback(async () => {
    if (!window.electronAPI?.getSteamVrBindings) {
      resetBindings();
      return;
    }

    setLoadingBindings(true);
    setBindingError('');

    try {
      const result = await window.electronAPI.getSteamVrBindings();
      if (!result?.success || !result.bindings) {
        resetBindings();
        setBindingError(getLocalizedSteamVrBindingsError());
        return;
      }

      const toStringArray = (value: unknown): string[] => {
        if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
        if (typeof value === 'string' && value.length > 0) return [value];
        return [];
      };

      setInitialized(Boolean(result.bindings.initialized));
      setToggleBindings(toStringArray(result.bindings.toggleOverlay));
      setTriggerBindings(toStringArray(result.bindings.triggerBindings));
      setGripBindings(toStringArray(result.bindings.gripBindings));
      setTriggerBound(Boolean(result.bindings.triggerBound));
      setGripBound(Boolean(result.bindings.gripBound));
    } catch {
      resetBindings();
      setBindingError(getLocalizedSteamVrBindingsError());
    } finally {
      setLoadingBindings(false);
    }
  }, [t.steamVrBindingsUnavailable]);

  useEffect(() => {
    if (!isOpen) return;
    void loadBindings();
  }, [isOpen, loadBindings]);

  const handleOpenBindingUi = async () => {
    if (!window.electronAPI?.openSteamVrBindingUi) return;
    setBindingError('');

    try {
      const result = await window.electronAPI.openSteamVrBindingUi();
      if (!result?.success) {
        setBindingError(getLocalizedSteamVrBindingsError());
        return;
      }

      await loadBindings();
      if (delayedRefreshTimerRef.current) {
        clearTimeout(delayedRefreshTimerRef.current);
      }
      delayedRefreshTimerRef.current = setTimeout(() => {
        delayedRefreshTimerRef.current = null;
        void loadBindings();
      }, 1500);
    } catch {
      setBindingError(getLocalizedSteamVrBindingsError());
    }
  };

  const formatBindings = (entries: string[]) => {
    if (!entries || entries.length === 0) {
      return t.steamVrBindingsEmpty;
    }
    return entries.join(', ');
  };

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

  const isCustomAccentSelected = !isPresetAccentColor(localConfig.accentColor);
  const customAccentColor = isCustomAccentSelected
    ? isValidCustomAccentColor(localConfig.accentColor)
      ? normalizeCustomAccentColor(localConfig.accentColor)
      : lastCustomAccentColor
    : lastCustomAccentColor;

  const TABS = [
    { id: 'general', label: 'General / 一般', icon: Settings },
    { id: 'appearance', label: 'Appearance / 外観', icon: Palette },
    { id: 'connectivity', label: 'Connectivity / 接続', icon: Link },
    { id: 'sound', label: 'Sound / サウンド', icon: Volume2 },
  ] as const;

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
            <div className='space-y-8 animate-fade-in'>
              <section>
                <label className={SECTION_LABEL_CLASS}>{t.language}</label>
                <div className='flex gap-2'>
                  <button onClick={() => handleLanguageChange('ja')} className={selectedBtnClass(localConfig.language === 'ja')}>日本語</button>
                  <button onClick={() => handleLanguageChange('en')} className={selectedBtnClass(localConfig.language === 'en')}>English</button>
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
                      onClick={() => handleIntervalChange(option.id)}
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
                        onClick={handleCheckNow}
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
                    onClick={() => setIsResetConfirmOpen(true)}
                    className='whitespace-nowrap px-4 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-xs sm:text-sm font-bold transition-colors'
                  >
                    {t.resetButton}
                  </button>
                </div>
              </section>
              
              <section className='text-center pt-8 opacity-60'>
                <p className='text-xs text-slate-500 font-mono'>v{APP_VERSION}</p>
              </section>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className='space-y-8 animate-fade-in'>
              <section>
                <label className={SECTION_LABEL_CLASS}>{t.theme}</label>
                <div className='flex gap-2'>
                  <button onClick={() => handleThemeChange('pure-black')} className={selectedBtnClass(localConfig.theme === 'pure-black')}>{t.themePureBlack}</button>
                  <button onClick={() => handleThemeChange('dark')} className={selectedBtnClass(localConfig.theme === 'dark')}>{t.themeDark}</button>
                  <button onClick={() => handleThemeChange('light')} className={selectedBtnClass(localConfig.theme === 'light')}>{t.themeLight}</button>
                </div>
              </section>

              <section className='pt-6 border-t dark:border-white/10 border-black/10'>
                <label className={SECTION_LABEL_CLASS}>{t.accentColor}</label>
                <div className='flex gap-2'>
                  <button onClick={() => handleAccentColorChange('cyan')} className={`${selectedBtnClass(localConfig.accentColor === 'cyan' || !localConfig.accentColor)} flex items-center justify-center gap-2`}>
                    <div className='w-4 h-4 rounded-full bg-[#06b6d4] shadow-sm' />
                    <span className='text-xs md:text-sm whitespace-nowrap'>{t.accentColorCyan}</span>
                  </button>
                  <button onClick={() => handleAccentColorChange('purple')} className={`${selectedBtnClass(localConfig.accentColor === 'purple')} flex items-center justify-center gap-2`}>
                    <div className='w-4 h-4 rounded-full bg-[#a855f7] shadow-sm' />
                    <span className='text-xs md:text-sm whitespace-nowrap'>{t.accentColorPurple}</span>
                  </button>
                  <button type='button' onClick={handleCustomAccentSelect} className={`${selectedBtnClass(isCustomAccentSelected)} flex items-center justify-center gap-2`}>
                    <div className='w-4 h-4 rounded-full border border-slate-300 dark:border-slate-500 shadow-sm' style={{ background: customAccentColor }} />
                    <span className='text-xs md:text-sm whitespace-nowrap'>{t.accentColorCustom}</span>
                  </button>
                </div>

                {isCustomAccentSelected && (
                  <div className='mt-4 p-4 rounded-xl border dark:border-white/10 border-black/10 dark:bg-slate-900/50 bg-white/50 backdrop-blur-md space-y-4 shadow-sm'>
                    <HexColorPicker
                      color={customAccentColor}
                      onChange={handleAccentColorChange}
                      className='settings-accent-picker !w-full !h-48'
                    />
                    <div className='flex items-center gap-3'>
                      <span className='text-xs font-semibold dark:text-slate-400 text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded-md'>
                        HEX
                      </span>
                      <HexColorInput
                        color={customAccentColor}
                        prefixed
                        onChange={handleAccentColorChange}
                        className='flex-1 dark:bg-slate-950/80 bg-white border dark:border-white/10 border-black/10 rounded-lg px-3 py-2 text-sm font-mono dark:text-slate-100 text-slate-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none transition-all shadow-inner'
                        aria-label='custom-accent-color-input'
                      />
                    </div>
                  </div>
                )}
              </section>

              <section className='pt-6 border-t dark:border-white/10 border-black/10'>
                <label className={`${SECTION_LABEL_CLASS} !mb-2`}>{t.overlayTitle}</label>
                <div className='p-4 rounded-xl border dark:border-white/10 border-black/10 dark:bg-slate-800/30 bg-white/50 shadow-sm'>
                  <ToggleRow
                    label={t.disableOverlay}
                    description={t.disableOverlayDesc}
                    enabled={localConfig.disableOverlay}
                    onToggle={handleToggleDisableOverlay}
                  />
                </div>
              </section>
            </div>
          )}

          {activeTab === 'connectivity' && (
            <div className='space-y-8 animate-fade-in'>
              <section>
                <label className={SECTION_LABEL_CLASS}>{t.oscPort}</label>
                <div className='relative group'>
                  <input
                    type='number'
                    min={1}
                    max={65535}
                    value={oscPortInput}
                    onChange={(e) => setOscPortInput(e.target.value)}
                    onBlur={handleOscPortCommit}
                    onKeyDown={handleOscPortKeyDown}
                    className='w-full dark:bg-slate-950/60 bg-white/80 border dark:border-white/10 border-black/10 rounded-xl p-4 dark:text-white text-slate-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none font-mono text-lg transition-all shadow-inner'
                    placeholder='9000'
                  />
                </div>
                <p className='text-xs text-slate-500 mt-3 flex items-start gap-2 px-1 whitespace-pre-line'>
                  <Info size={14} className='text-slate-400 mt-0.5 flex-shrink-0' />
                  <span>{t.oscPortDesc}</span>
                </p>
              </section>

              <section className='pt-6 border-t dark:border-white/10 border-black/10 space-y-4'>
                <label className={`${SECTION_LABEL_CLASS} !mb-2`}>SteamVR Integration</label>
                
                <div className='p-4 rounded-xl border dark:border-white/10 border-black/10 dark:bg-slate-800/30 bg-white/50 shadow-sm'>
                  <TextSwitchRow
                    label={t.steamVrAutoLaunch}
                    description={t.steamVrAutoLaunchDesc}
                    enabled={localConfig.steamVrAutoLaunch}
                    onToggle={(value) => void handleToggleSteamVrAutoLaunch(value)}
                    enabledText={t.steamVrUnregisterLabel}
                    disabledText={t.steamVrRegisterLabel}
                  />
                  {steamVrAutoLaunchError && (
                    <p className='text-xs text-red-400 mt-2 px-1'>{steamVrAutoLaunchError}</p>
                  )}
                </div>

                <div className='rounded-xl border dark:border-white/10 border-black/10 p-5 space-y-4 dark:bg-slate-800/30 bg-white/50 shadow-sm'>
                  <div className='flex items-center gap-2 mb-2'>
                    <div className='w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500'>
                      <Info size={16} />
                    </div>
                    <p className='text-sm font-bold dark:text-slate-200 text-slate-800'>
                      {t.steamVrBindingsTitle}
                    </p>
                  </div>
                  
                  <div className='text-xs dark:text-slate-400 text-slate-600 bg-black/5 dark:bg-black/20 p-3 rounded-lg min-h-[4rem] font-mono'>
                    {loadingBindings ? (
                      <span className='animate-pulse'>{t.loading}</span>
                    ) : !initialized ? (
                      <span className='text-amber-500 dark:text-amber-400'>{bindingError || t.steamVrBindingsUnavailable}</span>
                    ) : (
                      <div className='space-y-2'>
                        <p className='flex items-center gap-2'>
                          <span className='font-semibold text-slate-500 dark:text-slate-300 w-20'>{t.steamVrBindingsToggleLabel}:</span>
                          <span className='text-primary-600 dark:text-primary-400'>{formatBindings(toggleBindings)}</span>
                        </p>
                        <p className='flex items-center gap-2'>
                          <span className='font-semibold text-slate-500 dark:text-slate-300 w-20'>{t.steamVrBindingsTriggerLabel}:</span>
                          <span className='text-primary-600 dark:text-primary-400'>{formatBindings(triggerBindings)}</span>
                        </p>
                        <p className='flex items-center gap-2'>
                          <span className='font-semibold text-slate-500 dark:text-slate-300 w-20'>{t.steamVrBindingsGripLabel}:</span>
                          <span className='text-primary-600 dark:text-primary-400'>{formatBindings(gripBindings)}</span>
                        </p>
                      </div>
                    )}
                  </div>

                  {bindingError && initialized && (
                    <p className='text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-md'>{bindingError}</p>
                  )}
                  {initialized && (!triggerBound || !gripBound) && (
                    <p className='text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-md'>
                      {t.steamVrBindingsMissingActions}
                    </p>
                  )}

                  <div className='flex flex-wrap gap-2 pt-2 border-t dark:border-white/10 border-black/10'>
                    <button
                      type='button'
                      onClick={() => void loadBindings()}
                      className='px-4 py-2 rounded-lg text-xs font-semibold border dark:border-white/20 border-black/20 dark:text-slate-200 text-slate-700 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors shadow-sm'
                    >
                      {t.steamVrBindingsRefresh}
                    </button>
                    <button
                      type='button'
                      onClick={() => void handleOpenBindingUi()}
                      className='px-4 py-2 rounded-lg text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white transition-colors shadow-sm'
                    >
                      {t.openSteamVrBindingUi}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'sound' && (
            <div className='space-y-8 animate-fade-in'>
              <section>
                <label className={`${SECTION_LABEL_CLASS} !mb-2`}>{t.keySoundTitle}</label>
                <div className='p-4 rounded-xl border dark:border-white/10 border-black/10 dark:bg-slate-800/30 bg-white/50 shadow-sm space-y-4'>
                  <ToggleRow
                    label={t.keySoundEnabled}
                    description={t.keySoundEnabledDesc}
                    enabled={localConfig.keySoundEnabled}
                    onToggle={handleToggleKeySound}
                  />
                  <div className='h-px w-full bg-black/5 dark:bg-white/5' />
                  <div className='flex items-center justify-between gap-4'>
                    <SettingLabel label={t.keySoundVariant} description={t.keySoundVariantDesc} />
                    <select
                      value={localConfig.keySoundVariant}
                      onChange={(e) =>
                        handleKeySoundVariantChange(e.target.value as KeySoundVariant)
                      }
                      disabled={!localConfig.keySoundEnabled}
                      className='min-w-[160px] px-3 py-2 rounded-lg text-sm border dark:bg-slate-900/80 bg-white/80 dark:border-white/10 border-black/10 dark:text-slate-100 text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-1 focus:ring-primary-500/50 outline-none transition-all shadow-inner'
                    >
                      <option value='soft'>{t.keySoundSoft}</option>
                      <option value='mechanical'>{t.keySoundMechanical}</option>
                    </select>
                  </div>
                </div>
              </section>
            </div>
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
    </div>
  );
};

export default SettingsModal;
