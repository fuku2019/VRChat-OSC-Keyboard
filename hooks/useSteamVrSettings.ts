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

// SteamVR input is brought up by the VR bootstrap, which runs a second or two
// after the window is already on screen. Asking before then is not an error and
// must not be shown as one - in VR mode the settings window opens at startup
// and always asks first, so the very first thing the user saw was "bindings
// unavailable", which they then had to know to refresh away.
// SteamVR入力はVR初期化処理が立ち上げるが、この処理はウィンドウが画面に出てから
// 1〜2秒後に走る。それ以前の問い合わせはエラーではなく、エラーとして見せてはならない。
// VRモードでは設定ウィンドウが起動時に開いて必ず先に問い合わせるため、ユーザーが
// 最初に目にするのが「バインディングを利用できません」になり、更新を押せば直ると
// 知っている必要があった。
const BINDING_RETRY_INTERVAL_MS = 1000;
const BINDING_RETRY_ATTEMPTS = 10;

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
  const [fetchingBindings, setFetchingBindings] = useState<boolean>(false);
  const [bindingRetriesLeft, setBindingRetriesLeft] = useState<number>(0);
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
  const fetchBindings = useCallback(async () => {
    if (!window.electronAPI?.getSteamVrBindings) {
      resetBindings();
      return;
    }

    setFetchingBindings(true);
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
      setFetchingBindings(false);
    }
  }, [t.steamVrBindingsUnavailable]);

  // Every caller outside the retry loop is a fresh attempt, so give it a full
  // budget again. / リトライループ以外からの呼び出しはすべて仕切り直しなので、
  // 再び満額の回数を与える。
  const loadBindings = useCallback(async () => {
    setBindingRetriesLeft(BINDING_RETRY_ATTEMPTS);
    await fetchBindings();
  }, [fetchBindings]);

  useEffect(() => {
    if (!isOpen) return;
    void loadBindings();
  }, [isOpen, loadBindings]);

  // Keep asking while the answer is still "not initialized". A bounded budget
  // is right for both outcomes: either the bootstrap finishes within a few
  // seconds, or SteamVR genuinely is not there and the unavailable state is the
  // truth. / 「未初期化」という答えが返る間は問い合わせ続ける。回数に上限を設けるのは
  // どちらの結末にも適う。数秒で初期化が終わるか、SteamVRが本当に無く「利用できません」が
  // 事実であるかのどちらかだからである。
  // "Initialized" is not the finish line. SteamVR resolves the bindings for the
  // action handles asynchronously, a second or two after the action manifest is
  // accepted, so the first answer after initialization is typically
  // initialized=true with nothing bound. Stopping there left the tab showing
  // "no bindings assigned" plus a warning telling the user to go and set them
  // up - for bindings that were already set up and arrived moments later.
  // 「初期化済み」は終着点ではない。SteamVR はアクションマニフェストを受理してから
  // 1〜2秒後に、アクションハンドルに対するバインディングを非同期に解決する。その
  // ため初期化直後の最初の答えは、たいてい initialized=true かつ割り当てが空である。
  // そこで止めていたため、タブには「現在の割り当てはありません」と、設定を促す警告が
  // 表示されていた - 実際には設定済みで、直後に届くはずのバインディングに対して。
  const bindingsResolved =
    initialized && (toggleBindings.length > 0 || triggerBound || gripBound);

  useEffect(() => {
    if (!isOpen || bindingsResolved || bindingError || bindingRetriesLeft <= 0) return;
    const timer = setTimeout(() => {
      setBindingRetriesLeft((remaining) => remaining - 1);
      void fetchBindings();
    }, BINDING_RETRY_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [isOpen, bindingsResolved, bindingError, bindingRetriesLeft, fetchBindings]);

  // Waiting - for the bootstrap, then for SteamVR to resolve the bindings - is a
  // loading state, not a result. Folding it in here keeps the distinction out
  // of the tab's markup. Once the budget runs out, whatever was last seen is the
  // honest answer: unavailable, or genuinely nothing bound.
  // 待機 - 初期化処理を、その後SteamVRのバインディング解決を - は結果ではなく
  // 読み込み中である。ここで畳み込むことで、この区別をタブのマークアップへ
  // 持ち込まずに済む。回数を使い切ったら、最後に見えたものが正直な答えになる。
  // 利用できないか、本当に何も割り当てられていないかのどちらかである。
  const loadingBindings =
    fetchingBindings ||
    (!bindingsResolved && !bindingError && bindingRetriesLeft > 0);

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
