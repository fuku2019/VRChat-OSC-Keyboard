/**
 * launchMode tests - the app is VR-only, and the desktop keyboard is a
 * debugging aid. The mode must not depend on anything but the flags and the
 * debug setting.
 * launchMode のテスト - このアプリはVR専用で、デスクトップのキーボードは
 * デバッグ用である。モードはフラグとデバッグ設定以外に依存してはならない。
 */
import { describe, it, expect } from 'vitest';
import { resolveWindowMode } from './launchMode.js';

describe('resolveWindowMode', () => {
  it('opens in VR by default', () => {
    expect(resolveWindowMode()).toBe('vr');
    expect(resolveWindowMode({ launchArgs: {}, debug: false })).toBe('vr');
  });

  it('opens the desktop keyboard in debug mode', () => {
    expect(resolveWindowMode({ launchArgs: {}, debug: true })).toBe('desktop');
  });

  it('lets --desktop open the desktop keyboard without debug mode', () => {
    expect(
      resolveWindowMode({ launchArgs: { windowMode: 'desktop' }, debug: false }),
    ).toBe('desktop');
  });

  // Debugging the VR path itself needs debug mode and VR at the same time.
  // VR経路そのもののデバッグには、デバッグモードとVRを同時に使う必要がある。
  it('lets --vr win over debug mode', () => {
    expect(resolveWindowMode({ launchArgs: { windowMode: 'vr' }, debug: true })).toBe(
      'vr',
    );
  });
});
