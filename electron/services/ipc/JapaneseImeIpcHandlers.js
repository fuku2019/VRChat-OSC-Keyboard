import { ipcMain } from 'electron';
import { getJapaneseConversionService } from '../JapaneseConversionService.js';
import { getKeyboardWindow } from '../WindowManager.js';
import { ImeEngineError, validateRequest } from '../ime/ConversionEngine.js';

export function registerJapaneseImeIpcHandlers() {
  let owner;
  let sessionId;
  const hooked = new WeakSet();
  const release = (sender, target) => {
    if (owner !== sender) return;
    const resetting = getJapaneseConversionService().releaseSession(target);
    owner = undefined;
    sessionId = undefined;
    return resetting;
  };
  const authorize = (event, target) => {
    const keyboard = getKeyboardWindow();
    if (!keyboard || keyboard.isDestroyed() || event.sender !== keyboard.webContents ||
        event.senderFrame !== event.sender.mainFrame) throw new ImeEngineError('forbidden');
    validateRequest({ ...target, text: '' });
    if (owner && (owner !== event.sender || sessionId !== target.sessionId)) {
      throw new ImeEngineError('session-mismatch');
    }
    owner = event.sender;
    sessionId = target.sessionId;
    if (!hooked.has(owner)) {
      hooked.add(owner);
      owner.once('destroyed', () => release(event.sender));
      owner.on('render-process-gone', () => release(event.sender));
      owner.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) release(event.sender);
      });
      // Also clear requests sent by the outgoing document during navigation.
      owner.on('did-navigate', () => release(event.sender));
    }
  };
  const handle = (channel, operation, targetOf) => ipcMain.handle(channel, async (event, ...args) => {
    try {
      authorize(event, targetOf(...args));
      return { success: true, ...await operation(getJapaneseConversionService(), ...args) };
    } catch (error) {
      return { success: false, error: error.message, code: error.code ?? 'ime-error' };
    }
  });
  handle('jp-ime:convert', async (service, kana, context) => ({ state: await service.convert(kana, context) }),
    (_kana, context) => context);
  handle('jp-ime:next-candidate', async (service, target) => ({ state: await service.nextCandidate(target) }),
    (target) => target);
  handle('jp-ime:commit', (service, index, target) => service.commit(index, target),
    (_index, target) => target);
  handle('jp-ime:cancel', async (service, target) => ({ state: await service.cancel(target) }),
    (target) => target);
  handle('jp-ime:release-session', async (_service, target) => { await release(owner, target); return {}; }, (target) => target);
  // Read-only and immediately available to both keyboard and settings windows.
  ipcMain.handle('jp-ime:status', () => getJapaneseConversionService().status);
}
