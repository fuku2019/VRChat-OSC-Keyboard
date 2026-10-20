/**
 * Pure IME state machine. Timers, IPC and completion notifications live in useIME.
 * Input revisions and result revisions are distinct from IPC operation IDs.
 */
import { InputMode } from '../types';
import { toKana, convertToKatakana, katakanaToHiragana, dedupeCandidates } from '../utils/ime';
import { CHATBOX } from '../constants';
import type { ImeCandidate, ImeContext, ImeSegment, ImeState as ImeIpcState } from '../types/ime';

export type PendingRequest =
  | { id: number; kind: 'convert'; kana: string; context: ImeContext; immediate?: boolean }
  | { id: number; kind: 'next'; revision: number }
  | { id: number; kind: 'cancel' }
  | { id: number; kind: 'commit'; revision: number; index: number; context: ImeContext }
  | null;

export interface ImeCoreState {
  input: string;
  caret: number;
  selectionEnd: number;
  buffer: string;
  rawKana: string;
  preeditStart: number | null;
  segments: ImeSegment[];
  candidates: ImeCandidate[];
  candidateIndex: number;
  isConverting: boolean;
  candidateSelectionMode: boolean;
  revision: number;
  resultRevision: number | null;
  commitWait: { revision: number } | null;
  commitSeq: number;
  committedText: string;
  requestId: number;
  pending: PendingRequest;
  caretRevision: number;
  mutationSeq: number;
  mode: InputMode;
  maxLength: number;
}

export type ImeAction =
  | { type: 'CHAR_INPUT'; char: string }
  | { type: 'BACKSPACE' }
  | { type: 'SPACE' }
  | { type: 'COMMIT_PREEDIT'; index?: number; resultRevision?: number; expectedText?: string }
  | { type: 'COMMIT_TIMEOUT'; revision: number }
  | { type: 'CANCEL_CONVERSION' }
  | { type: 'CLEAR' }
  | { type: 'CLEAR_ALL' }
  | { type: 'CLEAR_SENT'; text: string; mutationSeq: number }
  | { type: 'REPLACE_ALL'; text: string }
  | { type: 'SET_SELECTION'; start: number; end: number }
  | { type: 'SET_MODE'; mode: InputMode }
  | { type: 'IPC_RESULT'; requestId: number; kind: 'convert' | 'next' | 'commit' | 'cancel'; state?: ImeIpcState | null; kana?: string };

export const createInitialImeState = (
  mode: InputMode = InputMode.HIRAGANA, maxLength: number = CHATBOX.MAX_LENGTH,
): ImeCoreState => ({
  input: '', caret: 0, selectionEnd: 0, buffer: '', rawKana: '', preeditStart: null,
  segments: [], candidates: [], candidateIndex: 0, isConverting: false,
  candidateSelectionMode: false, revision: 0, resultRevision: null, commitWait: null,
  commitSeq: 0, committedText: '', requestId: 0, pending: null,
  caretRevision: 0, mutationSeq: 0, mode, maxLength,
});

