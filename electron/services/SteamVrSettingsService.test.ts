/**
 * SteamVrSettingsService tests - steamvr.vrsettings is owned by SteamVR, so the
 * app must only write it when the AutoLaunch entry actually changes.
 * SteamVrSettingsServiceのテスト - steamvr.vrsettings は SteamVR 所有のファイルなので、
 * AutoLaunch の内容が実際に変わるときだけ書き込む必要がある。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const files = new Map<string, string>();
let writeCount = 0;

vi.mock('fs', () => {
  const api = {
    existsSync: (target: string) => files.has(target),
    readFileSync: (target: string) => {
      const content = files.get(target);
      if (content === undefined) throw new Error(`ENOENT: ${target}`);
      return content;
    },
    writeFileSync: (target: string, content: string) => {
      writeCount += 1;
      files.set(target, String(content));
    },
    renameSync: (from: string, to: string) => {
      const content = files.get(from);
      if (content === undefined) throw new Error(`ENOENT: ${from}`);
      files.set(to, content);
      files.delete(from);
    },
    mkdirSync: () => undefined,
    rmSync: (target: string) => {
      files.delete(target);
    },
  };
  return { default: api, ...api };
});

// Keep the Steam path lookup from shelling out to `reg` during tests.
// テスト中に `reg` を実行しないようにする。
vi.mock('child_process', () => {
  const execFileSync = () => {
    throw new Error('not available in tests');
  };
  return { default: { execFileSync }, execFileSync };
});

const { setSteamVrAutoLaunch, getSteamVrAutoLaunch } = await import(
  './SteamVrSettingsService.js'
);

const APP_KEY = 'system.generated.vrchat-osc-keyboard.exe';

describe('setSteamVrAutoLaunch / SteamVR自動起動設定の書き込み', () => {
  beforeEach(() => {
    files.clear();
    writeCount = 0;
  });

  it('does not create a settings file when disabling with none present', () => {
    const result = setSteamVrAutoLaunch(APP_KEY, false);

    expect(result.success).toBe(true);
    expect(result.enabled).toBe(false);
    expect(writeCount).toBe(0);
    expect(files.size).toBe(0);
  });

  it('writes once when enabling and skips the rewrite when already enabled', () => {
    const first = setSteamVrAutoLaunch(APP_KEY, true);
    expect(first.success).toBe(true);
    expect(first.paths).toHaveLength(1);
    const writesAfterEnable = writeCount;
    expect(writesAfterEnable).toBeGreaterThan(0);
    expect(getSteamVrAutoLaunch(APP_KEY).enabled).toBe(true);

    // Re-applying the same value (what every app launch does) must not touch the file.
    // 同じ値の再適用(アプリ起動のたびに行われる)ではファイルに触れてはならない。
    const second = setSteamVrAutoLaunch(APP_KEY, true);
    expect(second.success).toBe(true);
    expect(second.paths).toHaveLength(0);
    expect(writeCount).toBe(writesAfterEnable);
  });

  it('writes once when disabling and skips the rewrite when already disabled', () => {
    setSteamVrAutoLaunch(APP_KEY, true);
    const writesAfterEnable = writeCount;

    const disabled = setSteamVrAutoLaunch(APP_KEY, false);
    expect(disabled.success).toBe(true);
    expect(disabled.paths).toHaveLength(1);
    expect(writeCount).toBeGreaterThan(writesAfterEnable);
    expect(getSteamVrAutoLaunch(APP_KEY).enabled).toBe(false);

    const writesAfterDisable = writeCount;
    const again = setSteamVrAutoLaunch(APP_KEY, false);
    expect(again.success).toBe(true);
    expect(again.paths).toHaveLength(0);
    expect(writeCount).toBe(writesAfterDisable);
  });

  it('keeps unrelated SteamVR settings untouched', () => {
    setSteamVrAutoLaunch(APP_KEY, true);
    const [settingsPath] = [...files.keys()];
    const stored = JSON.parse(files.get(settingsPath)!);
    stored.steamvr = { enableHomeApp: false };
    files.set(settingsPath, JSON.stringify(stored, null, 2));

    setSteamVrAutoLaunch(APP_KEY, false);

    const after = JSON.parse(files.get(settingsPath)!);
    expect(after.steamvr).toEqual({ enableHomeApp: false });
    expect(after.applications[APP_KEY]).toBeUndefined();
  });
});
