/**
 * useIME - Binds the pure IME state machine to React and to the main process.
 * 純粋なIME状態機械をReactとメインプロセスへ結びつけるフック。
 *
 * imeReducer owns input and completion snapshots. This hook owns the debounce
 * and commit deadline timers, and sends the reducer's pending IPC requests.
 * 入力と確定snapshotはリデューサ、debounce・確定期限のtimerとIPCはこのフックが担う。
 *
 * Driving IPC from state rather than from the call sites is what keeps the
 * generation counter honest: every action that throws work away bumps it inside
 * the reducer, so a reply that arrives late can always be recognised and
 * dropped. The old code kept that counter in a ref next to the state and missed
 * several paths, which let stale conversions resurrect a committed preedit.
 * 呼び出し側ではなく状態からIPCを駆動することで、世代カウンタが常に正しく保たれる。
 * 作業を捨てるアクションはすべてリデューサ内でカウンタを進めるため、遅れて届いた応答を
 * 必ず識別して破棄できる。旧実装はこのカウンタを状態の隣のrefに持ち、いくつかの経路で
 * 進め忘れていたため、古い変換が確定済みの未確定文字列を復活させていた。
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { InputMode } from '../types';
import { CHATBOX } from '../constants';
import type { ImeCandidate } from '../types/ime';
import {
  createInitialImeState,
  displayCaretOf,
  displaySelectionEndOf,
  displayTextOf,
  imeReducer,
  preeditRangeOf,
} from './imeReducer';

const CONVERSION_DEBOUNCE_MS = 75;
const COMMIT_DEADLINE_MS = 200;

export interface UseIMEReturn {
  input: string; // Committed text / 確定したテキスト
  displayText: string; // What the textarea shows / テキストエリアに表示される文字列
  displayCaret: number; // Caret in displayText coordinates / displayText座標系のキャレット
  displaySelectionEnd: number;
  caretRevision: number; // Bumped when the caret must be written back to the DOM / DOMへ書き戻すべきときに進む
  mutationSeq: number; // Bumped when the user changed the text / ユーザーがテキストを変えたときに進む
  candidates: ImeCandidate[];
  candidateIndex: number;
  isConverting: boolean;
  isConversionPending: boolean;
  isCommitPending: boolean;
  candidateSelectionMode: boolean;
  commitSeq: number;
  committedText: string;
  hasPreedit: boolean;
  preeditRange: { start: number; end: number } | null; // Preedit span in displayText / displayText上の未確定範囲
  mode: InputMode;

  setMode: (mode: InputMode) => void;
  handleCharInput: (char: string) => void;
  handleBackspace: () => void;
  handleSpace: () => void;
  handleClear: () => void;
  handleCommitCandidate: (index?: number) => void;
  handleCancelConversion: () => void;
  commitPreedit: () => void;

  // The selection a click placed in the textarea / テキストエリアのクリックで置かれた選択位置
  setSelection: (start: number, end: number) => void;

  // Wholesale replacement (history recall, send, copy mode) / 一括置換（履歴呼び出し・送信・コピーモード）
  replaceAll: (text: string) => string;
  clearAll: () => void;
}

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
  const [state, dispatch] = useReducer(imeReducer, undefined, () =>
    createInitialImeState(initialMode, maxLength),
  );
  const [sessionId] = useState(() => crypto.randomUUID());
  const lastSent = useRef('');
  const latestRequestId = useRef(0);
  latestRequestId.current = state.requestId;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void window.electronAPI?.imeReleaseSession?.({ sessionId, revision: latestRequestId.current + 1 }).catch(() => {});
    };
  }, [sessionId]);

  const displayText = useMemo(() => displayTextOf(state), [state]);
  const displayCaret = useMemo(() => displayCaretOf(state), [state]);
  const displaySelectionEnd = useMemo(() => displaySelectionEndOf(state), [state]);
  const preeditRange = useMemo(() => preeditRangeOf(state), [state]);

  // Fire whatever the reducer queued. `pending` keeps its identity across
  // unrelated state changes, so this runs exactly once per request.
  // リデューサが積んだ注文票を発射する。`pending` は無関係な状態変化をまたいで
  // 同一性を保つため、1リクエストにつき1回だけ走る。
  const pending = state.pending;
  useEffect(() => {
    if (!pending) return;
    const settle = (result?: unknown, kana?: string) => {
      if (!mounted.current) return;
      dispatch({
        type: 'IPC_RESULT',
        requestId: pending.id,
        kind: pending.kind,
        state: (result as never) ?? null,
        kana,
      });
    };
    const send = () => {
      const key = `${pending.kind}:${pending.id}`;
      // Flush/debounce and StrictMode must not send the same conversion twice.
      if (lastSent.current === key) return;
      lastSent.current = key;
      const kana = pending.kind === 'convert' ? pending.kana : undefined;
      if (!hasImeIpcApi()) { settle(null, kana); return; }
      const target = { sessionId, revision: 'revision' in pending ? pending.revision : pending.id };
      const api = window.electronAPI!;
      try {
        const request = pending.kind === 'convert'
          ? api.imeConvert(pending.kana, { ...pending.context, ...target })
          : pending.kind === 'next' ? api.imeNextCandidate(target)
            : pending.kind === 'commit' ? api.imeCommitCandidate(pending.index, { ...pending.context, ...target })
              : api.imeCancelConversion(target);
        void request.then(response => {
          const result = response?.success ? response.state : null;
          if ((result?.sessionId !== undefined && result.sessionId !== sessionId) ||
              (result?.revision !== undefined && result.revision !== target.revision)) { settle(null, kana); return; }
          settle(result, kana);
        }).catch(() => settle(null, kana));
      } catch { settle(null, kana); }
    };
    if (pending.kind === 'convert' && !pending.immediate) {
      const timer = setTimeout(send, CONVERSION_DEBOUNCE_MS);
      return () => clearTimeout(timer);
    }
    send();
  }, [pending, sessionId]);

  const commitWait = state.commitWait;
  useEffect(() => {
    if (!commitWait) return;
    const timer = setTimeout(() => dispatch({ type: 'COMMIT_TIMEOUT', revision: commitWait.revision }), COMMIT_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, [commitWait]);

  // dispatch is stable, so every handler below is stable too. That is what lets
  // the virtual keyboard stay memoised. / dispatch は安定なので以下のハンドラも
  // すべて安定する。仮想キーボードの memo が効くのはこのため。
  const setMode = useCallback(
    (mode: InputMode) => dispatch({ type: 'SET_MODE', mode }),
    [],
  );
  const handleCharInput = useCallback(
    (char: string) => dispatch({ type: 'CHAR_INPUT', char }),
    [],
  );
  const handleBackspace = useCallback(() => dispatch({ type: 'BACKSPACE' }), []);
  const handleSpace = useCallback(() => dispatch({ type: 'SPACE' }), []);
  const handleClear = useCallback(() => dispatch({ type: 'CLEAR' }), []);
  const handleCommitCandidate = useCallback(
    (index?: number) => dispatch({ type: 'COMMIT_PREEDIT', index,
      resultRevision: index === undefined ? undefined : state.resultRevision ?? undefined,
      expectedText: index === undefined ? undefined : state.candidates[index]?.text }),
    [state.resultRevision, state.candidates],
  );
  const handleCancelConversion = useCallback(
    () => dispatch({ type: 'CANCEL_CONVERSION' }),
    [],
  );
  const commitPreedit = useCallback(
    () => dispatch({ type: 'COMMIT_PREEDIT' }),
    [],
  );
  const setSelection = useCallback(
    (start: number, end: number) =>
      dispatch({ type: 'SET_SELECTION', start, end }),
    [],
  );
  const clearAll = useCallback(() => dispatch({ type: 'CLEAR_ALL' }), []);

  // Returns the text that was actually applied. History navigation compares it
  // against what it handed us, so a silently trimmed value would make it think
  // the user edited the text and drop out of history navigation.
  // 実際に適用されたテキストを返す。履歴走査は渡した文字列と突き合わせるため、
  // 黙って切り詰めるとユーザーが編集したと誤認され、履歴走査から抜けてしまう。
  const replaceAll = useCallback(
    (text: string) => {
      dispatch({ type: 'REPLACE_ALL', text });
      return text.length > maxLength ? text.slice(0, maxLength) : text;
    },
    [maxLength],
  );

  return {
    input: state.input,
    displayText,
    displayCaret,
    displaySelectionEnd,
    caretRevision: state.caretRevision,
    mutationSeq: state.mutationSeq,
    candidates: state.candidates,
    candidateIndex: state.candidateIndex,
    isConverting: state.isConverting,
    isConversionPending: state.pending?.kind === 'convert',
    isCommitPending: state.commitWait !== null,
    candidateSelectionMode: state.candidateSelectionMode,
    commitSeq: state.commitSeq,
    committedText: state.committedText,
    hasPreedit: state.preeditStart !== null,
    preeditRange,
    mode: state.mode,

    setMode,
    handleCharInput,
    handleBackspace,
    handleSpace,
    handleClear,
    handleCommitCandidate,
    handleCancelConversion,
    commitPreedit,
    setSelection,
    replaceAll,
    clearAll,
  };
};
