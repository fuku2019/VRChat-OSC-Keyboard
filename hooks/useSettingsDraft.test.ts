import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSettingsDraft } from './useSettingsDraft';
import { useConfigStore } from '../stores/configStore';

const renderDraft = (isOpen: boolean) =>
  renderHook(({ open }) => useSettingsDraft(open), {
    initialProps: { open: isOpen },
  });

const originalSetConfig = useConfigStore.getState().setConfig;

describe('useSettingsDraft', () => {
  beforeEach(() => {
    localStorage.clear();
    // Restore setConfig in case a previous test replaced it with a mock.
    // 前のテストがモックへ差し替えた場合に備えて setConfig を元に戻す。
    useConfigStore.setState((state) => ({
      setConfig: originalSetConfig,
      config: {
        ...state.config,
        theme: 'dark',
        oscPort: 9000,
        historyMaxCount: 30,
      },
    }));
  });

  it('re-syncs the draft from the store only on the closed-to-open edge', () => {
    const { result, rerender } = renderDraft(false);
    expect(result.current.localConfig.theme).toBe('dark');

    // Store changes while closed are not reflected until the modal opens.
    // 閉じている間のストア変更は、モーダルを開くまで反映されない。
    act(() => {
      useConfigStore.setState((state) => ({
        config: { ...state.config, theme: 'light' },
      }));
    });
    expect(result.current.localConfig.theme).toBe('dark');

    rerender({ open: true });
    expect(result.current.localConfig.theme).toBe('light');

    // Store changes while open must not overwrite the draft.
    // 開いている間のストア変更でドラフトが上書きされてはならない。
    act(() => {
      useConfigStore.setState((state) => ({
        config: { ...state.config, theme: 'pure-black' },
      }));
    });
    expect(result.current.localConfig.theme).toBe('light');
  });

  it('writes updateConfig changes through to the store immediately', () => {
    const { result } = renderDraft(true);

    act(() => {
      result.current.updateConfig('theme', 'light');
    });

    expect(result.current.localConfig.theme).toBe('light');
    expect(useConfigStore.getState().config.theme).toBe('light');
  });

  it('does not write to the store when the value is unchanged', () => {
    const setConfig = vi.fn();
    useConfigStore.setState({ setConfig });
    const { result } = renderDraft(true);

    act(() => {
      result.current.updateConfig('theme', 'dark');
    });
    expect(setConfig).not.toHaveBeenCalled();

    act(() => {
      result.current.updateConfig('theme', 'light');
    });
    expect(setConfig).toHaveBeenCalledTimes(1);
  });

  it('commits the history size on blur so a two-digit value can be typed', () => {
    const { result } = renderDraft(true);

    // Typing "5" (the first digit of "50") is only an intermediate input value.
    // "50"の1桁目である"5"を打った時点では、途中の入力値として保持するだけ。
    act(() => {
      result.current.setHistoryMaxCountInput('5');
    });
    expect(result.current.historyMaxCountInput).toBe('5');
    expect(useConfigStore.getState().config.historyMaxCount).toBe(30);

    act(() => {
      result.current.setHistoryMaxCountInput('50');
    });
    act(() => {
      result.current.handleHistoryMaxCountCommit();
    });
    expect(useConfigStore.getState().config.historyMaxCount).toBe(50);
  });

  it('clamps an out-of-range history size on commit', () => {
    const { result } = renderDraft(true);

    act(() => {
      result.current.setHistoryMaxCountInput('5');
    });
    act(() => {
      result.current.handleHistoryMaxCountCommit();
    });

    expect(useConfigStore.getState().config.historyMaxCount).toBe(10);
    expect(result.current.historyMaxCountInput).toBe('10');
  });

  it('reverts an invalid OSC port input to the current value', () => {
    const { result } = renderDraft(true);

    act(() => {
      result.current.setOscPortInput('99999');
    });
    act(() => {
      result.current.handleOscPortCommit();
    });

    expect(result.current.oscPortInput).toBe('9000');
    expect(useConfigStore.getState().config.oscPort).toBe(9000);
  });
});
