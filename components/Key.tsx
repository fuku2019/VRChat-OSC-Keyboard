import { FC, useRef } from 'react';
import { KeyConfig } from '../types';

interface KeyProps {
  config: KeyConfig;
  onPress: (config: KeyConfig) => void;
  onLongPress?: (config: KeyConfig) => void;
  highlight?: boolean;
  isShiftActive?: boolean;
}

const Key: FC<KeyProps> = ({ config, onPress, onLongPress, highlight = false, isShiftActive = false }) => {
  const baseClasses = "rounded-lg font-bold text-xl transition-all duration-75 active:scale-95 select-none flex shadow-lg border-b-4 border-slate-700 active:border-b-0 active:translate-y-1 relative items-center justify-center";
  
  const timerRef = useRef<number | null>(null);
  const isLongPressTriggeredRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only left click or touch / 左クリックまたはタッチのみ
    if (e.button !== 0) return;
    
    isLongPressTriggeredRef.current = false;

    if (onLongPress) {
      timerRef.current = window.setTimeout(() => {
        onLongPress(config);
        isLongPressTriggeredRef.current = true;
        // Optional: Provide haptic/visual feedback here / オプション: ここでハプティック/視覚フィードバックを提供する
      }, 500); // 0.5 second threshold / 0.5秒のしきい値
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
    ? "bg-cyan-600 text-white hover:bg-cyan-500 border-cyan-800"
    : config.action === 'send'
      ? "bg-green-600 text-white hover:bg-green-500 border-green-800"
      : config.action === 'backspace' || config.action === 'clear'
        ? "bg-red-900/50 text-red-200 hover:bg-red-900 border-red-900"
        : config.action
          ? "bg-slate-700 text-slate-300 hover:bg-slate-600 border-slate-800" 
          : "bg-slate-800 text-slate-200 hover:bg-slate-700 border-slate-900"; 

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
  if (config.action === 'shift' && isShiftActive) displayLabel = 'SHIFT';

  return (
    <button
      className={`${baseClasses} ${colorClasses}`}
      style={{ 
        gridColumn: `span ${config.gridCols || 2}`,
        gridRow: `span ${config.gridRows || 1}`,
        height: '100%' 
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      type="button"
    >
      <span>{displayLabel}</span>
    </button>
  );
};

export default Key;
