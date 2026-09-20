/**
 * debugConfig tests - the repo copy is not shipped, so packaged builds depend
 * on the userData copy and on --debug winning over whatever a file says.
 * debugConfig のテスト - リポジトリ側のコピーは出荷されないため、パッケージ版は
 * userData 側のコピーと、ファイルの内容より --debug が優先されることに依存する。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

const files = new Map<string, string>();

vi.mock('fs', () => {
  const api = {
    existsSync: (target: string) => files.has(target),
    readFileSync: (target: string) => {
      const content = files.get(target);
      if (content === undefined) throw new Error(`ENOENT: ${target}`);
      return content;
    },
  };
  return { default: api, ...api };
});

const { loadDebugConfig } = await import('./debugConfig.js');

const USER_DATA = 'C:/Users/tester/AppData/Roaming/app';
const APP_DIR = 'C:/repo';
// Build the expected paths the same way the module does, so the test does
// not hard-code a separator. / モジュールと同じ方法で期待パスを組み立て、
// テストが区切り文字を直書きしないようにする。
const userDataFile = path.join(USER_DATA, 'debug.config.json');
const appDirFile = path.join(APP_DIR, 'debug.config.json');

beforeEach(() => {
  files.clear();
  vi.restoreAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('loadDebugConfig', () => {
  it('falls back to debug mode off when no file exists', () => {
    const config = loadDebugConfig({ userDataDir: USER_DATA, appDir: APP_DIR });
    expect(config.enableDebugMode).toBe(false);
  });

  it('reads the repo copy when only that exists', () => {
    files.set(appDirFile, JSON.stringify({ enableDebugMode: true, mockLatestVersion: 'v9.9' }));
    const config = loadDebugConfig({ userDataDir: USER_DATA, appDir: APP_DIR });
    expect(config.enableDebugMode).toBe(true);
    expect(config.mockLatestVersion).toBe('v9.9');
    expect(config.source).toBe(appDirFile);
  });

  it('prefers the userData copy over the repo copy', () => {
    files.set(userDataFile, JSON.stringify({ enableDebugMode: true }));
    files.set(appDirFile, JSON.stringify({ enableDebugMode: false, mockLatestVersion: 'v9.9' }));
    const config = loadDebugConfig({ userDataDir: USER_DATA, appDir: APP_DIR });
    expect(config.enableDebugMode).toBe(true);
    expect(config.source).toBe(userDataFile);
    // The winning file is used whole, not merged with the loser.
    // 採用したファイルをそのまま使い、負けた側とマージはしない。
    expect(config.mockLatestVersion).toBeUndefined();
  });

  it('lets --debug win over a file that disables debug mode', () => {
    files.set(userDataFile, JSON.stringify({ enableDebugMode: false }));
    const config = loadDebugConfig({
      userDataDir: USER_DATA,
      appDir: APP_DIR,
      launchArgs: { debug: true },
    });
    expect(config.enableDebugMode).toBe(true);
  });

  it('does not force debug mode off when --debug is absent', () => {
    files.set(userDataFile, JSON.stringify({ enableDebugMode: true }));
    const config = loadDebugConfig({
      userDataDir: USER_DATA,
      appDir: APP_DIR,
      launchArgs: { debug: false },
    });
    expect(config.enableDebugMode).toBe(true);
  });

  it.each([
    ['malformed JSON', '{ not json'],
    ['a JSON array', '[1, 2, 3]'],
    ['a JSON scalar', '42'],
  ])('skips %s and falls through to the next candidate', (_label, content) => {
    files.set(userDataFile, content);
    files.set(appDirFile, JSON.stringify({ enableDebugMode: true }));
    const config = loadDebugConfig({ userDataDir: USER_DATA, appDir: APP_DIR });
    expect(config.enableDebugMode).toBe(true);
    expect(config.source).toBe(appDirFile);
  });

  it('works with no directories supplied at all', () => {
    expect(loadDebugConfig().enableDebugMode).toBe(false);
  });
});
