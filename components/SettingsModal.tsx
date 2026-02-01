import { useState, useEffect, FC } from 'react';
import { X, Info, CircleHelp } from 'lucide-react';
import { Language } from '../types';
import { TRANSLATIONS, STORAGE_KEYS } from '../constants';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { useConfigStore } from '../stores/configStore';
import packageJson from '../package.json';

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
        setUpdateUrl('https://github.com/fuku2019/VRC-OSC-Keyboard/releases');
      } else {
        setCheckStatus('');
        setUpdateUrl('');
      }
    }
  }, [isOpen, config, updateAvailableVersion]);

  if (!shouldRender) return null;

  // Use localConfig for translations to ensure immediate UI update within modal / モーダル内で即時UI更新を保証するために翻訳にlocalConfigを使用する
  const t = TRANSLATIONS[localConfig.language || 'ja'].settings;

  // Save config immediately / 設定を即時保存
  const saveConfigImmediately = (newConfig: typeof config) => {
    setLocalConfig(newConfig);
    setConfig(newConfig); // Store handles localStorage and Electron sync / ストアがlocalStorageとElectron同期を処理
  };

  const handleClose = () => {
    onClose();
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

  const handleBridgeUrlChange = (value: string) => {
    const newConfig = { ...localConfig, bridgeUrl: value };
    saveConfigImmediately(newConfig);
  };

  return (
    <div
      className={`fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 ${animationClass}`}
    >
      <div
        className={`dark:bg-slate-800 pure-black:bg-black bg-white w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border dark:border-slate-600 pure-black:border-slate-800 border-slate-200 shadow-2xl overflow-hidden transition-colors duration-300 ${modalAnimationClass}`}
      >
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

        <div className='flex-1 overflow-y-auto p-6 space-y-8'>
          {/* Language Selection / 言語選択 */}
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

          {/* Theme Selection / テーマ選択 */}
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

          {/* Accent Color Selection / アクセントカラー選択 */}
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

          {/* OSC Port Config / OSCポート設定 */}
          <section className='pt-4 border-t dark:border-slate-700/50 border-slate-200'>
            <label className='block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider'>
              {t.oscPort}
            </label>
            <div className='relative group'>
              <input
                type='number'
                min={1}
                max={65535}
                value={localConfig.oscPort}
                onChange={(e) => handleOscPortChange(e.target.value)}
                className='w-full dark:bg-slate-900 bg-slate-50 border dark:border-slate-700 border-slate-300 rounded-xl p-4 dark:text-white text-slate-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none font-mono text-sm transition-all'
                placeholder='9000'
              />
            </div>
            <p className='text-xs text-slate-500 mt-3 flex items-start gap-2 px-1 whitespace-pre-line'>
              <Info size={14} className='text-slate-400 mt-0.5 flex-shrink-0' />
              <span>{t.oscPortDesc}</span>
            </p>
          </section>

          {/* URL Config / URL設定 */}
          <section>
            <label className='block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider'>
              {t.oscUrl}
            </label>
            <div className='relative group'>
              <input
                type='text'
                value={localConfig.bridgeUrl}
                onChange={(e) => handleBridgeUrlChange(e.target.value)}
                className='w-full dark:bg-slate-900 bg-slate-50 border dark:border-slate-700 border-slate-300 rounded-xl p-4 dark:text-white text-slate-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none font-mono text-sm transition-all'
                placeholder='ws://127.0.0.1:8080'
              />
            </div>
            <p className='text-xs text-slate-500 mt-3 flex items-center gap-2 px-1'>
              <Info size={14} className='text-slate-400' />
              {t.defaultUrl}
            </p>
          </section>

          {/* Update Check Config / 更新確認設定 */}
          <section className='pt-4 border-t dark:border-slate-700/50 border-slate-200'>
            <label className='block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider'>
              {t.checkInterval}
            </label>
            <div className='bg-gray-100 dark:bg-slate-900 rounded-xl p-1 mb-3 flex gap-1 overflow-x-auto'>
              {[
                { id: 'startup', label: t.intervalStartup },
                { id: 'daily', label: t.intervalDaily },
                { id: 'weekly', label: t.intervalWeekly },
                { id: 'manual', label: t.intervalManual },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    const newConfig = {
                      ...localConfig,
                      updateCheckInterval: option.id as any,
                    };
                    saveConfigImmediately(newConfig);
                  }}
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
                  onClick={async () => {
                    if (!window.electronAPI) {
                      setCheckStatus(t.updateError);
                      return;
                    }
                    setCheckStatus(t.checking);
                    try {
                      const result = await window.electronAPI.checkForUpdate();
                      if (result.success) {
                        if (result.updateAvailable) {
                          const msg = t.updateAvailable.replace(
                            '{version}',
                            result.latestVersion || '',
                          );
                          setCheckStatus(msg);
                          const url =
                            result.url ||
                            'https://github.com/fuku2019/VRC-OSC-Keyboard/releases';
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
                          localStorage.removeItem(
                            STORAGE_KEYS.UPDATE_AVAILABLE,
                          );
                          // Notify parent to clear state / 親に通知して状態をクリア
                          if (onUpdateAvailable) {
                            onUpdateAvailable(null);
                          }
                        }
                      } else {
                        setCheckStatus(t.updateError);
                      }
                    } catch (e) {
                      setCheckStatus(t.updateError);
                    }
                  }}
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
        </div>

        <div className='p-6 border-t dark:border-slate-700 pure-black:border-slate-800 border-slate-200 dark:bg-slate-800/50 pure-black:bg-black bg-slate-50 transition-colors duration-300'>
          <button
            onClick={handleClose}
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
