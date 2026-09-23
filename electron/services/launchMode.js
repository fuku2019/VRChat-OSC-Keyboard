/**
 * Window mode resolution / ウィンドウモードの解決
 *
 * The app is VR-only: the keyboard lives in the SteamVR overlay and the desktop
 * only shows the settings window. The desktop keyboard window survives as a
 * debugging aid. The mode is decided once, from the launch flags and the debug
 * setting alone - it no longer depends on whether SteamVR is running, which is
 * what used to force a second decision after the VR bootstrap and a visible
 * window rebuild in between.
 * このアプリはVR専用である。キーボードはSteamVRオーバーレイの中にあり、
 * デスクトップには設定ウィンドウだけが出る。デスクトップのキーボードウィンドウは
 * デバッグ用として残している。モードは起動フラグとデバッグ設定だけから一度で
 * 決まる。SteamVRが動いているかどうかには依存しない。以前はそれに依存していた
 * ため、VR初期化の後にもう一度判定し、その間にウィンドウを目に見える形で
 * 作り直す必要があった。
 */

/** @typedef {'vr'|'desktop'} WindowMode */

/**
 * @param {Object} options
 * @param {{windowMode?: WindowMode|null}} [options.launchArgs]
 * @param {boolean} [options.debug] - Debug mode (--debug or enableDebugMode) / デバッグモード
 * @returns {WindowMode}
 */
export function resolveWindowMode({ launchArgs = {}, debug = false } = {}) {
  // An explicit flag always wins, so VR mode can still be exercised while
  // debugging. / 明示的なフラグが常に優先される。デバッグ中でもVRモードを試せる
  // ようにするため。
  if (launchArgs.windowMode === 'vr' || launchArgs.windowMode === 'desktop') {
    return launchArgs.windowMode;
  }
  return debug ? 'desktop' : 'vr';
}
