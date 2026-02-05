import { FC, useRef, useEffect } from 'react';
import { KeyConfig } from '../types';
import { TIMEOUTS } from '../constants';

interface KeyProps {
  config: KeyConfig;
  onPress: (config: KeyConfig) => void;
  onLongPress?: (config: KeyConfig) => void;
  highlight?: boolean;
  isShiftActive?: boolean;
  isCapsLock?: boolean;
  className?: string; // Additional classes / 追加のクラス
  style?: React.CSSProperties; // Additional styles / 追加のスタイル
}

const Key: FC<KeyProps> = ({
  config,
  onPress,
  onLongPress,
  highlight = false,
  isShiftActive = false,
  isCapsLock = false,
  className = '',
  style = {},
}) => {
  const baseClasses =
    'rounded-lg font-bold text-xl transition-all duration-75 active:scale-95 select-none flex shadow-lg border-b-4 dark:border-slate-700 border-slate-300 active:border-b-0 active:translate-y-1 relative items-center justify-center';

  const timerRef = useRef<number | null>(null);
  const isLongPressTriggeredRef = useRef(false);

  // Cleanup timer on unmount / アンマウント時にタイマーをクリーンアップ
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only left click or touch / 左クリックまたはタッチのみ
    if (e.button !== 0) return;

    isLongPressTriggeredRef.current = false;

    if (onLongPress) {
      timerRef.current = window.setTimeout(() => {
        onLongPress(config);
        isLongPressTriggeredRef.current = true;
        // Optional: Provide haptic/visual feedback here / オプション: ここでハプティック/視覚フィードバックを提供する
      }, TIMEOUTS.LONG_PRESS_THRESHOLD);
    }
  };

  const handlePointerUp = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handlePointerLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isLongPressTriggeredRef.current) {
      // Prevent default click action if long press happened / 長押しが発生した場合はデフォルトのクリックアクションを防ぐ
      e.stopPropagation();
      return;
    }
    onPress(config);
  };

  const colorClasses = highlight
    ? 'bg-primary-600 text-[rgb(var(--rgb-on-primary))] hover:bg-primary-500 border-primary-800'
    : config.action === 'send'
      ? 'bg-green-600 text-white hover:bg-green-500 border-green-800'
      : config.action === 'backspace' || config.action === 'clear'
        ? 'dark:bg-red-900/50 bg-red-100 dark:text-red-200 text-red-800 dark:hover:bg-red-900 hover:bg-red-200 dark:border-red-900 border-red-200'
        : config.action
          ? 'dark:bg-slate-700 bg-slate-200 dark:text-slate-300 text-slate-700 dark:hover:bg-slate-600 hover:bg-slate-300 dark:border-slate-800 border-slate-300'
          : 'dark:bg-slate-800 bg-white dark:text-slate-200 text-slate-900 dark:hover:bg-slate-700 hover:bg-slate-50 dark:border-slate-900 border-slate-200';

  // Label Logic / ラベルロジック
  let displayLabel = config.label;

  // JIS Shift Logic: If shiftValue is present, showing it depends on design preference. / JISシフトロジック：shiftValueが存在する場合、それを表示するかどうかはデザインの好みによる。
  // Requested: "When shift is pressed, show the symbol". / 要望：「Shiftが押されたときに記号を表示する」。
  if (isShiftActive) {
    if (config.shiftValue) {
      displayLabel = config.shiftValue;
    } else if (config.label.length === 1 && /[a-z]/.test(config.label)) {
      displayLabel = config.label.toUpperCase();
    }
  }

  // Handle Shift Key label itself / Shiftキー自体のラベルを処理する
  if (config.action === 'shift' && isShiftActive)
    displayLabel = isCapsLock ? 'SHIFT ↑' : 'SHIFT';

  return (
    <button
      className={`${baseClasses} ${colorClasses} ${className}`}
      style={{
        gridColumn: `span ${config.gridCols || 2}`,
        gridRow: `span ${config.gridRows || 1}`,
        height: '100%',
        ...style,
      }}
      data-vr-key='true'
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
      type='button'
    >
      <span>{displayLabel}</span>
    </button>
  );
};

export default Key;
