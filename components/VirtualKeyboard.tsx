import { useState, FC, memo } from 'react';
import { KEYBOARD_LAYOUT, TRANSLATIONS, KEYBOARD_GRID } from '../constants';
import { KeyConfig, InputMode, Language, KeySoundVariant } from '../types';
import type { ImeCandidate } from '../types/ime';
import Key from './Key';
import { useKeyPressSound } from '../hooks/useKeyPressSound';
const SOUND_BASE_URL = `${import.meta.env.BASE_URL}sounds/`;

interface VirtualKeyboardProps {
  onChar: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSend: () => void;
  onSpace: () => void;
  mode: InputMode;
  onToggleMode: () => void;
  candidates: ImeCandidate[];
  candidateIndex: number;
  isConverting: boolean;
  onCommitCandidate: (index: number) => void;
  language: Language;
  keySoundEnabled: boolean;
  keySoundVariant: KeySoundVariant;
  onHistoryUp?: () => void; // Navigate to older history / 古い履歴へ移動
  onHistoryDown?: () => void; // Navigate to newer history / 新しい履歴へ移動
}

// Candidates reachable by the number keys 1-9 in useIME. Showing fewer than
// this made 6-9 commit a candidate that was never on screen.
// useIME の数字キー1-9で到達できる候補数。これより少なく表示していたため、
// 6-9 が画面に無い候補を確定していた。
const MAX_VISIBLE_CANDIDATES = 9;

// JIS inverted-L Enter key. The button spans 6 of the 60 grid columns over two
// rows; the lower row gives it only the right 5, so the notch on the left is one
// column plus one gap wide. The step sits at the bottom edge of the upper row,
// half a gap above the middle. Corners are rounded like the other keys; shape()
// clips hit testing too, so the VR ray's elementFromPoint misses the notch.
// JIS の逆L字の Enter キー。ボタンは 60列グリッドのうち6列ぶんの幅で2行にまたがり、
// 下の行では右の5列しか使わないので、左の切り欠きは1列+1ギャップの幅になる。
// 段差は上の行の下端、つまり中央よりギャップ半分だけ上にある。角はほかのキーと同じく
// 丸める。shape() は当たり判定も切り抜くので、VRレイの elementFromPoint は切り欠きを拾わない。
const ENTER_KEY_RADIUS = '10px';
const NOTCH_X = '((100% - 5 * var(--kb-gap)) / 6 + var(--kb-gap))';
const STEP_Y = '(50% - var(--kb-gap) / 2)';
const ENTER_NOTCH_X = `calc${NOTCH_X}`;
const ENTER_KEY_SHAPE = (() => {
  const r = ENTER_KEY_RADIUS;
  return [
    `shape(from ${r} 0`,
    `hline to calc(100% - ${r})`,
    `arc to 100% ${r} of ${r} cw`,
    `vline to calc(100% - ${r})`,
    `arc to calc(100% - ${r}) 100% of ${r} cw`,
    `hline to calc(${NOTCH_X} + ${r})`,
    `arc to calc${NOTCH_X} calc(100% - ${r}) of ${r} cw`,
    `vline to calc(${STEP_Y} + ${r})`,
    `arc to calc(${NOTCH_X} - ${r}) calc${STEP_Y} of ${r} ccw`,
    `hline to ${r}`,
    `arc to 0 calc(${STEP_Y} - ${r}) of ${r} cw`,
    `vline to ${r}`,
    `arc to ${r} 0 of ${r} cw`,
    'close)',
  ].join(', ');
})();

const SOUND_SRC_MAP: Record<KeySoundVariant, string> = {
  soft: `${SOUND_BASE_URL}key-soft.mp3`,
  mechanical: `${SOUND_BASE_URL}key-mechanical.mp3`,
};

