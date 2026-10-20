import { StrictMode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useIME } from './useIME';
import { InputMode } from '../types';
import type { ImeContext, ImeResponse, ImeTarget } from '../types/ime';

type Request = { kana: string; context: ImeContext & ImeTarget; resolve: (response: ImeResponse) => void };
let requests: Request[];
function installApi() {
  const api = {
    imeConvert: vi.fn((kana: string, context: Request['context']) => new Promise<ImeResponse>(resolve => requests.push({ kana, context, resolve }))),
    imeNextCandidate: vi.fn(async (_target: ImeTarget) => ({ success: false })),
    imeCommitCandidate: vi.fn(async (_index: number, _context: unknown) => ({ success: true })),
    imeCancelConversion: vi.fn(async (_target: ImeTarget) => ({ success: true })),
    imeReleaseSession: vi.fn(async (_target: ImeTarget) => ({ success: true })),
  };
  window.electronAPI = api as unknown as typeof window.electronAPI;
  return api;
}
const type = (hook: { current: ReturnType<typeof useIME> }, text: string) => {
  act(() => { for (const char of text) hook.current.handleCharInput(char); });
};
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
async function answer(request: Request, texts: string[]) {
  await act(async () => {
    const candidates = texts.map(text => ({ text }));
    request.resolve({ success: true, state: {
      ...request.context, rawKana: request.kana,
      segments: [{ raw: request.kana, candidates, selectedIndex: 0 }], candidates,
      candidateIndex: 0, isConverting: true, preedit: texts[0], selectedCandidate: texts[0],
    } });
  });
}
beforeEach(() => { vi.useFakeTimers(); requests = []; delete window.electronAPI; });
afterEach(() => { cleanup(); delete window.electronAPI; vi.useRealTimers(); });

describe('useIME local fallback', () => {
  it('keeps symbols and uppercase letters over an open candidate list', () => {
    const { result } = renderHook(() => useIME());
    type(result, 'a'); advance(75);
    expect(result.current.isConverting).toBe(true);
    type(result, '!A');
    expect(result.current.displayText).toBe('あ!A');
  });
  it('types digits during automatic live conversion', () => {
    const { result } = renderHook(() => useIME());
    type(result, 'a'); advance(75);
    type(result, '2026');
    expect(result.current.displayText).toBe('あ2026');
  });
  it('selects digits only after explicit Space', () => {
    const { result } = renderHook(() => useIME());
    type(result, 'a'); advance(75);
    act(() => result.current.handleSpace());
    type(result, '2');
    expect(result.current.displayText).toBe('ア');
  });
});

