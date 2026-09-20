import { describe, expect, it } from 'vitest';
import {
  createInitialImeState,
  imeReducer,
  displayTextOf,
  displayCaretOf,
  preeditTextOf,
  type ImeAction,
  type ImeCoreState,
} from './imeReducer';
import { InputMode } from '../types';
import type { ImeState as ImeIpcState } from '../types/ime';

// Apply a list of actions in order, like a sequence of key presses.
// アクションを順に適用する。キー入力の連打に相当。
const run = (state: ImeCoreState, ...actions: ImeAction[]): ImeCoreState =>
  actions.reduce(imeReducer, state);

const type = (state: ImeCoreState, chars: string): ImeCoreState =>
  run(state, ...[...chars].map((char): ImeAction => ({ type: 'CHAR_INPUT', char })));

// Answer whatever convert request is currently pending, the way the main
// process would. / 現在保留中の変換リクエストに、メインプロセスの代わりに応答する。
const reply = (
  state: ImeCoreState,
  candidateTexts: string[],
  overrides: Partial<ImeIpcState> = {},
): ImeCoreState => {
  const pending = state.pending;
  if (!pending) throw new Error('no pending request to reply to');
  const candidates = candidateTexts.map((text) => ({
    text,
    reading: state.rawKana,
  }));
  const ipcState: ImeIpcState = {
    rawKana: state.rawKana,
    segments: [{ raw: state.rawKana, candidates, selectedIndex: 0 }],
    candidates,
    candidateIndex: 0,
    isConverting: true,
    preedit: candidateTexts[0] ?? '',
    selectedCandidate: candidateTexts[0] ?? '',
    ...overrides,
  };
  return imeReducer(state, {
    type: 'IPC_RESULT',
    requestId: pending.id,
    kind: 'convert',
    state: ipcState,
  });
};

const fresh = (mode: InputMode = InputMode.HIRAGANA, maxLength = 144) =>
  createInitialImeState(mode, maxLength);

