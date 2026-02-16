import { useEffect, useRef } from 'react';
import { TIMEOUTS } from '../constants';

const VR_SCROLL_SELECT_LOCK_CLASS = 'vr-scroll-select-lock';

/**
 * Temporarily disables text selection while VR scroll input is active.
 * VRスクロール入力中のみ一時的にテキスト選択を無効化する
 */
export const useVrScrollSelectionGuard = () => {
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!window.electronAPI?.onInputScroll) return;

    const root = document.documentElement;

    const clearUnlockTimer = () => {
      if (!unlockTimerRef.current) return;
      clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    };

    const releaseLock = () => {
      root.classList.remove(VR_SCROLL_SELECT_LOCK_CLASS);
    };

    const scheduleRelease = () => {
      clearUnlockTimer();
      unlockTimerRef.current = setTimeout(() => {
        unlockTimerRef.current = null;
        releaseLock();
      }, TIMEOUTS.VR_SCROLL_SELECTION_LOCK);
    };

    const handleInputScroll = (_payload: { deltaY: number }) => {
      root.classList.add(VR_SCROLL_SELECT_LOCK_CLASS);
      try {
        window.getSelection()?.removeAllRanges();
      } catch {
        // Ignore selection API failures; lock class still prevents new selections.
      }
      scheduleRelease();
    };

    window.electronAPI.onInputScroll(handleInputScroll);

    return () => {
      clearUnlockTimer();
      releaseLock();
      window.electronAPI?.removeInputScrollListener?.(handleInputScroll);
    };
  }, []);
};
