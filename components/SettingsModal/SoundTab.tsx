/**
 * Settings Modal - Sound tab
 * 設定モーダル - サウンドタブ
 */

import { FC } from 'react';
import { KeySoundVariant, OscConfig, UpdateConfigFn } from '../../types';
import { TranslationStrings } from '../../constants';
import {
  SECTION_LABEL_CLASS,
  selectedBtnClass,
  SelectedMark,
  SettingLabel,
  ToggleRow,
} from './settingsRows';

interface SoundTabProps {
  t: TranslationStrings['settings'];
  localConfig: OscConfig;
  updateConfig: UpdateConfigFn;
}

const SoundTab: FC<SoundTabProps> = ({ t, localConfig, updateConfig }) => (
  <div className='space-y-8 animate-fade-in'>
    <section>
      <label className={SECTION_LABEL_CLASS}>{t.keySoundTitle}</label>
      <div className='space-y-5'>
        <ToggleRow
          label={t.keySoundEnabled}
          description={t.keySoundEnabledDesc}
          enabled={localConfig.keySoundEnabled}
          onToggle={(value) => updateConfig('keySoundEnabled', value)}
        />
        <div className='flex items-center justify-between gap-4'>
          <SettingLabel label={t.keySoundVariant} description={t.keySoundVariantDesc} />
          {/* Buttons, not a <select>: its native popup is not painted into the
              offscreen keyboard window, so it could not be opened in VR.
              <select> ではなくボタンにする。ネイティブのポップアップはオフスクリーンの
              キーボードウィンドウに描画されず、VRでは開けなかったため。 */}
          <div className='flex gap-2 min-w-[280px]'>
            {([
              ['soft', t.keySoundSoft],
              ['mechanical', t.keySoundMechanical],
            ] as [KeySoundVariant, string][]).map(([variant, label]) => {
              const active = localConfig.keySoundVariant === variant;
              return (
                <button
                  key={variant}
                  type='button'
                  disabled={!localConfig.keySoundEnabled}
                  aria-pressed={active}
                  onClick={() => updateConfig('keySoundVariant', variant)}
                  className={`${selectedBtnClass(active)} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <SelectedMark active={active} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  </div>
);

export default SoundTab;
