/**
 * Settings Modal shared UI primitives - class constants and setting rows
 * 設定モーダル共通UI - CSSクラス定数と設定行コンポーネント
 */

import { FC } from 'react';
import { Info } from 'lucide-react';

// Shared CSS class constants / 共通CSSクラス定数
export const SECTION_LABEL_CLASS = 'block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider';
const BTN_ACTIVE_CLASS = 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--rgb-primary-500)_/_0.15)]';
const BTN_INACTIVE_CLASS = 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500';
export const selectedBtnClass = (active: boolean) =>
  `flex-1 py-3 px-4 rounded-xl border transition-all ${active ? BTN_ACTIVE_CLASS : BTN_INACTIVE_CLASS}`;

// Shared label + description UI / 共通ラベル+説明文UI
export const SettingLabel: FC<{ label: string; description: string }> = ({ label, description }) => (
  <div className='flex-1'>
    <p className='text-sm font-semibold dark:text-slate-200 text-slate-700'>{label}</p>
    <p className='text-xs text-slate-500 mt-1 flex items-start gap-2'>
      <Info size={14} className='text-slate-400 mt-0.5 flex-shrink-0' />
      <span>{description}</span>
    </p>
  </div>
);

export const ToggleRow: FC<{
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  enabledText?: string;
  disabledText?: string;
}> = ({ label, description, enabled, onToggle, enabledText, disabledText }) => (
  <div className='flex items-center justify-between gap-4'>
    <SettingLabel label={label} description={description} />
    <button
      type='button'
      onClick={() => onToggle(!enabled)}
      aria-pressed={enabled}
      aria-label={enabled ? enabledText || label : disabledText || label}
      className={`relative inline-flex h-8 w-14 items-center rounded-full border transition-colors ${
        enabled
          ? 'bg-primary-500/80 border-primary-500'
          : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
      }`}
    >
      {(enabledText || disabledText) && (
        <span className='absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white pointer-events-none'>
          {enabled ? enabledText : disabledText}
        </span>
      )}
      <span
        className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

export const TextSwitchRow: FC<{
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  enabledText: string;
  disabledText: string;
}> = ({ label, description, enabled, onToggle, enabledText, disabledText }) => (
  <div className='flex items-center justify-between gap-4'>
    <SettingLabel label={label} description={description} />
    <button
      type='button'
      onClick={() => onToggle(!enabled)}
      aria-pressed={enabled}
      aria-label={enabled ? enabledText : disabledText}
      className={`px-3 py-2 rounded-lg text-xs font-semibold border min-w-[92px] transition-colors ${
        enabled
          ? 'bg-primary-600 hover:bg-primary-500 border-primary-600 text-[rgb(var(--rgb-on-primary))]'
          : 'dark:bg-slate-700/40 bg-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600/60 dark:border-slate-500 border-slate-300 dark:text-slate-200 text-slate-700'
      }`}
    >
      {enabled ? enabledText : disabledText}
    </button>
  </div>
);
