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
  overwriteInput: (text: string) => string; // For syncing with physical textarea / 物理的なテキストエリアと同期するため
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
    return (
      input.slice(0, bufferPosition) + buffer + input.slice(bufferPosition)
    );
  }, [input, buffer, bufferPosition]);

  const commitBuffer = useCallback(() => {
    if (buffer.length > 0) {
      if (bufferPosition !== null && bufferPosition <= input.length) {
        // Ensure position is within valid range / 位置が有効な範囲内であることを確認
        const safePosition = Math.max(
          0,
          Math.min(bufferPosition, input.length),
        );
        // Insert buffer at the stored position / 保存された位置にバッファを挿入
        setInput(
          input.slice(0, safePosition) + buffer + input.slice(safePosition),
        );
      } else {
        setInput((prev) => prev + buffer);
      }
      setBuffer('');
      setBufferPosition(null);
    }
  }, [buffer, bufferPosition, input]);

  // Called when typing directly into the textarea (Physical Keyboard / Native IME) / テキストエリアに直接入力するときに呼び出される（物理キーボード / ネイティブIME）
  const overwriteInput = useCallback(
    (text: string): string => {
      const currentValue = input + buffer;

      // If already at max and trying to add more characters, block completely (no slice)
      // 既に最大長に達していて文字を追加しようとしている場合は完全にブロック（sliceしない）
      if (
        currentValue.length >= maxLength &&
        text.length > currentValue.length
      ) {
        return currentValue; // Reject input entirely / 入力を完全に拒否
      }

      // Truncate to maxLength if exceeded (for paste operations etc.)
      // maxLengthを超えた場合は切り捨て（ペースト操作などの場合）
      const truncated =
        text.length > maxLength ? text.slice(0, maxLength) : text;
      setInput(truncated);
      setBuffer(''); // Clear local buffer as native IME handles composition / ネイティブIMEが構成を処理するため、ローカルバッファをクリアする
      setBufferPosition(null);
      return truncated;
    },
    [input, buffer, maxLength],
  );

  // Called by Virtual Keyboard buttons / バーチャルキーボードのボタンから呼び出される
  const handleCharInput = useCallback(
    (char: string, cursorPosition?: number) => {
      // Check if adding this char would exceed maxLength / この文字を追加するとmaxLengthを超えるかチェック
      const currentLength = input.length + buffer.length;
      if (currentLength >= maxLength) return; // Block input if at limit / 制限に達したら入力をブロック

      const displayCursorPos =
        cursorPosition !== undefined ? cursorPosition : displayText.length;

      const insertDirectChar = (text: string) => {
        const baseText = displayText;
        const pos = Math.max(0, Math.min(displayCursorPos, baseText.length));
        const nextText = baseText.slice(0, pos) + text + baseText.slice(pos);
        setInput(nextText);
        setBuffer('');
        setBufferPosition(null);
      };

      // Calculate effective cursor position in input (excluding buffer) / input内の有効なカーソル位置を計算（バッファを除く）
      const effectiveCursorPos =
        cursorPosition !== undefined
          ? bufferPosition !== null && cursorPosition > bufferPosition
            ? Math.max(0, cursorPosition - buffer.length)
            : cursorPosition
          : input.length;

      if (mode === InputMode.ENGLISH) {
        insertDirectChar(char);
        return;
      }

      // Japanese Logic / 日本語ロジック

      // Check if input is Uppercase (Shift+Key behavior in JP mode) / 入力が大文字かどうかを確認する（JPモードでのShift+Keyの動作）
      // This allows typing Uppercase English letters while in Hiragana/Katakana mode / これにより、ひらがな/カタカナモード中に大文字の英字を入力できる
      if (/^[A-Z]$/.test(char)) {
        insertDirectChar(char);
        return;
      }

      // Only process lowercase alphabet chars and hyphen for IME conversion / IME変換のために小文字のアルファベットとハイフンのみを処理する
      // Numbers and symbols should go through directly / 数字と記号はそのまま通す
      if (!/^[a-z-]$/.test(char)) {
        insertDirectChar(char);
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
        const rawPos =
          bufferPosition !== null
            ? bufferPosition
            : Math.min(effectiveCursorPos, input.length);
        // Ensure position is within valid range / 位置が有効な範囲内であることを確認
        const pos = Math.max(0, Math.min(rawPos, input.length));
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
    [buffer, mode, input, maxLength, bufferPosition, displayText],
  );

  const handleBackspace = useCallback(
    (cursorPosition?: number) => {
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
    },
    [buffer, input],
  );

  const handleClear = useCallback(() => {
    setBuffer('');
    setInput('');
    setBufferPosition(null);
  }, []);

  const handleSpace = useCallback(
    (cursorPosition?: number) => {
      // Check if adding space would exceed maxLength / スペース追加がmaxLengthを超えるかチェック
      const currentLength = input.length + buffer.length;
      if (currentLength >= maxLength) {
        // Just commit buffer without adding space / スペースを追加せずにバッファのみ確定
        commitBuffer();
        return;
      }

      // Calculate the position where space should be inserted after buffer commit / バッファ確定後にスペースを挿入する位置を計算
      let spaceInsertPosition: number | undefined;
      let inputAfterCommit = input;

      if (buffer.length > 0) {
        // Calculate what input will be after commit / 確定後の入力を計算
        if (bufferPosition !== null && bufferPosition <= input.length) {
          inputAfterCommit =
            input.slice(0, bufferPosition) +
            buffer +
            input.slice(bufferPosition);
          // Adjust cursor position to account for committed buffer / 確定されたバッファを考慮してカーソル位置を調整
          if (cursorPosition !== undefined) {
            spaceInsertPosition = cursorPosition; // Cursor is already at correct position in displayText / カーソルは既にdisplayText内の正しい位置にある
          }
        } else {
          inputAfterCommit = input + buffer;
          if (cursorPosition !== undefined) {
            spaceInsertPosition = cursorPosition;
          }
        }
        // Commit buffer by updating input directly / inputを直接更新してバッファを確定
        setInput(inputAfterCommit);
        setBuffer('');
        setBufferPosition(null);
      }

      // Insert space at cursor position / カーソル位置にスペースを挿入
      const targetInput = buffer.length > 0 ? inputAfterCommit : input;
      const insertPos =
        spaceInsertPosition !== undefined
          ? spaceInsertPosition
          : cursorPosition;

      if (insertPos !== undefined && insertPos <= targetInput.length) {
        setInput(
          targetInput.slice(0, insertPos) + ' ' + targetInput.slice(insertPos),
        );
      } else {
        setInput(targetInput + ' ');
      }
    },
    [buffer, bufferPosition, input, maxLength, commitBuffer],
  );

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