const VirtualKeyboard: FC<VirtualKeyboardProps> = ({
  onChar,
  onBackspace,
  onClear,
  onSend,
  onSpace,
  mode,
  onToggleMode,
  candidates,
  candidateIndex,
  isConverting,
  onCommitCandidate,
  language,
  keySoundEnabled,
  keySoundVariant,
  onHistoryUp,
  onHistoryDown,
}) => {
  const [shift, setShift] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const t = TRANSLATIONS[language];
  const tKeys = t.keys;
  const playKeyPressSound = useKeyPressSound({
    enabled: keySoundEnabled,
    src: SOUND_SRC_MAP[keySoundVariant],
  });

  // Handle key press event / キープレスイベントの処理
  const handleKeyPress = (key: KeyConfig) => {
    playKeyPressSound();

    switch (key.action) {
      case 'shift':
        if (capsLock) {
          setCapsLock(false);
          setShift(false);
        } else {
          setShift(!shift);
        }
        return;
      case 'backspace':
        onBackspace();
        return;
      case 'clear':
        onClear();
        return;
      case 'send':
        onSend();
        return;
      case 'space':
        onSpace();
        if (shift && !capsLock) {
          setShift(false);
        }
        return;
      case 'mode':
        onToggleMode();
        return;
      case 'tab':
        onToggleMode();
        return;
      case 'history-up':
        onHistoryUp?.();
        return;
      case 'history-down':
        onHistoryDown?.();
        return;
    }

    let char = key.value;
    const isShifted = shift || capsLock;

    if (isShifted) {
      if (key.shiftValue) char = key.shiftValue;
      else char = key.value.toUpperCase();
    }
    onChar(char);

    if (shift && !capsLock) {
      setShift(false);
    }
  };

  // Handle long press on Shift key for CapsLock / CapsLockのためのShiftキー長押しの処理
  const handleShiftLongPress = () => {
    playKeyPressSound();
    setCapsLock(!capsLock);
    setShift(false); // Reset temp shift logic / 一時的なシフトロジックをリセット
  };

  // Handle candidate commit / 変換候補の確定処理
  const handleCandidateCommit = (index: number) => {
    playKeyPressSound();
    onCommitCandidate(index);
  };

  return (
    <div className='flex flex-col w-full select-none'>
      {/* Suggestion strip, Gboard style: plain text split by thin rules, the
          selected candidate in a tonal pill. Keeps its height while empty so the
          keys do not jump when conversion starts.
          Gboard 風の候補帯。細い縦線で区切った文字だけを並べ、選択中の候補を tonal の
          pill にする。変換が始まってもキーが動かないよう、空のときも高さを保つ。 */}
      <div className='h-16 flex items-center overflow-hidden'>
        <div className='flex-1 min-w-0 h-full overflow-x-auto overflow-y-hidden scrollbar-none [mask-image:linear-gradient(to_right,#000_94%,transparent)]'>
          {isConverting && candidates.length > 0 && (
            <div className='inline-flex h-full items-center pr-16'>
              {candidates.slice(0, MAX_VISIBLE_CANDIDATES).map((candidate, index) => (
                <div key={`${candidate.text}-${index}`} className='flex h-full items-center'>
                  {/* Hidden next to the selected pill, which already separates itself
                      選択中の pill の隣では隠す。pill 自体が区切りになるため */}
                  {index > 0 && (
                    <span
                      aria-hidden='true'
                      className={`h-5 w-px ${
                        index === candidateIndex || index - 1 === candidateIndex ? '' : 'bg-line'
                      }`}
                    />
                  )}
                  <button
                    type='button'
                    onClick={() => handleCandidateCommit(index)}
                    // Keep the textarea focused, same as Key.tsx. Without this the
                    // candidate click blurs it and the caret jumps to the end.
                    // Key.tsx と同じくテキストエリアのフォーカスを保つ。これが無いと
                    // 候補クリックでblurし、キャレットが末尾へ飛ぶ。
                    onMouseDown={(e) => e.preventDefault()}
                    // Committed on VR trigger press, like the keys (Key.tsx).
                    // キーと同じく、VRのトリガーを押した瞬間に確定する(Key.tsx)。
                    data-vr-click='press'
                    // The whole strip height is the target; the pill inside stays small.
                    // 当たり判定は帯の高さいっぱい。見た目の pill は内側で小さく保つ。
                    className='h-full px-1 flex items-center'
                    title={candidate.source ? `${candidate.source}` : 'candidate'}
                  >
                    <span
                      className={`h-10 px-4 rounded-full text-xl whitespace-nowrap flex items-center gap-1.5 ${
                        index === candidateIndex ? 'bg-tonal text-on-tonal' : 'text-ink'
                      }`}
                    >
                      <span className='text-[13px] opacity-70 tabular-nums'>{index + 1}</span>
                      {candidate.text}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className='grid w-full'
        style={
          {
            '--kb-gap': KEYBOARD_GRID.GAP,
            gap: 'var(--kb-gap)',
            gridTemplateColumns: `repeat(${KEYBOARD_GRID.COLUMNS}, 1fr)`,
            gridAutoRows: KEYBOARD_GRID.ROW_HEIGHT,
          } as React.CSSProperties
        }
      >
        {KEYBOARD_LAYOUT.map((key, index) => {
          let displayKey = { ...key };

          // Localization / ローカリゼーション（多言語対応）
          if (key.action === 'send') displayKey.label = tKeys.send;
          if (key.action === 'clear') displayKey.label = tKeys.clear;
          // The space bar names the current input mode, like Gboard's language label.
          // スペースキーには、Gboard の言語表示のように現在の入力モードを出す。
          if (key.action === 'space') displayKey.label = t.modesShort[mode];
          if (key.action === 'backspace' && key.label === '←')
            displayKey.label = tKeys.backspace;

          // Dynamic Labels / 動的ラベル
          if (key.action === 'mode') displayKey.label = t.modeKeys[mode];

          // Spacer Logic for Enter Key / Enterキー用のスペーサーロジック
          if (key.isSpacer) {
            // Top part spacer (Row 2) - this holds the actual button
            if (key.gridCols === 6) {
              return (
                <div
                  key={index}
                  style={{
                    gridColumn: `span ${key.gridCols}`,
                    gridRow: `span ${key.gridRows || 1}`,
                    position: 'relative',
                  }}
                  className='pointer-events-none'
                >
                  <Key
                    config={{
                      label: tKeys.send,
                      value: 'enter',
                      action: 'send',
                      gridCols: 6,
                    }}
                    onPress={handleKeyPress}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: 'calc(200% + var(--kb-gap))', // Span 2 rows (100% + 100% + gap)
                      zIndex: 10,
                      clipPath: ENTER_KEY_SHAPE,
                      // Centre the label over the lower part / ラベルを下段の部分の中央に置く
                      paddingLeft: ENTER_NOTCH_X,
                    }}
                    className='pointer-events-auto' // Enable pointer events for the button itself
                  />
                </div>
              );
            }

            // Bottom part spacer (Row 3) - just a placeholder
            return (
              <div
                key={index}
                style={{
                  gridColumn: `span ${key.gridCols || 2}`,
                  gridRow: `span ${key.gridRows || 1}`,
                }}
                className='pointer-events-none'
              />
            );
          }

          const isKeyShiftActive = shift || capsLock;

          return (
            <Key
              key={index}
              config={displayKey}
              onPress={handleKeyPress}
              onLongPress={
                key.action === 'shift' ? handleShiftLongPress : undefined
              }
              highlight={key.action === 'shift' && isKeyShiftActive}
              isShiftActive={isKeyShiftActive}
              isCapsLock={capsLock}
            />
          );
        })}
      </div>
    </div>
  );
};

// Wrap with React.memo to prevent unnecessary re-renders / 不要な再レンダリングを防ぐためにReact.memoでラップ
export default memo(VirtualKeyboard);
