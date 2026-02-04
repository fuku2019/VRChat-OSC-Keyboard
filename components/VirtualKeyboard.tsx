import { useState, FC, memo } from 'react';
import { KEYBOARD_LAYOUT, TRANSLATIONS, KEYBOARD_GRID } from '../constants';
import { KeyConfig, InputMode, Language } from '../types';
import Key from './Key';
import packageJson from '../package.json';

const APP_VERSION = packageJson.version;

interface VirtualKeyboardProps {
  onChar: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSend: () => void;
  onSpace: () => void;
  mode: InputMode;
  onToggleMode: () => void;
  buffer: string;
  language: Language;
}

const VirtualKeyboard: FC<VirtualKeyboardProps> = ({
  onChar,
  onBackspace,
  onClear,
  onSend,
  onSpace,
  mode,
  onToggleMode,
  buffer,
  language,
}) => {
  const [shift, setShift] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const tKeys = TRANSLATIONS[language].keys;

  const handleKeyPress = (key: KeyConfig) => {
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
        return;
      case 'mode':
        onToggleMode();
        return;
      case 'tab':
        onToggleMode();
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

  const handleShiftLongPress = () => {
    setCapsLock(!capsLock);
    setShift(false); // Reset temp shift logic / 一時的なシフトロジックをリセット
  };

  return (
    <div className='flex flex-col w-full max-w-5xl mx-auto p-2 dark:bg-slate-900/90 bg-slate-100/90 rounded-2xl shadow-2xl border dark:border-slate-700 border-slate-300 select-none backdrop-blur-sm transition-colors duration-300'>
      <div className='h-8 mb-2 px-4 flex items-center dark:text-primary-300 text-primary-700 font-mono text-lg overflow-hidden'>
        {buffer && (
          <span className='border-b-2 border-primary-500 animate-pulse dark:bg-primary-900/30 bg-primary-100 px-1 rounded'>
            {buffer}
          </span>
        )}
      </div>

      <div
        className='grid gap-1 w-full'
        style={{
          gridTemplateColumns: `repeat(${KEYBOARD_GRID.COLUMNS}, 1fr)`,
          gridAutoRows: KEYBOARD_GRID.ROW_HEIGHT,
        }}
      >
        {KEYBOARD_LAYOUT.map((key, index) => {
          let displayKey = { ...key };

          // Localization / ローカリゼーション（多言語対応）
          if (key.action === 'send') displayKey.label = tKeys.send;
          if (key.action === 'clear') displayKey.label = tKeys.clear;
          if (key.action === 'space' && key.label.trim() === '')
            displayKey.label = tKeys.space;
          if (key.action === 'backspace' && key.label === '←')
            displayKey.label = tKeys.backspace;

          // Dynamic Labels / 動的ラベル
          if (key.action === 'mode') {
            displayKey.label =
              mode === InputMode.ENGLISH
                ? 'ENG'
                : mode === InputMode.HIRAGANA
                  ? 'あ'
                  : 'ア';
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

      <div className='mt-2 flex justify-between px-4 text-slate-500 text-xs'>
        <span>JIS Layout (Standard)</span>
        <span>VRChat OSC Keyboard v{APP_VERSION}</span>
      </div>
    </div>
  );
};

// Wrap with React.memo to prevent unnecessary re-renders / 不要な再レンダリングを防ぐためにReact.memoでラップ
export default memo(VirtualKeyboard);
