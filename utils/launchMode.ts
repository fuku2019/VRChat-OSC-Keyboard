/**
 * Renderer entry mode / レンダラーのエントリモード
 *
 * Both windows load the same index.html; the query string is what tells them
 * apart. The keyboard tree opens the OSC bridge and the IME IPC, so mounting it
 * twice would have two copies of the app fighting over the same connections.
 * 両方のウィンドウが同じ index.html を読み込むため、区別するのはクエリ文字列である。
 * キーボードのツリーは OSC ブリッジと IME IPC を開くので、2回マウントすると
 * 同じ接続を2つのコピーが奪い合うことになる。
 */

export type RenderMode = 'keyboard' | 'settings';

/**
 * @param search - Typically window.location.search / 通常は window.location.search
 */
export const parseRenderMode = (search: string): RenderMode => {
  try {
    const mode = new URLSearchParams(search).get('mode');
    return mode === 'settings' ? 'settings' : 'keyboard';
  } catch {
    // A malformed query must never cost the user their keyboard.
    // 壊れたクエリでキーボードを失わせてはならない。
    return 'keyboard';
  }
};
