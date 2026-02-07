import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('configStore bridge port sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).electronAPI;
  });

  it('retries bridge port sync and updates bridgeUrl when port becomes available', async () => {
    const getBridgePort = vi
      .fn()
      .mockResolvedValueOnce({ port: null })
      .mockResolvedValueOnce({ port: 8081 });

    (window as any).electronAPI = {
      updateOscPort: vi.fn().mockResolvedValue({ success: true }),
      getBridgePort,
      checkForUpdate: vi.fn(),
      openExternal: vi.fn(),
      logConfigChange: vi.fn().mockResolvedValue({ success: true }),
      sendTypingStatus: vi.fn(),
    };

    const { useConfigStore } = await import('./configStore');

    await vi.runAllTimersAsync();

    expect(getBridgePort).toHaveBeenCalledTimes(2);
    expect(useConfigStore.getState().config.bridgeUrl).toBe(
      'ws://127.0.0.1:8081',
    );
  });

  it('keeps existing bridgeUrl when bridge port never becomes valid', async () => {
    localStorage.setItem(
      'vrc_osc_config',
      JSON.stringify({
        bridgeUrl: 'ws://127.0.0.1:1234',
        oscPort: 9000,
        autoSend: false,
        copyMode: false,
        autoSendBeforeCopyMode: false,
        language: 'ja',
        theme: 'dark',
        accentColor: 'cyan',
        updateCheckInterval: 'weekly',
      }),
    );

    const getBridgePort = vi.fn().mockResolvedValue({ port: null });

    (window as any).electronAPI = {
      updateOscPort: vi.fn().mockResolvedValue({ success: true }),
      getBridgePort,
      checkForUpdate: vi.fn(),
      openExternal: vi.fn(),
      logConfigChange: vi.fn().mockResolvedValue({ success: true }),
      sendTypingStatus: vi.fn(),
    };

    const { useConfigStore } = await import('./configStore');

    await vi.runAllTimersAsync();

    expect(getBridgePort).toHaveBeenCalledTimes(20);
    expect(useConfigStore.getState().config.bridgeUrl).toBe(
      'ws://127.0.0.1:1234',
    );
  });

  it('fills copy mode defaults for legacy config without new fields', async () => {
    localStorage.setItem(
      'vrc_osc_config',
      JSON.stringify({
        bridgeUrl: 'ws://127.0.0.1:8088',
        oscPort: 9000,
        autoSend: true,
        language: 'ja',
        theme: 'dark',
        accentColor: 'cyan',
        updateCheckInterval: 'weekly',
      }),
    );

    (window as any).electronAPI = {
      updateOscPort: vi.fn().mockResolvedValue({ success: true }),
      getBridgePort: vi.fn().mockResolvedValue({ port: null }),
      checkForUpdate: vi.fn(),
      openExternal: vi.fn(),
      logConfigChange: vi.fn().mockResolvedValue({ success: true }),
      sendTypingStatus: vi.fn(),
    };

    const { useConfigStore } = await import('./configStore');

    await vi.runAllTimersAsync();

    expect(useConfigStore.getState().config.copyMode).toBe(false);
    expect(useConfigStore.getState().config.autoSendBeforeCopyMode).toBe(false);
  });
});
