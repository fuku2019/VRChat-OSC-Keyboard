/**
 * Settings Modal - Connectivity tab (OSC port and SteamVR integration)
 * 設定モーダル - 接続タブ(OSCポートとSteamVR連携)
 */

import { FC } from 'react';
import { Info } from 'lucide-react';
import { OscConfig } from '../../types';
import { TranslationStrings } from '../../constants';
import { useSteamVrSettings } from '../../hooks/useSteamVrSettings';
import { SECTION_LABEL_CLASS, TextSwitchRow } from './settingsRows';

interface ConnectivityTabProps {
  t: TranslationStrings['settings'];
  localConfig: OscConfig;
  oscPortInput: string;
  onOscPortInputChange: (value: string) => void;
  onOscPortCommit: () => void;
  onOscPortKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  steamVr: ReturnType<typeof useSteamVrSettings>;
}

const ConnectivityTab: FC<ConnectivityTabProps> = ({
  t,
  localConfig,
  oscPortInput,
  onOscPortInputChange,
  onOscPortCommit,
  onOscPortKeyDown,
  steamVr,
}) => {
  const {
    toggleBindings,
    triggerBindings,
    gripBindings,
    initialized,
    loadingBindings,
    bindingError,
    triggerBound,
    gripBound,
    steamVrAutoLaunchError,
    loadBindings,
    handleOpenBindingUi,
    formatBindings,
    handleToggleSteamVrAutoLaunch,
  } = steamVr;

  return (
    <div className='space-y-8 animate-fade-in'>
      <section>
        <label className={SECTION_LABEL_CLASS}>{t.oscPort}</label>
        <div className='relative group'>
          <input
            type='number'
            min={1}
            max={65535}
            value={oscPortInput}
            onChange={(e) => onOscPortInputChange(e.target.value)}
            onBlur={onOscPortCommit}
            onKeyDown={onOscPortKeyDown}
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
  );
};

export default ConnectivityTab;
