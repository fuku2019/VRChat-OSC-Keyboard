import { useState, useCallback, useMemo } from 'react';
import { InputMode } from '../types';
import { toKana, convertToKatakana } from '../utils/ime';
import { CHATBOX } from '../constants';

interface UseIMEReturn {
  input: string; // Committed text / 確定したテキスト
  buffer: string; // Typing buffer (pre-conversion) / 入力バッファ（変換前）
  displayText: string; // Text to display (input with buffer inserted at correct position) / 表示用テキスト（バッファを正しい位置に挿入したinput）
  bufferPosition: number | null; // Position where buffer is inserted / バッファが挿入される位置
  mode: InputMode;
  setMode: (mode: InputMode) => void;
  setInput: (text: string) => void;
  overwriteInput: (text: string) => void; // For syncing with physical textarea / 物理的なテキストエリアと同期するため
  handleCharInput: (char: string, cursorPosition?: number) => void;
  handleBackspace: (cursorPosition?: number) => void;
  handleClear: () => void;
  handleSpace: (cursorPosition?: number) => void;
  commitBuffer: () => void;
}

export const useIME = (
  initialMode: InputMode = InputMode.HIRAGANA,
  maxLength: number = CHATBOX.MAX_LENGTH,
): UseIMEReturn => {
  const [input, setInput] = useState('');
  const [buffer, setBuffer] = useState('');
  const [bufferPosition, setBufferPosition] = useState<number | null>(null);
  const [mode, setMode] = useState<InputMode>(initialMode);

  // Calculate display text with buffer inserted at correct position / バッファを正しい位置に挿入した表示用テキストを計算
  const displayText = useMemo(() => {
    if (buffer.length === 0 || bufferPosition === null) {
      return input + buffer; // Fallback: append buffer at end / フォールバック: バッファを末尾に追加
    }
    return input.slice(0, bufferPosition) + buffer + input.slice(bufferPosition);
  }, [input, buffer, bufferPosition]);

  const commitBuffer = useCallback(() => {
    if (buffer.length > 0) {
      if (bufferPosition !== null && bufferPosition <= input.length) {
        // Insert buffer at the stored position / 保存された位置にバッファを挿入
        setInput(input.slice(0, bufferPosition) + buffer + input.slice(bufferPosition));
      } else {
        setInput((prev) => prev + buffer);
      }
      setBuffer('');
      setBufferPosition(null);
    }
  }, [buffer, bufferPosition, input]);

  // Called when typing directly into the textarea (Physical Keyboard / Native IME) / テキストエリアに直接入力するときに呼び出される（物理キーボード / ネイティブIME）
  const overwriteInput = useCallback((text: string) => {
    const currentValue = input + buffer;
    
    // If already at max and trying to add more characters, block completely (no slice)
    // 既に最大長に達していて文字を追加しようとしている場合は完全にブロック（sliceしない）
    if (currentValue.length >= maxLength && text.length > currentValue.length) {
      return; // Reject input entirely / 入力を完全に拒否
    }
    
    // Truncate to maxLength if exceeded (for paste operations etc.)
    // maxLengthを超えた場合は切り捨て（ペースト操作などの場合）
    const truncated = text.length > maxLength ? text.slice(0, maxLength) : text;
    setInput(truncated);
    setBuffer(''); // Clear local buffer as native IME handles composition / ネイティブIMEが構成を処理するため、ローカルバッファをクリアする
    setBufferPosition(null);
  }, [input, buffer, maxLength]);

  // Called by Virtual Keyboard buttons / バーチャルキーボードのボタンから呼び出される
  const handleCharInput = useCallback(
    (char: string, cursorPosition?: number) => {
      // Check if adding this char would exceed maxLength / この文字を追加するとmaxLengthを超えるかチェック
      const currentLength = input.length + buffer.length;
      if (currentLength >= maxLength) return; // Block input if at limit / 制限に達したら入力をブロック

      // Calculate effective cursor position in input (excluding buffer) / input内の有効なカーソル位置を計算（バッファを除く）
      const effectiveCursorPos = cursorPosition !== undefined 
        ? (bufferPosition !== null && cursorPosition > bufferPosition 
            ? Math.max(0, cursorPosition - buffer.length) 
            : cursorPosition)
        : input.length;

      // Helper function to insert char at position / 位置に文字を挿入するヘルパー関数
      const insertAtPosition = (text: string) => {
        const pos = Math.min(effectiveCursorPos, input.length);
        return input.slice(0, pos) + text + input.slice(pos);
      };

      if (mode === InputMode.ENGLISH) {
        commitBuffer(); // Ensure buffer is empty before adding direct chars / 直接文字を追加する前にバッファが空であることを確認する
        setInput(insertAtPosition(char));
        setBufferPosition(null);
        return;
      }

      // Japanese Logic / 日本語ロジック

      // Check if input is Uppercase (Shift+Key behavior in JP mode) / 入力が大文字かどうかを確認する（JPモードでのShift+Keyの動作）
      // This allows typing Uppercase English letters while in Hiragana/Katakana mode / これにより、ひらがな/カタカナモード中に大文字の英字を入力できる
      if (/^[A-Z]$/.test(char)) {
        commitBuffer();
        setInput(insertAtPosition(char));
        setBufferPosition(null);
        return;
      }

      // Only process lowercase alphabet chars and hyphen for IME conversion / IME変換のために小文字のアルファベットとハイフンのみを処理する
      // Numbers and symbols should go through directly / 数字と記号はそのまま通す
      if (!/^[a-z-]$/.test(char)) {
        commitBuffer();
        setInput(insertAtPosition(char));
        setBufferPosition(null);
        return;
      }

      // If buffer is empty, set buffer position to current cursor position / バッファが空の場合はバッファ位置を現在のカーソル位置に設定
      if (buffer.length === 0) {
        setBufferPosition(Math.min(effectiveCursorPos, input.length));
      }

      const lowerChar = char.toLowerCase();
      const res = toKana(lowerChar, buffer);

      if (res.output) {
        let out = res.output;
        if (mode === InputMode.KATAKANA) {
          out = convertToKatakana(out);
        }
        // Insert converted kana at buffer position / 変換されたかなをバッファ位置に挿入
        const pos = bufferPosition !== null ? bufferPosition : Math.min(effectiveCursorPos, input.length);
        setInput(input.slice(0, pos) + out + input.slice(pos));
        // Update buffer position for next character / 次の文字のためにバッファ位置を更新
        if (res.newBuffer.length > 0) {
          setBufferPosition(pos + out.length);
        } else {
          setBufferPosition(null);
        }
      }
      setBuffer(res.newBuffer);
    },
    [buffer, mode, commitBuffer, input, maxLength, bufferPosition],
  );

  const handleBackspace = useCallback((cursorPosition?: number) => {
    if (buffer.length > 0) {
      setBuffer((prev) => prev.slice(0, -1));
      if (buffer.length === 1) {
        setBufferPosition(null);
      }
    } else if (cursorPosition !== undefined && cursorPosition > 0) {
      // Delete character at cursor position - 1 / カーソル位置-1の文字を削除
      const pos = Math.min(cursorPosition - 1, input.length - 1);
      if (pos >= 0) {
        setInput(input.slice(0, pos) + input.slice(pos + 1));
      }
    } else {
      setInput((prev) => prev.slice(0, -1));
    }
  }, [buffer, input]);

  const handleClear = useCallback(() => {
    setBuffer('');
    setInput('');
    setBufferPosition(null);
  }, []);

  const handleSpace = useCallback((cursorPosition?: number) => {
    // Check if adding space would exceed maxLength / スペース追加がmaxLengthを超えるかチェック
    const currentLength = input.length + buffer.length;
    if (currentLength >= maxLength) {
      // Just commit buffer without adding space / スペースを追加せずにバッファのみ確定
      commitBuffer();
      return;
    }

    if (buffer.length > 0) {
      // Simple behavior: just commit current buffer as is / 単純な動作: 現在のバッファをそのまま確定する
      commitBuffer();
    }
    
    // Insert space at cursor position / カーソル位置にスペースを挿入
    if (cursorPosition !== undefined && cursorPosition <= input.length) {
      setInput(input.slice(0, cursorPosition) + ' ' + input.slice(cursorPosition));
    } else {
      setInput((prev) => prev + ' ');
    }
  }, [buffer, commitBuffer, input, maxLength]);

  return {
    input,
    buffer,
    displayText,
    bufferPosition,
    mode,
    setMode,
    setInput,
    overwriteInput,
    handleCharInput,
    handleBackspace,
    handleClear,
    handleSpace,
    commitBuffer,
  };
};
