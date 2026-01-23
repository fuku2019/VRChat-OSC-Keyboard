import { useState } from 'react';
import { X } from 'lucide-react';
import { UpdateInfo } from '../hooks/useUpdateChecker';
import { TRANSLATIONS, DEFAULT_CONFIG } from '../constants';
import { Language } from '../types';

interface NotificationToastProps {
  updateAvailable: UpdateInfo;
  language: Language;
  onClose?: () => void;
}

// Update Notification Toast Component / アップデート通知トーストコンポーネント
const NotificationToast = ({
  updateAvailable,
  language,
  onClose,
}: NotificationToastProps) => {
  const [isClosing, setIsClosing] = useState(false);
  const t = TRANSLATIONS[language || DEFAULT_CONFIG.LANGUAGE];

  // Handle toast dismissal with animation / アニメーション付きでトーストを閉じる
  const handleDismiss = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose?.();
    }, 200); // Match animation duration (0.2s)
  };

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 ${isClosing ? 'animate-fade-out' : 'animate-bounce-in'}`}
    >
      <div className='flex items-center justify-between gap-4 dark:bg-slate-800 bg-white p-4 rounded-xl shadow-2xl border dark:border-cyan-500/50 border-cyan-500 ring-1 ring-cyan-500/20 w-full'>
        <div className='flex flex-col'>
          <span className='text-sm font-bold dark:text-white text-slate-800 flex items-center gap-2'>
            <span className='w-2 h-2 rounded-full bg-cyan-500 animate-pulse'></span>
            {t.settings.updateAvailable.replace(
              '{version}',
              updateAvailable.version,
            )}
          </span>
        </div>
        <div className='flex gap-2'>
          <button
            onClick={() => {
              if (window.electronAPI && updateAvailable.url) {
                window.electronAPI.openExternal(updateAvailable.url);
              }
            }}
            className='px-3 py-1.5 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors'
          >
            {t.settings.openReleasePage}
          </button>
          <button
            onClick={handleDismiss}
            className='p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400 transition-colors'
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationToast;
