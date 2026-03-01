import { useState, useCallback, useMemo, useRef } from 'react';
import { InputMode } from '../types';
import {
  toKana,
  convertToKatakana,
  katakanaToHiragana,
  dedupeCandidates,
  extractPreviousWord,
} from '../utils/ime';
import { CHATBOX } from '../constants';
import type { ImeCandidate, ImeContext, ImeSegment, ImeState } from '../types/ime';

const LOCAL_MAX_CANDIDATES = 20;

interface UseIMEReturn {
  input: string; // Committed text / 確定したテキスト
  buffer: string; // Romaji typing buffer / ローマ字入力バッファ
  rawKana: string; // Kana preedit before conversion / 変換前のかな
  segments: ImeSegment[];
  candidates: ImeCandidate[];
  candidateIndex: number;
  isConverting: boolean;
  displayText: string; // Text for textarea / テキストエリア表示用文字列
  bufferPosition: number | null; // Position where preedit is inserted / 未確定文字列の挿入位置
  mode: InputMode;
  setMode: (mode: InputMode) => void;
  setInput: (text: string) => void;
  overwriteInput: (text: string) => string; // For physical textarea sync / 物理テキストエリア同期用
  handleCharInput: (char: string, cursorPosition?: number) => void;
  handleBackspace: (cursorPosition?: number) => void;
  handleClear: () => void;
  handleSpace: (cursorPosition?: number) => void;
  handleCommitCandidate: (index?: number) => void;
  handleCancelConversion: () => void;
  commitBuffer: () => void;
}

const buildLocalFallbackCandidates = (kana: string): ImeCandidate[] => {
  const normalizedKana = katakanaToHiragana(kana);
  const fallback: ImeCandidate[] = [
    {
      text: normalizedKana,
      reading: normalizedKana,
      source: 'fallback',
      dictSource: 'fallback',
      score: 10,
    },
    {
      text: convertToKatakana(normalizedKana),
      reading: normalizedKana,
      source: 'fallback',
      dictSource: 'fallback',
      score: 9,
    },
  ];
  return dedupeCandidates(fallback);
};

const hasImeIpcApi = () => {
  if (typeof window === 'undefined') return false;
  const api = window.electronAPI;
  return Boolean(
    api?.imeConvert &&
      api?.imeNextCandidate &&
      api?.imeCommitCandidate &&
      api?.imeCancelConversion,
  );
};

