import { FC, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
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
    'rounded-md font-bold text-xl transition-all duration-150 active:scale-95 select-none flex shadow-sm border relative items-center justify-center backdrop-blur-md overflow-hidden';

  const timerRef = useRef<number | null>(null);
  const isLongPressTriggeredRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const suppressNextClickRef = useRef(false);

  // Cleanup timer on unmount / アンマウント時にタイマーをクリーンアップ
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Handle pointer down / ポインターが押された時の処理
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only primary action (left click / touch / primary pen)
    const isPrimaryAction =
      e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary;
    if (!isPrimaryAction) return;

    isLongPressTriggeredRef.current = false;
    activePointerIdRef.current = e.pointerId;

    if (e.currentTarget.hasPointerCapture?.(e.pointerId) === false) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }

    if (onLongPress) {
      timerRef.current = window.setTimeout(() => {
        onLongPress(config);
        isLongPressTriggeredRef.current = true;
        // Optional: Provide haptic/visual feedback here / オプション: ここでハプティック/視覚フィードバックを提供する
      }, TIMEOUTS.LONG_PRESS_THRESHOLD);
    }
  };

  // Handle pointer up / ポインターが離された時の処理
  const handlePointerUp = (e: React.PointerEvent) => {
    if (activePointerIdRef.current === null) return;
    if (e.pointerId !== activePointerIdRef.current) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!isLongPressTriggeredRef.current) {
      suppressNextClickRef.current = true;
      onPress(config);
    }

    activePointerIdRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    }
  };

  // Handle pointer cancel / ポインターがキャンセルされた時の処理
  const handlePointerCancel = (e: React.PointerEvent) => {
    if (
      activePointerIdRef.current !== null &&
      e.pointerId !== activePointerIdRef.current
    ) {
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    activePointerIdRef.current = null;
  };

  // Handle click / クリック処理
  const handleClick = (e: React.MouseEvent) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }

    if (isLongPressTriggeredRef.current) {
      // Prevent default click action if long press happened / 長押しが発生した場合はデフォルトのクリックアクションを防ぐ
      e.stopPropagation();
      return;
    }
    onPress(config);
  };

  const colorClasses = highlight
    ? 'bg-primary-500/80 text-[rgb(var(--rgb-on-primary))] hover:bg-primary-500 border-primary-500/50'
    : config.action === 'send'
      ? 'bg-green-500/80 text-white hover:bg-green-500 border-green-500/50'
      : config.action === 'backspace' || config.action === 'clear'
        ? 'dark:bg-red-900/40 bg-red-100/60 dark:text-red-200 text-red-800 dark:hover:bg-red-900/60 hover:bg-red-200/80 dark:border-red-500/30 border-red-500/30'
        : config.action
          ? 'dark:bg-slate-700/40 bg-slate-300/40 dark:text-slate-200 text-slate-800 dark:hover:bg-slate-600/60 hover:bg-slate-400/60 dark:border-white/10 border-black/10'
          : 'dark:bg-white/5 bg-black/5 dark:text-slate-100 text-slate-900 dark:hover:bg-white/10 hover:bg-black/10 dark:border-white/10 border-black/10';

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
      onPointerCancel={handlePointerCancel}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
      type='button'
    >
      {config.action === 'history-up' ? (
        <ChevronUp size={24} />
      ) : config.action === 'history-down' ? (
        <ChevronDown size={24} />
      ) : (
        <span>{displayLabel}</span>
      )}
    </button>
  );
};

export default Key;
