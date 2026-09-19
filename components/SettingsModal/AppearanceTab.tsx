/**
 * Settings Modal - Appearance tab
 * 設定モーダル - 外観タブ
 */

import { FC } from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { OscConfig, UpdateConfigFn } from '../../types';
import { TranslationStrings } from '../../constants';
import {
  isPresetAccentColor,
  isValidCustomAccentColor,
  normalizeCustomAccentColor,
} from '../../utils/colorUtils';
import { SECTION_LABEL_CLASS, selectedBtnClass, ToggleRow } from './settingsRows';

interface AppearanceTabProps {
  t: TranslationStrings['settings'];
  localConfig: OscConfig;
  updateConfig: UpdateConfigFn;
  lastCustomAccentColor: string;
  onAccentColorChange: (color: string) => void;
  onCustomAccentSelect: () => void;
}

const AppearanceTab: FC<AppearanceTabProps> = ({
  t,
  localConfig,
  updateConfig,
  lastCustomAccentColor,
  onAccentColorChange,
  onCustomAccentSelect,
}) => {
  const isCustomAccentSelected = !isPresetAccentColor(localConfig.accentColor);
  const customAccentColor = isCustomAccentSelected
    ? isValidCustomAccentColor(localConfig.accentColor)
      ? normalizeCustomAccentColor(localConfig.accentColor)
      : lastCustomAccentColor
    : lastCustomAccentColor;

  return (
    <div className='space-y-8 animate-fade-in'>
      <section>
        <label className={SECTION_LABEL_CLASS}>{t.theme}</label>
        <div className='flex gap-2'>
          <button onClick={() => updateConfig('theme', 'pure-black')} className={selectedBtnClass(localConfig.theme === 'pure-black')}>{t.themePureBlack}</button>
          <button onClick={() => updateConfig('theme', 'dark')} className={selectedBtnClass(localConfig.theme === 'dark')}>{t.themeDark}</button>
          <button onClick={() => updateConfig('theme', 'light')} className={selectedBtnClass(localConfig.theme === 'light')}>{t.themeLight}</button>
        </div>
      </section>

      <section className='pt-6 border-t dark:border-white/10 border-black/10'>
        <label className={SECTION_LABEL_CLASS}>{t.accentColor}</label>
        <div className='flex gap-2'>
          <button onClick={() => onAccentColorChange('cyan')} className={`${selectedBtnClass(localConfig.accentColor === 'cyan' || !localConfig.accentColor)} flex items-center justify-center gap-2`}>
            <div className='w-4 h-4 rounded-full bg-[#06b6d4] shadow-sm' />
            <span className='text-xs md:text-sm whitespace-nowrap'>{t.accentColorCyan}</span>
          </button>
          <button onClick={() => onAccentColorChange('purple')} className={`${selectedBtnClass(localConfig.accentColor === 'purple')} flex items-center justify-center gap-2`}>
            <div className='w-4 h-4 rounded-full bg-[#a855f7] shadow-sm' />
            <span className='text-xs md:text-sm whitespace-nowrap'>{t.accentColorPurple}</span>
          </button>
          <button type='button' onClick={onCustomAccentSelect} className={`${selectedBtnClass(isCustomAccentSelected)} flex items-center justify-center gap-2`}>
            <div className='w-4 h-4 rounded-full border border-slate-300 dark:border-slate-500 shadow-sm' style={{ background: customAccentColor }} />
            <span className='text-xs md:text-sm whitespace-nowrap'>{t.accentColorCustom}</span>
          </button>
        </div>

        {isCustomAccentSelected && (
          <div className='mt-4 p-4 rounded-xl border dark:border-white/10 border-black/10 dark:bg-slate-900/50 bg-white/50 backdrop-blur-md space-y-4 shadow-sm'>
            <HexColorPicker
              color={customAccentColor}
              onChange={onAccentColorChange}
              className='settings-accent-picker !w-full !h-48'
            />
            <div className='flex items-center gap-3'>
              <span className='text-xs font-semibold dark:text-slate-400 text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded-md'>
                HEX
              </span>
              <HexColorInput
                color={customAccentColor}
                prefixed
                onChange={onAccentColorChange}
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
            onToggle={(value) => updateConfig('disableOverlay', value)}
          />
        </div>
      </section>
    </div>
  );
};

export default AppearanceTab;
