/**
 * Language Section - Language selection UI for settings modal
 * 言語セクション - 設定モーダル用の言語選択UI
 */

import { FC } from 'react';
import { Language, OscConfig } from '../../types';

interface LanguageSectionProps {
  localConfig: OscConfig;
  t: { language: string };
  onLanguageChange: (lang: Language) => void;
}

export const LanguageSection: FC<LanguageSectionProps> = ({
  localConfig,
  t,
  onLanguageChange,
}) => {
  return (
    <section>
      <label className='block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider'>
        {t.language}
      </label>
      <div className='flex gap-2'>
        <button
          onClick={() => onLanguageChange('ja')}
          className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.language === 'ja' ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]' : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
        >
          日本語
        </button>
        <button
          onClick={() => onLanguageChange('en')}
          className={`flex-1 py-3 px-4 rounded-xl border transition-all ${localConfig.language === 'en' ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]' : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
        >
          English
        </button>
      </div>
    </section>
  );
};
