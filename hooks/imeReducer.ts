/**
 * imeReducer - Pure state machine for the in-app Japanese IME.
 * アプリ内蔵日本語IMEの純粋な状態機械。
 *
 * Everything the input layer needs lives in one object so the caret, the
 * committed text and the preedit can never land out of step with each other.
 * The previous implementation spread these across separate useState calls and
 * tracked the caret in two incompatible coordinate systems (one relative to the
 * committed text, one relative to the rendered text), which is what made the
 * caret jump to column 0 after a commit.
 *
 * 入力レイヤーが必要とする状態を1つのオブジェクトに集約し、キャレット・確定テキスト・
 * 未確定文字列が互いにずれた状態へ落ちないようにする。以前の実装はこれらを個別の
 * useState に分散させ、さらにキャレットを2つの非互換な座標系(確定テキスト基準と
 * 表示テキスト基準)で管理していた。確定後にキャレットが先頭へ飛ぶ原因がこれである。
 *
 * This module is deliberately DOM-free: no refs, no window, no IPC. Side
 * effects are expressed as a `pending` request that the hook fires and reports
 * back through IPC_RESULT.
 * このモジュールは意図的にDOM非依存にしてある(ref・window・IPCを一切触らない)。
 * 副作用は `pending` という「注文票」として表現し、フック側が発射して IPC_RESULT で
 * 結果を戻す。
 */

import { InputMode } from '../types';
import {
  toKana,
  convertToKatakana,
  katakanaToHiragana,
  dedupeCandidates,
  extractPreviousWord,
} from '../utils/ime';
import { CHATBOX } from '../constants';
import type {
  ImeCandidate,
  ImeContext,
  ImeSegment,
  ImeState as ImeIpcState,
} from '../types/ime';

const LOCAL_MAX_CANDIDATES = 20;

// A request the hook still has to send to the main process.
// フックがメインプロセスへ送るべき、未発射のリクエスト。
export type PendingRequest =
  | { id: number; kind: 'convert'; kana: string; context: ImeContext }
  | { id: number; kind: 'next' }
  | { id: number; kind: 'cancel' }
  | { id: number; kind: 'commit'; index: number; context: ImeContext }
  | null;

export interface ImeCoreState {
  // Committed text and caret, both in *committed text* coordinates.
  // 確定テキストと、その座標系でのキャレット。
  input: string;
  caret: number;
  selectionEnd: number; // caret === selectionEnd means a collapsed caret / 同値なら範囲選択なし

  // Preedit. Invariant: preeditStart !== null <=> (buffer !== '' || rawKana !== '')
  // 未確定文字列。不変条件: preeditStart !== null <=> (buffer !== '' || rawKana !== '')
  buffer: string; // romaji awaiting a kana / かなになる前のローマ字
  rawKana: string;
  preeditStart: number | null;

  // Conversion / 変換
  segments: ImeSegment[];
  candidates: ImeCandidate[];
  candidateIndex: number;
  isConverting: boolean;

  // Async control / 非同期制御
  requestId: number; // generation counter; bumping it invalidates in-flight replies / 世代カウンタ。進めると飛行中の応答が無効になる
  pending: PendingRequest;

  // DOM sync triggers / DOM同期のトリガー
  caretRevision: number; // changed => the hook writes the caret back to the textarea / 変化したらフックがtextareaへキャレットを書き戻す
  mutationSeq: number; // changed => the user changed the text, run input side effects / 変化したらユーザーがテキストを変えた。入力副作用を発火

  mode: InputMode;
  maxLength: number;
}

export type ImeAction =
  | { type: 'CHAR_INPUT'; char: string }
  | { type: 'BACKSPACE' }
  | { type: 'SPACE' }
  | { type: 'COMMIT_PREEDIT'; index?: number }
  | { type: 'CANCEL_CONVERSION' }
  | { type: 'CLEAR' }
  | { type: 'CLEAR_ALL' }
  | { type: 'REPLACE_ALL'; text: string }
  | { type: 'SET_SELECTION'; start: number; end: number }
  | { type: 'SET_MODE'; mode: InputMode }
  | {
      type: 'IPC_RESULT';
      requestId: number;
      kind: 'convert' | 'next' | 'commit' | 'cancel';
      state?: ImeIpcState | null;
      kana?: string;
    };

