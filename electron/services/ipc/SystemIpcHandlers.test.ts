import { beforeEach, expect, it, vi } from 'vitest';
const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>());
vi.mock('electron', () => ({
  app: {}, shell: {}, ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler) },
}));
import { registerSystemIpcHandlers } from './SystemIpcHandlers.js';
beforeEach(() => { handlers.clear(); registerSystemIpcHandlers('3.0.1'); });
it('does not contact upstream or install cached upstream updates', async () => {
  const network = vi.fn();
  vi.stubGlobal('fetch', network);
  try {
    expect(await handlers.get('check-for-update')!()).toMatchObject({ success: true, disabled: true, updateAvailable: false });
    expect(await handlers.get('download-update')!({}, 'https://github.com/fuku2019/VRChat-OSC-Keyboard/releases/file.exe')).toMatchObject({ success: false });
    expect(await handlers.get('install-update')!({}, 'C:/Temp/old-update.exe')).toMatchObject({ success: false });
    expect(network).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
