import { useState, useCallback } from 'react';
import { InputMode } from '../types';
import { toKana, convertToKatakana } from '../utils/ime';

interface UseIMEReturn {
  input: string;      // Committed text
  buffer: string;     // Typing buffer (pre-conversion)
  mode: InputMode;
  setMode: (mode: InputMode) => void;
  setInput: (text: string) => void;
  overwriteInput: (text: string) => void; // For syncing with physical textarea
  handleCharInput: (char: string) => void;
  handleBackspace: () => void;
  handleClear: () => void;
  handleSpace: () => void;
  commitBuffer: () => void;
}

export const useIME = (initialMode: InputMode = InputMode.HIRAGANA): UseIMEReturn => {
  const [input, setInput] = useState('');
  const [buffer, setBuffer] = useState('');
  const [mode, setMode] = useState<InputMode>(initialMode);

  const commitBuffer = useCallback(() => {
    if (buffer.length > 0) {
      setInput(prev => prev + buffer);
      setBuffer('');
    }
  }, [buffer]);

  // Called when typing directly into the textarea (Physical Keyboard / Native IME)
  const overwriteInput = useCallback((text: string) => {
    setInput(text);
    setBuffer(''); // Clear local buffer as native IME handles composition
  }, []);

  // Called by Virtual Keyboard buttons
  const handleCharInput = useCallback((char: string) => {
    if (mode === InputMode.ENGLISH) {
      commitBuffer(); // Ensure buffer is empty before adding direct chars
      setInput(prev => prev + char);
      return;
    }

    // Japanese Logic
    // Only process alphabet chars for IME, others (numbers/symbols) go direct
    if (!/^[a-zA-Z-]$/.test(char)) {
      commitBuffer();
      setInput(prev => prev + char);
      return;
    }

    const lowerChar = char.toLowerCase();
    const res = toKana(lowerChar, buffer);
    
    if (res.output) {
      let out = res.output;
      if (mode === InputMode.KATAKANA) {
        out = convertToKatakana(out);
      }
      setInput(prev => prev + out);
    }
    setBuffer(res.newBuffer);

  }, [buffer, mode, commitBuffer]);

  const handleBackspace = useCallback(() => {
    if (buffer.length > 0) {
      setBuffer(prev => prev.slice(0, -1));
    } else {
      setInput(prev => prev.slice(0, -1));
    }
  }, [buffer]);

  const handleClear = useCallback(() => {
    setBuffer('');
    setInput('');
  }, []);

  const handleSpace = useCallback(() => {
    if (buffer.length > 0) {
      // Simple behavior: just commit current buffer as is
      commitBuffer();
    }
    setInput(prev => prev + ' ');
  }, [buffer, commitBuffer]);

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
    commitBuffer
  };
};