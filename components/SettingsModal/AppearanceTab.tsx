/**
 * Settings Modal - Appearance tab
 * 設定モーダル - 外観タブ
 */

import { FC } from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { OscConfig, UpdateConfigFn } from '../../types';
import { TranslationStrings } from '../../constants';
import {
  PRESET_ACCENT_IDS,
  PRESET_PALETTES,
  PresetAccentId,
  isPresetAccentColor,
  isValidCustomAccentColor,
  normalizeCustomAccentColor,
} from '../../utils/colorUtils';
import { INPUT_CLASS, SECTION_CLASS, SECTION_LABEL_CLASS, selectedBtnClass, SelectedMark } from './settingsRows';

const PRESET_LABEL_KEYS: Record<PresetAccentId, keyof TranslationStrings['settings']> = {
  blue: 'accentColorBlue',
  purple: 'accentColorPurple',
};

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
          {([
            ['light', t.themeLight],
            ['dark', t.themeDark],
            ['pure-black', t.themePureBlack],
          ] as [OscConfig['theme'], string][]).map(([theme, label]) => (
            <button key={theme} onClick={() => updateConfig('theme', theme)} className={selectedBtnClass(localConfig.theme === theme)}>
              <SelectedMark active={localConfig.theme === theme} />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <label className={SECTION_LABEL_CLASS}>{t.accentColor}</label>
        <div className='flex gap-2'>
          {PRESET_ACCENT_IDS.map((id) => (
            <button
              key={id}
              onClick={() => onAccentColorChange(id)}
              className={selectedBtnClass(localConfig.accentColor === id || (id === 'blue' && !localConfig.accentColor))}
            >
              <SelectedMark active={localConfig.accentColor === id || (id === 'blue' && !localConfig.accentColor)} />
              <span className='w-4 h-4 rounded-full ring-2 ring-key' style={{ background: PRESET_PALETTES[id][600] }} />
              <span className='whitespace-nowrap'>{t[PRESET_LABEL_KEYS[id]]}</span>
            </button>
          ))}
          <button type='button' onClick={onCustomAccentSelect} className={selectedBtnClass(isCustomAccentSelected)}>
            <SelectedMark active={isCustomAccentSelected} />
            <span className='w-4 h-4 rounded-full ring-2 ring-key border border-line' style={{ background: customAccentColor }} />
            <span className='whitespace-nowrap'>{t.accentColorCustom}</span>
          </button>
        </div>

        {isCustomAccentSelected && (
          <div className='mt-5 space-y-4'>
            <HexColorPicker
              color={customAccentColor}
              onChange={onAccentColorChange}
              className='settings-accent-picker !w-full !h-48'
            />
            <div className='flex items-center gap-3'>
              <span className='text-[13px] text-ink-muted'>HEX</span>
              <HexColorInput
                color={customAccentColor}
                prefixed
                onChange={onAccentColorChange}
                className={`flex-1 ${INPUT_CLASS}`}
                aria-label='custom-accent-color-input'
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default AppearanceTab;