export const useIME = (
  initialMode: InputMode = InputMode.HIRAGANA,
  maxLength: number = CHATBOX.MAX_LENGTH,
): UseIMEReturn => {
  const [input, setInput] = useState('');
  const [buffer, setBuffer] = useState('');
  const [rawKana, setRawKana] = useState('');
  const [segments, setSegments] = useState<ImeSegment[]>([]);
  const [candidates, setCandidates] = useState<ImeCandidate[]>([]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const [bufferPosition, setBufferPosition] = useState<number | null>(null);
  const [mode, setMode] = useState<InputMode>(initialMode);
  const ipcRequestIdRef = useRef(0);

  const preeditText = useMemo(() => {
    if (isConverting) {
      return candidates[candidateIndex]?.text || rawKana;
    }
    return rawKana + buffer;
  }, [isConverting, candidates, candidateIndex, rawKana, buffer]);

  // Calculate display text with preedit inserted at the correct position.
  // 未確定文字列を正しい位置に挿入した表示文字列を計算
  const displayText = useMemo(() => {
    if (!preeditText) return input;
    if (bufferPosition === null) return input + preeditText;
    const safePosition = Math.max(0, Math.min(bufferPosition, input.length));
    return (
      input.slice(0, safePosition) + preeditText + input.slice(safePosition)
    );
  }, [input, preeditText, bufferPosition]);

  const clearConversionState = useCallback(() => {
    setSegments([]);
    setCandidates([]);
    setCandidateIndex(0);
    setIsConverting(false);
  }, []);

  const clearAllPendingState = useCallback(() => {
    setBuffer('');
    setRawKana('');
    clearConversionState();
    setBufferPosition(null);
  }, [clearConversionState]);

  const applyImeState = useCallback((state?: ImeState) => {
    if (!state) return;
    setRawKana(state.rawKana || '');
    setSegments(Array.isArray(state.segments) ? state.segments : []);
    setCandidates(Array.isArray(state.candidates) ? state.candidates : []);
    setCandidateIndex(
      Number.isInteger(state.candidateIndex) ? state.candidateIndex : 0,
    );
    setIsConverting(Boolean(state.isConverting));
  }, []);

  const insertCommittedText = useCallback(
    (text: string) => {
      if (!text) return;
      setInput((prev) => {
        if (bufferPosition === null) return prev + text;
        const safePosition = Math.max(0, Math.min(bufferPosition, prev.length));
        return (
          prev.slice(0, safePosition) + text + prev.slice(safePosition)
        );
      });
      clearAllPendingState();
    },
    [bufferPosition, clearAllPendingState],
  );

  const commitBuffer = useCallback(() => {
    if (!preeditText) return;
    if (isConverting && hasImeIpcApi()) {
      void window.electronAPI?.imeCommitCandidate?.(candidateIndex, {
        previousWord: extractPreviousWord(input),
        currentInput: input,
      });
    }
    insertCommittedText(preeditText);
  }, [preeditText, isConverting, candidateIndex, input, insertCommittedText]);

  // Called when typing directly into textarea (physical keyboard / native IME)
  // テキストエリアへ直接入力時（物理キーボード / ネイティブIME）
  const overwriteInput = useCallback(
    (text: string): string => {
      const currentValue = displayText;
      if (
        currentValue.length >= maxLength &&
        text.length > currentValue.length
      ) {
        return currentValue;
      }

      const truncated =
        text.length > maxLength ? text.slice(0, maxLength) : text;
      setInput(truncated);
      clearAllPendingState();
      return truncated;
    },
    [displayText, maxLength, clearAllPendingState],
  );

  const startLocalConversion = useCallback(
    (kana: string) => {
      if (!kana) {
        clearConversionState();
        return;
      }
      const localCandidates = buildLocalFallbackCandidates(kana);
      setRawKana(kana);
      setCandidates(localCandidates);
      setCandidateIndex(0);
      setSegments([
        {
          raw: kana,
          candidates: localCandidates,
          selectedIndex: 0,
        },
      ]);
      setIsConverting(true);
    },
    [clearConversionState],
  );

  const requestConversion = useCallback(
    (kana: string, context: ImeContext = {}) => {
      if (!kana) {
        clearConversionState();
        return;
      }

      if (hasImeIpcApi()) {
        const requestId = ++ipcRequestIdRef.current;
        void window.electronAPI
          ?.imeConvert?.(kana, context)
          .then((response) => {
            if (requestId !== ipcRequestIdRef.current) return;
            if (response?.success && response.state) {
              applyImeState(response.state);
            } else {
              startLocalConversion(kana);
            }
          })
          .catch(() => {
            if (requestId !== ipcRequestIdRef.current) return;
            startLocalConversion(kana);
          });
        return;
      }

      startLocalConversion(kana);
    },
    [applyImeState, clearConversionState, startLocalConversion],
  );

  const handleCommitCandidate = useCallback(
    (index?: number) => {
      if (!isConverting) {
        commitBuffer();
        return;
      }

      const safeIndex =
        Number.isInteger(index) &&
        index !== undefined &&
        index >= 0 &&
        index < candidates.length
          ? index
          : candidateIndex;
      const committed = candidates[safeIndex]?.text || rawKana || preeditText;
      const previousWord = extractPreviousWord(input);

      if (hasImeIpcApi()) {
        void window.electronAPI?.imeCommitCandidate?.(safeIndex, {
          previousWord,
          currentInput: input,
        });
      }

      insertCommittedText(committed);
    },
    [
      isConverting,
      commitBuffer,
      candidates,
      candidateIndex,
      rawKana,
      preeditText,
      input,
      insertCommittedText,
    ],
  );

  const handleCancelConversion = useCallback(() => {
    if (!isConverting) return;

    if (hasImeIpcApi()) {
      const requestId = ++ipcRequestIdRef.current;
      void window.electronAPI
        ?.imeCancelConversion?.()
        .then((response) => {
          if (requestId !== ipcRequestIdRef.current) return;
          if (response?.success && response.state) {
            // Keep kana preedit after cancel for continued editing.
            // キャンセル後はかな未確定文字を残す
            setRawKana((prev) => prev || response.state?.rawKana || '');
          }
        })
        .catch(() => {});
    }

    clearConversionState();
  }, [isConverting, clearConversionState]);

  // Called by virtual keyboard buttons / 仮想キーボードボタンから呼び出し
  const handleCharInput = useCallback(
    (char: string, cursorPosition?: number) => {
      if (!char) return;

      const displayCursorPos =
        cursorPosition !== undefined ? cursorPosition : displayText.length;

      const insertDirectChar = (text: string) => {
        if (displayText.length + text.length > maxLength) return;
        const pos = Math.max(0, Math.min(displayCursorPos, displayText.length));
        const nextText =
          displayText.slice(0, pos) + text + displayText.slice(pos);
        setInput(nextText);
        clearAllPendingState();
      };

      if (isConverting && /^[1-9]$/.test(char)) {
        handleCommitCandidate(Number(char) - 1);
        return;
      }

      if (mode === InputMode.ENGLISH) {
        insertDirectChar(char);
        return;
      }

      if (isConverting) {
        // Keep typing flow smooth: when user continues romaji input,
        // stop candidate mode and continue building kana.
        // ローマ字入力の継続時は候補状態を解除してかな構築を続ける
        if (/^[a-z-]$/.test(char)) {
          clearConversionState();
        } else {
          handleCommitCandidate();
          return;
        }
      }

      if (/^[A-Z]$/.test(char)) {
        insertDirectChar(char);
        return;
      }

      if (!/^[a-z-]$/.test(char)) {
        insertDirectChar(char);
        return;
      }

      const preeditLength = preeditText.length; // Use actual display length / 実際の表示文字数を使用
      const effectiveCursorPos =
        cursorPosition !== undefined
          ? bufferPosition !== null && cursorPosition > bufferPosition
            ? Math.max(0, cursorPosition - preeditLength)
            : cursorPosition
          : input.length;

      if (rawKana.length === 0 && buffer.length === 0) {
        setBufferPosition(Math.min(effectiveCursorPos, input.length));
      }

      const res = toKana(char.toLowerCase(), buffer);
      let nextRawKana = rawKana;

      if (res.output) {
        const out =
          mode === InputMode.KATAKANA
            ? convertToKatakana(res.output)
            : res.output;
        if (
          input.length + rawKana.length + out.length + res.newBuffer.length >
          maxLength
        ) {
          return;
        }
        nextRawKana = rawKana + out;
        setRawKana(nextRawKana);
      }
      setBuffer(res.newBuffer);

      // Auto-show candidates once kana syllables are formed.
      // かなが形成されたタイミングで候補を自動表示
      if (nextRawKana.length > 0 && res.newBuffer.length === 0) {
        requestConversion(nextRawKana, { previousText: input });
      }
    },
    [
      mode,
      input,
      rawKana,
      buffer,
      bufferPosition,
      displayText,
      isConverting,
      maxLength,
      clearAllPendingState,
      clearConversionState,
      handleCommitCandidate,
      requestConversion,
    ],
  );

  const handleBackspace = useCallback(
    (cursorPosition?: number) => {
      if (isConverting) {
        handleCancelConversion();
      }

      if (buffer.length > 0) {
        setBuffer((prev) => prev.slice(0, -1));
        if (buffer.length === 1 && rawKana.length === 0) {
          setBufferPosition(null);
        }
        return;
      }

      if (rawKana.length > 0) {
        const nextRawKana = rawKana.slice(0, -1);
        setRawKana(nextRawKana);
        if (nextRawKana.length === 0) {
          setBufferPosition(null);
        }
        if (nextRawKana.length > 0 && mode !== InputMode.ENGLISH) {
          requestConversion(nextRawKana, { previousText: input });
        } else {
          clearConversionState();
        }
        return;
      }

      if (cursorPosition !== undefined && cursorPosition > 0) {
        const pos = Math.min(cursorPosition - 1, input.length - 1);
        if (pos >= 0) {
          setInput(input.slice(0, pos) + input.slice(pos + 1));
        }
      } else {
        setInput((prev) => prev.slice(0, -1));
      }
    },
    [
      isConverting,
      handleCancelConversion,
      buffer,
      rawKana,
      input,
      mode,
      requestConversion,
      clearConversionState,
    ],
  );

  const handleClear = useCallback(() => {
    if (isConverting) {
      handleCancelConversion();
      return;
    }
    clearAllPendingState();
    setInput('');
  }, [isConverting, handleCancelConversion, clearAllPendingState]);

  const handleSpace = useCallback(
    (cursorPosition?: number) => {
      if (isConverting) {
        if (hasImeIpcApi()) {
          const requestId = ++ipcRequestIdRef.current;
          void window.electronAPI
            ?.imeNextCandidate?.()
            .then((response) => {
              if (requestId !== ipcRequestIdRef.current) return;
              if (response?.success) {
                applyImeState(response.state);
              }
            })
            .catch(() => {});
          return;
        }

        if (candidates.length === 0) return;
        const next = (candidateIndex + 1) % candidates.length;
        setCandidateIndex(next);
        setSegments((prev) =>
          prev.length === 0
            ? prev
            : [{ ...prev[0], selectedIndex: next }],
        );
        return;
      }

      if (mode !== InputMode.ENGLISH) {
        const kanaToConvert = rawKana + buffer;
        if (kanaToConvert.length > 0) {
          if (bufferPosition === null) {
            const safe = Math.max(0, Math.min(cursorPosition ?? input.length, input.length));
            setBufferPosition(safe);
          }
          setRawKana(kanaToConvert);
          setBuffer('');
          requestConversion(kanaToConvert, { previousText: input });
          return;
        }
      }

      if (displayText.length >= maxLength) return;
      const insertPos =
        cursorPosition !== undefined
          ? Math.max(0, Math.min(cursorPosition, displayText.length))
          : displayText.length;
      const nextText =
        displayText.slice(0, insertPos) + ' ' + displayText.slice(insertPos);
      setInput(nextText);
      clearAllPendingState();
    },
    [
      isConverting,
      mode,
      rawKana,
      buffer,
      bufferPosition,
      input,
      displayText,
      maxLength,
      candidates,
      candidateIndex,
      applyImeState,
      requestConversion,
      clearAllPendingState,
    ],
  );

  return {
    input,
    buffer,
    rawKana,
    segments,
    candidates,
    candidateIndex,
    isConverting,
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
    handleCommitCandidate,
    handleCancelConversion,
    commitBuffer,
  };
};
