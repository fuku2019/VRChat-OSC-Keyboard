/**
 * Window mode resolution / ウィンドウモードの解決
 *
 * The VR overlay bootstrap is asynchronous and slow (it shells out to vrpathreg
 * and tasklist, then calls VR_Init), while the window has to appear immediately.
 * So the mode is decided twice: once synchronously from cheap inputs to get a
 * window on screen, and once after the bootstrap reports whether the overlay
 * actually came up.
 * VRオーバーレイの初期化は非同期かつ低速である (vrpathreg と tasklist を起動し、
 * その後 VR_Init を呼ぶ) 一方、ウィンドウは即座に出す必要がある。そのためモードは
 * 2回決める。1回目は安価な入力だけから同期的に決めてウィンドウを出し、2回目は
 * 初期化がオーバーレイの起動可否を報告した後に決める。
 */

/** @typedef {'vr'|'desktop'} WindowMode */

/**
 * Decide the mode to start with, before anything asynchronous has run.
 * 非同期処理が走る前の、起動時点のモードを決める。
 *
 * @param {Object} options
 * @param {{windowMode?: WindowMode|null}} [options.launchArgs]
 * @param {WindowMode|null} [options.storedLaunchMode] - Mode confirmed on the previous run / 前回の起動で確定したモード
 * @param {{disableOverlay?: boolean}} [options.overlaySettings]
 * @returns {WindowMode}
 */
export function resolveInitialWindowMode({
  launchArgs = {},
  storedLaunchMode = null,
  overlaySettings = {},
} = {}) {
  // An explicit flag always wins - it is how SteamVR and manual debugging ask
  // for a specific mode. / 明示的なフラグが常に優先される。SteamVR と手動デバッグは
  // これでモードを指定する。
  if (launchArgs.windowMode === 'vr' || launchArgs.windowMode === 'desktop') {
    // ...except that VR mode with the overlay switched off would leave no
    // visible window at all. / ただしオーバーレイを切った状態のVRモードは、
    // 可視ウィンドウが一切ない状態を生むので許さない。
    if (launchArgs.windowMode === 'vr' && overlaySettings.disableOverlay === true) {
      return 'desktop';
    }
    return launchArgs.windowMode;
  }

  if (overlaySettings.disableOverlay === true) return 'desktop';

  if (storedLaunchMode === 'vr' || storedLaunchMode === 'desktop') {
    return storedLaunchMode;
  }

  return 'desktop';
}

/**
 * Decide the mode to settle on once the overlay bootstrap has reported back.
 * オーバーレイの初期化が結果を返した後に落ち着くべきモードを決める。
 *
 * @param {Object} options
 * @param {{windowMode?: WindowMode|null}} [options.launchArgs]
 * @param {'auto'|'always'|'never'} [options.vrOsrMode] - User setting / ユーザー設定
 * @param {boolean} [options.overlayStarted] - Whether the VR overlay came up / VRオーバーレイが起動したか
 * @returns {WindowMode}
 */
export function resolveFinalWindowMode({
  launchArgs = {},
  vrOsrMode = 'auto',
  overlayStarted = false,
} = {}) {
  // Without a live overlay there is nothing to render into, so VR mode would
  // hide the UI with no replacement. / 生きたオーバーレイがなければ描画先がなく、
  // VRモードは代わりのないままUIを隠すだけになる。
  if (!overlayStarted) return 'desktop';

  if (vrOsrMode === 'never') return 'desktop';
  if (vrOsrMode === 'always') return 'vr';

  // 'auto': only go VR when something explicitly asked for it, so existing
  // installs keep behaving exactly as before.
  // 'auto': 明示的に要求されたときだけVRにする。これにより既存の環境の挙動は
  // 従来とまったく変わらない。
  return launchArgs.windowMode === 'vr' ? 'vr' : 'desktop';
}
