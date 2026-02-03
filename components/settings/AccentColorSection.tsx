/**
 * Accent Color Section - Accent color selection UI for settings modal
 * アクセントカラーセクション - 設定モーダル用のアクセントカラー選択UI
 */

import { FC } from 'react';
import { OscConfig } from '../../types';

interface AccentColorSectionProps {
  localConfig: OscConfig;
  t: {
    accentColor: string;
    accentColorCyan: string;
    accentColorPurple: string;
    accentColorCustom: string;
  };
  onAccentColorChange: (color: string) => void;
}

export const AccentColorSection: FC<AccentColorSectionProps> = ({
  localConfig,
  t,
  onAccentColorChange,
}) => {
  return (
    <section className='pt-4 border-t dark:border-slate-700/50 border-slate-200'>
      <label className='block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider'>
        {t.accentColor}
      </label>
      <div className='flex gap-2'>
        <button
          onClick={() => onAccentColorChange('cyan')}
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
          onClick={() => onAccentColorChange('purple')}
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
            onChange={(e) => onAccentColorChange(e.target.value)}
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
  );
};
