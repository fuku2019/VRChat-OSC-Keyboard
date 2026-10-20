import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
const mkdir = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({ default: { mkdirSync: mkdir } }));
import { configureAppIdentity } from './appIdentity.js';
it('creates a separate user data directory before configuring Electron', () => {
  const app = { setName: vi.fn(), getPath: vi.fn(() => 'C:/appdata'),
    setPath: vi.fn(() => expect(mkdir).toHaveBeenCalled()), setAppUserModelId: vi.fn() };
  configureAppIdentity(app);
  expect(app.setPath).toHaveBeenCalledWith('userData', path.join('C:/appdata', 'VrcLiveIme'));
  expect(app.setName).toHaveBeenCalledWith('VrcLiveIme');
});
