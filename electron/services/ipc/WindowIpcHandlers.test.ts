/**
 * WindowIpcHandlers tests - the relay must not echo a config change back to the
 * window that sent it, or the two stores would bounce the same value forever.
 * WindowIpcHandlers のテスト - 中継は設定変更を送信元へ送り返してはならない。
 * 送り返すと2つのストアが同じ値を延々と往復させることになる。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const onHandlers = new Map<string, Handler>();
const invokeHandlers = new Map<string, Handler>();

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, handler: Handler) => onHandlers.set(channel, handler),
    handle: (channel: string, handler: Handler) =>
      invokeHandlers.set(channel, handler),
  },
}));

function makeWindow(id: number, destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: { id, send: vi.fn() },
  };
}

let appWindows: ReturnType<typeof makeWindow>[] = [];
let keyboard: ReturnType<typeof makeWindow> | null = null;

vi.mock('../WindowManager.js', () => ({
  getAllAppWindows: () => appWindows,
  getKeyboardWindow: () => keyboard,
}));

const { registerWindowIpcHandlers } = await import('./WindowIpcHandlers.js');

beforeEach(() => {
  onHandlers.clear();
  invokeHandlers.clear();
  appWindows = [];
  keyboard = null;
});

describe('config-changed relay', () => {
  it('sends the change to every window except the sender', () => {
    const sender = makeWindow(1);
    const other = makeWindow(2);
    appWindows = [sender, other];
    registerWindowIpcHandlers();

    const config = { language: 'ja' };
    onHandlers.get('config-changed')!({ sender: { id: 1 } }, config);

    expect(sender.webContents.send).not.toHaveBeenCalled();
    expect(other.webContents.send).toHaveBeenCalledWith('config-broadcast', config);
  });

  it('is a no-op when the sender is the only window', () => {
    const sender = makeWindow(1);
    appWindows = [sender];
    registerWindowIpcHandlers();

    onHandlers.get('config-changed')!({ sender: { id: 1 } }, {});
    expect(sender.webContents.send).not.toHaveBeenCalled();
  });
});

describe('delegated actions', () => {
  it.each([
    ['request-show-tutorial', 'show-tutorial'],
    ['request-clear-history', 'clear-history'],
  ])('%s forwards to the keyboard window', async (request, forwarded) => {
    keyboard = makeWindow(1);
    registerWindowIpcHandlers();

    const result = await invokeHandlers.get(request)!();
    expect(keyboard.webContents.send).toHaveBeenCalledWith(forwarded, undefined);
    expect(result).toEqual({ success: true });
  });

  it.each([
    ['request-show-tutorial'],
    ['request-clear-history'],
  ])('%s reports failure when there is no keyboard window', async (request) => {
    keyboard = null;
    registerWindowIpcHandlers();
    expect(await invokeHandlers.get(request)!()).toEqual({ success: false });
  });

  it('does not send to a destroyed keyboard window', async () => {
    keyboard = makeWindow(1, true);
    registerWindowIpcHandlers();

    await invokeHandlers.get('request-show-tutorial')!();
    expect(keyboard.webContents.send).not.toHaveBeenCalled();
  });
});

describe('get-launch-info', () => {
  it('returns what the main process reports', async () => {
    const info = { windowMode: 'vr', isOsr: true, debug: true };
    registerWindowIpcHandlers({ getLaunchInfo: () => info });
    expect(await invokeHandlers.get('get-launch-info')!()).toEqual(info);
  });

  it('falls back to a desktop answer when nothing was supplied', async () => {
    registerWindowIpcHandlers();
    expect(await invokeHandlers.get('get-launch-info')!()).toEqual({
      windowMode: 'desktop',
      isOsr: false,
      debug: false,
    });
  });
});
