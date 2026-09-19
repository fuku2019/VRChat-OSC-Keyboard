/**
 * Settings Modal - Sound tab
 * 設定モーダル - サウンドタブ
 */

import { FC } from 'react';
import { KeySoundVariant, OscConfig, UpdateConfigFn } from '../../types';
import { TranslationStrings } from '../../constants';
import { SECTION_LABEL_CLASS, SettingLabel, ToggleRow } from './settingsRows';

interface SoundTabProps {
  t: TranslationStrings['settings'];
  localConfig: OscConfig;
  updateConfig: UpdateConfigFn;
}

const SoundTab: FC<SoundTabProps> = ({ t, localConfig, updateConfig }) => (
  <div className='space-y-8 animate-fade-in'>
    <section>
      <label className={`${SECTION_LABEL_CLASS} !mb-2`}>{t.keySoundTitle}</label>
      <div className='p-4 rounded-xl border dark:border-white/10 border-black/10 dark:bg-slate-800/30 bg-white/50 shadow-sm space-y-4'>
        <ToggleRow
          label={t.keySoundEnabled}
          description={t.keySoundEnabledDesc}
          enabled={localConfig.keySoundEnabled}
          onToggle={(value) => updateConfig('keySoundEnabled', value)}
        />
        <div className='h-px w-full bg-black/5 dark:bg-white/5' />
        <div className='flex items-center justify-between gap-4'>
          <SettingLabel label={t.keySoundVariant} description={t.keySoundVariantDesc} />
          <select
            value={localConfig.keySoundVariant}
            onChange={(e) =>
              updateConfig('keySoundVariant', e.target.value as KeySoundVariant)
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
);

export default SoundTab;
