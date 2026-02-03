/**
 * OSC Port Section - OSC port configuration UI for settings modal
 * OSCポートセクション - 設定モーダル用のOSCポート設定UI
 */

import { FC } from 'react';
import { Info } from 'lucide-react';
import { OscConfig } from '../../types';

interface OscPortSectionProps {
  localConfig: OscConfig;
  t: {
    oscPort: string;
    oscPortDesc: string;
  };
  onOscPortChange: (value: string) => void;
}

export const OscPortSection: FC<OscPortSectionProps> = ({
  localConfig,
  t,
  onOscPortChange,
}) => {
  return (
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
          onChange={(e) => onOscPortChange(e.target.value)}
          className='w-full dark:bg-slate-900 bg-slate-50 border dark:border-slate-700 border-slate-300 rounded-xl p-4 dark:text-white text-slate-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none font-mono text-sm transition-all'
          placeholder='9000'
        />
      </div>
      <p className='text-xs text-slate-500 mt-3 flex items-start gap-2 px-1 whitespace-pre-line'>
        <Info size={14} className='text-slate-400 mt-0.5 flex-shrink-0' />
        <span>{t.oscPortDesc}</span>
      </p>
    </section>
  );
};
