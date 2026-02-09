/**
 * Settings Modal - Application settings interface
 * 設定モーダル - アプリケーション設定インターフェース
 */

import { useState, useEffect, useRef, useCallback, FC } from 'react';
import { X, CircleHelp, Info } from 'lucide-react';
import { Language, UpdateCheckInterval } from '../types';
import { TRANSLATIONS, GITHUB, STORAGE_KEYS } from '../constants';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { useConfigStore } from '../stores/configStore';
import packageJson from '../package.json';
import { ConfirmDialog } from './ConfirmDialog';

const APP_VERSION = packageJson.version;

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowTutorial: () => void;
  onUpdateAvailable?: (version: string | null, url?: string) => void;
  updateAvailableVersion?: string;
}

const ToggleRow: FC<{
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  enabledText?: string;
  disabledText?: string;
}> = ({
  label,
  description,
  enabled,
  onToggle,
  enabledText,
  disabledText,
}) => {
  return (
    <div className='flex items-center justify-between gap-4'>
      <div className='flex-1'>
        <p className='text-sm font-semibold dark:text-slate-200 text-slate-700'>
          {label}
        </p>
        <p className='text-xs text-slate-500 mt-1 flex items-start gap-2'>
          <Info size={14} className='text-slate-400 mt-0.5 flex-shrink-0' />
          <span>{description}</span>
        </p>
      </div>
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
};

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
  const [oscPortInput, setOscPortInput] = useState(String(config.oscPort));
  const [checkStatus, setCheckStatus] = useState<string>('');
  const [updateUrl, setUpdateUrl] = useState<string>('');
  const { shouldRender, animationClass, modalAnimationClass } =
    useModalAnimation(isOpen);

  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const delayedRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [toggleBindings, setToggleBindings] = useState<string[]>([]);
  const [triggerBindings, setTriggerBindings] = useState<string[]>([]);
  const [gripBindings, setGripBindings] = useState<string[]>([]);
  const [initialized, setInitialized] = useState<boolean>(false);
  const [loadingBindings, setLoadingBindings] = useState<boolean>(false);
  const [bindingError, setBindingError] = useState<string>('');
  const [triggerBound, setTriggerBound] = useState<boolean>(false);
  const [gripBound, setGripBound] = useState<boolean>(false);
  const [steamVrAutoLaunchError, setSteamVrAutoLaunchError] = useState<string>('');

  // Sync local state when opening / 開くときにローカル状態を同期する
  useEffect(() => {
    if (isOpen) {
      setLocalConfig(config);
      setOscPortInput(String(config.oscPort));
      setSteamVrAutoLaunchError('');
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
    return () => {
      if (delayedRefreshTimerRef.current) {
        clearTimeout(delayedRefreshTimerRef.current);
        delayedRefreshTimerRef.current = null;
      }
    };
  }, []);

  const t = TRANSLATIONS[localConfig.language || 'ja'].settings;

  const saveConfigImmediately = (newConfig: typeof config) => {
    setLocalConfig(newConfig);
    setConfig(newConfig);
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

  const handleOscPortCommit = () => {
    const trimmedValue = oscPortInput.trim();
    const portNum = parseInt(trimmedValue, 10);
    if (!isNaN(portNum) && portNum >= 1 && portNum <= 65535) {
      if (portNum !== localConfig.oscPort) {
        const newConfig = { ...localConfig, oscPort: portNum };
        saveConfigImmediately(newConfig);
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

  const handleIntervalChange = (interval: UpdateCheckInterval) => {
    const newConfig = { ...localConfig, updateCheckInterval: interval };
    saveConfigImmediately(newConfig);
  };

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
          JSON.stringify({ version, url }),
        );
        if (onUpdateAvailable && result.latestVersion) {
          onUpdateAvailable(result.latestVersion, url);
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

  const handleToggleOffscreenCapture = (value: boolean) => {
    const newConfig = { ...localConfig, useOffscreenCapture: value };
    saveConfigImmediately(newConfig);
  };

  const handleToggleForceOpaqueAlpha = (value: boolean) => {
    const newConfig = { ...localConfig, forceOpaqueAlpha: value };
    saveConfigImmediately(newConfig);
  };

  const handleToggleDisableOverlay = (value: boolean) => {
    const newConfig = { ...localConfig, disableOverlay: value };
    saveConfigImmediately(newConfig);
  };

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
      const newConfig = { ...localConfig, steamVrAutoLaunch: value };
      saveConfigImmediately(newConfig);
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

        const currentConfig = useConfigStore.getState().config;
        if (result.enabled !== currentConfig.steamVrAutoLaunch) {
          const newConfig = { ...currentConfig, steamVrAutoLaunch: result.enabled };
          saveConfigImmediately(newConfig);
        }
      } catch {
        // no-op: this sync is best-effort only / この同期はベストエフォート
      }
    };

    void syncSteamVrAutoLaunch();
  }, [isOpen]);

  const loadBindings = useCallback(async () => {
    if (!window.electronAPI?.getSteamVrBindings) {
      setInitialized(false);
      setToggleBindings([]);
      setTriggerBindings([]);
      setGripBindings([]);
      setTriggerBound(false);
      setGripBound(false);
      return;
    }

    setLoadingBindings(true);
    setBindingError('');

    try {
      const result = await window.electronAPI.getSteamVrBindings();
      if (!result?.success || !result.bindings) {
        setInitialized(false);
        setToggleBindings([]);
        setTriggerBindings([]);
        setGripBindings([]);
        setTriggerBound(false);
        setGripBound(false);
        setBindingError(result?.error || t.steamVrBindingsUnavailable);
        return;
      }

      const toStringArray = (value: unknown): string[] => {
        if (Array.isArray(value)) {
          return value.filter((entry): entry is string => typeof entry === 'string');
        }
        if (typeof value === 'string' && value.length > 0) {
          return [value];
        }
        return [];
      };

      setInitialized(Boolean(result.bindings.initialized));
      setToggleBindings(toStringArray(result.bindings.toggleOverlay));
      setTriggerBindings(toStringArray(result.bindings.triggerBindings));
      setGripBindings(toStringArray(result.bindings.gripBindings));
      setTriggerBound(Boolean(result.bindings.triggerBound));
      setGripBound(Boolean(result.bindings.gripBound));
    } catch (e) {
      setInitialized(false);
      setToggleBindings([]);
      setTriggerBindings([]);
      setGripBindings([]);
      setTriggerBound(false);
      setGripBound(false);
      setBindingError((e as Error)?.message || t.steamVrBindingsUnavailable);
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
        setBindingError(result?.error || t.steamVrBindingsUnavailable);
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
    } catch (e) {
      setBindingError((e as Error)?.message || t.steamVrBindingsUnavailable);
    }
  };

  const formatBindings = (entries: string[]) => {
    if (!entries || entries.length === 0) {
      return t.steamVrBindingsEmpty;
    }
    return entries.join(', ');
  };

  const handleResetConfig = () => {
    localStorage.clear();
    window.location.reload();
  };

  if (!shouldRender) return null;

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
          <section>
            <label className='block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider'>
              {t.language}
            </label>
            <div className='flex gap-2'>
              <button
                onClick={() => handleLanguageChange('ja')}
                className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.language === 'ja' ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]' : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
              >
                日本語
              </button>
              <button
                onClick={() => handleLanguageChange('en')}
                className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.language === 'en' ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]' : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
              >
                English
              </button>
            </div>
          </section>

          <section>
            <label className='block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider'>
              {t.theme}
            </label>
            <div className='flex gap-2'>
              <button
                onClick={() => handleThemeChange('pure-black')}
                className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.theme === 'pure-black' ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]' : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
              >
                {t.themePureBlack}
              </button>
              <button
                onClick={() => handleThemeChange('dark')}
                className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.theme === 'dark' ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]' : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
              >
                {t.themeDark}
              </button>
              <button
                onClick={() => handleThemeChange('light')}
                className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.theme === 'light' ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]' : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
              >
                {t.themeLight}
              </button>
            </div>
          </section>

          <section className='pt-4 border-t dark:border-slate-700/50 border-slate-200'>
            <label className='block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider'>
              {t.accentColor}
            </label>
            <div className='flex gap-2'>
              <button
                onClick={() => handleAccentColorChange('cyan')}
                className={`flex-1 py-3 px-4 rounded-xl border transition-all flex items-center justify-center gap-2 ${
                  localConfig.accentColor === 'cyan' || !localConfig.accentColor
                    ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]'
                    : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'
                }`}
              >
                <div className='w-3 h-3 rounded-full bg-[#06b6d4]' />
                <span className='text-xs md:text-sm whitespace-nowrap'>
                  {t.accentColorCyan}
                </span>
              </button>
              <button
                onClick={() => handleAccentColorChange('purple')}
                className={`flex-1 py-3 px-4 rounded-xl border transition-all flex items-center justify-center gap-2 ${
                  localConfig.accentColor === 'purple'
                    ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]'
                    : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'
                }`}
              >
                <div className='w-3 h-3 rounded-full bg-[#a855f7]' />
                <span className='text-xs md:text-sm whitespace-nowrap'>
                  {t.accentColorPurple}
                </span>
              </button>

              <div className='flex-1 relative'>
                <input
                  id='custom-color-picker'
                  type='color'
                  className='absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10'
                  onChange={(e) => handleAccentColorChange(e.target.value)}
                  value={
                    localConfig.accentColor !== 'cyan' &&
                    localConfig.accentColor !== 'purple'
                      ? localConfig.accentColor
                      : '#ff0000'
                  }
                />
                <div
                  className={`w-full h-full py-3 px-4 rounded-xl border transition-all flex items-center justify-center gap-2 ${
                    localConfig.accentColor &&
                    localConfig.accentColor !== 'cyan' &&
                    localConfig.accentColor !== 'purple'
                      ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]'
                      : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'
                  }`}
                >
                  <div
                    className='w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600'
                    style={{
                      background:
                        localConfig.accentColor !== 'cyan' &&
                        localConfig.accentColor !== 'purple'
                          ? localConfig.accentColor
                          : 'linear-gradient(135deg, #f00, #0f0, #00f)',
                    }}
                  />
                  <span className='text-xs md:text-sm whitespace-nowrap'>
                    {t.accentColorCustom}
                  </span>
                </div>
              </div>
            </div>
          </section>

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

          <section className='pt-4 border-t dark:border-slate-700/50 border-slate-200'>
            <label className='block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider'>
              {t.oscPort}
            </label>
            <div className='relative group'>
              <input
                type='number'
                min={1}
                max={65535}
                value={oscPortInput}
                onChange={(e) => setOscPortInput(e.target.value)}
                onBlur={handleOscPortCommit}
                onKeyDown={handleOscPortKeyDown}
                className='w-full dark:bg-slate-900 bg-slate-50 border dark:border-slate-700 border-slate-300 rounded-xl p-4 dark:text-white text-slate-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none font-mono text-sm transition-all'
                placeholder='9000'
              />
            </div>
            <p className='text-xs text-slate-500 mt-3 flex items-start gap-2 px-1 whitespace-pre-line'>
              <Info size={14} className='text-slate-400 mt-0.5 flex-shrink-0' />
              <span>{t.oscPortDesc}</span>
            </p>
          </section>

          <section className='pt-4 border-t dark:border-slate-700/50 border-slate-200 space-y-5'>
            <label className='block dark:text-slate-300 text-slate-600 mb-1 text-sm font-semibold uppercase tracking-wider'>
              {t.overlayTitle}
            </label>
            <ToggleRow
              label={t.disableOverlay}
              description={t.disableOverlayDesc}
              enabled={localConfig.disableOverlay}
              onToggle={handleToggleDisableOverlay}
            />
            <ToggleRow
              label={t.steamVrAutoLaunch}
              description={t.steamVrAutoLaunchDesc}
              enabled={localConfig.steamVrAutoLaunch}
              onToggle={(value) => void handleToggleSteamVrAutoLaunch(value)}
              enabledText={t.steamVrUnregisterLabel}
              disabledText={t.steamVrRegisterLabel}
            />
            {steamVrAutoLaunchError && (
              <p className='text-xs text-red-400'>{steamVrAutoLaunchError}</p>
            )}
            <ToggleRow
              label={t.offscreenCapture}
              description={t.offscreenCaptureDesc}
              enabled={localConfig.useOffscreenCapture}
              onToggle={handleToggleOffscreenCapture}
            />
            <ToggleRow
              label={t.forceOpaqueAlpha}
              description={t.forceOpaqueAlphaDesc}
              enabled={localConfig.forceOpaqueAlpha}
              onToggle={handleToggleForceOpaqueAlpha}
            />

            <div className='rounded-xl border dark:border-slate-600/60 border-slate-200 p-4 space-y-3 dark:bg-slate-700/20 bg-slate-50'>
              <p className='text-sm font-semibold dark:text-slate-200 text-slate-700'>
                {t.steamVrBindingsTitle}
              </p>
              <div className='text-xs text-slate-500 min-h-5'>
                {loadingBindings ? (
                  <span>Loading...</span>
                ) : !initialized ? (
                  <span>{bindingError || t.steamVrBindingsUnavailable}</span>
                ) : (
                  <div className='space-y-1'>
                    <p>
                      <span className='font-semibold'>Toggle:</span>{' '}
                      {formatBindings(toggleBindings)}
                    </p>
                    <p>
                      <span className='font-semibold'>Trigger:</span>{' '}
                      {formatBindings(triggerBindings)}
                    </p>
                    <p>
                      <span className='font-semibold'>Grip:</span>{' '}
                      {formatBindings(gripBindings)}
                    </p>
                  </div>
                )}
              </div>

              {bindingError && initialized && (
                <p className='text-xs text-red-400'>{bindingError}</p>
              )}
              {initialized && (!triggerBound || !gripBound) && (
                <p className='text-xs text-amber-400'>
                  {t.steamVrBindingsMissingActions}
                </p>
              )}

              <div className='flex flex-wrap gap-2'>
                <button
                  type='button'
                  onClick={() => void loadBindings()}
                  className='px-3 py-2 rounded-lg text-xs font-semibold border dark:border-slate-500 border-slate-300 dark:text-slate-200 text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600/60 transition-colors'
                >
                  {t.steamVrBindingsRefresh}
                </button>
                <button
                  type='button'
                  onClick={() => void handleOpenBindingUi()}
                  className='px-3 py-2 rounded-lg text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-[rgb(var(--rgb-on-primary))] transition-colors'
                >
                  {t.openSteamVrBindingUi}
                </button>
              </div>
            </div>
          </section>

          <section className='pt-4 border-t dark:border-slate-700/50 border-slate-200'>
            <label className='block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider'>
              {t.checkInterval}
            </label>
            <div className='bg-gray-100 dark:bg-slate-900 rounded-xl p-1 mb-3 flex gap-1 overflow-x-auto'>
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

          {/* Version Info / バージョン情報 */}
          <section className='text-center'>
            <p className='text-xs text-slate-500'>Version: v{APP_VERSION}</p>
          </section>

          {/* Reset Settings / 設定リセット */}
          <section className='pt-6 border-t dark:border-slate-700/50 border-slate-200'>
            <h3 className='text-sm font-bold text-slate-900 dark:text-slate-100 mb-2'>
              {t.resetTitle}
            </h3>
            <div className='flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30'>
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
