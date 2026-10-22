import { FC } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useModalAnimation } from '../hooks/useModalAnimation';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

// Confirm dialog component / 確認ダイアログコンポーネント
export const ConfirmDialog: FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancel',
  isDanger = false,
}) => {
  const { shouldRender, animationClass, modalAnimationClass } =
    useModalAnimation(isOpen);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 ${animationClass}`}
    >
      <div
        className={`bg-key text-ink w-full max-w-sm flex flex-col rounded-[28px] pure-black:border pure-black:border-line overflow-hidden ${modalAnimationClass}`}
      >
        <div className='px-6 pt-6 pb-4 space-y-4'>
          <AlertTriangle size={24} className={isDanger ? 'text-error' : 'text-accent'} />
          <h3 className='text-2xl'>{title}</h3>
          <p className='text-sm text-ink-muted leading-relaxed'>{message}</p>
        </div>

        <div className='px-6 pb-6 pt-2 flex gap-2 justify-end'>
          <button
            onClick={onClose}
            className='px-4 py-2.5 rounded-full text-accent text-sm font-medium'
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-5 py-2.5 rounded-full text-sm font-medium ${
              isDanger ? 'bg-error-container text-error' : 'bg-accent text-on-accent'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
