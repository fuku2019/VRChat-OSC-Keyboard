import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const context = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => context.userData } }));
vi.mock('../overlay/native.js', () => ({ getAssetPath: (asset: string) => path.resolve(asset) }));
import { ensureSteamVrInputFiles } from './SteamVrManifestService.js';
afterEach(() => {
  if (context.userData) {
    expect(path.resolve(context.userData).startsWith(path.resolve(os.tmpdir()) + path.sep)).toBe(true);
    expect(path.basename(context.userData).startsWith('vrcliveime-manifest-')).toBe(true);
    fs.rmSync(context.userData, { recursive: true, force: true });
  }
});
it('writes a consistent fork key into actions and every binding across executable versions', () => {
  context.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcliveime-manifest-'));
  const result = ensureSteamVrInputFiles();
  expect(result.appKey).toBe('vrcliveime.keyboard');
  expect(JSON.parse(fs.readFileSync(result.actionsPath, 'utf8')).app_key).toBe(result.appKey);
  for (const file of fs.readdirSync(result.bindingsDir)) {
    expect(JSON.parse(fs.readFileSync(path.join(result.bindingsDir, file), 'utf8')).app_key).toBe(result.appKey);
  }
});
