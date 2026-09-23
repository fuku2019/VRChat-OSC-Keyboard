/**
 * steamVrWatcher tests - starting before SteamVR is the normal case for a
 * VR-only app, so waiting, starting late and retrying are the whole contract.
 * steamVrWatcher のテスト - VR専用アプリでは SteamVR より先に起動するのが普通の
 * 手順なので、待機・後からの起動・再試行がこのモジュールの約束のすべてである。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { watchForSteamVr, VR_STATUS } from './steamVrWatcher.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const INTERVAL = 1000;

describe('watchForSteamVr', () => {
  it('starts the overlay straight away when SteamVR is already running', async () => {
    const start = vi.fn(() => ({ handle: 1 }));
    const onStatus = vi.fn();
    const stop = watchForSteamVr({ isRunning: () => true, start, onStatus, intervalMs: INTERVAL });

    await vi.advanceTimersByTimeAsync(0);

    expect(start).toHaveBeenCalledTimes(1);
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual([
      VR_STATUS.STARTING,
      VR_STATUS.RUNNING,
    ]);
    stop();
  });

  it('waits while SteamVR is not running, then starts once it appears', async () => {
    let running = false;
    const start = vi.fn(() => ({ handle: 1 }));
    const onStatus = vi.fn();
    const stop = watchForSteamVr({
      isRunning: () => running,
      start,
      onStatus,
      intervalMs: INTERVAL,
    });

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(start).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith(VR_STATUS.WAITING);

    running = true;
    await vi.advanceTimersByTimeAsync(INTERVAL);

    expect(start).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith(VR_STATUS.RUNNING);
    stop();
  });

  it('reports each status once, not on every poll', async () => {
    const onStatus = vi.fn();
    const stop = watchForSteamVr({
      isRunning: () => false,
      start: vi.fn(),
      onStatus,
      intervalMs: INTERVAL,
    });

    await vi.advanceTimersByTimeAsync(INTERVAL * 5);

    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith(VR_STATUS.WAITING);
    stop();
  });

  // vrserver shows up some seconds before VR_Init will succeed.
  // vrserver は VR_Init が成功するようになる数秒前に現れる。
  it('retries a failed start while SteamVR is still coming up', async () => {
    const start = vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValue({ handle: 1 });
    const onStatus = vi.fn();
    const stop = watchForSteamVr({ isRunning: () => true, start, onStatus, intervalMs: INTERVAL });

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);

    expect(start).toHaveBeenCalledTimes(3);
    expect(onStatus).toHaveBeenLastCalledWith(VR_STATUS.RUNNING);
    stop();
  });

  it('treats a throwing start as a failed attempt', async () => {
    const start = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('VR_Init failed');
      })
      .mockReturnValue({ handle: 1 });
    const stop = watchForSteamVr({ isRunning: () => true, start, intervalMs: INTERVAL });

    await vi.advanceTimersByTimeAsync(INTERVAL);

    expect(start).toHaveBeenCalledTimes(2);
    stop();
  });

  it('gives up after the attempt budget and reports failure', async () => {
    const start = vi.fn(() => null);
    const onStatus = vi.fn();
    const stop = watchForSteamVr({
      isRunning: () => true,
      start,
      onStatus,
      intervalMs: INTERVAL,
      maxStartAttempts: 3,
    });

    await vi.advanceTimersByTimeAsync(INTERVAL * 10);

    expect(start).toHaveBeenCalledTimes(3);
    expect(onStatus).toHaveBeenLastCalledWith(VR_STATUS.FAILED);
    stop();
  });

  it('stops polling once the overlay is running', async () => {
    const isRunning = vi.fn(() => true);
    const stop = watchForSteamVr({
      isRunning,
      start: () => ({ handle: 1 }),
      intervalMs: INTERVAL,
    });

    await vi.advanceTimersByTimeAsync(0);
    const callsWhenRunning = isRunning.mock.calls.length;
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);

    expect(isRunning.mock.calls.length).toBe(callsWhenRunning);
    stop();
  });

  it('does nothing further after being stopped', async () => {
    let running = false;
    const start = vi.fn(() => ({ handle: 1 }));
    const stop = watchForSteamVr({
      isRunning: () => running,
      start,
      intervalMs: INTERVAL,
    });

    await vi.advanceTimersByTimeAsync(0);
    stop();
    running = true;
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);

    expect(start).not.toHaveBeenCalled();
  });
});