export const createInitialImeState = (
  mode: InputMode = InputMode.HIRAGANA,
  maxLength: number = CHATBOX.MAX_LENGTH,
): ImeCoreState => ({
  input: '',
  caret: 0,
  selectionEnd: 0,
  buffer: '',
  rawKana: '',
  preeditStart: null,
  segments: [],
  candidates: [],
  candidateIndex: 0,
  isConverting: false,
  requestId: 0,
  pending: null,
  // Both start at 0 so the very first layout effect is a no-op and does not
  // steal focus from the tutorial overlay on a cold start.
  // 両方0から始めることで初回のレイアウトエフェクトがno-opになり、初回起動時に
  // チュートリアルからフォーカスを奪わない。
  caretRevision: 0,
  mutationSeq: 0,
  mode,
  maxLength,
});

// ---------------------------------------------------------------------------
// Derived values / 導出値
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(value, max));
}

export const preeditTextOf = (state: ImeCoreState): string => {
  if (state.isConverting) {
    return state.candidates[state.candidateIndex]?.text || state.rawKana;
  }
  return state.rawKana + state.buffer;
};

export const displayTextOf = (state: ImeCoreState): string => {
  if (state.preeditStart === null) return state.input;
  const preedit = preeditTextOf(state);
  if (!preedit) return state.input;
  const at = clamp(state.preeditStart, 0, state.input.length);
  return state.input.slice(0, at) + preedit + state.input.slice(at);
};

// While a preedit is open the caret sits at its trailing edge, exactly like a
// native IME. / 未確定文字列がある間、キャレットはその末尾に置く。ネイティブIMEと同じ挙動。
export const displayCaretOf = (state: ImeCoreState): number => {
  if (state.preeditStart === null) return state.caret;
  const at = clamp(state.preeditStart, 0, state.input.length);
  return at + preeditTextOf(state).length;
};

export const displaySelectionEndOf = (state: ImeCoreState): number =>
  state.preeditStart === null ? state.selectionEnd : displayCaretOf(state);

export const hasPreeditOf = (state: ImeCoreState): boolean =>
  state.preeditStart !== null;

// ---------------------------------------------------------------------------
// Helpers / ヘルパー
// ---------------------------------------------------------------------------

const touchCaret = (state: ImeCoreState): ImeCoreState => ({
  ...state,
  caretRevision: state.caretRevision + 1,
});

const touchMutation = (state: ImeCoreState): ImeCoreState => ({
  ...state,
  caretRevision: state.caretRevision + 1,
  mutationSeq: state.mutationSeq + 1,
});

// Delete the selected range, leaving a collapsed caret at its start.
// Running this from one place keeps every mutating action range-aware; doing it
// per action is how the old code ended up deleting a single character while a
// whole range was selected.
// 選択範囲を削除し、その先頭で折りたたんだキャレットを残す。1箇所に集約することで
// すべての変異アクションが範囲選択に対応する。アクションごとに書いていた旧実装では、
// 範囲選択中でも1文字しか消えなかった。
const collapseSelection = (state: ImeCoreState): ImeCoreState => {
  if (state.caret === state.selectionEnd) return state;
  const from = Math.min(state.caret, state.selectionEnd);
  const to = Math.max(state.caret, state.selectionEnd);
  return {
    ...state,
    input: state.input.slice(0, from) + state.input.slice(to),
    caret: from,
    selectionEnd: from,
  };
};

