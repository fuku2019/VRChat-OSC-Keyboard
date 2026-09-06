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
  isConverting: boolean;
  mode: InputMode;
  setMode: (mode: InputMode) => void;
  setInput: (val: string) => void;
  overwriteInput: (val: string) => string;
  handleCharInput: (char: string, cursorPos?: number) => void;
  handleBackspace: (cursorPos?: number) => void;
  handleClear: () => void;
  handleSpace: (cursorPos?: number) => void;
  handleCommitCandidate: (index?: number) => void;
  handleCancelConversion: () => void;
  commitBuffer: () => void;
  handlePrimaryAction: () => void;
  handleInputEffect: (text: string) => void;
  onHistoryUp?: () => void; // Navigate to older history / 古い履歴へ移動
  onHistoryDown?: () => void; // Navigate to newer history / 新しい履歴へ移動
}

export const useKeyboardController = ({
  input,
  buffer,
  displayText,
  isConverting,
  mode,
  setMode,
  setInput,
  overwriteInput,
  handleCharInput,
  handleBackspace,
  handleClear,
  handleSpace,
  handleCommitCandidate,
  handleCancelConversion,
  commitBuffer,
  handlePrimaryAction,
  handleInputEffect,
  onHistoryUp,
  onHistoryDown,
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
    // Use requestAnimationFrame for reliable cursor positioning after React render / Reactレンダリング後の確実なカーソル位置設定のためrAFを使用
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        if (savedPosition !== null) {
          // Calculate cursor position based on text length change / テキスト長の変化に基づいてカーソル位置を計算
          const newLength = textareaRef.current.value.length;
          const newPos = Math.min(
            Math.max(0, savedPosition + (newLength - oldLength)),
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
    });
  };

  // Handle physical keyboard key down / 物理キーボードのキーダウンを処理
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Enter') {
      if (isConverting) {
        e.preventDefault();
        handleCommitCandidate();
        return;
      }
      if (!e.shiftKey) {
        e.preventDefault();
        handlePrimaryAction();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      toggleMode();
    } else if (e.key === 'Escape') {
      if (isConverting) {
        handleCancelConversion();
        return;
      }
      handleClear();
    } else if (e.key === 'ArrowUp' && !isConverting) {
      // Navigate to older history / 古い履歴へ移動
      // Same path as the virtual ↑ key: recalled text replaces the input without
      // an onChange, so the side effects must be fired explicitly.
      // 仮想キーの↑と同じ経路を使う。呼び出した履歴は onChange を経ずに入力を
      // 置き換えるため、副作用を明示的に発火させる必要がある。
      if (onHistoryUp) {
        e.preventDefault();
        handleVirtualKey(onHistoryUp);
      }
    } else if (e.key === 'ArrowDown' && !isConverting) {
      // Navigate to newer history / 新しい履歴へ移動
      if (onHistoryDown) {
        e.preventDefault();
        handleVirtualKey(onHistoryDown);
      }
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
    onSend: () =>
      handleVirtualKey(() =>
        isConverting ? handleCommitCandidate() : handlePrimaryAction(),
      ),
    onSpace: () =>
      handleVirtualKey(() =>
        handleSpace(lastCursorPosition.current ?? undefined),
      ),
    onToggleMode: () => handleVirtualKey(toggleMode),
    // Route candidate clicks through the same path as the other virtual keys so
    // the commit refocuses the textarea and runs the input side effects
    // (typing indicator / auto-send) instead of silently updating state.
    // 候補クリックも他の仮想キーと同じ経路に通し、確定時にテキストエリアへ
    // フォーカスを戻し入力副作用（タイピング表示 / 自動送信）を発火させる。
    onCommitCandidate: (index: number) =>
      handleVirtualKey(() => handleCommitCandidate(index)),
    onHistoryUp: onHistoryUp
      ? () => handleVirtualKey(() => onHistoryUp())
      : undefined,
    onHistoryDown: onHistoryDown
      ? () => handleVirtualKey(() => onHistoryDown())
      : undefined,
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
