/**
 * Settings Modal - Connectivity tab (OSC port and SteamVR integration)
 * 設定モーダル - 接続タブ(OSCポートとSteamVR連携)
 */

import { FC } from 'react';
import { OscConfig } from '../../types';
import { TranslationStrings } from '../../constants';
import { useSteamVrSettings } from '../../hooks/useSteamVrSettings';
import {
  INPUT_CLASS,
  OUTLINED_BTN_CLASS,
  SECTION_CLASS,
  SECTION_LABEL_CLASS,
  TextSwitchRow,
  TONAL_BTN_CLASS,
} from './settingsRows';

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
        <input
          type='number'
          min={1}
          max={65535}
          value={oscPortInput}
          onChange={(e) => onOscPortInputChange(e.target.value)}
          onBlur={onOscPortCommit}
          onKeyDown={onOscPortKeyDown}
          className={`w-40 !text-lg ${INPUT_CLASS}`}
          placeholder='9000'
        />
        <p className='text-sm text-ink-muted mt-3 leading-relaxed whitespace-pre-line [word-break:auto-phrase]'>
          {t.oscPortDesc}
        </p>
      </section>

      <section className={`${SECTION_CLASS} space-y-6`}>
        <label className={SECTION_LABEL_CLASS}>{t.steamVrSection}</label>

        <div>
          <TextSwitchRow
            label={t.steamVrAutoLaunch}
            description={t.steamVrAutoLaunchDesc}
            enabled={localConfig.steamVrAutoLaunch}
            onToggle={(value) => void handleToggleSteamVrAutoLaunch(value)}
            enabledText={t.steamVrUnregisterLabel}
            disabledText={t.steamVrRegisterLabel}
          />
          {steamVrAutoLaunchError && (
            <p className='text-[13px] text-error mt-2'>{steamVrAutoLaunchError}</p>
          )}
        </div>

        <div className='space-y-4'>
          <p className='text-[15px] text-ink'>{t.steamVrBindingsTitle}</p>

          <div className='text-sm text-ink bg-canvas border border-line px-4 py-3 rounded-xl min-h-[4rem]'>
            {loadingBindings ? (
              <span className='text-ink-muted'>{t.loading}</span>
            ) : !initialized ? (
              <span className='text-warning'>{bindingError || t.steamVrBindingsUnavailable}</span>
            ) : (
              <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-2'>
                <dt className='text-ink-muted'>{t.steamVrBindingsToggleLabel}</dt>
                <dd>{formatBindings(toggleBindings)}</dd>
                <dt className='text-ink-muted'>{t.steamVrBindingsTriggerLabel}</dt>
                <dd>{formatBindings(triggerBindings)}</dd>
                <dt className='text-ink-muted'>{t.steamVrBindingsGripLabel}</dt>
                <dd>{formatBindings(gripBindings)}</dd>
              </dl>
            )}
          </div>

          {bindingError && initialized && (
            <p className='text-[13px] text-error bg-error-container px-3 py-2 rounded-xl'>{bindingError}</p>
          )}
          {initialized && (!triggerBound || !gripBound) && (
            <p className='text-[13px] text-warning bg-warning-container px-3 py-2 rounded-xl'>
              {t.steamVrBindingsMissingActions}
            </p>
          )}

          <div className='flex flex-wrap gap-2'>
            <button
              type='button'
              onClick={() => void loadBindings()}
              className={TONAL_BTN_CLASS}
            >
              {t.steamVrBindingsRefresh}
            </button>
            <button
              type='button'
              onClick={() => void handleOpenBindingUi()}
              className={OUTLINED_BTN_CLASS}
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