// Throw the preedit away and invalidate any in-flight conversion reply.
// Main keeps its own conversion state, so it is told to cancel whenever we had
// one - otherwise it answers a later commit from stale segments and learns a
// word the user never picked.
// 未確定文字列を破棄し、飛行中の変換応答を無効化する。main側も独自に変換状態を持つため、
// こちらが変換中だった場合は必ずキャンセルを送る。送らないと main が古い segments のまま
// 次の確定に応じ、ユーザーが選んでいない語を学習してしまう。
const dropPreedit = (state: ImeCoreState): ImeCoreState => {
  const id = state.requestId + 1;
  return {
    ...state,
    buffer: '',
    rawKana: '',
    preeditStart: null,
    segments: [],
    candidates: [],
    candidateIndex: 0,
    isConverting: false,
    requestId: id,
    pending: state.isConverting ? { id, kind: 'cancel' } : null,
  };
};

// Leave candidate mode but keep the kana, so continued romaji typing extends
// the reading instead of restarting it. / 候補モードを抜けつつ かな は残し、
// ローマ字入力を続けたときに読みが作り直されず伸びていくようにする。
const dropConversion = (state: ImeCoreState): ImeCoreState => {
  if (!state.isConverting) {
    return { ...state, segments: [], candidates: [], candidateIndex: 0 };
  }
  const id = state.requestId + 1;
  return {
    ...state,
    segments: [],
    candidates: [],
    candidateIndex: 0,
    isConverting: false,
    requestId: id,
    pending: { id, kind: 'cancel' },
  };
};

// Fold the preedit into the committed text and park the caret right after it.
// The old code never told anyone where the caret should end up, which is why
// the controller had to guess from the text length difference.
// 未確定文字列を確定テキストへ畳み込み、キャレットをその直後へ置く。旧実装は確定後の
// キャレット位置を誰にも伝えていなかったため、コントローラがテキスト長の差分から
// 推測するしかなかった。
const foldPreedit = (
  state: ImeCoreState,
  overrideIndex?: number,
): ImeCoreState => {
  if (state.preeditStart === null) return state;

  const index =
    overrideIndex !== undefined &&
    Number.isInteger(overrideIndex) &&
    overrideIndex >= 0 &&
    overrideIndex < state.candidates.length
      ? overrideIndex
      : state.candidateIndex;

  const committed = state.isConverting
    ? state.candidates[index]?.text || state.rawKana
    : state.rawKana + state.buffer;

  const at = clamp(state.preeditStart, 0, state.input.length);
  const nextInput = state.input.slice(0, at) + committed + state.input.slice(at);
  const caret = at + committed.length;

  // Always bump the generation counter: a conversion reply that arrives after
  // this point belongs to text that is already committed and would otherwise
  // resurrect the preedit behind the caret.
  // 世代カウンタは必ず進める。この時点より後に届く変換応答は確定済みテキストに
  // 対するものであり、そのまま適用するとキャレットの裏で未確定文字列が復活する。
  const id = state.requestId + 1;

  return {
    ...state,
    input: nextInput,
    caret,
    selectionEnd: caret,
    buffer: '',
    rawKana: '',
    preeditStart: null,
    segments: [],
    candidates: [],
    candidateIndex: 0,
    isConverting: false,
    requestId: id,
    pending: state.isConverting
      ? {
          id,
          kind: 'commit',
          index,
          context: {
            previousWord: extractPreviousWord(state.input.slice(0, at)),
            // Main only learns when this matches its own composition, so a
            // renderer that fell back to local candidates cannot poison the
            // learning store. / main はこれが自身の合成結果と一致するときだけ
            // 学習するため、ローカル候補にフォールバックしたレンダラーが
            // 学習ストアを汚染することはない。
            expectedText: committed,
          },
        }
      : null,
  };
};

const buildLocalCandidates = (kana: string): ImeCandidate[] => {
  const normalized = katakanaToHiragana(kana);
  return dedupeCandidates<ImeCandidate>(
    [
      {
        text: normalized,
        reading: normalized,
        source: 'fallback',
        dictSource: 'fallback',
        score: 10,
      },
      {
        text: convertToKatakana(normalized),
        reading: normalized,
        source: 'fallback',
        dictSource: 'fallback',
        score: 9,
      },
    ],
    LOCAL_MAX_CANDIDATES,
  );
};

