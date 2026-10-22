/**
 * Settings Modal shared UI primitives - class constants and setting rows
 * 設定モーダル共通UI - CSSクラス定数と設定行コンポーネント
 */

import { FC } from 'react';
import { Check } from 'lucide-react';

// Shared CSS class constants / 共通CSSクラス定数
// Sections are separated by a divider, Android settings style, instead of cards.
// セクションはカードではなく、Android の設定画面のように区切り線で分ける。
export const SECTION_CLASS = 'pt-6 border-t border-line';
export const SECTION_LABEL_CLASS = 'block text-accent mb-3 text-sm font-medium';
export const FILLED_BTN_CLASS =
  'px-5 py-2.5 rounded-full text-sm font-medium bg-accent text-on-accent disabled:opacity-50 disabled:cursor-not-allowed';
export const TONAL_BTN_CLASS =
  'px-5 py-2.5 rounded-full text-sm font-medium bg-tonal text-on-tonal disabled:opacity-50 disabled:cursor-not-allowed';
export const OUTLINED_BTN_CLASS =
  'px-5 py-2.5 rounded-full text-sm font-medium border border-line text-accent disabled:opacity-50 disabled:cursor-not-allowed';
export const DANGER_BTN_CLASS =
  'px-5 py-2.5 rounded-full text-sm font-medium bg-error-container text-error whitespace-nowrap';
export const INPUT_CLASS =
  'px-4 py-2.5 rounded-xl text-sm bg-canvas text-ink border border-line focus:border-accent focus:outline-none tabular-nums disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_ACTIVE_CLASS = 'bg-tonal text-on-tonal border-transparent';
const BTN_INACTIVE_CLASS = 'border-line text-ink';
export const selectedBtnClass = (active: boolean) =>
  `flex-1 py-3 px-4 rounded-full border text-sm font-medium inline-flex items-center justify-center gap-2 ${active ? BTN_ACTIVE_CLASS : BTN_INACTIVE_CLASS}`;

// Check mark for the selected segment: the tonal fill alone is a weak cue in light.
// 選択中のセグメントに付けるチェック。light では tonal の塗りだけでは手がかりが弱い。
export const SelectedMark: FC<{ active: boolean }> = ({ active }) =>
  active ? <Check size={16} strokeWidth={2.5} className='shrink-0' /> : null;

// Shared label + description UI / 共通ラベル+説明文UI
export const SettingLabel: FC<{ label: string; description: string }> = ({ label, description }) => (
  <div className='flex-1'>
    <p className='text-base text-ink'>{label}</p>
    <p className='text-sm text-ink-muted mt-1 leading-relaxed [word-break:auto-phrase]'>{description}</p>
  </div>
);

// Material 3 switch. enabledText/disabledText only become a tooltip; the track no
// longer carries text, and the state is exposed through role="switch".
// Material 3 のスイッチ。enabledText/disabledText はツールチップになるだけで、
// トラックに文字は載せない。状態は role="switch" で伝える。
export const ToggleRow: FC<{
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  enabledText?: string;
  disabledText?: string;
}> = ({ label, description, enabled, onToggle, enabledText, disabledText }) => (
  <div className='flex items-center justify-between gap-6'>
    <SettingLabel label={label} description={description} />
    <button
      type='button'
      role='switch'
      onClick={() => onToggle(!enabled)}
      aria-checked={enabled}
      aria-label={label}
      title={enabled ? enabledText : disabledText}
      className={`relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full border-2 ${
        enabled ? 'bg-accent border-accent' : 'bg-key-fn border-ink-muted'
      }`}
    >
      <span
        className={`inline-flex items-center justify-center rounded-full ${
          enabled
            ? 'h-6 w-6 translate-x-[22px] bg-on-accent text-accent'
            : 'h-4 w-4 translate-x-1.5 bg-ink-muted'
        }`}
      >
        {enabled && <Check size={16} strokeWidth={3} />}
      </span>
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
  <div className='flex items-center justify-between gap-6'>
    <SettingLabel label={label} description={description} />
    <button
      type='button'
      onClick={() => onToggle(!enabled)}
      aria-pressed={enabled}
      aria-label={enabled ? enabledText : disabledText}
      className={`min-w-[96px] ${OUTLINED_BTN_CLASS}`}
    >
      {enabled ? enabledText : disabledText}
    </button>
  </div>
);
