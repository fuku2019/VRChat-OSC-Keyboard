import { useState, useEffect } from 'react';
import { TIMEOUTS } from '../constants';

interface UseModalAnimationReturn {
  shouldRender: boolean;
  animationClass: string;
  modalAnimationClass: string;
}

/**
 * Custom hook for handling modal open/close animations.
 * モーダルの開閉アニメーションを処理するカスタムフック。
 * 
 * @param isOpen - Whether the modal is open / モーダルが開いているかどうか
 * @returns Animation state and CSS classes / アニメーション状態とCSSクラス
 */
export const useModalAnimation = (isOpen: boolean): UseModalAnimationReturn => {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
    } else {
      const timer = setTimeout(() => setShouldRender(false), TIMEOUTS.MODAL_ANIMATION);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  return {
    shouldRender,
    animationClass: isOpen ? 'animate-fade-in' : 'animate-fade-out',
    modalAnimationClass: isOpen ? 'animate-scale-in' : 'animate-scale-out',
  };
};
