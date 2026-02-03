/**
 * Theme Section - Theme selection UI for settings modal
 * テーマセクション - 設定モーダル用のテーマ選択UI
 */

import { FC } from 'react';
import { OscConfig } from '../../types';

interface ThemeSectionProps {
  localConfig: OscConfig;
  t: {
    theme: string;
    themePureBlack: string;
    themeDark: string;
    themeLight: string;
  };
  onThemeChange: (theme: 'light' | 'dark' | 'pure-black') => void;
}

export const ThemeSection: FC<ThemeSectionProps> = ({
  localConfig,
  t,
  onThemeChange,
}) => {
  return (
    <section>
      <label className='block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider'>
        {t.theme}
      </label>
      <div className='flex gap-2'>
        <button
          onClick={() => onThemeChange('pure-black')}
          className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.theme === 'pure-black' ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]' : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
        >
          {t.themePureBlack}
        </button>
        <button
          onClick={() => onThemeChange('dark')}
          className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.theme === 'dark' ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]' : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
        >
          {t.themeDark}
        </button>
        <button
          onClick={() => onThemeChange('light')}
          className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.theme === 'light' ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]' : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
        >
          {t.themeLight}
        </button>
      </div>
    </section>
  );
};
