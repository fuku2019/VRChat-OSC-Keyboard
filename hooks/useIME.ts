import { useState, useCallback } from 'react';
import { InputMode } from '../types';
import { toKana, convertToKatakana } from '../utils/ime';
import { CHATBOX } from '../constants';

interface UseIMEReturn {
  input: string; // Committed text / 確定したテキスト
  buffer: string; // Typing buffer (pre-conversion) / 入力バッファ（変換前）
  mode: InputMode;
  setMode: (mode: InputMode) => void;
  setInput: (text: string) => void;
  overwriteInput: (text: string) => void; // For syncing with physical textarea / 物理的なテキストエリアと同期するため
  handleCharInput: (char: string) => void;
  handleBackspace: () => void;
  handleClear: () => void;
  handleSpace: () => void;
  commitBuffer: () => void;
}

export const useIME = (
  initialMode: InputMode = InputMode.HIRAGANA,
  maxLength: number = CHATBOX.MAX_LENGTH,
): UseIMEReturn => {
  const [input, setInput] = useState('');
  const [buffer, setBuffer] = useState('');
  const [mode, setMode] = useState<InputMode>(initialMode);

  const commitBuffer = useCallback(() => {
    if (buffer.length > 0) {
      setInput((prev) => prev + buffer);
      setBuffer('');
    }
  }, [buffer]);

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
  }, [input, buffer, maxLength]);

  // Called by Virtual Keyboard buttons / バーチャルキーボードのボタンから呼び出される
  const handleCharInput = useCallback(
    (char: string) => {
      // Check if adding this char would exceed maxLength / この文字を追加するとmaxLengthを超えるかチェック
      const currentLength = input.length + buffer.length;
      if (currentLength >= maxLength) return; // Block input if at limit / 制限に達したら入力をブロック

      if (mode === InputMode.ENGLISH) {
        commitBuffer(); // Ensure buffer is empty before adding direct chars / 直接文字を追加する前にバッファが空であることを確認する
        setInput((prev) => prev + char);
        return;
      }

      // Japanese Logic / 日本語ロジック

      // Check if input is Uppercase (Shift+Key behavior in JP mode) / 入力が大文字かどうかを確認する（JPモードでのShift+Keyの動作）
      // This allows typing Uppercase English letters while in Hiragana/Katakana mode / これにより、ひらがな/カタカナモード中に大文字の英字を入力できる
      if (/^[A-Z]$/.test(char)) {
        commitBuffer();
        setInput((prev) => prev + char);
        return;
      }

      // Only process lowercase alphabet chars and hyphen for IME conversion / IME変換のために小文字のアルファベットとハイフンのみを処理する
      // Numbers and symbols should go through directly / 数字と記号はそのまま通す
      if (!/^[a-z-]$/.test(char)) {
        commitBuffer();
        setInput((prev) => prev + char);
        return;
      }

      const lowerChar = char.toLowerCase();
      const res = toKana(lowerChar, buffer);

      if (res.output) {
        let out = res.output;
        if (mode === InputMode.KATAKANA) {
          out = convertToKatakana(out);
        }
        setInput((prev) => prev + out);
      }
      setBuffer(res.newBuffer);
    },
    [buffer, mode, commitBuffer, input, maxLength],
  );

  const handleBackspace = useCallback(() => {
    if (buffer.length > 0) {
      setBuffer((prev) => prev.slice(0, -1));
    } else {
      setInput((prev) => prev.slice(0, -1));
    }
  }, [buffer]);

  const handleClear = useCallback(() => {
    setBuffer('');
    setInput('');
  }, []);

  const handleSpace = useCallback(() => {
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
    setInput((prev) => prev + ' ');
  }, [buffer, commitBuffer, input, maxLength]);

  return {
    input,
    buffer,
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
