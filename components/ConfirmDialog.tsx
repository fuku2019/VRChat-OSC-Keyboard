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
      className={`fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 ${animationClass}`}
    >
      <div
        className={`dark:bg-slate-800 pure-black:bg-black bg-white w-full max-w-sm flex flex-col rounded-2xl border dark:border-slate-600 pure-black:border-slate-800 border-slate-200 shadow-2xl overflow-hidden transition-colors duration-300 ${modalAnimationClass}`}
      >
        <div className='p-6 space-y-4'>
          <div className='flex items-center gap-3'>
            <div
              className={`p-3 rounded-full ${
                isDanger
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              }`}
            >
              <AlertTriangle size={24} />
            </div>
            <h3 className='text-lg font-bold dark:text-slate-100 text-slate-900'>
              {title}
            </h3>
          </div>
          <p className='text-slate-600 dark:text-slate-300'>{message}</p>
        </div>

        <div className='p-4 bg-slate-50 dark:bg-slate-800/50 pure-black:bg-black flex gap-3 justify-end'>
          <button
            onClick={onClose}
            className='px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-medium'
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 rounded-lg text-white font-medium shadow-lg transition-all active:scale-95 ${
              isDanger
                ? 'bg-red-600 hover:bg-red-500 shadow-red-900/30'
                : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/30'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
