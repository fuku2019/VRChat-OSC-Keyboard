import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, cleanup } from '@testing-library/react';
import { useIME } from './useIME';
import { useKeyboardController } from './useKeyboardController';
import { InputMode } from '../types';

// The caret restoration lives in a layout effect that reads textareaRef, so a
// renderHook cannot exercise it - it needs a real textarea in the document.
// <App /> would drag in the config store, audio and lucide for no extra
// coverage, so the harness below is the smallest thing that reproduces the
// renderer's actual wiring.
// キャレット復元は textareaRef を読むレイアウトエフェクトにあるため renderHook では
// 検証できない。実際の textarea がDOMに必要である。<App /> を使うと設定ストアや音声や
// lucide まで引き込む割にカバー範囲は増えないので、レンダラーの結線を再現する最小の
// ハーネスを用意する。

type Deferred = {
  kana: string;
  resolve: (response: unknown) => void;
};

let pendingConverts: Deferred[] = [];
let commitCalls: Array<[number, unknown]> = [];
let cancelCalls = 0;

const installElectronApi = () => {
  pendingConverts = [];
  commitCalls = [];
  cancelCalls = 0;
  vi.stubGlobal('electronAPI', undefined);
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    // Held open so a test can decide exactly when the reply lands, which is the
    // race the old implementation lost. / 応答の着弾タイミングをテストが決められるよう
    // 保留する。旧実装が負けていたのはこの競合である。
    imeConvert: (kana: string) =>
      new Promise((resolve) => {
        pendingConverts.push({ kana, resolve });
      }),
    imeNextCandidate: () => Promise.resolve({ success: false }),
    imeCommitCandidate: (index: number, context: unknown) => {
      commitCalls.push([index, context]);
      return Promise.resolve({ success: true, committed: '' });
    },
    imeCancelConversion: () => {
      cancelCalls += 1;
      return Promise.resolve({ success: true });
    },
  };
};

const onInputEffect = vi.fn();
const onPrimaryAction = vi.fn();

