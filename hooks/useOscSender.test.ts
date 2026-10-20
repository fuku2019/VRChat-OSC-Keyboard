import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useIME } from './useIME';
import { useKeyboardController } from './useKeyboardController';
import { InputMode } from '../types';
import type { ImeTextSnapshot } from '../types/ime';

const sendOscMessage = vi.fn<(...args: unknown[]) => Promise<{ success: boolean; error?: string }>>();
vi.mock('../services/oscService', () => ({ sendOscMessage: (...args: unknown[]) => sendOscMessage(...args) }));
import { useOscSender } from './useOscSender';
import { useConfigStore } from '../stores/configStore';
const snapshot = { text: '日本語', mutationSeq: 1 };
const url = 'ws://127.0.0.1:8080';
const setup = (clear = vi.fn((_s: ImeTextSnapshot) => true)) => {
  const typing = vi.fn(), cancelTyping = vi.fn(), history = vi.fn();
  const hook = renderHook(() => useOscSender(clear, typing, cancelTyping, history));
  return { ...hook, clear, typing, cancelTyping, history };
};
beforeEach(() => {
  vi.useFakeTimers();
  sendOscMessage.mockReset().mockResolvedValue({ success: true });
  useConfigStore.setState(state => ({ config: { ...state.config, autoSend: true, copyMode: false, bridgeUrl: url } }));
  delete window.electronAPI;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('committed OSC sends', () => {
  it('previews unfinished user input but does not send again when conversion arrives', async () => {
    let answer!: (response: unknown) => void;
    window.electronAPI = {
      imeConvert: vi.fn(() => new Promise(resolve => { answer = resolve; })),
      imeNextCandidate: vi.fn(), imeCommitCandidate: vi.fn(), imeCancelConversion: vi.fn(),
    } as unknown as typeof window.electronAPI;
    const { result } = renderHook(() => {
      const ime = useIME();
      const sender = useOscSender(ime.clearSentText, vi.fn(), vi.fn());
      useKeyboardController({ ...ime, handlePrimaryAction: vi.fn(),
        handleInputEffect: text => { if (text) sender.throttledAutoSend(text, url); },
      });
      return ime;
    });
    act(() => { for (const char of 'kanji') result.current.handleCharInput(char); });
    expect(sendOscMessage).toHaveBeenCalledExactlyOnceWith('かんじ', url, true, false);
    act(() => vi.advanceTimersByTime(75));
    await act(async () => { answer({ success: true, state: {
      rawKana: 'かんじ', candidates: [{ text: '漢字' }], candidateIndex: 0,
      segments: [], isConverting: true, preedit: '漢字', selectedCandidate: '漢字',
    } }); });
    expect(result.current.displayText).toBe('漢字');
    act(() => vi.advanceTimersByTime(1000));
    expect(sendOscMessage).toHaveBeenCalledTimes(1);
  });
  it('commits on the first primary press and sends the completed Japanese snapshot on the next', async () => {
    useConfigStore.setState(state => ({ config: { ...state.config, autoSend: false } }));
    const { result } = renderHook(() => {
      const ime = useIME();
      const sender = useOscSender(ime.clearSentText, vi.fn(), vi.fn());
      const controller = useKeyboardController({ ...ime,
        handlePrimaryAction: () => {
          const captured = ime.getCommittedSnapshot();
          if (captured) void sender.handleSend(captured);
        }, handleInputEffect: vi.fn(),
      });
      return { ime, controller };
    });
    act(() => { for (const char of 'kanji') result.current.ime.handleCharInput(char); });
    act(() => vi.advanceTimersByTime(75));
    await act(async () => { result.current.controller.virtualKeyHandlers.onSend(); });
    expect(result.current.ime.input).toBe('かんじ');
    expect(sendOscMessage).not.toHaveBeenCalled();
    await act(async () => { result.current.controller.virtualKeyHandlers.onSend(); });
    expect(sendOscMessage).toHaveBeenCalledExactlyOnceWith('かんじ', url);
    expect(result.current.ime.input).toBe('');
  });
  it('sends the captured snapshot once during simultaneous presses', async () => {
    let finish!: (value: { success: boolean }) => void;
    sendOscMessage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { result, clear, history } = setup();
    let first!: Promise<void>;
    act(() => { first = result.current.handleSend(snapshot); void result.current.handleSend(snapshot); });
    expect(sendOscMessage).toHaveBeenCalledExactlyOnceWith('日本語', url);
    await act(async () => { finish({ success: true }); await first; });
    expect(clear).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(history).toHaveBeenCalledExactlyOnceWith('日本語');
  });
  it.each(['success', 'failure'] as const)('cancels pending auto-send even on manual %s', async outcome => {
    const { result, clear } = setup();
    act(() => {
      result.current.throttledAutoSend('preview', url);
      result.current.throttledAutoSend('queued', url);
    });
    sendOscMessage.mockResolvedValueOnce({ success: outcome === 'success', error: 'offline' });
    await act(async () => { await result.current.handleSend(snapshot); });
    act(() => vi.advanceTimersByTime(2000));
    expect(sendOscMessage).toHaveBeenCalledTimes(2);
    expect(clear).toHaveBeenCalledTimes(outcome === 'success' ? 1 : 0);
    if (outcome === 'failure') expect(result.current.error).toBe('offline');
  });
  it('keeps new input and its typing indicator when a send completes', async () => {
    let finish!: (value: { success: boolean }) => void;
    sendOscMessage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const history = vi.fn(), typing = vi.fn();
    const { result } = renderHook(() => {
      const ime = useIME(InputMode.ENGLISH);
      const sender = useOscSender(ime.clearSentText, typing, vi.fn(), history);
      return { ime, sender };
    });
    act(() => result.current.ime.replaceAll('日本語'));
    const captured = result.current.ime.getCommittedSnapshot()!;
    let pending!: Promise<void>;
    act(() => { pending = result.current.sender.handleSend(captured); });
    act(() => result.current.ime.replaceAll('次の入力'));
    await act(async () => { finish({ success: true }); await pending; });
    expect(result.current.ime.input).toBe('次の入力');
    expect(history).toHaveBeenCalledWith('日本語');
    expect(typing).not.toHaveBeenCalled();
  });
  it('preserves input after a rejected send and permits retry', async () => {
    const { result, clear } = setup();
    sendOscMessage.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await result.current.handleSend(snapshot); });
    expect(clear).not.toHaveBeenCalled();
    expect(result.current.isSending).toBe(false);
    await act(async () => { await result.current.handleSend(snapshot); });
    expect(clear).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
  });
  it('drops trailing previews on disable and copy mode', async () => {
    const { result } = setup();
    act(() => {
      result.current.throttledAutoSend('preview', url);
      result.current.throttledAutoSend('queued', url);
      useConfigStore.setState(state => ({ config: { ...state.config, autoSend: false } }));
    });
    act(() => vi.advanceTimersByTime(1000));
    expect(sendOscMessage).toHaveBeenCalledTimes(1);
    act(() => {
      useConfigStore.setState(state => ({ config: { ...state.config, autoSend: true, copyMode: true } }));
      result.current.throttledAutoSend('copy only', url);
    });
    expect(sendOscMessage).toHaveBeenCalledTimes(1);
  });
  it('does not mutate input or history after unmount', async () => {
    let finish!: (value: { success: boolean }) => void;
    sendOscMessage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { result, unmount, clear, history } = setup();
    let pending!: Promise<void>;
    act(() => { pending = result.current.handleSend(snapshot); });
    unmount();
    await act(async () => { finish({ success: true }); await pending; });
    expect(clear).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });
});
