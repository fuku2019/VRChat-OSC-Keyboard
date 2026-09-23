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
        overlaySettings: { vrOsrMode: 'always', disableOverlay: true },
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
        overlaySettings: { vrOsrMode: 'always' },
      }),
    ).toBe('vr');
  });

  it('stays on desktop when vrOsrMode is never', () => {
    expect(
      resolveInitialWindowMode({ overlaySettings: { vrOsrMode: 'never' } }),
    ).toBe('desktop');
  });

  // 'auto' means "VR only when a flag asks for it". An earlier version also
  // consulted the mode remembered from the previous run here, and a single --vr
  // run turned every later plain launch into a VR launch.
  // 'auto' は「フラグで要求されたときだけVR」という意味である。以前の版はここで
  // 前回の起動で記憶したモードも参照しており、一度の --vr 起動がその後の素の起動を
  // すべてVRにしていた。
  it('opens desktop under auto without a flag', () => {
    expect(
      resolveInitialWindowMode({ launchArgs: {}, overlaySettings: { vrOsrMode: 'auto' } }),
    ).toBe('desktop');
  });

  it('lets an explicit flag override always', () => {
    expect(
      resolveInitialWindowMode({
        launchArgs: { windowMode: 'desktop' },
        overlaySettings: { vrOsrMode: 'always' },
      }),
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