const Harness = () => {
  const ime = useIME(InputMode.HIRAGANA, 144);
  const controller = useKeyboardController({
    displayText: ime.displayText,
    displayCaret: ime.displayCaret,
    displaySelectionEnd: ime.displaySelectionEnd,
    caretRevision: ime.caretRevision,
    mutationSeq: ime.mutationSeq,
    isConverting: ime.isConverting,
    mode: ime.mode,
    setMode: ime.setMode,
    handleCharInput: ime.handleCharInput,
    handleBackspace: ime.handleBackspace,
    handleClear: ime.handleClear,
    handleSpace: ime.handleSpace,
    handleCommitCandidate: ime.handleCommitCandidate,
    handleCancelConversion: ime.handleCancelConversion,
    commitPreedit: ime.commitPreedit,
    discardPreedit: ime.discardPreedit,
    syncFromDom: ime.syncFromDom,
    setSelection: ime.setSelection,
    handlePrimaryAction: onPrimaryAction,
    handleInputEffect: onInputEffect,
  });

  return (
    <div>
      <textarea
        data-testid='input'
        ref={controller.textareaRef}
        value={ime.displayText}
        onChange={controller.handleTextareaChange}
        onKeyDown={controller.handleKeyDown}
        onCompositionStart={controller.handleCompositionStart}
        onCompositionEnd={controller.handleCompositionEnd}
        onSelect={controller.handleSelect}
        onPointerDown={controller.handlePointerDown}
      />
      {/* Virtual keys keep focus, exactly like components/Key.tsx does.
          仮想キーは components/Key.tsx と同じくフォーカスを保持する。 */}
      {['k', 'a', 'n', 'j', 'i', 'b', 'o'].map((char) => (
        <button
          key={char}
          data-testid={`key-${char}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => controller.virtualKeyHandlers.onChar(char)}
        />
      ))}
      <button
        data-testid='key-backspace'
        onClick={controller.virtualKeyHandlers.onBackspace}
      />
      <button
        data-testid='key-space'
        onClick={controller.virtualKeyHandlers.onSpace}
      />
      {/* No preventDefault here: a candidate button that steals focus is the
          worst case the caret restoration has to survive.
          ここでは preventDefault しない。フォーカスを奪う候補ボタンこそが
          キャレット復元が耐えるべき最悪ケースである。 */}
      <button
        data-testid='candidate-1'
        onClick={() => controller.virtualKeyHandlers.onCommitCandidate(1)}
      />
      <button data-testid='elsewhere' />
      <span data-testid='caret'>{ime.displayCaret}</span>
    </div>
  );
};

const textarea = () =>
  document.querySelector('[data-testid="input"]') as HTMLTextAreaElement;

const press = (testId: string) =>
  act(() => {
    fireEvent.click(document.querySelector(`[data-testid="${testId}"]`)!);
  });

const typeKeys = (chars: string) => {
  for (const char of chars) press(`key-${char}`);
};

// Answer the newest outstanding convert request the way main would. Typing
// "kanji" fires one request per completed kana, so several are in flight at
// once; only the last one still matches the current generation, the rest are
// meant to be dropped.
// 保留中の最も新しい変換リクエストに、main の代わりに応答する。"kanji" と打つと
// かなが1音成立するたびにリクエストが飛ぶため複数が同時に飛行する。現在の世代と
// 一致するのは最後の1件だけで、残りは破棄されるのが正しい。
const resolveConvert = async (candidateTexts: string[]) => {
  const deferred = pendingConverts.pop();
  if (!deferred) throw new Error('no convert request in flight');
  const superseded = pendingConverts.splice(0, pendingConverts.length);
  const candidates = candidateTexts.map((text) => ({
    text,
    reading: deferred.kana,
  }));
  await act(async () => {
    // Settle the superseded ones so nothing is left hanging; the reducer drops
    // them on the generation check.
    // 追い越されたリクエストも決着させる。リデューサが世代チェックで破棄する。
    for (const old of superseded) old.resolve({ success: false });
    deferred.resolve({
      success: true,
      state: {
        rawKana: deferred.kana,
        segments: [{ raw: deferred.kana, candidates, selectedIndex: 0 }],
        candidates,
        candidateIndex: 0,
        isConverting: true,
        preedit: candidateTexts[0] ?? '',
        selectedCandidate: candidateTexts[0] ?? '',
      },
    });
  });
};

// Move the caret the way a user click would, then let React see it.
// ユーザーのクリックと同じようにキャレットを動かし、Reactに伝える。
const placeCaret = (position: number, end = position) => {
  const el = textarea();
  act(() => {
    // React's select plugin remembers the last selection it reported in module
    // scope and stays quiet when a new one matches it. That memory outlives a
    // test, so refocusing resets it and keeps these tests order-independent.
    // Reactのselectプラグインは最後に通知した選択をモジュールスコープに記憶し、
    // 同じ値なら発火しない。この記憶はテストをまたいで残るため、フォーカスを入れ直して
    // リセットし、テストの実行順に依存しないようにする。
    fireEvent.focusOut(el);
    el.focus();
    fireEvent.focusIn(el);
    el.setSelectionRange(position, end);
    fireEvent.select(el);
  });
};

// Echo back the selection the DOM currently holds, which is what a real
// selectionchange task does after our own caret write.
// DOMが現在持っている選択をそのまま通知する。自前のキャレット書き込みの後に実際の
// selectionchange タスクが行うのはこれである。
const echoSelection = () => {
  const el = textarea();
  act(() => {
    fireEvent.select(el);
  });
};

beforeEach(() => {
  installElectronApi();
  onInputEffect.mockClear();
  onPrimaryAction.mockClear();
  render(<Harness />);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useKeyboardController - caret / キャレット', () => {
  describe('the reported bug / 報告されたバグ', () => {
    it('types the next character after the committed text, not at the left edge', async () => {
      typeKeys('kanji');
      await resolveConvert(['かんじ', '漢字']);

      press('candidate-1'); // commit 漢字
      echoSelection();

      expect(textarea().value).toBe('漢字');
      expect(textarea().selectionStart).toBe(2);

      typeKeys('a');

      expect(textarea().value).toBe('漢字あ');
      expect(textarea().selectionStart).toBe(3);
    });

    it('keeps the caret at the preedit edge when the reply lands late', async () => {
      typeKeys('ka');
      // Before the reply the preedit is still the raw kana.
      // 応答前の未確定文字列はまだ生のかな。
      expect(textarea().value).toBe('か');
      expect(textarea().selectionStart).toBe(1);

      // The reply arrives and the preedit grows from 1 to 4 characters. The old
      // implementation had already guessed the caret inside a rAF by then and
      // never corrected it.
      // 応答が届き、未確定文字列が1文字から4文字へ伸びる。旧実装はこの時点で既にrAF内で
      // キャレットを推測し終えており、その後の補正を一切行わなかった。
      await resolveConvert(['かいしゃく']);

      expect(textarea().value).toBe('かいしゃく');
      expect(textarea().selectionStart).toBe(5);
    });

    it('is correct for a commit that does not change the text length', async () => {
      typeKeys('kanji');
      await resolveConvert(['かんじ', '漢字']);

      // Both are 3 and 2 characters respectively, but the point is that the
      // caret comes from the state, not from a length difference.
      // 長さの差分ではなく状態からキャレットが決まることが要点。
      press('candidate-1');

      expect(textarea().value).toBe('漢字');
      expect(textarea().selectionStart).toBe(2);
    });

    it('commits into the middle of existing text and stays there', async () => {
      typeKeys('bo');
      await resolveConvert(['ぼ']);
      press('candidate-1');
      typeKeys('bo');
      await resolveConvert(['ぼ']);
      press('candidate-1');
      expect(textarea().value).toBe('ぼぼ');

      placeCaret(1);
      typeKeys('ka');
      await resolveConvert(['か', '課']);
      press('candidate-1');

      expect(textarea().value).toBe('ぼ課ぼ');
      expect(textarea().selectionStart).toBe(2);
    });
  });

  describe('select events / selectイベント', () => {
    it('does not record the selection our own caret write produced', async () => {
      typeKeys('ka');
      await resolveConvert(['か', '課']);
      press('candidate-1');

      // A real selectionchange task reads the caret we just wrote.
      // 実際の selectionchange タスクは、書き込んだばかりのキャレットを読む。
      echoSelection();
      echoSelection();

      typeKeys('a');

      expect(textarea().value).toBe('課あ');
      expect(textarea().selectionStart).toBe(2);
    });

    it('records a selection the user actually made', () => {
      const el = textarea();
      act(() => {
        fireEvent.change(el, { target: { value: 'ABCD' } });
      });

      placeCaret(2);
      press('key-backspace');

      // Deleting at the caret rather than at the end is what proves the
      // selection was recorded. / 末尾ではなくキャレット位置が削除されることが、
      // 選択が記録された証拠になる。
      expect(textarea().value).toBe('ACD');
      expect(textarea().selectionStart).toBe(1);
    });
  });

  describe('candidate buttons / 候補ボタン', () => {
    it('restores focus to the textarea after a click that blurred it', async () => {
      typeKeys('ka');
      await resolveConvert(['か', '課']);

      const elsewhere = document.querySelector(
        '[data-testid="elsewhere"]',
      ) as HTMLButtonElement;
      act(() => elsewhere.focus());
      expect(document.activeElement).toBe(elsewhere);

      press('candidate-1');

      expect(document.activeElement).toBe(textarea());
      expect(textarea().selectionStart).toBe(1);
    });
  });

  describe('physical keys / 物理キー', () => {
    it('restores the caret after committing with Enter', async () => {
      typeKeys('kanji');
      await resolveConvert(['かんじ', '漢字']);

      act(() => {
        fireEvent.keyDown(textarea(), { key: 'Enter' });
      });

      expect(textarea().value).toBe('かんじ');
      expect(textarea().selectionStart).toBe(3);
    });

    it('runs the input side effects exactly once per Enter commit', async () => {
      typeKeys('kanji');
      await resolveConvert(['かんじ', '漢字']);
      onInputEffect.mockClear();

      act(() => {
        fireEvent.keyDown(textarea(), { key: 'Enter' });
      });

      expect(onInputEffect).toHaveBeenCalledTimes(1);
      expect(onInputEffect).toHaveBeenCalledWith('かんじ');
    });

    it('does not run the input side effects when only the candidate changed', async () => {
      typeKeys('ka');
      onInputEffect.mockClear();

      // A conversion reply changes the visible text without the user typing.
      // 変換応答は、ユーザーが何も打たないのに表示文字列を変える。
      await resolveConvert(['か', '課']);

      expect(onInputEffect).not.toHaveBeenCalled();
    });

    it('leaves candidate mode on Escape and clears on the second press', async () => {
      typeKeys('ka');
      await resolveConvert(['か', '課']);

      act(() => {
        fireEvent.keyDown(textarea(), { key: 'Escape' });
      });
      expect(textarea().value).toBe('か');

      act(() => {
        fireEvent.keyDown(textarea(), { key: 'Escape' });
      });
      expect(textarea().value).toBe('');
      expect(textarea().selectionStart).toBe(0);
    });
  });

  describe('OS IME composition / OSのIME合成', () => {
    it('does not write the selection while composing', async () => {
      const spy = vi.spyOn(HTMLTextAreaElement.prototype, 'setSelectionRange');
      typeKeys('ka');
      await resolveConvert(['か', '課']);
      spy.mockClear();

      act(() => {
        fireEvent.compositionStart(textarea());
      });

      // compositionStart drops our preedit, which bumps the caret revision -
      // but the effect must refuse to touch the selection mid-composition.
      // compositionStart は未確定文字列を破棄しキャレットの版を進めるが、エフェクトは
      // 合成中の選択操作を拒否しなければならない。
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('drops an in-flight conversion when the OS IME takes over', () => {
      typeKeys('ka');
      expect(pendingConverts).toHaveLength(1);
      const stale = pendingConverts[0];

      act(() => {
        fireEvent.compositionStart(textarea());
      });

      const el = textarea();
      act(() => {
        fireEvent.compositionEnd(el, { target: { value: 'ねこ' } });
      });

      // The stale reply must not be able to rebuild a preedit.
      // 古い応答が未確定文字列を再構築できてはならない。
      act(() => {
        stale.resolve({
          success: true,
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
      });

      expect(textarea().value).toBe('ねこ');
    });
  });

  describe('editing mid-text / 文中編集', () => {
    it('inserts at the caret and advances it by one', async () => {
      typeKeys('bo');
      await resolveConvert(['ぼ']);
      press('candidate-1');
      typeKeys('bo');
      await resolveConvert(['ぼ']);
      press('candidate-1');

      placeCaret(1);
      typeKeys('ka');
      await resolveConvert(['か']);
      press('candidate-1');

      expect(textarea().value).toBe('ぼかぼ');
      expect(textarea().selectionStart).toBe(2);
    });

    it('replaces a selected range when typing over it', async () => {
      const el = textarea();
      act(() => {
        fireEvent.change(el, { target: { value: 'ABCD' } });
      });
      expect(el.value).toBe('ABCD');

      placeCaret(1, 3);
      press('key-space');

      expect(textarea().value).toBe('A D');
    });

    it('deletes the whole selected range on backspace', () => {
      const el = textarea();
      act(() => {
        fireEvent.change(el, { target: { value: 'ABCD' } });
      });

      placeCaret(1, 3);
      press('key-backspace');

      expect(textarea().value).toBe('AD');
      expect(textarea().selectionStart).toBe(1);
    });
  });

  describe('main process sync / メインプロセスとの同期', () => {
    it('tells main to cancel when the renderer drops the conversion itself', async () => {
      typeKeys('ka');
      await resolveConvert(['か', '課']);
      const before = cancelCalls;

      act(() => {
        fireEvent.keyDown(textarea(), { key: 'Escape' });
      });

      expect(cancelCalls).toBe(before + 1);
    });

    it('tells main to cancel when continued romaji leaves candidate mode', async () => {
      typeKeys('ka');
      await resolveConvert(['か', '課']);
      const before = cancelCalls;

      // Typing on leaves candidate mode and keeps building the reading. Main
      // must be told, or it answers the next commit from these stale segments.
      // ローマ字を打ち続けると候補モードを抜けて読みの構築が続く。mainへ通知しないと、
      // 次の確定がこの古いsegmentsに対して処理されてしまう。
      press('key-n');

      await act(async () => {});

      expect(cancelCalls).toBe(before + 1);
      expect(textarea().value).toBe('かn');
    });

    it('sends the committed text alongside the candidate index', async () => {
      typeKeys('ka');
      await resolveConvert(['か', '課']);

      press('candidate-1');

      expect(commitCalls).toHaveLength(1);
      expect(commitCalls[0][0]).toBe(1);
      expect(commitCalls[0][1]).toMatchObject({ expectedText: '課' });
    });
  });
});
