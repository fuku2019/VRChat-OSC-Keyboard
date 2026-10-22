import { FC, useRef, useEffect } from 'react';
import {
  ArrowBigUp,
  ArrowBigUpDash,
  ChevronDown,
  ChevronUp,
  Delete,
  Eraser,
} from 'lucide-react';
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
  // Flat Gboard-style key: no border, shadow or blur, and no transition, so a
  // press repaints the offscreen window once instead of for every animated frame.
  // Hover and press feedback comes from the state layers in index.css.
  // Gboard 風の平らなキー。枠・影・ぼかし・トランジションを付けないので、押下時の
  // オフスクリーンウィンドウの再描画はアニメーションの各フレームではなく1回で済む。
  // ホバーと押下の手応えは index.css の状態レイヤーが受け持つ。
  const baseClasses =
    'relative flex items-center justify-center select-none overflow-hidden rounded-[10px] text-[22px] font-medium transition-none';

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
    ? 'bg-key-active text-on-key-active'
    : config.action === 'send'
      ? 'bg-accent text-on-accent'
      : config.action && config.action !== 'space'
        ? 'bg-key-fn text-ink'
        : 'bg-key text-ink';

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

  // The shifted symbol, shown small in the corner while Shift is off. Skipped when
  // it would repeat the label ('_') or there is none ('0').
  // Shift が OFF の間、角に小さく出すシフト時の記号。ラベルと同じ('_')か、
  // 無い('0')ときは出さない。
  const hint =
    !isShiftActive && config.shiftValue && config.shiftValue !== config.label
      ? config.shiftValue
      : null;

  const renderContent = () => {
    switch (config.action) {
      case 'history-up':
        return <ChevronUp size={26} />;
      case 'history-down':
        return <ChevronDown size={26} />;
      case 'backspace':
        return <Delete size={26} />;
      case 'shift':
        return isCapsLock ? (
          <ArrowBigUpDash size={26} fill='currentColor' />
        ) : (
          <ArrowBigUp size={26} fill={isShiftActive ? 'currentColor' : 'none'} />
        );
      case 'clear':
        return (
          <span className='flex items-center gap-2 text-[17px]'>
            <Eraser size={20} className='text-error' />
            {displayLabel}
          </span>
        );
      case 'space':
        return <span className='text-base'>{displayLabel}</span>;
      case undefined:
        return <span>{displayLabel}</span>;
      default:
        return <span className='text-[17px]'>{displayLabel}</span>;
    }
  };

  return (
    <button
      className={`${baseClasses} ${colorClasses} ${className}`}
      style={{
        gridColumn: `span ${config.gridCols || 2}`,
        gridRow: `span ${config.gridRows || 1}`,
        height: '100%',
        ...style,
      }}
      aria-label={displayLabel}
      data-action={config.action}
      data-vr-key='true'
      // How a VR trigger drives this key: 'press' clicks the moment the trigger
      // goes down; 'hold' presses on trigger down and releases on trigger up, so
      // the long press timer above can run.
      // VRトリガーでのこのキーの扱い: 'press' はトリガーを押した瞬間にクリックする。
      // 'hold' はトリガーの押下で押し、離したときに離すので、上の長押しタイマーが動く。
      data-vr-click={onLongPress ? 'hold' : 'press'}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
      type='button'
    >
      {renderContent()}
      {/* CapsLock bar: the dash in the icon alone was too small to see in a headset.
          CapsLock の目印。アイコンの短い線だけではヘッドセットで見えなかった。 */}
      {config.action === 'shift' && isCapsLock && (
        <span aria-hidden='true' className='absolute bottom-2 w-6 h-[3px] rounded-full bg-current' />
      )}
      {hint && (
        <span
          aria-hidden='true'
          className='absolute top-1.5 right-2.5 text-[15px] leading-none text-ink-muted'
        >
          {hint}
        </span>
      )}
    </button>
  );
};

export default Key;
