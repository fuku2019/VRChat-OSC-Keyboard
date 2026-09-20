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

  it('reuses the mode confirmed on the previous run', () => {
    expect(resolveInitialWindowMode({ storedLaunchMode: 'vr' })).toBe('vr');
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