// Used when the main process is unreachable (browser dev server) or answered
// with a failure. / メインプロセスへ到達できない(ブラウザのdev server)か、
// 失敗を返した場合に使う。
const applyLocalConversion = (
  state: ImeCoreState,
  kana: string,
): ImeCoreState => {
  if (!kana) {
    return {
      ...state,
      segments: [],
      candidates: [],
      candidateIndex: 0,
      isConverting: false,
    };
  }
  const candidates = buildLocalCandidates(kana);
  return {
    ...state,
    rawKana: kana,
    candidates,
    candidateIndex: 0,
    segments: [{ raw: kana, candidates, selectedIndex: 0 }],
    isConverting: true,
  };
};

const requestConvert = (state: ImeCoreState, kana: string): ImeCoreState => {
  const id = state.requestId + 1;
  const before =
    state.preeditStart === null
      ? state.input
      : state.input.slice(0, clamp(state.preeditStart, 0, state.input.length));
  return {
    ...state,
    requestId: id,
    pending: {
      id,
      kind: 'convert',
      kana,
      context: {
        previousText: before,
        previousWord: extractPreviousWord(before),
      },
    },
  };
};

// Insert literal text at the caret, committing any preedit first.
// The chatbox limit applies to what the user sees, which is why this measures
// the folded text rather than the raw input.
// キャレット位置へテキストをそのまま挿入する。未確定文字列があれば先に確定する。
// チャットボックスの上限はユーザーに見えている文字列に掛かるため、畳み込み後の
// テキストで判定する。
const insertLiteral = (
  state: ImeCoreState,
  text: string,
): ImeCoreState | null => {
  let next = foldPreedit(state);
  next = collapseSelection(next);
  if (next.input.length + text.length > next.maxLength) return null;
  const at = clamp(next.caret, 0, next.input.length);
  return {
    ...next,
    input: next.input.slice(0, at) + text + next.input.slice(at),
    caret: at + text.length,
    selectionEnd: at + text.length,
  };
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function imeReducer(
  state: ImeCoreState,
  action: ImeAction,
): ImeCoreState {
  switch (action.type) {
    case 'CHAR_INPUT': {
      const char = action.char;
      if (!char) return state;

      // Digits pick a candidate while the list is open, they do not type.
      // 候補表示中の数字キーは入力ではなく候補選択。
      if (state.isConverting && /^[1-9]$/.test(char)) {
        return imeReducer(state, {
          type: 'COMMIT_PREEDIT',
          index: Number(char) - 1,
        });
      }

      const isRomaji = /^[a-z-]$/.test(char);
      if (state.mode === InputMode.ENGLISH || !isRomaji) {
        const inserted = insertLiteral(state, char);
        return inserted === null ? state : touchMutation(inserted);
      }

      // Continued romaji leaves candidate mode and keeps extending the kana.
      // ローマ字の継続入力は候補モードを抜け、かなを伸ばし続ける。
      let next = state.isConverting ? dropConversion(state) : state;
      next = collapseSelection(next);

      const startsPreedit =
        next.rawKana.length === 0 && next.buffer.length === 0;
      const preeditStart = startsPreedit
        ? clamp(next.caret, 0, next.input.length)
        : next.preeditStart;

      const res = toKana(char.toLowerCase(), next.buffer);
      let nextRawKana = next.rawKana;
      if (res.output) {
        nextRawKana =
          next.rawKana +
          (next.mode === InputMode.KATAKANA
            ? convertToKatakana(res.output)
            : res.output);
      }

      if (
        next.input.length + nextRawKana.length + res.newBuffer.length >
        next.maxLength
      ) {
        return state;
      }

      next = {
        ...next,
        rawKana: nextRawKana,
        buffer: res.newBuffer,
        preeditStart,
      };

      // Show candidates as soon as a full kana syllable exists.
      // かなが1音成立した時点で候補を出す。
      if (
        next.mode === InputMode.HIRAGANA &&
        nextRawKana.length > 0 &&
        res.newBuffer.length === 0
      ) {
        next = requestConvert(next, nextRawKana);
      }

      return touchMutation(next);
    }

    case 'BACKSPACE': {
      // While candidates are open, backspace only leaves candidate mode.
      // 候補表示中のバックスペースは候補モードを抜けるだけ。
      if (state.isConverting) return touchMutation(dropConversion(state));

      if (state.caret !== state.selectionEnd) {
        return touchMutation(collapseSelection(state));
      }

      if (state.buffer.length > 0) {
        const buffer = state.buffer.slice(0, -1);
        return touchMutation({
          ...state,
          buffer,
          preeditStart:
            buffer === '' && state.rawKana === '' ? null : state.preeditStart,
        });
      }

      if (state.rawKana.length > 0) {
        const rawKana = state.rawKana.slice(0, -1);
        return touchMutation({
          ...state,
          rawKana,
          preeditStart: rawKana === '' ? null : state.preeditStart,
        });
      }

      if (state.caret <= 0) return state;
      const at = clamp(state.caret, 0, state.input.length);
      return touchMutation({
        ...state,
        input: state.input.slice(0, at - 1) + state.input.slice(at),
        caret: at - 1,
        selectionEnd: at - 1,
      });
    }

    case 'SPACE': {
      if (state.isConverting) {
        const id = state.requestId + 1;
        return touchCaret({
          ...state,
          requestId: id,
          pending: { id, kind: 'next' },
        });
      }

      if (state.mode === InputMode.HIRAGANA && state.preeditStart !== null) {
        // Flush the leftover romaji buffer into kana before converting.
        // 変換前に残留ローマ字バッファをかなへフラッシュする。
        let kana = state.rawKana;
        if (state.buffer) {
          const res = toKana(state.buffer, '');
          if (res.output) kana += res.output;
          // Romaji that cannot resolve stays literal, same as a native IME.
          // 解決できないローマ字はネイティブIMEと同じくそのまま残す。
          if (res.newBuffer) kana += res.newBuffer;
        }
        if (kana.length > 0) {
          return touchMutation(
            requestConvert({ ...state, rawKana: kana, buffer: '' }, kana),
          );
        }
      }

      // Any other mode commits the preedit and then types a space. Clearing it
      // instead silently ate the user's unconverted kana.
      // それ以外のモードでは未確定文字列を確定してから空白を打つ。旧実装はここで
      // 破棄しており、ユーザーの未変換かなが黙って消えていた。
      const inserted = insertLiteral(state, ' ');
      return inserted === null ? state : touchMutation(inserted);
    }

    case 'COMMIT_PREEDIT': {
      if (state.preeditStart === null) return state;
      return touchMutation(foldPreedit(state, action.index));
    }

    case 'CANCEL_CONVERSION': {
      if (!state.isConverting) return state;
      return touchMutation(dropConversion(state));
    }

    // Escape and the virtual clear key back out of candidate mode first and
    // only wipe the text on a second press, like a native IME.
    // Escape と仮想クリアキーは、まず候補モードを抜け、2回目の押下で初めてテキストを
    // 消す。ネイティブIMEと同じ段階的な挙動。
    case 'CLEAR': {
      return imeReducer(
        state,
        state.isConverting ? { type: 'CANCEL_CONVERSION' } : { type: 'CLEAR_ALL' },
      );
    }

    case 'CLEAR_ALL': {
      const next = dropPreedit(state);
      return touchMutation({ ...next, input: '', caret: 0, selectionEnd: 0 });
    }

    case 'REPLACE_ALL': {
      const text =
        action.text.length > state.maxLength
          ? action.text.slice(0, state.maxLength)
          : action.text;
      const next = dropPreedit(state);
      return touchMutation({
        ...next,
        input: text,
        caret: text.length,
        selectionEnd: text.length,
      });
    }

    case 'SET_SELECTION': {
      if (state.preeditStart === null) {
        const caret = clamp(action.start, 0, state.input.length);
        const selectionEnd = clamp(action.end, 0, state.input.length);
        // Returning the same object keeps React from re-rendering on the
        // selectionchange events our own caret writes produce.
        // 同一オブジェクトを返すことで、自前のキャレット書き込みが生む
        // selectionchange による再レンダーを防ぐ。
        if (caret === state.caret && selectionEnd === state.selectionEnd) {
          return state;
        }
        return { ...state, caret, selectionEnd };
      }

      // Moving inside the preedit is ignored: the caret belongs at its trailing
      // edge until it is committed. / 未確定文字列の内側への移動は無視する。
      // 確定するまでキャレットはその末尾に属する。
      const at = clamp(state.preeditStart, 0, state.input.length);
      const spanEnd = at + preeditTextOf(state).length;
      if (
        action.start >= at &&
        action.start <= spanEnd &&
        action.end >= at &&
        action.end <= spanEnd
      ) {
        return state;
      }

      // Clicking outside commits, like a native IME. The committed text is
      // exactly the preedit text, so display and committed coordinates line up
      // and the requested offsets need no adjustment.
      // 外側をクリックしたら確定する。ネイティブIMEと同じ挙動。確定テキストは未確定
      // 文字列そのものなので表示座標と確定テキスト座標が一致し、要求されたオフセットの
      // 補正は不要。
      const folded = foldPreedit(state);
      return touchCaret({
        ...folded,
        caret: clamp(action.start, 0, folded.input.length),
        selectionEnd: clamp(action.end, 0, folded.input.length),
      });
    }

    case 'SET_MODE': {
      if (action.mode === state.mode) return state;
      if (state.preeditStart === null) {
        return touchCaret({ ...state, mode: action.mode });
      }
      return touchMutation({ ...foldPreedit(state), mode: action.mode });
    }

    case 'IPC_RESULT': {
      // A reply for a generation we have moved past describes text that no
      // longer exists. Dropping it is what stops a stale conversion from
      // resurrecting a preedit behind an already committed word.
      // 世代が進んだ後に届いた応答は、もう存在しないテキストに対するものである。
      // これを破棄することで、古い変換が確定済みの語の裏で未確定文字列を
      // 復活させるのを防ぐ。
      if (action.requestId !== state.requestId) return state;

      if (action.kind === 'commit' || action.kind === 'cancel') {
        return { ...state, pending: null };
      }

      // The preedit is gone, so there is nothing left for this reply to apply
      // to. / 未確定文字列が既に無いので、この応答の適用先が存在しない。
      if (state.preeditStart === null) return { ...state, pending: null };

      if (!action.state) {
        // No main process (browser dev server) or it reported a failure, so
        // cycle / convert locally instead of leaving the user stuck.
        // メインプロセスが無い(ブラウザのdev server)か失敗を返した場合。ユーザーを
        // 行き止まりにしないよう、ローカルで巡回・変換する。
        if (action.kind === 'next') {
          if (state.candidates.length === 0) return { ...state, pending: null };
          const nextIndex = (state.candidateIndex + 1) % state.candidates.length;
          return touchCaret({
            ...state,
            pending: null,
            candidateIndex: nextIndex,
            segments:
              state.segments.length > 0
                ? [{ ...state.segments[0], selectedIndex: nextIndex }]
                : state.segments,
          });
        }
        return touchCaret(
          applyLocalConversion(
            { ...state, pending: null },
            action.kana || state.rawKana,
          ),
        );
      }

      const incoming = action.state;
      return touchCaret({
        ...state,
        pending: null,
        rawKana: incoming.rawKana || state.rawKana,
        segments: Array.isArray(incoming.segments) ? incoming.segments : [],
        candidates: Array.isArray(incoming.candidates)
          ? incoming.candidates
          : [],
        candidateIndex: Number.isInteger(incoming.candidateIndex)
          ? incoming.candidateIndex
          : 0,
        isConverting: Boolean(incoming.isConverting),
      });
    }

    default:
      return state;
  }
}
