/**
 * cli tests - argv layout differs between `electron .` and the packaged exe, so
 * the parser must never depend on a token's position.
 * cli のテスト - argv の並びは `electron .` とパッケージ版 exe とで異なるため、
 * パーサはトークンの位置に依存してはならない。
 */
import { describe, it, expect } from 'vitest';
import { parseLaunchArgs } from './cli.js';

const DEV_ARGV = ['C:/app/node_modules/electron/dist/electron.exe', '.'];
const PACKAGED_ARGV = ['C:/Program Files/VRChat OSC Keyboard/app.exe'];

describe('parseLaunchArgs', () => {
  it('returns inert defaults with no flags', () => {
    expect(parseLaunchArgs([...PACKAGED_ARGV])).toEqual({
      debug: false,
      windowMode: null,
      perfLog: false,
      poseAheadSec: null,
      pointerFilter: null,
      cursorEpsilon: null,
      keepIdleCursors: false,
    });
  });

  it.each([
    ['dev', DEV_ARGV],
    ['packaged', PACKAGED_ARGV],
  ])('parses the same flags regardless of the %s argv offset', (_label, prefix) => {
    const args = parseLaunchArgs([...prefix, '--debug', '--vr', '--perf-log']);
    expect(args.debug).toBe(true);
    expect(args.windowMode).toBe('vr');
    expect(args.perfLog).toBe(true);
  });

  it.each([
    ['--vr', 'windowMode', 'vr'],
    ['--desktop-keyboard', 'windowMode', 'desktop'],
    ['--debug', 'debug', true],
    ['--perf-log', 'perfLog', true],
    ['--keep-idle-cursors', 'keepIdleCursors', true],
  ])('%s sets %s', (flag, key, expected) => {
    const args = parseLaunchArgs([...PACKAGED_ARGV, flag]) as Record<string, unknown>;
    expect(args[key]).toBe(expected);
  });

  it('accepts a value flag in both --key=value and --key value form', () => {
    expect(parseLaunchArgs([...PACKAGED_ARGV, '--pose-ahead=0.011']).poseAheadSec).toBe(0.011);
    expect(parseLaunchArgs([...PACKAGED_ARGV, '--pose-ahead', '0.022']).poseAheadSec).toBe(0.022);
  });

  // Prediction is on by default now, so 0 is the only way to turn it off - it
  // must come through as 0, not be dropped as a missing value.
  // 予測は既定で有効になったため、0 が唯一の無効化手段である。欠落値として
  // 捨てられず、0 として届かなければならない。
  it('accepts --pose-ahead=0 to turn prediction off', () => {
    expect(parseLaunchArgs([...PACKAGED_ARGV, '--pose-ahead=0']).poseAheadSec).toBe(0);
  });

  it('parses the cursor epsilon', () => {
    expect(parseLaunchArgs([...PACKAGED_ARGV, '--cursor-epsilon=0.004']).cursorEpsilon).toBe(0.004);
  });

  it('parses the pointer filter pair', () => {
    expect(parseLaunchArgs([...PACKAGED_ARGV, '--pointer-filter=4.0,1.0']).pointerFilter).toEqual({
      minCutoff: 4,
      beta: 1,
    });
  });

  it.each([
    ['missing value', ['--pose-ahead']],
    ['non numeric', ['--pose-ahead=abc']],
    ['negative', ['--pose-ahead=-1']],
  ])('ignores a %s pose-ahead instead of poisoning the value', (_label, flags) => {
    expect(parseLaunchArgs([...PACKAGED_ARGV, ...flags]).poseAheadSec).toBeNull();
  });

  it.each([
    ['wrong arity', '--pointer-filter=4.0'],
    ['non numeric', '--pointer-filter=a,b'],
    ['zero cutoff', '--pointer-filter=0,1'],
  ])('ignores a %s pointer filter', (_label, flag) => {
    expect(parseLaunchArgs([...PACKAGED_ARGV, flag]).pointerFilter).toBeNull();
  });

  it('does not consume the next flag as a value', () => {
    const args = parseLaunchArgs([...PACKAGED_ARGV, '--pose-ahead', '--vr']);
    expect(args.poseAheadSec).toBeNull();
    expect(args.windowMode).toBe('vr');
  });

  it('keeps scanning past a bare -- separator', () => {
    expect(parseLaunchArgs([...PACKAGED_ARGV, '--', '--debug']).debug).toBe(true);
  });

  it('ignores unknown flags and bare tokens', () => {
    const args = parseLaunchArgs([
      ...PACKAGED_ARGV,
      '--enable-logging',
      'C:/some/path --vr',
      '--vr',
    ]);
    expect(args.windowMode).toBe('vr');
    expect(args.debug).toBe(false);
  });

  it('tolerates a missing argv', () => {
    expect(parseLaunchArgs(undefined as unknown as string[]).debug).toBe(false);
  });
});
