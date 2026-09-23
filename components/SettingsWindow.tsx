/**
 * Settings Window - The desktop window shown while the keyboard lives in VR
 * 設定ウィンドウ - キーボードがVR内にある間、デスクトップに表示されるウィンドウ
 *
 * In VR mode the keyboard window renders offscreen and is invisible on the
 * desktop, so this is the only window the user can see, click or close. It
 * deliberately mounts SettingsModal alone: the keyboard tree opens the OSC
 * bridge and the IME IPC, and a second copy of those would fight the first.
 * VRモードではキーボードウィンドウはオフスクリーン描画でデスクトップからは見えない
 * ため、ユーザーが見て操作し閉じられるウィンドウはこれだけになる。ここで
 * SettingsModal だけをマウントするのは意図的である。キーボードのツリーは OSC
 * ブリッジと IME IPC を開くので、2つ目のコピーが1つ目と衝突してしまう。
 */

import { FC } from 'react';
import SettingsModal from './SettingsModal';
import VrStatusBanner from './VrStatusBanner';
import { useConfigStore } from '../stores/configStore';
import { useTheme } from '../hooks/useTheme';
import { useUpdateChecker } from '../hooks/useUpdateChecker';

const SettingsWindow: FC = () => {
  useTheme();

  // A change made in the keyboard window arrives through the main process and
  // bumps this. Remounting is what re-syncs useSettingsDraft, which by design
  // only reads the store when it opens.
  // キーボードウィンドウでの変更はメインプロセス経由で届き、この値を進める。
  // useSettingsDraft は仕様上、開いた瞬間にしかストアを読まないため、再マウント
  // することが再同期の手段になる。
  const externalRevision = useConfigStore((state) => state.externalRevision);

  const {
    updateAvailable,
    setUpdateAvailable,
    isDownloading,
    downloadProgress,
    downloadError,
    downloadedPath,
    startDownload,
    cancelDownload,
    installUpdate,
  } = useUpdateChecker();

  return (
    <div className='h-screen w-screen overflow-hidden flex flex-col dark:bg-slate-950 pure-black:bg-black bg-slate-50'>
      {/* Outside the keyed panel so a config remount does not reset it.
          キー付きのパネルの外に置き、設定による再マウントでリセットされないようにする。 */}
      <VrStatusBanner />
      <div className='relative flex-1 min-h-0'>
        <SettingsModal
          key={externalRevision}
          variant='panel'
          isOpen
          onClose={() => window.close()}
          onShowTutorial={() => {
            void window.electronAPI?.requestShowTutorial?.();
          }}
          updateAvailable={updateAvailable}
          onUpdateAvailable={(version, url, isInstaller, installerUrl) => {
            if (version === null) {
              setUpdateAvailable(null);
            } else if (url) {
              setUpdateAvailable({ version, url, isInstaller, installerUrl });
            }
          }}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
          downloadError={downloadError}
          downloadedPath={downloadedPath}
          startDownload={startDownload}
          cancelDownload={cancelDownload}
          installUpdate={installUpdate}
          onClearHistory={() => {
            void window.electronAPI?.requestClearHistory?.();
          }}
        />
      </div>
    </div>
  );
};

export default SettingsWindow;
