/**
 * useKeyboardController - Wires the IME state machine to the textarea.
 * IME状態機械をテキストエリアへ接続するフック。
 *
 * The caret is written back to the DOM from exactly one place: the layout
 * effect below. Every path - virtual key, candidate click, a conversion reply
 * arriving milliseconds later, send, history recall - ends up there, because
 * they all go through the reducer and bump caretRevision.
 * キャレットをDOMへ書き戻す箇所は下のレイアウトエフェクトただ1つである。仮想キー・
 * 候補クリック・数ミリ秒遅れて届く変換応答・送信・履歴呼び出しのすべてが
 * リデューサを通って caretRevision を進めるため、必ずここに合流する。
 *
 * The textarea never edits its own text. The only thing that flows from the
 * DOM into the reducer is the selection a click placed (SET_SELECTION). The
 * physical keyboard / OS IME path used to let the textarea own the text and
 * caret while typing, which gave the caret two owners; the app is VR-only and
 * the offscreen keyboard window cannot receive OS focus, so that path is gone.
 * テキストエリアは自分でテキストを編集しない。DOMからリデューサへ流れるのは、クリックで
 * 置かれた選択位置(SET_SELECTION)だけである。以前の物理キーボード / OS IME 経路は
 * 入力中のテキストとキャレットをテキストエリアに持たせており、キャレットの持ち主が
 * 2つあった。アプリはVR専用で、オフスクリーンのキーボードウィンドウはOSのフォーカスを
 * 受け取れないため、この経路は削除した。
 *
 * The previous implementation instead guessed the caret inside a
 * requestAnimationFrame from the difference in text length. That guess ran
 * before the asynchronous conversion reply landed, so the reply moved the caret
 * afterwards with nothing left to correct it - and the resulting position was
 * then recorded as the new insertion point. That is the "caret jumps to the
 * left edge after committing" bug.
 * 旧実装は requestAnimationFrame の中でテキスト長の差分からキャレットを推測していた。
 * この推測は非同期の変換応答が届く前に走るため、応答が後からキャレットを動かしても
 * 誰も補正せず、その位置が新しい挿入基準として記録されていた。これが「確定後に
 * キャレットが左端へ飛ぶ」バグである。
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { InputMode } from '../types';

interface UseKeyboardControllerProps {
  displayText: string;
  displayCaret: number;
  displaySelectionEnd: number;
  caretRevision: number;
  mutationSeq: number;
  isConverting: boolean;
  mode: InputMode;
  setMode: (mode: InputMode) => void;
  handleCharInput: (char: string) => void;
  handleBackspace: () => void;
  handleClear: () => void;
  handleSpace: () => void;
  handleCommitCandidate: (index?: number) => void;
  commitPreedit: () => void;
  setSelection: (start: number, end: number) => void;
  handlePrimaryAction: () => void;
  handleInputEffect: (text: string) => void;
  onHistoryUp?: () => void; // Navigate to older history / 古い履歴へ移動
  onHistoryDown?: () => void; // Navigate to newer history / 新しい履歴へ移動
}

const MODE_CYCLE: Record<InputMode, InputMode> = {
  [InputMode.ENGLISH]: InputMode.HIRAGANA,
  [InputMode.HIRAGANA]: InputMode.KATAKANA,
  [InputMode.KATAKANA]: InputMode.ENGLISH,
};

// Focus belongs to a dialog while one is open; stealing it back would fight the
// settings modal's focus trap. / モーダルが開いている間フォーカスはそちらに属する。
// 奪い返すと設定モーダルのフォーカストラップと喧嘩する。
const isInsideDialog = (element: Element | null): boolean =>
  Boolean(element?.closest('[role="dialog"]'));

export const useKeyboardController = ({
  displayText,
  displayCaret,
  displaySelectionEnd,
  caretRevision,
  mutationSeq,
  isConverting,
  mode,
  setMode,
  handleCharInput,
  handleBackspace,
  handleClear,
  handleSpace,
  handleCommitCandidate,
  commitPreedit,
  setSelection,
  handlePrimaryAction,
  handleInputEffect,
  onHistoryUp,
  onHistoryDown,
}: UseKeyboardControllerProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isPointerSelecting = useRef(false); // User is dragging a selection / ユーザーがドラッグ選択中
  const appliedSelection = useRef<{ start: number; end: number } | null>(null);
  const lastAppliedRevision = useRef(0);
  const lastMutationSeq = useRef(0);

  // --- Caret: the single write path to the DOM / キャレット: DOMへの唯一の書き込み経路 ---
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Revision starts at 0 on both sides, so the first pass is a no-op and does
    // not steal focus from the tutorial overlay on a cold start.
    // 両者とも0から始まるので初回はno-opになり、初回起動時にチュートリアルから
    // フォーカスを奪わない。
    if (caretRevision === lastAppliedRevision.current) return;
    lastAppliedRevision.current = caretRevision;

    // Do not fight a selection the user is still dragging out.
    // ユーザーがドラッグ中の選択範囲は奪わない。
    if (isPointerSelecting.current) return;

    const max = el.value.length;
    const start = Math.max(0, Math.min(displayCaret, max));
    const end = Math.max(0, Math.min(displaySelectionEnd, max));

    // Candidate buttons and virtual keys can take focus. Restoring it here is
    // what replaces the focus() the removed rAF callback used to do.
    // 候補ボタンや仮想キーはフォーカスを奪いうる。ここで戻すことが、削除したrAF
    // コールバックの focus() の代わりになる。
    const active = document.activeElement;
    if (active !== el && !isInsideDialog(active)) {
      el.focus({ preventScroll: true });
    }

    el.setSelectionRange(start, end);
    appliedSelection.current = { start, end };
  }, [caretRevision, displayCaret, displaySelectionEnd]);

  // --- Input side effects: typing indicator, auto-send, history exit ---
  // --- 入力副作用: タイピングインジケーター、自動送信、履歴走査の解除 ---
  //
  // Driven by mutationSeq rather than by displayText, so candidate cycling and
  // conversion replies - which change the visible text without the user typing
  // anything - do not trigger an auto-send or knock the user out of history
  // navigation.
  // displayText ではなく mutationSeq で駆動する。候補の巡回や変換応答は、ユーザーが
  // 何も打っていないのに表示文字列を変えるため、それらで自動送信が走ったり履歴走査が
  // 解除されたりしないようにするため。
  useEffect(() => {
    if (mutationSeq === lastMutationSeq.current) return;
    lastMutationSeq.current = mutationSeq;
    handleInputEffect(displayText);
  }, [mutationSeq, displayText, handleInputEffect]);

  const toggleMode = useCallback(() => {
    // SET_MODE commits any open preedit first, so the kana already typed is
    // kept in the mode it was typed in. / SET_MODE は開いている未確定文字列を先に
    // 確定するので、既に打ったかなは打った時のモードのまま残る。
    setMode(MODE_CYCLE[mode]);
  }, [mode, setMode]);

  // --- DOM edits are refused / DOM由来の編集は拒否する ---
  //
  // Typing, paste, drop and undo would all change the text behind the
  // reducer's back. React's onBeforeInput is a synthetic event built from
  // keypress / textInput and misses most of these, so the native event is used.
  // readOnly is not an option: Chromium does not paint a caret in a readonly
  // field, and the user would lose sight of the insertion point in VR.
  // タイプ・ペースト・ドロップ・Undo はいずれもリデューサの知らないところでテキストを
  // 変えてしまう。React の onBeforeInput は keypress / textInput から作られる合成
  // イベントで、その大半を拾えないためネイティブのイベントを使う。readOnly は使えない。
  // Chromium は readonly のフィールドにキャレットを描かないので、VRで挿入位置が見えなくなる。
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const refuse = (e: Event) => e.preventDefault();
    el.addEventListener('beforeinput', refuse);
    return () => el.removeEventListener('beforeinput', refuse);
  }, []);

  // A controlled textarea needs onChange. Edits are already refused above, and
  // anything that slipped through is put back from state by React.
  // 制御コンポーネントには onChange が必要。編集は上で拒否しており、万一すり抜けても
  // React が state の値へ戻す。
  const handleTextareaChange = useCallback(() => {}, []);

  // --- Selection tracking / 選択位置の追跡 ---
  const handleSelect = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;

      // Ignore the selectionchange our own caret write produced. Feeding it
      // back in is how the old controller recorded a caret position it had just
      // corrected and then inserted the next character there.
      // 自前のキャレット書き込みが生んだ selectionchange は無視する。これを取り込むことが、
      // 旧コントローラが直したばかりの位置を記録し、次の文字をそこへ挿入していた原因。
      const applied = appliedSelection.current;
      if (applied && applied.start === start && applied.end === end) return;

      setSelection(start, end);
    },
    [setSelection],
  );

  const handlePointerDown = useCallback(() => {
    isPointerSelecting.current = true;
  }, []);

  useEffect(() => {
    const release = () => {
      isPointerSelecting.current = false;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, []);

  // --- Virtual keyboard / 仮想キーボード ---
  //
  // Memoised so VirtualKeyboard's memo() actually holds. Building this object
  // fresh on every render made the memo a no-op, and the virtual keyboard is
  // the most expensive subtree in the app.
  // VirtualKeyboard の memo() が実際に効くよう memo 化する。毎レンダーで作り直していた
  // ため memo が無意味になっていた。仮想キーボードはアプリ内で最も重いサブツリーである。
  const virtualKeyHandlers = useMemo(
    () => ({
      onChar: handleCharInput,
      onBackspace: handleBackspace,
      onClear: handleClear,
      onSend: () => (isConverting ? handleCommitCandidate() : handlePrimaryAction()),
      onSpace: handleSpace,
      onToggleMode: toggleMode,
      onCommitCandidate: handleCommitCandidate,
      onHistoryUp,
      onHistoryDown,
    }),
    [
      handleCharInput,
      handleBackspace,
      handleClear,
      handleSpace,
      handleCommitCandidate,
      handlePrimaryAction,
      isConverting,
      toggleMode,
      onHistoryUp,
      onHistoryDown,
    ],
  );

  return {
    textareaRef,
    toggleMode,
    handleTextareaChange,
    handleSelect,
    handlePointerDown,
    virtualKeyHandlers,
    commitPreedit,
  };
};
