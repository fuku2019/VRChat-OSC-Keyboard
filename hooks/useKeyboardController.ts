/**
 * useKeyboardController - Hook to handle keyboard input logic for App.tsx
 * キーボード入力ロジックをApp.tsxから分離するフック
 */

import { useRef } from 'react';
import { CHATBOX } from '../constants';
import { InputMode } from '../types';

interface UseKeyboardControllerProps {
  input: string;
  buffer: string;
  displayText: string;
  mode: InputMode;
  setMode: (mode: InputMode) => void;
  setInput: (val: string) => void;
  overwriteInput: (val: string) => string;
  handleCharInput: (char: string, cursorPos?: number) => void;
  handleBackspace: (cursorPos?: number) => void;
  handleClear: () => void;
  handleSpace: (cursorPos?: number) => void;
  commitBuffer: () => void;
  handlePrimaryAction: () => void;
  handleInputEffect: (text: string) => void;
}

export const useKeyboardController = ({
  input,
  buffer,
  displayText,
  mode,
  setMode,
  setInput,
  overwriteInput,
  handleCharInput,
  handleBackspace,
  handleClear,
  handleSpace,
  commitBuffer,
  handlePrimaryAction,
  handleInputEffect,
}: UseKeyboardControllerProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preCompositionValue = useRef<string>(''); // Store value before IME composition / IME構成前の値を保存
  const isComposing = useRef<boolean>(false); // Track if IME is composing / IME構成中かどうかを追跡
  const lastCursorPosition = useRef<number | null>(null); // Store cursor position before virtual key click / 仮想キークリック前のカーソル位置を保存

  // Toggle input mode / 入力モードを切り替え
  const toggleMode = () => {
    commitBuffer();
    if (mode === InputMode.ENGLISH) setMode(InputMode.HIRAGANA);
    else if (mode === InputMode.HIRAGANA) setMode(InputMode.KATAKANA);
    else setMode(InputMode.ENGLISH);
    textareaRef.current?.focus();
  };

  // Handle virtual keyboard key press / 仮想キーボードのキー押下を処理
  const handleVirtualKey = (action: () => void) => {
    const savedPosition = lastCursorPosition.current;
    const oldLength = displayText.length; // Save text length before action / アクション前のテキスト長を保存
    action();
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        if (savedPosition !== null) {
          // Calculate cursor position based on text length change / テキスト長の変化に基づいてカーソル位置を計算
          const newLength = textareaRef.current.value.length;
          const newPos = Math.min(
            savedPosition + (newLength - oldLength),
            newLength,
          );
          textareaRef.current.selectionStart = newPos;
          textareaRef.current.selectionEnd = newPos;
          lastCursorPosition.current = newPos; // Update saved position / 保存位置を更新
        } else {
          // No saved position, move to end / 保存位置なし、末尾に移動
          const len = textareaRef.current.value.length;
          textareaRef.current.selectionStart = len;
          textareaRef.current.selectionEnd = len;
        }

        // Trigger input side effects / 入力副作用を発火
        const currentText = textareaRef.current.value;
        handleInputEffect(currentText);
      }
    }, 0);
  };

  // Handle physical keyboard key down / 物理キーボードのキーダウンを処理
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Enter') {
      if (!e.shiftKey) {
        e.preventDefault();
        handlePrimaryAction();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      toggleMode();
    } else if (e.key === 'Escape') {
      handleClear();
    }
  };

  // Store current value when IME composition starts / IME構成開始時に現在の値を保存
  const handleCompositionStart = () => {
    isComposing.current = true;
    preCompositionValue.current = input + buffer;
  };

  // When IME composition ends, apply the value with limit check / IME構成終了時に制限チェックして値を適用
  const handleCompositionEnd = (
    e: React.CompositionEvent<HTMLTextAreaElement>,
  ) => {
    isComposing.current = false;
    const newValue = e.currentTarget.value;

    if (newValue.length > CHATBOX.MAX_LENGTH) {
      // Revert to pre-composition value if over limit / 制限を超えたら構成前の値に戻す
      const applied = overwriteInput(preCompositionValue.current);
      handleInputEffect(applied);
    } else {
      // Apply the new value / 新しい値を適用
      const applied = overwriteInput(newValue);
      handleInputEffect(applied);
    }
  };

  // Handle textarea onChange - allow during IME composition for proper display / textareaのonChange処理 - IME表示のため構成中も許可
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;

    // During IME composition, allow all input (limit check happens in handleCompositionEnd)
    // IME構成中はすべての入力を許可（制限チェックはhandleCompositionEndで行う）
    if (isComposing.current) {
      const applied = overwriteInput(newValue);

      // Still trigger effects during IME (for typing indicator) / IME中もエフェクトを発火（タイピング表示のため）
      handleInputEffect(applied);
      return;
    }

    // For non-IME input, let overwriteInput handle trimming/blocking / 非IME入力はoverwriteInputにトリミング/ブロックを任せる
    const applied = overwriteInput(newValue);
    handleInputEffect(applied);
  };

  // Handle cursor position update on selection / 選択時のカーソル位置更新
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    lastCursorPosition.current = e.currentTarget.selectionStart;
  };

  // Create handlers for virtual keyboard / 仮想キーボード用のハンドラを作成
  const createVirtualKeyHandlers = () => ({
    onChar: (c: string) =>
      handleVirtualKey(() =>
        handleCharInput(c, lastCursorPosition.current ?? undefined),
      ),
    onBackspace: () =>
      handleVirtualKey(() =>
        handleBackspace(lastCursorPosition.current ?? undefined),
      ),
    onClear: () => handleVirtualKey(handleClear),
    onSend: () => handleVirtualKey(handlePrimaryAction),
    onSpace: () =>
      handleVirtualKey(() =>
        handleSpace(lastCursorPosition.current ?? undefined),
      ),
    onToggleMode: () => handleVirtualKey(toggleMode),
  });

  return {
    textareaRef,
    isComposing,
    lastCursorPosition,
    toggleMode,
    handleVirtualKey,
    handleKeyDown,
    handleCompositionStart,
    handleCompositionEnd,
    handleTextareaChange,
    handleSelect,
    createVirtualKeyHandlers,
  };
};