describe('imeReducer / IME状態機械', () => {
  describe('caret after commit / 確定後のキャレット', () => {
    // This is the reported bug: after committing, the next character landed at
    // column 0 instead of after the committed word.
    // 報告されたバグそのもの。確定後、次の文字が確定語の後ろではなく先頭に入っていた。
    it('leaves the caret right after the committed text', () => {
      let state = type(fresh(), 'kanji');
      state = reply(state, ['かんじ', '漢字']);
      state = imeReducer(state, { type: 'COMMIT_PREEDIT', index: 1 });

      expect(state.input).toBe('漢字');
      expect(state.caret).toBe(2);
      expect(displayCaretOf(state)).toBe(2);
    });

    it('types the next character after the committed text, not at column 0', () => {
      let state = type(fresh(), 'kanji');
      state = reply(state, ['かんじ', '漢字']);
      state = imeReducer(state, { type: 'COMMIT_PREEDIT', index: 1 });

      state = type(state, 'a');

      expect(displayTextOf(state)).toBe('漢字あ');
      expect(displayCaretOf(state)).toBe(3);
    });

    it('commits into the middle of existing text and keeps the caret there', () => {
      let state = run(fresh(), { type: 'REPLACE_ALL', text: 'ABCD' });
      state = imeReducer(state, { type: 'SET_SELECTION', start: 2, end: 2 });

      state = type(state, 'ka');
      expect(displayTextOf(state)).toBe('ABかCD');

      state = reply(state, ['か', '化']);
      state = imeReducer(state, { type: 'COMMIT_PREEDIT', index: 1 });

      expect(state.input).toBe('AB化CD');
      expect(state.caret).toBe(3);
    });
  });

  describe('caret while converting / 変換中のキャレット', () => {
    it('follows the preedit when a 1-char kana becomes a 3-char word', () => {
      let state = type(fresh(), 'a');
      expect(displayCaretOf(state)).toBe(1);

      state = reply(state, ['あいさつ']);

      expect(displayTextOf(state)).toBe('あいさつ');
      expect(displayCaretOf(state)).toBe(4);
    });

    // The old controller guessed the caret from the text length difference, so
    // a same-length commit moved it by zero and left it inside the word.
    // 旧コントローラはテキスト長の差分からキャレットを推測していたため、長さが
    // 変わらない確定では移動量0になり、語の内側に取り残されていた。
    it('is correct for a commit that does not change the text length', () => {
      let state = type(fresh(), 'kanji');
      state = reply(state, ['かんじ', '漢字']);
      expect(preeditTextOf(state)).toBe('かんじ');

      state = imeReducer(state, { type: 'COMMIT_PREEDIT', index: 0 });

      expect(state.input).toBe('かんじ');
      expect(state.caret).toBe(3);
    });

    it('sits at the trailing edge of a preedit inserted mid-text', () => {
      let state = run(fresh(), { type: 'REPLACE_ALL', text: 'XY' });
      state = imeReducer(state, { type: 'SET_SELECTION', start: 1, end: 1 });
      state = type(state, 'ka');
      state = reply(state, ['か', '課']);

      expect(displayTextOf(state)).toBe('XかY');
      expect(displayCaretOf(state)).toBe(2);
    });
  });

  describe('batching / 同一状態からの連続適用', () => {
    // Two virtual key presses landing in one React batch both read the same
    // state. The old non-functional setState dropped the first character.
    // 仮想キーの2回押下が1つのReactバッチに入ると、両方が同じstateを読む。
    // 旧実装の非functional setStateは1文字目を取りこぼしていた。
    it('does not drop a character when two inputs apply to the same state', () => {
      const base = run(fresh(InputMode.ENGLISH), { type: 'REPLACE_ALL', text: '' });

      const once = imeReducer(base, { type: 'CHAR_INPUT', char: 'a' });
      const twice = imeReducer(once, { type: 'CHAR_INPUT', char: 'b' });

      expect(twice.input).toBe('ab');
      expect(twice.caret).toBe(2);
    });
  });

  describe('preeditStart invariant / preeditStart の不変条件', () => {
    const actions: ImeAction[] = [
      { type: 'CHAR_INPUT', char: 'k' },
      { type: 'CHAR_INPUT', char: 'a' },
      { type: 'CHAR_INPUT', char: '!' },
      { type: 'BACKSPACE' },
      { type: 'SPACE' },
      { type: 'COMMIT_PREEDIT' },
      { type: 'CANCEL_CONVERSION' },
      { type: 'DISCARD_PREEDIT' },
      { type: 'CLEAR_ALL' },
      { type: 'REPLACE_ALL', text: 'hello' },
      { type: 'SYNC_FROM_DOM', value: 'hi', selectionStart: 2, selectionEnd: 2 },
      { type: 'SET_SELECTION', start: 0, end: 0 },
      { type: 'SET_MODE', mode: InputMode.KATAKANA },
    ];

    it.each(actions.map((action) => [action.type, action] as const))(
      'holds after %s',
      (_label, action) => {
        // Start from a state that has both a kana and a romaji buffer pending.
        // かなとローマ字バッファの両方が残った状態から始める。
        const withPreedit = type(fresh(), 'kak');
        expect(withPreedit.preeditStart).not.toBeNull();

        const next = imeReducer(withPreedit, action);
        const hasPending = next.buffer !== '' || next.rawKana !== '';

        expect(next.preeditStart !== null).toBe(hasPending);
      },
    );
  });

  describe('generation counter / 世代カウンタ', () => {
    const discarding: ImeAction[] = [
      { type: 'COMMIT_PREEDIT' },
      { type: 'DISCARD_PREEDIT' },
      { type: 'CLEAR_ALL' },
      { type: 'REPLACE_ALL', text: 'x' },
      { type: 'SYNC_FROM_DOM', value: 'x', selectionStart: 1, selectionEnd: 1 },
      { type: 'CANCEL_CONVERSION' },
    ];

    it.each(discarding.map((action) => [action.type, action] as const))(
      '%s invalidates in-flight replies',
      (_label, action) => {
        let state = type(fresh(), 'ka');
        state = reply(state, ['か', '課']);
        const before = state.requestId;

        const next = imeReducer(state, action);

        expect(next.requestId).toBeGreaterThan(before);
      },
    );

    it.each(discarding.map((action) => [action.type, action] as const))(
      '%s tells main to cancel its own conversion state',
      (_label, action) => {
        // Main keeps conversion state of its own. Dropping ours without telling
        // it leaves it answering a later commit from stale segments.
        // main側も変換状態を持つ。こちらだけ捨てて通知しないと、main は古い segments の
        // まま次の確定に応じてしまう。
        let state = type(fresh(), 'ka');
        state = reply(state, ['か', '課']);

        const next = imeReducer(state, action);

        expect(next.pending?.kind).toBe(
          action.type === 'COMMIT_PREEDIT' ? 'commit' : 'cancel',
        );
      },
    );

    it('drops a reply whose generation has already been superseded', () => {
      let state = type(fresh(), 'ka');
      const staleId = state.pending!.id;
      state = imeReducer(state, { type: 'CLEAR_ALL' });

      const next = imeReducer(state, {
        type: 'IPC_RESULT',
        requestId: staleId,
        kind: 'convert',
        state: {
          rawKana: 'か',
          segments: [],
          candidates: [{ text: '課' }],
          candidateIndex: 0,
          isConverting: true,
          preedit: '課',
          selectedCandidate: '課',
        },
      });

      // Same object, so React does not even re-render.
      // 同一オブジェクトなのでReactは再レンダーすらしない。
      expect(next).toBe(state);
      expect(next.isConverting).toBe(false);
    });

    it('does not resurrect a preedit behind an already committed word', () => {
      let state = type(fresh(), 'ka');
      state = reply(state, ['か', '課']);
      const staleId = state.requestId;

      state = imeReducer(state, { type: 'COMMIT_PREEDIT', index: 1 });
      // A convert reply for the pre-commit text lands late.
      // 確定前のテキストに対する変換応答が遅れて着弾する。
      state = imeReducer(state, {
        type: 'IPC_RESULT',
        requestId: staleId,
        kind: 'convert',
        state: {
          rawKana: 'か',
          segments: [],
          candidates: [{ text: '蚊' }],
          candidateIndex: 0,
          isConverting: true,
          preedit: '蚊',
          selectedCandidate: '蚊',
        },
      });

      expect(displayTextOf(state)).toBe('課');
      expect(state.isConverting).toBe(false);
    });
  });

  describe('commit context / 確定時のコンテキスト', () => {
    it('sends the committed text so main can verify before learning', () => {
      let state = type(fresh(), 'ka');
      state = reply(state, ['か', '課']);

      state = imeReducer(state, { type: 'COMMIT_PREEDIT', index: 1 });

      expect(state.pending).toMatchObject({
        kind: 'commit',
        index: 1,
        context: { expectedText: '課' },
      });
    });
  });

  describe('space / スペースキー', () => {
    // The old code cleared all pending state here, so unconverted kana vanished
    // whenever the user hit space outside hiragana mode.
    // 旧実装はここで未確定状態を全消去していたため、ひらがなモード以外でスペースを
    // 押すと未変換のかなが消えていた。
    it('commits the preedit before inserting a space in katakana mode', () => {
      let state = type(fresh(InputMode.KATAKANA), 'ka');
      expect(displayTextOf(state)).toBe('カ');

      state = imeReducer(state, { type: 'SPACE' });

      expect(state.input).toBe('カ ');
      expect(state.caret).toBe(2);
    });

    it('commits the preedit before inserting a space in english mode', () => {
      let state = type(fresh(InputMode.HIRAGANA), 'ka');
      state = imeReducer(state, { type: 'SET_MODE', mode: InputMode.ENGLISH });
      state = imeReducer(state, { type: 'SPACE' });

      expect(state.input).toBe('か ');
    });

    it('cycles to the next candidate while converting', () => {
      let state = type(fresh(), 'ka');
      state = reply(state, ['か', '課']);

      state = imeReducer(state, { type: 'SPACE' });

      expect(state.pending?.kind).toBe('next');
    });

    it('flushes a leftover romaji buffer into the reading before converting', () => {
      // 'ky' is a valid prefix, so it stays literal - the same thing a native
      // IME shows. What matters is that it is not silently dropped.
      // 'ky' は有効な接頭辞なのでそのまま残る。ネイティブIMEと同じ表示になる。
      // 重要なのは黙って消えないこと。
      let state = type(fresh(), 'ky');
      expect(state.buffer).toBe('ky');

      state = imeReducer(state, { type: 'SPACE' });

      expect(state.buffer).toBe('');
      expect(state.rawKana).toBe('ky');
      expect(state.pending).toMatchObject({ kind: 'convert', kana: 'ky' });
    });
  });

  describe('backspace / バックスペース', () => {
    it('deletes the character before the caret, not at the end', () => {
      let state = run(fresh(), { type: 'REPLACE_ALL', text: 'ABCD' });
      state = imeReducer(state, { type: 'SET_SELECTION', start: 2, end: 2 });

      state = imeReducer(state, { type: 'BACKSPACE' });

      expect(state.input).toBe('ACD');
      expect(state.caret).toBe(1);
    });

    // The old code applied a display-coordinate cursor straight to the
    // committed text, so it deleted the wrong character while a preedit was up.
    // 旧実装は表示座標のカーソルを確定テキストへ直接適用していたため、未確定文字列が
    // あると別の文字を消していた。
    it('never touches the committed text while a preedit is open', () => {
      let state = run(fresh(), { type: 'REPLACE_ALL', text: 'ABCD' });
      state = imeReducer(state, { type: 'SET_SELECTION', start: 2, end: 2 });
      state = type(state, 'ka');
      state = reply(state, ['か']);

      state = imeReducer(state, { type: 'BACKSPACE' }); // leaves candidate mode
      state = imeReducer(state, { type: 'BACKSPACE' }); // deletes the kana

      expect(state.input).toBe('ABCD');
      expect(state.rawKana).toBe('');
      expect(state.preeditStart).toBeNull();
    });

    it('does nothing at the start of the text', () => {
      const state = run(fresh(), { type: 'REPLACE_ALL', text: 'A' }, { type: 'SET_SELECTION', start: 0, end: 0 });

      expect(imeReducer(state, { type: 'BACKSPACE' })).toBe(state);
    });
  });

  describe('selection ranges / 範囲選択', () => {
    it('replaces the selected range when typing', () => {
      let state = run(fresh(InputMode.ENGLISH), { type: 'REPLACE_ALL', text: 'ABCD' });
      state = imeReducer(state, { type: 'SET_SELECTION', start: 1, end: 3 });

      state = type(state, 'x');

      expect(state.input).toBe('AxD');
      expect(state.caret).toBe(2);
    });

    it('deletes the whole selected range on backspace, not one extra char', () => {
      let state = run(fresh(), { type: 'REPLACE_ALL', text: 'ABCD' });
      state = imeReducer(state, { type: 'SET_SELECTION', start: 1, end: 3 });

      state = imeReducer(state, { type: 'BACKSPACE' });

      expect(state.input).toBe('AD');
      expect(state.caret).toBe(1);
    });

    it('replaces the selected range with a space', () => {
      let state = run(fresh(), { type: 'REPLACE_ALL', text: 'ABCD' });
      state = imeReducer(state, { type: 'SET_SELECTION', start: 1, end: 3 });

      state = imeReducer(state, { type: 'SPACE' });

      expect(state.input).toBe('A D');
    });
  });

  describe('SET_SELECTION', () => {
    it('returns the identical state object for an unchanged selection', () => {
      const state = run(fresh(), { type: 'REPLACE_ALL', text: 'ABC' });

      const next = imeReducer(state, { type: 'SET_SELECTION', start: 3, end: 3 });

      expect(next).toBe(state);
    });

    it('ignores a move inside the preedit span', () => {
      let state = type(fresh(), 'ka');
      state = reply(state, ['か']);

      const next = imeReducer(state, { type: 'SET_SELECTION', start: 0, end: 0 });

      // preeditStart is 0 and the span is [0, 1], so 0 is inside.
      // preeditStart は 0、スパンは [0, 1] なので 0 は内側。
      expect(next).toBe(state);
    });

    it('commits the preedit when the caret moves outside it', () => {
      let state = run(fresh(), { type: 'REPLACE_ALL', text: 'ABCD' });
      state = imeReducer(state, { type: 'SET_SELECTION', start: 4, end: 4 });
      state = type(state, 'ka');
      state = reply(state, ['か', '課']);
      expect(displayTextOf(state)).toBe('ABCDか');

      state = imeReducer(state, { type: 'SET_SELECTION', start: 1, end: 1 });

      expect(state.isConverting).toBe(false);
      expect(state.input).toBe('ABCDか');
      expect(state.caret).toBe(1);
    });
  });

  describe('maxLength / 文字数上限', () => {
    it('measures what the user sees, preedit included', () => {
      const state = run(fresh(InputMode.HIRAGANA, 4), {
        type: 'REPLACE_ALL',
        text: 'ABC',
      });
      const withKana = type(state, 'ka'); // 'ABCか' = 4
      expect(displayTextOf(withKana)).toBe('ABCか');

      const blocked = type(withKana, 'ki');

      expect(displayTextOf(blocked)).toBe('ABCか');
    });

    it('blocks a literal insert that would overflow', () => {
      const state = run(fresh(InputMode.ENGLISH, 3), {
        type: 'REPLACE_ALL',
        text: 'ABC',
      });

      expect(imeReducer(state, { type: 'CHAR_INPUT', char: 'D' })).toBe(state);
    });

    it('truncates a replacement that is too long', () => {
      const state = run(fresh(InputMode.HIRAGANA, 3), {
        type: 'REPLACE_ALL',
        text: 'ABCDEF',
      });

      expect(state.input).toBe('ABC');
      expect(state.caret).toBe(3);
    });
  });

  describe('candidate digits / 数字キーでの候補選択', () => {
    it('commits the nth candidate instead of typing the digit', () => {
      let state = type(fresh(), 'a');
      state = reply(state, ['あ', 'ア', '亜']);

      state = type(state, '3');

      expect(state.input).toBe('亜');
      expect(state.isConverting).toBe(false);
    });

    it('types the digit when no candidates are open', () => {
      const state = type(fresh(), '3');

      expect(state.input).toBe('3');
    });
  });

  describe('clear and replace / クリアと置換', () => {
    it('clears text, preedit and caret together', () => {
      let state = type(fresh(), 'ka');
      state = reply(state, ['か']);

      state = imeReducer(state, { type: 'CLEAR_ALL' });

      expect(state.input).toBe('');
      expect(state.caret).toBe(0);
      expect(state.preeditStart).toBeNull();
      expect(state.isConverting).toBe(false);
    });

    it('puts the caret at the end of recalled history text', () => {
      const state = run(fresh(), { type: 'REPLACE_ALL', text: 'こんにちは' });

      expect(state.caret).toBe(5);
      expect(state.selectionEnd).toBe(5);
    });
  });

  describe('SYNC_FROM_DOM / DOM由来の同期', () => {
    it('keeps the caret the DOM already placed and does not write it back', () => {
      const state = fresh();

      const next = imeReducer(state, {
        type: 'SYNC_FROM_DOM',
        value: 'こんにちは',
        selectionStart: 2,
        selectionEnd: 2,
      });

      expect(next.input).toBe('こんにちは');
      expect(next.caret).toBe(2);
      // Writing the selection back mid-composition breaks the OS IME.
      // 合成中に選択を書き戻すと OS の IME が壊れる。
      expect(next.caretRevision).toBe(state.caretRevision);
      expect(next.mutationSeq).toBe(state.mutationSeq + 1);
    });

    it('writes the caret back when it had to trim the value', () => {
      const state = fresh(InputMode.HIRAGANA, 3);

      const next = imeReducer(state, {
        type: 'SYNC_FROM_DOM',
        value: 'ABCDEF',
        selectionStart: 6,
        selectionEnd: 6,
      });

      expect(next.input).toBe('ABC');
      expect(next.caret).toBe(3);
      expect(next.caretRevision).toBe(state.caretRevision + 1);
    });
  });

  describe('local fallback / ローカルフォールバック', () => {
    it('falls back to kana and katakana when main reports a failure', () => {
      let state = type(fresh(), 'a');
      const pendingId = state.pending!.id;

      state = imeReducer(state, {
        type: 'IPC_RESULT',
        requestId: pendingId,
        kind: 'convert',
        state: null,
        kana: 'あ',
      });

      expect(state.isConverting).toBe(true);
      expect(state.candidates.map((candidate) => candidate.text)).toEqual([
        'あ',
        'ア',
      ]);
    });
  });
});