const clamp = (n: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.max(min, Math.min(n, max)) : min;
const hasResult = (s: ImeCoreState) => s.isConverting && s.resultRevision === s.revision;
export const preeditTextOf = (s: ImeCoreState): string =>
  (hasResult(s) ? s.candidates[s.candidateIndex]?.text || s.rawKana : s.rawKana) + s.buffer;
export const displayTextOf = (s: ImeCoreState): string => {
  if (s.preeditStart === null) return s.input;
  const at = clamp(s.preeditStart, 0, s.input.length);
  return s.input.slice(0, at) + preeditTextOf(s) + s.input.slice(at);
};
export const displayCaretOf = (s: ImeCoreState): number =>
  s.preeditStart === null ? s.caret : clamp(s.preeditStart, 0, s.input.length) + preeditTextOf(s).length;
export const displaySelectionEndOf = (s: ImeCoreState): number =>
  s.preeditStart === null ? s.selectionEnd : displayCaretOf(s);
export const preeditRangeOf = (s: ImeCoreState): { start: number; end: number } | null => {
  if (s.preeditStart === null || !preeditTextOf(s)) return null;
  const start = clamp(s.preeditStart, 0, s.input.length);
  return { start, end: start + preeditTextOf(s).length };
};
export const hasPreeditOf = (s: ImeCoreState) => s.preeditStart !== null;
const touchCaret = (s: ImeCoreState): ImeCoreState => ({ ...s, caretRevision: s.caretRevision + 1 });
const touchMutation = (s: ImeCoreState): ImeCoreState =>
  ({ ...s, caretRevision: s.caretRevision + 1, mutationSeq: s.mutationSeq + 1 });
const collapseSelection = (s: ImeCoreState): ImeCoreState => {
  if (s.caret === s.selectionEnd) return s;
  const from = Math.min(s.caret, s.selectionEnd), to = Math.max(s.caret, s.selectionEnd);
  return { ...s, input: s.input.slice(0, from) + s.input.slice(to), caret: from, selectionEnd: from };
};
const clearedConversion = {
  segments: [] as ImeSegment[], candidates: [] as ImeCandidate[], candidateIndex: 0,
  isConverting: false, resultRevision: null, candidateSelectionMode: false, commitWait: null,
};
const dropPreedit = (s: ImeCoreState): ImeCoreState => {
  const id = s.requestId + 1;
  return { ...s, ...clearedConversion, rawKana: '', buffer: '', preeditStart: null,
    requestId: id, revision: id, pending: { id, kind: 'cancel' } };
};
const cancelConversion = (s: ImeCoreState): ImeCoreState => {
  const id = s.requestId + 1;
  return { ...s, ...clearedConversion, requestId: id, revision: id, pending: { id, kind: 'cancel' } };
};

// A trailing n resolves to ん at a composition boundary; other unfinished romaji stays literal.
const flushFinalN = (s: ImeCoreState): ImeCoreState => s.buffer === 'n'
  ? { ...s, rawKana: s.rawKana + (s.mode === InputMode.KATAKANA ? 'ン' : 'ん'), buffer: '' } : s;

const requestConvert = (s: ImeCoreState, immediate = false): ImeCoreState => {
  const id = s.requestId + 1;
  const before = s.input.slice(0, clamp(s.preeditStart ?? s.caret, 0, s.input.length));
  return { ...s, ...clearedConversion, requestId: id, revision: id,
    pending: s.mode === InputMode.HIRAGANA && s.rawKana
      ? { id, kind: 'convert', kana: s.rawKana, context: { previousText: before }, immediate }
      : { id, kind: 'cancel' } };
};

// Freeze the text snapshot on completion, independent of subsequent input or reset acknowledgements.
const foldPreedit = (original: ImeCoreState, index?: number, forceKana = false): ImeCoreState => {
  if (original.preeditStart === null) return original;
  const s = original;
  const selected = index ?? s.candidateIndex;
  const validResult = !forceKana && hasResult(s);
  const candidate = validResult ? s.candidates[selected]?.text : undefined;
  const suffix = s.buffer === 'n' ? (s.mode === InputMode.KATAKANA ? 'ン' : 'ん') : s.buffer;
  const text = (candidate ?? s.rawKana) + suffix;
  const at = clamp(s.preeditStart!, 0, s.input.length);
  const input = s.input.slice(0, at) + text + s.input.slice(at);
  const next = dropPreedit(s);
  return { ...next, input, caret: at + text.length, selectionEnd: at + text.length,
    commitSeq: s.commitSeq + 1, committedText: input,
    pending: validResult && candidate
      ? { id: next.requestId, kind: 'commit', revision: s.resultRevision!, index: s.candidates[selected].engineIndex ?? selected,
          context: { expectedText: candidate } }
      : next.pending };
};
const insertLiteral = (s: ImeCoreState, text: string): ImeCoreState | null => {
  let next = foldPreedit(s, undefined, !hasResult(s));
  next = collapseSelection(next);
  if (next.input.length + text.length > next.maxLength) return null;
  const at = clamp(next.caret, 0, next.input.length);
  return { ...next, input: next.input.slice(0, at) + text + next.input.slice(at),
    caret: at + text.length, selectionEnd: at + text.length };
};
const beginCommit = (s: ImeCoreState, index?: number): ImeCoreState => {
  if (s.preeditStart === null || s.commitWait) return s;
  // Clicks commit the displayed snapshot immediately; never reinterpret an old index.
  if (index !== undefined) {
    if (!hasResult(s) || !Number.isInteger(index) || !s.candidates[index]) return s;
    return touchMutation(foldPreedit(s, index));
  }
  const flushed = flushFinalN(s);
  if (hasResult(s) && flushed === s && s.pending?.kind === 'next') {
    return { ...s, commitWait: { revision: s.revision } };
  }
  if (hasResult(s) && flushed === s && s.pending?.kind !== 'next') {
    return touchMutation(foldPreedit(s));
  }
  if (s.mode !== InputMode.HIRAGANA || !flushed.rawKana) {
    return touchMutation(foldPreedit(flushed, undefined, true));
  }
  let next = flushed !== s || s.pending?.kind !== 'convert' ? requestConvert(flushed, true)
    : { ...s, pending: { ...s.pending, immediate: true } };
  return { ...next, commitWait: { revision: next.revision } };
};
const localCandidates = (kana: string): ImeCandidate[] => {
  const reading = katakanaToHiragana(kana);
  return dedupeCandidates([{ text: reading }, { text: convertToKatakana(reading) }], 20);
};
const applyResult = (s: ImeCoreState, incoming?: ImeIpcState | null): ImeCoreState => {
  // A longer candidate may overflow even though the reading fitted. Keep kana available.
  const capacity = s.maxLength - s.input.length - s.buffer.length;
  const source = incoming?.candidates.map((c, engineIndex) => ({ ...c, engineIndex })) ?? localCandidates(s.rawKana);
  const seen = new Set<string>();
  const candidates: ImeCandidate[] = source.filter(c => {
    if (!c.text || seen.has(c.text) || c.text.length > capacity) return false;
    seen.add(c.text);
    return true;
  }).slice(0, 128);
  if (s.rawKana.length <= capacity && !candidates.some(c => c.text === s.rawKana)) {
    candidates.push({ text: s.rawKana });
  }
  const selectedText = incoming?.candidates[incoming.candidateIndex]?.text;
  const index = Math.max(0, candidates.findIndex(c => c.text === selectedText));
  return { ...s, pending: null, candidates, candidateIndex: index,
    segments: candidates.length ? [{ raw: s.rawKana, candidates, selectedIndex: index }] : [],
    resultRevision: s.revision, isConverting: candidates.length > 0 };
};

export function imeReducer(state: ImeCoreState, action: ImeAction): ImeCoreState {
  // Clear/cancel/history replacement can always invalidate a bounded commit wait.
  if (state.commitWait && ['CHAR_INPUT', 'BACKSPACE', 'SPACE', 'COMMIT_PREEDIT', 'SET_MODE', 'SET_SELECTION'].includes(action.type)) return state;
  switch (action.type) {
    case 'CHAR_INPUT': {
      const char = action.char;
      if (!char) return state;
      if (state.candidateSelectionMode && hasResult(state) && /^[1-9]$/.test(char)) {
        return beginCommit(state, Number(char) - 1);
      }
      if (state.mode === InputMode.ENGLISH || !/^[a-z-]$/.test(char)) {
        const inserted = insertLiteral(state, char);
        return inserted ? touchMutation(inserted) : state;
      }
      let next = collapseSelection(state);
      const preeditStart = next.preeditStart ?? clamp(next.caret, 0, next.input.length);
      const res = toKana(char, next.buffer);
      const rawKana = next.rawKana + (next.mode === InputMode.KATAKANA ? convertToKatakana(res.output) : res.output);
      if (next.input.length + rawKana.length + res.newBuffer.length > next.maxLength) return state;
      next = requestConvert({ ...next, rawKana, buffer: res.newBuffer, preeditStart });
      return touchMutation(next);
    }
    case 'BACKSPACE': {
      if (state.preeditStart !== null) {
        const buffer = state.buffer ? state.buffer.slice(0, -1) : '';
        const rawKana = state.buffer ? state.rawKana : [...state.rawKana].slice(0, -1).join('');
        return touchMutation(requestConvert({ ...state, buffer, rawKana,
          preeditStart: buffer || rawKana ? state.preeditStart : null }));
      }
      if (state.caret !== state.selectionEnd) return touchMutation(collapseSelection(state));
      if (state.caret <= 0) return state;
      const at = clamp(state.caret, 0, state.input.length);
      const before = [...state.input.slice(0, at)].slice(0, -1).join('');
      return touchMutation({ ...state, input: before + state.input.slice(at), caret: before.length, selectionEnd: before.length });
    }
    case 'SPACE': {
      if (hasResult(state) && !state.buffer) {
        const id = state.requestId + 1;
        return touchCaret({ ...state, candidateSelectionMode: true, requestId: id,
          pending: { id, kind: 'next', revision: state.resultRevision! } });
      }
      if (state.mode === InputMode.HIRAGANA && state.preeditStart !== null) {
        let flushed = flushFinalN(state);
        if (flushed.buffer) {
          const res = toKana(flushed.buffer, '');
          flushed = { ...flushed, rawKana: flushed.rawKana + res.output + res.newBuffer, buffer: '' };
        }
        const next = flushed !== state || state.pending?.kind !== 'convert'
          ? requestConvert(flushed, true) : { ...state, pending: { ...state.pending, immediate: true } };
        return touchCaret({ ...next, candidateSelectionMode: true });
      }
      const inserted = insertLiteral(state, ' ');
      return inserted ? touchMutation(inserted) : state;
    }
    case 'COMMIT_PREEDIT':
      if (action.index !== undefined &&
          ((action.resultRevision !== undefined && action.resultRevision !== state.resultRevision) ||
           (action.expectedText !== undefined && action.expectedText !== state.candidates[action.index]?.text))) return state;
      return beginCommit(state, action.index);
    case 'COMMIT_TIMEOUT':
      return state.commitWait?.revision === action.revision
        ? touchMutation(foldPreedit(state, undefined, true)) : state;
    case 'CANCEL_CONVERSION':
      return state.preeditStart === null && !state.commitWait ? state : touchMutation(cancelConversion(state));
    case 'CLEAR':
      return state.isConverting && !state.commitWait ? touchMutation(cancelConversion(state))
        : imeReducer(state, { type: 'CLEAR_ALL' });
    case 'CLEAR_SENT':
      if (state.preeditStart !== null || state.commitWait || state.input !== action.text || state.mutationSeq !== action.mutationSeq) return state;
      return imeReducer(state, { type: 'CLEAR_ALL' });
    case 'CLEAR_ALL':
      return touchMutation({ ...dropPreedit(state), input: '', caret: 0, selectionEnd: 0 });
    case 'REPLACE_ALL': {
      const text = action.text.slice(0, state.maxLength);
      return touchMutation({ ...dropPreedit(state), input: text, caret: text.length, selectionEnd: text.length });
    }
    case 'SET_SELECTION': {
      if (state.preeditStart === null) {
        const caret = clamp(action.start, 0, state.input.length), selectionEnd = clamp(action.end, 0, state.input.length);
        return caret === state.caret && selectionEnd === state.selectionEnd ? state : { ...state, caret, selectionEnd };
      }
      const at = state.preeditStart, end = at + preeditTextOf(state).length;
      if (action.start >= at && action.start <= end && action.end >= at && action.end <= end) return state;
      const folded = foldPreedit(state, undefined, !hasResult(state));
      return touchCaret({ ...folded, caret: clamp(action.start, 0, folded.input.length), selectionEnd: clamp(action.end, 0, folded.input.length) });
    }
    case 'SET_MODE':
      if (action.mode === state.mode) return state;
      return touchMutation({ ...foldPreedit(state, undefined, !hasResult(state)), mode: action.mode });
    case 'IPC_RESULT': {
      if (!state.pending || action.requestId !== state.pending.id || action.kind !== state.pending.kind) return state;
      if (action.kind === 'cancel' || action.kind === 'commit') return { ...state, pending: null };
      if (state.preeditStart === null) return state;
      const expectedRevision = state.pending.kind === 'next' ? state.pending.revision : state.revision;
      if (action.state?.revision !== undefined && action.state.revision !== expectedRevision) return state;
      if (action.kind === 'next' && !action.state) {
        const index = (state.candidateIndex + 1) % Math.max(1, state.candidates.length);
        const next = { ...state, pending: null, candidateIndex: index,
          segments: state.segments.map(segment => ({ ...segment, selectedIndex: index })) };
        return state.commitWait ? touchMutation(foldPreedit(next)) : touchCaret(next);
      }
      const next = applyResult(state, action.state);
      if (state.commitWait?.revision === next.revision) {
        return touchMutation(foldPreedit({ ...next, commitWait: null }, undefined, !next.isConverting));
      }
      return touchCaret(next);
    }
    default: return state;
  }
}
