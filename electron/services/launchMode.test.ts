/**
 * launchMode tests - the dangerous combination is VR mode with the overlay
 * disabled: an offscreen keyboard window and no overlay leaves a process the
 * user can neither see nor close.
 * launchMode のテスト - 危険な組み合わせはオーバーレイ無効でのVRモードである。
 * オフスクリーンのキーボードウィンドウとオーバーレイ無効が重なると、ユーザーが
 * 見ることも閉じることもできないプロセスが残る。
 */
import { describe, it, expect } from 'vitest';
import {
  resolveInitialWindowMode,
  resolveFinalWindowMode,
} from './launchMode.js';

describe('resolveInitialWindowMode', () => {
  it('defaults to desktop with no inputs at all', () => {
    expect(resolveInitialWindowMode()).toBe('desktop');
  });

  it.each([
    ['vr', 'vr'],
    ['desktop', 'desktop'],
  ])('honours an explicit --%s flag', (flag, expected) => {
    expect(
      resolveInitialWindowMode({ launchArgs: { windowMode: flag as 'vr' | 'desktop' } }),
    ).toBe(expected);
  });

  it('refuses VR mode when the overlay is disabled, even with --vr', () => {
    expect(
      resolveInitialWindowMode({
        launchArgs: { windowMode: 'vr' },
        overlaySettings: { disableOverlay: true },
      }),
    ).toBe('desktop');
  });

  it('forces desktop when the overlay is disabled and no flag was given', () => {
    expect(
      resolveInitialWindowMode({
        storedLaunchMode: 'vr',
        overlaySettings: { disableOverlay: true },
      }),
    ).toBe('desktop');
  });

  // Starting in desktop and letting the bootstrap correct it made the first
  // launch after switching to 'always' flash a normal keyboard window and then
  // tear it down. / desktopで開いて初期化処理に直させていたため、'always' へ
  // 切り替えた直後の起動で通常のキーボードウィンドウが一瞬出て消えていた。
  it('opens straight into VR when vrOsrMode is always, with no flag', () => {
    expect(
      resolveInitialWindowMode({
        launchArgs: {},
        storedLaunchMode: null,
        overlaySettings: { vrOsrMode: 'always' },
      }),
    ).toBe('vr');
  });

  it('stays on desktop when vrOsrMode is never, even with a stored VR mode', () => {
    expect(
      resolveInitialWindowMode({
        storedLaunchMode: 'vr',
        overlaySettings: { vrOsrMode: 'never' },
      }),
    ).toBe('desktop');
  });

  it('refuses always when the overlay is disabled', () => {
    expect(
      resolveInitialWindowMode({
        overlaySettings: { vrOsrMode: 'always', disableOverlay: true },
      }),
    ).toBe('desktop');
  });

  // Under 'auto' the stored mode cannot predict anything - 'auto' means "VR
  // only when a flag asked for it". Honouring it there made one --vr run turn
  // every later launch into a VR launch, and washing that out took two more.
  // 'auto' では保存されたモードは何も先読みできない。'auto' は「フラグで要求された
  // ときだけVR」という意味だからである。ここで従ったために、一度の --vr 起動が
  // 以降のすべての起動をVRにし、それが解消するまでさらに2回の起動を要していた。
  it.each([['auto'], ['never'], [undefined]])(
    'ignores a stored VR mode when vrOsrMode is %s',
    (vrOsrMode) => {
      expect(
        resolveInitialWindowMode({
          storedLaunchMode: 'vr',
          overlaySettings: { vrOsrMode: vrOsrMode as never },
        }),
      ).toBe('desktop');
    },
  );

  it('does not let a stored VR mode survive a launch without the flag', () => {
    // The exact sequence that was reported: --vr once, then plain launches.
    // 報告された通りの手順: 一度 --vr で起動し、その後は素で起動する。
    const afterVrRun = resolveInitialWindowMode({
      launchArgs: {},
      storedLaunchMode: 'vr',
      overlaySettings: { vrOsrMode: 'auto' },
    });
    expect(afterVrRun).toBe('desktop');
  });

  it('reuses a stored desktop mode', () => {
    expect(resolveInitialWindowMode({ storedLaunchMode: 'desktop' })).toBe(
      'desktop',
    );
  });

  it('lets an explicit flag override the stored mode', () => {
    expect(
      resolveInitialWindowMode({
        launchArgs: { windowMode: 'desktop' },
        storedLaunchMode: 'vr',
      }),
    ).toBe('desktop');
  });

  it('ignores a stored value that is not a mode', () => {
    expect(
      resolveInitialWindowMode({ storedLaunchMode: 'garbage' as never }),
    ).toBe('desktop');
  });
});

describe('resolveFinalWindowMode', () => {
  it.each([
    ['auto', 'auto'],
    ['always', 'always'],
    ['never', 'never'],
  ])('falls back to desktop under %s when the overlay never came up', (_label, mode) => {
    expect(
      resolveFinalWindowMode({
        launchArgs: { windowMode: 'vr' },
        vrOsrMode: mode as 'auto' | 'always' | 'never',
        overlayStarted: false,
      }),
    ).toBe('desktop');
  });

  it('under auto, goes VR only when --vr asked for it', () => {
    expect(
      resolveFinalWindowMode({ launchArgs: { windowMode: 'vr' }, overlayStarted: true }),
    ).toBe('vr');
    expect(resolveFinalWindowMode({ overlayStarted: true })).toBe('desktop');
  });

  it('under always, goes VR whenever the overlay is up', () => {
    expect(
      resolveFinalWindowMode({ vrOsrMode: 'always', overlayStarted: true }),
    ).toBe('vr');
  });

  it('under never, stays on desktop even with --vr and a live overlay', () => {
    expect(
      resolveFinalWindowMode({
        launchArgs: { windowMode: 'vr' },
        vrOsrMode: 'never',
        overlayStarted: true,
      }),
    ).toBe('desktop');
  });
});
