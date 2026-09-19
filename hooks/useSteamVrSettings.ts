import { useState, useEffect, useRef, useCallback } from 'react';
import { UpdateConfigFn } from '../types';
import type { TranslationStrings } from '../constants';

interface UseSteamVrSettingsReturn {
  toggleBindings: string[];
  triggerBindings: string[];
  gripBindings: string[];
  initialized: boolean;
  loadingBindings: boolean;
  bindingError: string;
  triggerBound: boolean;
  gripBound: boolean;
  steamVrAutoLaunchError: string;
  loadBindings: () => Promise<void>;
  handleOpenBindingUi: () => Promise<void>;
  formatBindings: (entries: string[]) => string;
  handleToggleSteamVrAutoLaunch: (value: boolean) => Promise<void>;
}

/**
 * Custom hook for SteamVR auto-launch registration and controller binding display.
 * SteamVRの自動起動登録とコントローラーバインディング表示を扱うカスタムフック。
 *
 * @param isOpen - Whether the settings modal is open / 設定モーダルが開いているかどうか
 * @param t - Settings translation strings / 設定用の翻訳文字列
 * @param updateConfig - Single-field config updater / 単一フィールド設定更新関数
 * @returns Binding state and handlers / バインディングの状態とハンドラー
 */
export const useSteamVrSettings = (
  isOpen: boolean,
  t: TranslationStrings['settings'],
  updateConfig: UpdateConfigFn,
): UseSteamVrSettingsReturn => {
  const delayedRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [toggleBindings, setToggleBindings] = useState<string[]>([]);
  const [triggerBindings, setTriggerBindings] = useState<string[]>([]);
  const [gripBindings, setGripBindings] = useState<string[]>([]);
  const [initialized, setInitialized] = useState<boolean>(false);
  const [loadingBindings, setLoadingBindings] = useState<boolean>(false);
  const [bindingError, setBindingError] = useState<string>('');
  const [triggerBound, setTriggerBound] = useState<boolean>(false);
  const [gripBound, setGripBound] = useState<boolean>(false);
  const [steamVrAutoLaunchError, setSteamVrAutoLaunchError] = useState<string>('');

  const getLocalizedSteamVrBindingsError = () => t.steamVrBindingsUnavailable;

  // Clear the auto-launch error each time the modal opens / モーダルを開くたびに自動起動のエラー表示を消す
  useEffect(() => {
    if (isOpen) setSteamVrAutoLaunchError('');
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) return;
    if (delayedRefreshTimerRef.current) {
      clearTimeout(delayedRefreshTimerRef.current);
      delayedRefreshTimerRef.current = null;
    }
    // Cleanup on unmount / アンマウント時のクリーンアップ
    return () => {
      if (delayedRefreshTimerRef.current) {
        clearTimeout(delayedRefreshTimerRef.current);
        delayedRefreshTimerRef.current = null;
      }
    };
  }, [isOpen]);

  const handleToggleSteamVrAutoLaunch = async (value: boolean) => {
    if (!window.electronAPI?.setSteamVrAutoLaunch) {
      setSteamVrAutoLaunchError(t.steamVrAutoLaunchError);
      return;
    }
    try {
      const result = await window.electronAPI.setSteamVrAutoLaunch(value);
      if (!result?.success) {
        setSteamVrAutoLaunchError(result?.error || t.steamVrAutoLaunchError);
        return;
      }
      setSteamVrAutoLaunchError('');
      updateConfig('steamVrAutoLaunch', value);
    } catch (e) {
      setSteamVrAutoLaunchError((e as Error)?.message || t.steamVrAutoLaunchError);
    }
  };

  // The dependency list is intentionally [isOpen] only (unchanged from the original behavior).
  // 依存配列を[isOpen]のみにしているのは元の挙動をそのまま維持するため(意図的)。
  useEffect(() => {
    if (!isOpen || !window.electronAPI?.getSteamVrAutoLaunch) return;
    const syncSteamVrAutoLaunch = async () => {
      try {
        const result = await window.electronAPI!.getSteamVrAutoLaunch();
        if (!result?.success || typeof result.enabled !== 'boolean') return;
        updateConfig('steamVrAutoLaunch', result.enabled);
      } catch {
        // no-op: this sync is best-effort only / この同期はベストエフォート
      }
    };
    void syncSteamVrAutoLaunch();
  }, [isOpen]);

  // Reset all binding states / バインディング状態を全てリセット
  const resetBindings = () => {
    setInitialized(false);
    setToggleBindings([]);
    setTriggerBindings([]);
    setGripBindings([]);
    setTriggerBound(false);
    setGripBound(false);
  };

  // The dependency is the translated string on purpose: switching language re-creates this callback and reloads bindings.
  // 依存に翻訳文字列を指定しているのは意図的: 言語を切り替えるとコールバックが再生成され、バインディングが再読み込みされる。
  const loadBindings = useCallback(async () => {
    if (!window.electronAPI?.getSteamVrBindings) {
      resetBindings();
      return;
    }

    setLoadingBindings(true);
    setBindingError('');

    try {
      const result = await window.electronAPI.getSteamVrBindings();
      if (!result?.success || !result.bindings) {
        resetBindings();
        setBindingError(getLocalizedSteamVrBindingsError());
        return;
      }

      const toStringArray = (value: unknown): string[] => {
        if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
        if (typeof value === 'string' && value.length > 0) return [value];
        return [];
      };

      setInitialized(Boolean(result.bindings.initialized));
      setToggleBindings(toStringArray(result.bindings.toggleOverlay));
      setTriggerBindings(toStringArray(result.bindings.triggerBindings));
      setGripBindings(toStringArray(result.bindings.gripBindings));
      setTriggerBound(Boolean(result.bindings.triggerBound));
      setGripBound(Boolean(result.bindings.gripBound));
    } catch {
      resetBindings();
      setBindingError(getLocalizedSteamVrBindingsError());
    } finally {
      setLoadingBindings(false);
    }
  }, [t.steamVrBindingsUnavailable]);

  useEffect(() => {
    if (!isOpen) return;
    void loadBindings();
  }, [isOpen, loadBindings]);

  const handleOpenBindingUi = async () => {
    if (!window.electronAPI?.openSteamVrBindingUi) return;
    setBindingError('');

    try {
      const result = await window.electronAPI.openSteamVrBindingUi();
      if (!result?.success) {
        setBindingError(getLocalizedSteamVrBindingsError());
        return;
      }

      await loadBindings();
      if (delayedRefreshTimerRef.current) {
        clearTimeout(delayedRefreshTimerRef.current);
      }
      delayedRefreshTimerRef.current = setTimeout(() => {
        delayedRefreshTimerRef.current = null;
        void loadBindings();
      }, 1500);
    } catch {
      setBindingError(getLocalizedSteamVrBindingsError());
    }
  };

  const formatBindings = (entries: string[]) => {
    if (!entries || entries.length === 0) {
      return t.steamVrBindingsEmpty;
    }
    return entries.join(', ');
  };

  return {
    toggleBindings,
    triggerBindings,
    gripBindings,
    initialized,
    loadingBindings,
    bindingError,
    triggerBound,
    gripBound,
    steamVrAutoLaunchError,
    loadBindings,
    handleOpenBindingUi,
    formatBindings,
    handleToggleSteamVrAutoLaunch,
  };
};
