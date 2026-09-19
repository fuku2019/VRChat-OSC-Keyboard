import { useEffect, useRef, RefObject } from 'react';

interface UseOverlayScrollForwardReturn {
  contentRef: RefObject<HTMLDivElement | null>;
}

/**
 * Custom hook that forwards VR controller scroll events to a scrollable element.
 * VRコントローラーのスクロールイベントをスクロール可能な要素へ転送するカスタムフック。
 *
 * @param isOpen - Whether the listener should be active / リスナーを有効にするかどうか
 * @returns Ref to attach to the scrollable element / スクロール対象要素に付与するref
 */
export const useOverlayScrollForward = (isOpen: boolean): UseOverlayScrollForwardReturn => {
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (payload?: { deltaY?: number } | number) => {
      const deltaY =
        typeof payload === 'number'
          ? payload
          : typeof payload?.deltaY === 'number'
            ? payload.deltaY
            : 0;
      if (!deltaY) return;
      const el = contentRef.current;
      if (!el) return;
      el.scrollBy({ top: deltaY, behavior: 'auto' });
    };
    if (window.electronAPI?.onInputScroll) {
      window.electronAPI.onInputScroll(handler);
    }
    return () => {
      if (window.electronAPI?.removeInputScrollListener) {
        window.electronAPI.removeInputScrollListener(handler);
      }
    };
  }, [isOpen]);

  return { contentRef };
};
