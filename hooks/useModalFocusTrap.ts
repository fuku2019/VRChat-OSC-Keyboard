import { useEffect, useRef, RefObject } from 'react';

interface UseModalFocusTrapReturn {
  modalRef: RefObject<HTMLDivElement | null>;
}

/**
 * Custom hook that traps Tab focus inside a modal, closes it on Escape, and restores focus on close.
 * モーダル内にTabフォーカスを閉じ込め、Escapeで閉じ、閉じたときにフォーカスを元へ戻すカスタムフック。
 *
 * @param isOpen - Whether the modal is open / モーダルが開いているかどうか
 * @param shouldRender - Whether the modal is mounted in the DOM / モーダルがDOMに描画されているかどうか
 * @param onClose - Called when Escape is pressed / Escape押下時に呼ばれるコールバック
 * @returns Ref to attach to the dialog element / ダイアログ要素に付与するref
 */
export const useModalFocusTrap = (
  isOpen: boolean,
  shouldRender: boolean,
  onClose: () => void,
): UseModalFocusTrapReturn => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || !shouldRender) return;
    const modalElement = modalRef.current;
    if (!modalElement) return;

    previousFocusedElementRef.current = document.activeElement as HTMLElement | null;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusableElements = () =>
      Array.from(modalElement.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute('aria-hidden'),
      );

    const focusableElements = getFocusableElements();
    (focusableElements[0] || modalElement).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const currentFocusableElements = getFocusableElements();
      if (currentFocusableElements.length === 0) {
        event.preventDefault();
        modalElement.focus();
        return;
      }

      const firstElement = currentFocusableElements[0];
      const lastElement = currentFocusableElements[currentFocusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstElement || !modalElement.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    modalElement.addEventListener('keydown', handleKeyDown);
    return () => {
      modalElement.removeEventListener('keydown', handleKeyDown);
      if (previousFocusedElementRef.current) {
        previousFocusedElementRef.current.focus();
        previousFocusedElementRef.current = null;
      }
    };
  }, [isOpen, shouldRender]);

  return { modalRef };
};
