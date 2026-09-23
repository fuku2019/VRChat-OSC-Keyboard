/**
 * Window IPC Handlers - Cross-window messaging for the two-window layout
 * ウィンドウIPCハンドラ - 2ウィンドウ構成のためのウィンドウ間メッセージング
 *
 * Config lives in each renderer's localStorage, which is per-window state as far
 * as a running zustand store is concerned: a change made in the settings window
 * would not reach the keyboard window until it reloaded. The main process is the
 * only thing both windows can see, so it relays the change.
 * 設定は各レンダラーの localStorage にあり、動作中の zustand ストアから見れば
 * ウィンドウごとの状態でしかない。設定ウィンドウでの変更は、キーボードウィンドウが
 * 再読み込みするまで届かない。両方のウィンドウから見えるのはメインプロセスだけ
 * なので、そこが変更を中継する。
 */

import { ipcMain } from 'electron';
import {
  getAllAppWindows,
  getKeyboardWindow,
} from '../WindowManager.js';

function sendToKeyboard(channel, payload) {
  const win = getKeyboardWindow();
  if (!win || win.isDestroyed()) return { success: false };
  win.webContents.send(channel, payload);
  return { success: true };
}

/**
 * Tell every window where the SteamVR overlay stands. The settings window shows
 * it, because while SteamVR is not running there is otherwise nothing on screen
 * that explains why no keyboard has appeared.
 * SteamVR オーバーレイの状態を全ウィンドウへ知らせる。表示するのは設定ウィンドウで、
 * SteamVR が動いていない間、キーボードが出てこない理由を説明するものが画面上に
 * ほかに何もないためである。
 *
 * @param {'waiting'|'starting'|'running'|'failed'} status
 */
export function broadcastVrStatus(status) {
  for (const win of getAllAppWindows()) {
    win.webContents.send('vr-status-changed', status);
  }
}

/**
 * @param {Object} [options]
 * @param {() => {windowMode: string, isOsr: boolean, debug: boolean}} [options.getLaunchInfo]
 * @param {() => string} [options.getVrStatus] - Current SteamVR overlay status / 現在の SteamVR オーバーレイの状態
 */
export function registerWindowIpcHandlers({
  getLaunchInfo = null,
  getVrStatus = null,
} = {}) {
  // Relay a config change to every other window. Echoing it back to the sender
  // would make the two stores bounce the same value between them forever.
  // 設定変更を他のすべてのウィンドウへ中継する。送信元へ送り返すと、2つのストアが
  // 同じ値を延々と往復させることになる。
  ipcMain.on('config-changed', (event, config) => {
    for (const win of getAllAppWindows()) {
      if (win.webContents.id === event.sender.id) continue;
      win.webContents.send('config-broadcast', config);
    }
  });

  // The tutorial and the send history belong to the keyboard window, so the
  // settings window asks for them rather than owning them.
  // チュートリアルと送信履歴はキーボードウィンドウのものなので、設定ウィンドウは
  // 自分で持たずに依頼する。
  ipcMain.handle('request-show-tutorial', () =>
    sendToKeyboard('show-tutorial'),
  );
  ipcMain.handle('request-clear-history', () =>
    sendToKeyboard('clear-history'),
  );

  // Lets a renderer find out which window it is and whether VR mode is active,
  // which it otherwise has no way to know.
  // レンダラーが自分がどのウィンドウなのか、VRモードが有効かを知るための唯一の
  // 手段。これがないとレンダラー側には判断材料がない。
  ipcMain.handle('get-launch-info', () =>
    getLaunchInfo
      ? getLaunchInfo()
      : { windowMode: 'desktop', isOsr: false, debug: false },
  );

  // A window that opens after a status change has to be able to ask for the
  // current value, since it missed the broadcast.
  // 状態が変わった後に開いたウィンドウは配信を聞き逃しているため、現在の値を
  // 問い合わせられなければならない。
  ipcMain.handle('get-vr-status', () => (getVrStatus ? getVrStatus() : 'starting'));
}
