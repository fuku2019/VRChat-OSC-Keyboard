import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { UpdateInfo } from '../hooks/useUpdateChecker';
import { TRANSLATIONS, DEFAULT_CONFIG } from '../constants';
import { Language } from '../types';

interface NotificationToastProps {
  updateAvailable: UpdateInfo;
  language: Language;
  onClose?: () => void;
  isDownloading: boolean;
  downloadProgress: number;
  downloadError: string | null;
  downloadedPath?: string | null;
  startDownload: () => Promise<void>;
  cancelDownload?: () => Promise<void>;
  installUpdate?: () => Promise<void>;
}

// Update Notification Toast Component / アップデート通知トーストコンポーネント
const NotificationToast = ({
  updateAvailable,
  language,
  onClose,
  isDownloading,
  downloadProgress,
  downloadError,
  downloadedPath,
  startDownload,
  cancelDownload,
  installUpdate,
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
      // At the top, over the header: at the bottom it covered the space bar, so the
      // VR ray hit the toast instead of the key.
      // 上端のヘッダーの上に出す。下端ではスペースキーを覆い、VRのレイがキーではなく
      // トーストに当たっていた。
      className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4 ${isClosing ? 'animate-fade-out' : 'animate-scale-in'}`}
    >
      <div className='flex flex-col gap-3 bg-key text-ink pl-5 pr-3 py-3 rounded-2xl border border-line w-full'>
        <div className='flex items-center justify-between gap-4'>
          <div className='flex flex-col'>
            <span className='text-sm flex items-center gap-2 whitespace-nowrap'>
              <Download size={18} className='text-accent shrink-0' />
              {t.settings.updateAvailable.replace(
                '{version}',
                updateAvailable.version,
              )}
            </span>
          </div>
          <div className='flex gap-2'>
            {updateAvailable.isInstaller && updateAvailable.installerUrl ? (
              downloadedPath && installUpdate ? (
                <button
                  onClick={installUpdate}
                  className='px-4 py-2 text-sm font-medium bg-accent text-on-accent rounded-full whitespace-nowrap'
                >
                  {t.settings.installUpdate}
                </button>
              ) : (
                <button
                  onClick={startDownload}
                  disabled={isDownloading}
                  className='px-4 py-2 text-sm font-medium bg-accent text-on-accent rounded-full whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  {isDownloading ? t.settings.downloading : t.settings.downloadAndUpdate}
                </button>
              )
            ) : (
              <button
                onClick={() => {
                  if (window.electronAPI && updateAvailable.url) {
                    window.electronAPI.openExternal(updateAvailable.url);
                  }
                }}
                className='px-4 py-2 text-sm font-medium bg-accent text-on-accent rounded-full whitespace-nowrap'
              >
                {t.settings.openReleasePage}
              </button>
            )}
            <button
              onClick={handleDismiss}
              className='p-3 rounded-full text-ink-muted'
            >
              <X size={20} />
            </button>
          </div>
        </div>
        {/* Download Progress Bar / ダウンロードプログレスバー */}
        {isDownloading && (
          <div className='flex flex-col gap-1 w-full'>
            <div className='flex items-center justify-between'>
              {/* No looping animation for unknown progress: it would make the offscreen
                  keyboard window paint every frame.
                  進捗不明でもループするアニメーションは使わない。オフスクリーンの
                  キーボードウィンドウに毎フレーム描画させるため。 */}
              <div className='w-full bg-key-fn rounded-full h-1 overflow-hidden mr-3'>
                {downloadProgress >= 0 ? (
                  <div
                    className='bg-accent h-1 rounded-full'
                    style={{ width: `${downloadProgress}%` }}
                  ></div>
                ) : (
                  <div className='bg-accent h-1 rounded-full w-full opacity-50'></div>
                )}
              </div>
              {cancelDownload && (
                <button
                  onClick={cancelDownload}
                  className='text-[13px] px-3 py-1 rounded-full text-error flex-shrink-0'
                >
                  {t.settings.cancel}
                </button>
              )}
            </div>
          </div>
        )}
        {/* Download Error / ダウンロードエラー */}
        {downloadError && !isDownloading && (
          <p className='text-[13px] text-error'>{t.settings.downloadError}: {downloadError}</p>
        )}
      </div>
    </div>
  );
};

export default NotificationToast;