describe('useIME asynchronous live conversion', () => {
  it('debounces a burst and sends only the newest full reading after 75ms', () => {
    const api = installApi();
    const { result } = renderHook(() => useIME());
    type(result, 'ka'); advance(50);
    type(result, 'nji'); advance(74);
    expect(api.imeConvert).not.toHaveBeenCalled();
    expect(result.current.displayText).toBe('かんじ');
    advance(1);
    expect(requests.map(r => r.kana)).toEqual(['かんじ']);
    expect(result.current.isConversionPending).toBe(true);
  });
  it('keeps the unfinished buffer visible and rejects an old prefix response', async () => {
    installApi();
    const { result } = renderHook(() => useIME());
    type(result, 'ka'); advance(75);
    const old = requests[0];
    type(result, 'k');
    await answer(old, ['課']);
    expect(result.current.displayText).toBe('かk');
    advance(75);
    await answer(requests[1], ['課']);
    expect(result.current.displayText).toBe('課k');
    expect(result.current.displayCaret).toBe(2);
    act(() => result.current.handleCommitCandidate(0));
    expect(result.current.committedText).toBe('課k');
  });
  it('drops inverted responses without losing the current reading', async () => {
    installApi();
    const { result } = renderHook(() => useIME());
    type(result, 'ka'); advance(75);
    type(result, 'na'); advance(75);
    await answer(requests[1], ['仮名']);
    await answer(requests[0], ['課']);
    expect(result.current.displayText).toBe('仮名');
  });
  it('terminates a mismatched IPC response with local kana fallback', async () => {
    installApi();
    const { result } = renderHook(() => useIME());
    type(result, 'ka'); advance(75);
    const wrong = { ...requests[0], context: { ...requests[0].context, revision: 999 } };
    await answer(wrong, ['別の入力']);
    expect(result.current.displayText).toBe('か');
    expect(result.current.isConversionPending).toBe(false);
  });
  it('Clear cancels a debounce before any conversion is sent', () => {
    const api = installApi();
    const { result } = renderHook(() => useIME());
    type(result, 'ka'); advance(74);
    act(() => result.current.handleClear());
    advance(300);
    expect(api.imeConvert).not.toHaveBeenCalled();
    expect(result.current.displayText).toBe('');
  });
  it('Backspace deletes buffer first and then kana, with new full-reading conversion', async () => {
    installApi();
    const { result } = renderHook(() => useIME());
    type(result, 'kanak'); advance(75);
    await answer(requests[0], ['仮名']);
    act(() => result.current.handleBackspace());
    expect(result.current.displayText).toBe('かな');
    act(() => result.current.handleBackspace());
    expect(result.current.displayText).toBe('か');
    advance(75);
    expect(requests.at(-1)!.kana).toBe('か');
  });
  it('Space flushes debounce exactly once and enters explicit candidate selection', async () => {
    const api = installApi();
    const { result } = renderHook(() => useIME());
    type(result, 'ka');
    act(() => result.current.handleSpace());
    expect(requests).toHaveLength(1);
    advance(75);
    expect(requests).toHaveLength(1);
    await answer(requests[0], ['課', 'か']);
    act(() => result.current.handleSpace());
    expect(api.imeNextCandidate).toHaveBeenCalledWith({
      sessionId: requests[0].context.sessionId, revision: requests[0].context.revision,
    });
    expect(result.current.candidateSelectionMode).toBe(true);
  });
  it('commit flushes debounce, freezes input and completes from the latest result within 200ms', async () => {
    const api = installApi();
    const { result } = renderHook(() => useIME());
    type(result, 'kanji');
    act(() => result.current.commitPreedit());
    expect(requests).toHaveLength(1);
    expect(result.current.isCommitPending).toBe(true);
    type(result, 'a');
    act(() => { result.current.handleBackspace(); result.current.handleSpace(); result.current.commitPreedit(); });
    expect(requests).toHaveLength(1);
    advance(199);
    expect(result.current.commitSeq).toBe(0);
    await answer(requests[0], ['漢字', 'かんじ']);
    expect(result.current.input).toBe('漢字');
    expect(result.current.committedText).toBe('漢字');
    expect(result.current.commitSeq).toBe(1);
    expect(result.current.isCommitPending).toBe(false);
    expect(api.imeCommitCandidate).toHaveBeenCalledWith(0, expect.objectContaining({ expectedText: '漢字' }));
    type(result, 'a');
    expect(result.current.displayText).toBe('漢字あ');
    expect(result.current.committedText).toBe('漢字');
  });
  it('uses fixed kana and unfinished romaji at 200ms, then drops late inference', async () => {
    const api = installApi();
    const { result } = renderHook(() => useIME());
    type(result, 'kak');
    act(() => result.current.commitPreedit());
    advance(200);
    expect(result.current.input).toBe('かk');
    expect(result.current.commitSeq).toBe(1);
    expect(api.imeCancelConversion).toHaveBeenCalled();
    await answer(requests[0], ['課']);
    expect(result.current.input).toBe('かk');
    expect(result.current.hasPreedit).toBe(false);
  });
  it('waits for an in-flight candidate cycle before committing its selected candidate', async () => {
    const api = installApi();
    let resolveNext!: (response: ImeResponse) => void;
    api.imeNextCandidate.mockImplementationOnce(() => new Promise(resolve => { resolveNext = resolve; }));
    const { result } = renderHook(() => useIME());
    type(result, 'ka'); advance(75);
    await answer(requests[0], ['か', '課']);
    act(() => result.current.handleSpace());
    act(() => result.current.commitPreedit());
    expect(requests).toHaveLength(1);
    expect(result.current.isCommitPending).toBe(true);
    await act(async () => resolveNext({ success: true, state: {
      ...requests[0].context, rawKana: 'か', candidates: [{ text: 'か' }, { text: '課' }],
      candidateIndex: 1, segments: [], isConverting: true, preedit: '課', selectedCandidate: '課',
    } }));
    expect(result.current.input).toBe('課');
    expect(result.current.commitSeq).toBe(1);
  });
  it('can finish a commit from a failed candidate cycle using its local next candidate', async () => {
    const api = installApi();
    let resolveNext!: (response: ImeResponse) => void;
    api.imeNextCandidate.mockImplementationOnce(() => new Promise(resolve => { resolveNext = resolve; }));
    const { result } = renderHook(() => useIME());
    type(result, 'ka'); advance(75);
    await answer(requests[0], ['か', '課']);
    act(() => result.current.handleSpace());
    act(() => result.current.commitPreedit());
    await act(async () => resolveNext({ success: false }));
    expect(result.current.input).toBe('課');
    expect(result.current.isCommitPending).toBe(false);
  });
  it('resolves trailing n before committing and falls back to ん on timeout', () => {
    installApi();
    const { result } = renderHook(() => useIME());
    type(result, 'kan');
    act(() => result.current.commitPreedit());
    expect(requests[0].kana).toBe('かん');
    advance(200);
    expect(result.current.input).toBe('かん');
  });
  it.each(['clear', 'cancel', 'history'] as const)('%s invalidates a pending commit and its timer', async (kind) => {
    installApi();
    const { result } = renderHook(() => useIME());
    type(result, 'ka');
    act(() => result.current.commitPreedit());
    act(() => {
      if (kind === 'clear') result.current.handleClear();
      else if (kind === 'cancel') result.current.handleCancelConversion();
      else result.current.replaceAll('履歴');
    });
    const expected = kind === 'clear' ? '' : kind === 'history' ? '履歴' : 'か';
    advance(500);
    await answer(requests[0], ['課']);
    expect(result.current.displayText).toBe(expected);
    expect(result.current.commitSeq).toBe(0);
    expect(result.current.isCommitPending).toBe(false);
  });
  it('mode change commits the visible kana and drops delayed results', async () => {
    installApi();
    const { result } = renderHook(() => useIME());
    type(result, 'ka'); advance(75);
    act(() => result.current.setMode(InputMode.KATAKANA));
    await answer(requests[0], ['課']);
    type(result, 'na');
    expect(result.current.displayText).toBe('かナ');
  });
  it('rejects a candidate click captured before a new result', async () => {
    installApi();
    const { result } = renderHook(() => useIME());
    type(result, 'ka'); advance(75);
    await answer(requests[0], ['課', 'か']);
    const oldClick = result.current.handleCommitCandidate;
    type(result, 'na'); advance(75);
    await answer(requests[1], ['仮名', 'かな']);
    act(() => oldClick(1));
    expect(result.current.hasPreedit).toBe(true);
    expect(result.current.displayText).toBe('仮名');
    act(() => result.current.handleCommitCandidate(1));
    expect(result.current.input).toBe('かな');
  });
  it('filters overflowing candidates and retains their original engine indexes on commit', async () => {
    const api = installApi();
    const { result } = renderHook(() => useIME(InputMode.HIRAGANA, 3));
    act(() => result.current.replaceAll('XY'));
    type(result, 'a'); advance(75);
    await answer(requests[0], ['あいさつ', '亜', 'あ']);
    expect(result.current.displayText).toBe('XY亜');
    act(() => result.current.handleCommitCandidate(0));
    expect(api.imeCommitCandidate).toHaveBeenCalledWith(1, expect.objectContaining({ expectedText: '亜' }));
    expect(result.current.input).toBe('XY亜');
  });
  it('unmount cancels debounce and releases a session with pending inference', async () => {
    const api = installApi();
    const { result, unmount } = renderHook(() => useIME());
    type(result, 'ka'); advance(75);
    type(result, 'na');
    unmount(); advance(300);
    expect(requests).toHaveLength(1);
    expect(api.imeReleaseSession).toHaveBeenCalled();
    await answer(requests[0], ['課']);
  });
  it('does not duplicate conversion or a commit timer in StrictMode', async () => {
    installApi();
    const { result } = renderHook(() => useIME(), { wrapper: StrictMode });
    type(result, 'ka'); advance(75);
    act(() => result.current.commitPreedit());
    expect(requests).toHaveLength(1);
    advance(200);
    await answer(requests[0], ['課']);
    expect(result.current.commitSeq).toBe(1);
    expect(result.current.input).toBe('か');
  });
});

 describe('committed send snapshots', () => {
  it('withholds the snapshot during preedit and commit wait, then captures the completed text', async () => {
    installApi();
    const { result } = renderHook(() => useIME());
    type(result, 'kanji'); advance(75);
    expect(result.current.getCommittedSnapshot()).toBeNull();
    act(() => result.current.commitPreedit());
    expect(result.current.getCommittedSnapshot()).toBeNull();
    await answer(requests[0], ['漢字']);
    expect(result.current.getCommittedSnapshot()?.text).toBe('漢字');
    const snapshot = result.current.getCommittedSnapshot()!;
    act(() => result.current.clearSentText(snapshot));
    expect(result.current.input).toBe('');
  });
  it('does not clear an edited and restored string or a queued edit', () => {
    const { result } = renderHook(() => useIME(InputMode.ENGLISH));
    act(() => result.current.replaceAll('hello'));
    const snapshot = result.current.getCommittedSnapshot()!;
    act(() => result.current.replaceAll('other'));
    act(() => result.current.replaceAll('hello'));
    act(() => result.current.clearSentText(snapshot));
    expect(result.current.input).toBe('hello');
    const current = result.current.getCommittedSnapshot()!;
    act(() => { result.current.handleCharInput('!'); result.current.clearSentText(current); });
    expect(result.current.input).toBe('hello!');
  });
});
