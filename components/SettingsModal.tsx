import { useState, useEffect, FC } from 'react';
import { X, Info, CircleHelp } from 'lucide-react';
import { OscConfig, Language } from '../types';
import { TRANSLATIONS, DEFAULT_CONFIG } from '../constants';
import { useModalAnimation } from '../hooks/useModalAnimation';
import packageJson from '../package.json';

const APP_VERSION = packageJson.version;

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: OscConfig;
  onSave: (config: OscConfig) => void;
  onLanguageChange: (lang: Language) => void;
  onShowTutorial: () => void;
}

const SettingsModal: FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
  onLanguageChange,
  onShowTutorial,
}) => {
  const [localConfig, setLocalConfig] = useState(config);
  const { shouldRender, animationClass, modalAnimationClass } =
    useModalAnimation(isOpen);

  // Sync local state when opening / 開くときにローカル状態を同期する
  useEffect(() => {
    if (isOpen) {
      setLocalConfig(config);
    }
  }, [isOpen, config]);

  if (!shouldRender) return null;

  // Use localConfig for translations to ensure immediate UI update within modal / モーダル内で即時UI更新を保証するために翻訳にlocalConfigを使用する
  const t = TRANSLATIONS[localConfig.language || 'ja'].settings;

  // Save config immediately and update OSC port if needed / 設定を即時保存し、必要に応じてOSCポートを更新
  const saveConfigImmediately = async (newConfig: OscConfig) => {
    setLocalConfig(newConfig);
    onSave(newConfig);
    
    // Update OSC port via Electron IPC if changed / 変更された場合はElectron IPC経由でOSCポートを更新
    if (window.electronAPI && newConfig.oscPort !== config.oscPort) {
      try {
        const result = await window.electronAPI.updateOscPort(newConfig.oscPort);
        if (!result.success) {
          console.error('Failed to update OSC port:', result.error);
        }
      } catch (e) {
        console.error('Error updating OSC port:', e);
      }
    }
  };

  const handleClose = () => {
    onClose();
  };

  const handleLanguageChange = (lang: Language) => {
    const newConfig = { ...localConfig, language: lang };
    saveConfigImmediately(newConfig);
    onLanguageChange(lang); // Trigger immediate update in parent / 親コンポーネントで即時更新をトリガーする
  };

  const handleThemeChange = (theme: 'light' | 'dark') => {
    const newConfig = { ...localConfig, theme };
    saveConfigImmediately(newConfig);
  };

  const handleOscPortChange = (value: string) => {
    const portNum = parseInt(value, 10);
    if (!isNaN(portNum) && portNum >= 1 && portNum <= 65535) {
      const newConfig = { ...localConfig, oscPort: portNum };
      saveConfigImmediately(newConfig);
    } else if (value === '') {
      // Allow empty for typing / 入力中は空を許可
      const newConfig = { ...localConfig, oscPort: DEFAULT_CONFIG.OSC_PORT };
      saveConfigImmediately(newConfig);
    }
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
        className={`dark:bg-slate-800 bg-white w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border dark:border-slate-600 border-slate-200 shadow-2xl overflow-hidden ${modalAnimationClass}`}
      >
        <div className='flex justify-between items-center p-6 border-b dark:border-slate-700 border-slate-200 dark:bg-slate-800 bg-white'>
          <h2 className='text-2xl font-bold dark:text-cyan-400 text-cyan-600'>{t.title}</h2>
          <button
            onClick={onClose}
            className='p-2 dark:hover:bg-slate-700 hover:bg-slate-100 rounded-full dark:text-slate-400 text-slate-500 dark:hover:text-white hover:text-slate-900 transition-colors'
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
                className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.language === 'ja' ? 'dark:bg-cyan-900/40 bg-cyan-50 border-cyan-500 dark:text-cyan-300 text-cyan-700 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
              >
                日本語
              </button>
              <button
                onClick={() => handleLanguageChange('en')}
                className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.language === 'en' ? 'dark:bg-cyan-900/40 bg-cyan-50 border-cyan-500 dark:text-cyan-300 text-cyan-700 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
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
                onClick={() => handleThemeChange('dark')}
                className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.theme === 'dark' ? 'dark:bg-cyan-900/40 bg-cyan-50 border-cyan-500 dark:text-cyan-300 text-cyan-700 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
              >
                {t.themeDark}
              </button>
              <button
                onClick={() => handleThemeChange('light')}
                className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.theme === 'light' ? 'dark:bg-cyan-900/40 bg-cyan-50 border-cyan-500 dark:text-cyan-300 text-cyan-700 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
              >
                {t.themeLight}
              </button>
            </div>
          </section>

          {/* Tutorial Trigger / チュートリアル表示 */}
          <section className='pt-4 border-t dark:border-slate-700/50 border-slate-200'>
            <button
              onClick={onShowTutorial}
              className='w-full flex items-center justify-between p-4 dark:bg-slate-700/30 bg-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded-xl border dark:border-slate-600/50 border-slate-200 dark:text-slate-300 text-slate-700 dark:hover:text-white hover:text-slate-900 transition-all group'
            >
              <div className='flex items-center gap-3'>
                <CircleHelp size={20} className='text-cyan-500' />
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
                className='w-full dark:bg-slate-900 bg-slate-50 border dark:border-slate-700 border-slate-300 rounded-xl p-4 dark:text-white text-slate-900 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 focus:outline-none font-mono text-sm transition-all'
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
                className='w-full dark:bg-slate-900 bg-slate-50 border dark:border-slate-700 border-slate-300 rounded-xl p-4 dark:text-white text-slate-900 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 focus:outline-none font-mono text-sm transition-all'
                placeholder='ws://127.0.0.1:8080'
              />
            </div>
            <p className='text-xs text-slate-500 mt-3 flex items-center gap-2 px-1'>
              <Info size={14} className='text-slate-400' />
              {t.defaultUrl}
            </p>
          </section>

          {/* Version Info / バージョン情報 */}
          <section className='pt-2 text-center'>
            <p className='text-xs text-slate-500'>Version: {APP_VERSION}</p>
          </section>
        </div>

        <div className='p-6 border-t dark:border-slate-700 border-slate-200 dark:bg-slate-800/50 bg-slate-50'>
          <button
            onClick={handleClose}
            className='flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-4 rounded-xl font-bold shadow-lg shadow-cyan-900/30 active:scale-95 transition-all w-full justify-center'
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
