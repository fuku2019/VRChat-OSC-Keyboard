import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JapaneseConversionService, _resetJapaneseConversionServiceForTests, configureJapaneseConversionService } from '../JapaneseConversionService.js';
import { KanaFallbackEngine } from '../ime/KanaFallbackEngine.js';

const handlers = new Map<string, (...args: any[]) => Promise<any>>();
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: any) => handlers.set(name, handler) } }));
let keyboard: any;
vi.mock('../WindowManager.js', () => ({ getKeyboardWindow: () => keyboard }));
const { registerJapaneseImeIpcHandlers } = await import('./JapaneseImeIpcHandlers.js');
let service: JapaneseConversionService;
let sender: any;
const target = { sessionId: 'keyboard', revision: 1 };
const event = () => ({ sender, senderFrame: sender.mainFrame });
const invoke = (channel: string, ...args: any[]) => handlers.get('jp-ime:' + channel)!(event(), ...args);

beforeEach(() => {
  handlers.clear();
  _resetJapaneseConversionServiceForTests();
  service = configureJapaneseConversionService(new KanaFallbackEngine('test'));
  sender = Object.assign(new EventEmitter(), { mainFrame: {} });
  keyboard = { webContents: sender, isDestroyed: () => false };
  registerJapaneseImeIpcHandlers();
});

describe('Japanese IME IPC', () => {
  it('awaits conversion and keeps session/revision through cycle and commit', async () => {
    expect(await invoke('convert', 'かな', target)).toMatchObject({ success: true, state: { ...target, preedit: 'かな' } });
    expect(await invoke('next-candidate', target)).toMatchObject({ success: true, state: { revision: 1 } });
    expect(await invoke('commit', 0, target)).toMatchObject({ success: true, committed: 'かな', state: { isConverting: false } });
  });
  it('rejects stale operations with a structured error', async () => {
    await invoke('convert', 'かな', { ...target, revision: 2 });
    expect(await invoke('commit', 0, target)).toMatchObject({ success: false, code: 'stale-revision' });
  });
  it('does not create an editing session for settings or subframes', async () => {
    keyboard = { webContents: {}, isDestroyed: () => false };
    expect(await invoke('convert', 'かな', target)).toMatchObject({ success: false, code: 'forbidden' });
    keyboard.webContents = sender;
    expect(await handlers.get('jp-ime:convert')!({ sender, senderFrame: {} }, 'かな', target)).toMatchObject({ code: 'forbidden' });
    expect(service.buildState().sessionId).toBe('');
  });
  it('rejects malformed and foreign session targets', async () => {
    expect(await invoke('convert', 'かな', {})).toMatchObject({ success: false, code: 'invalid-request' });
    await invoke('convert', 'かな', target);
    expect(await invoke('cancel', { ...target, sessionId: 'settings' })).toMatchObject({ code: 'session-mismatch' });
  });
  it.each(['destroyed', 'render-process-gone', 'did-start-navigation'])('releases the session on %s', async (name) => {
    await invoke('convert', 'かな', target);
    if (name === 'did-start-navigation') sender.emit(name, {}, 'http://localhost', false, true);
    else sender.emit(name);
    expect(service.buildState().sessionId).toBe('');
    expect(await invoke('convert', 'かな', { ...target, sessionId: 'new' })).toMatchObject({ success: true });
  });
  it('does not reset on subframe or same-document navigation', async () => {
    await invoke('convert', 'かな', target);
    sender.emit('did-start-navigation', {}, 'url', false, false);
    sender.emit('did-start-navigation', {}, 'url#hash', true, true);
    expect(service.buildState().sessionId).toBe('keyboard');
  });
  it('clears an outgoing document that sends another request before navigation commits', async () => {
    await invoke('convert', 'かな', target);
    sender.emit('did-start-navigation', {}, 'url', false, true);
    await invoke('convert', 'かな', { ...target, revision: 2 });
    sender.emit('did-navigate');
    expect(await invoke('convert', 'かな', { ...target, sessionId: 'new-document' })).toMatchObject({ success: true });
  });
  it('returns status immediately without opening a session', async () => {
    expect(await invoke('status')).toEqual({ state: 'ready', engine: 'kana', reason: 'test' });
    expect(service.buildState().sessionId).toBe('');
  });
  it('releases an unmounted hook and permits a new session in the same document', async () => {
    await invoke('convert', 'かな', target);
    expect(await invoke('release-session', { ...target, revision: 2 })).toMatchObject({ success: true });
    expect(service.buildState().sessionId).toBe('');
    expect(await invoke('convert', 'かな', { ...target, sessionId: 'remounted' })).toMatchObject({ success: true });
  });
  it('does not let an old release clear a newer composition', async () => {
    await invoke('convert', 'かな', { ...target, revision: 3 });
    expect(await invoke('release-session', target)).toMatchObject({ success: false, code: 'stale-revision' });
    expect(service.buildState().rawKana).toBe('かな');
  });
});
