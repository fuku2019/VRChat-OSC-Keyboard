/**
 * Launch argument parser / 起動引数パーサ
 *
 * The parser scans every token instead of relying on a fixed offset, because
 * argv is laid out differently depending on how the app was started:
 * packaged is `[exe, ...flags]` while `electron .` is `[electron.exe, '.', ...flags]`.
 * Only tokens starting with `--` are considered, so paths are never mistaken
 * for flags and a bare `--` separator is simply ignored.
 * 固定のオフセットに頼らず全トークンを走査する。argv の並びは起動方法で変わり、
 * パッケージ版は `[exe, ...flags]`、`electron .` は `[electron.exe, '.', ...flags]`
 * になるためである。`--` で始まるトークンだけを見るので、パスがフラグと誤認される
 * ことはなく、区切りの `--` も単に無視される。
 *
 * Value flags accept both `--key=value` and `--key value`.
 * 値を取るフラグは `--key=value` と `--key value` の両方を受け付ける。
 */

/**
 * @typedef {Object} LaunchArgs
 * @property {boolean} debug            Force debug mode on / デバッグモードを強制的に有効化
 * @property {'vr'|'desktop'|null} windowMode  Explicit window mode / ウィンドウモードの明示指定
 * @property {boolean} perfLog          Enable capture perf logging / キャプチャ計測ログを有効化
 * @property {number|null} poseAheadSec Controller pose prediction / コントローラーのポーズ予測秒数
 * @property {{minCutoff: number, beta: number}|null} pointerFilter  1e filter tuning / 1€フィルタの調整値
 * @property {number|null} cursorEpsilon  Cursor send threshold / カーソル送信しきい値
 * @property {boolean} keepIdleCursors  Keep cursors for idle controllers / 休止中コントローラーのカーソルを残す
 */

/** @returns {LaunchArgs} */
function createDefaults() {
  return {
    debug: false,
    windowMode: null,
    perfLog: false,
    poseAheadSec: null,
    pointerFilter: null,
    cursorEpsilon: null,
    keepIdleCursors: false,
  };
}

/**
 * Split `--key=value` into its parts. A flag without `=` yields a null value.
 * `--key=value` を分解する。`=` を含まないフラグの値は null になる。
 */
function splitToken(token) {
  const body = token.slice(2);
  const eq = body.indexOf('=');
  if (eq === -1) return { name: body, inlineValue: null };
  return { name: body.slice(0, eq), inlineValue: body.slice(eq + 1) };
}

function parsePositiveNumber(raw) {
  if (raw === null || raw === '') return null;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * Parse `<minCutoff>,<beta>` for the 1e pointer filter.
 * 1€ポインタフィルタ用の `<minCutoff>,<beta>` を解析する。
 */
function parsePointerFilter(raw) {
  if (!raw) return null;
  const parts = raw.split(',');
  if (parts.length !== 2) return null;
  const minCutoff = Number.parseFloat(parts[0]);
  const beta = Number.parseFloat(parts[1]);
  if (!Number.isFinite(minCutoff) || minCutoff <= 0) return null;
  if (!Number.isFinite(beta) || beta < 0) return null;
  return { minCutoff, beta };
}

/**
 * @param {string[]} argv - Usually process.argv / 通常は process.argv
 * @returns {LaunchArgs}
 */
export function parseLaunchArgs(argv) {
  const args = createDefaults();
  if (!Array.isArray(argv)) return args;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (typeof token !== 'string' || !token.startsWith('--')) continue;

    const { name, inlineValue } = splitToken(token);
    if (name === '') continue; // bare `--` separator / 単独の `--` 区切り

    // Pull the next token as the value when the flag needs one and no `=` was used.
    // 値を取るフラグで `=` が使われていないときは次のトークンを値として取る。
    const takeValue = () => {
      if (inlineValue !== null) return inlineValue;
      const next = argv[i + 1];
      if (typeof next === 'string' && !next.startsWith('--')) {
        i += 1;
        return next;
      }
      return null;
    };

    switch (name) {
      case 'debug':
        args.debug = true;
        break;
      case 'vr':
        args.windowMode = 'vr';
        break;
      case 'desktop-keyboard':
        args.windowMode = 'desktop';
        break;
      case 'perf-log':
        args.perfLog = true;
        break;
      case 'keep-idle-cursors':
        args.keepIdleCursors = true;
        break;
      case 'pose-ahead': {
        const value = parsePositiveNumber(takeValue());
        if (value !== null) args.poseAheadSec = value;
        break;
      }
      case 'pointer-filter': {
        const value = parsePointerFilter(takeValue());
        if (value !== null) args.pointerFilter = value;
        break;
      }
      case 'cursor-epsilon': {
        const value = parsePositiveNumber(takeValue());
        if (value !== null) args.cursorEpsilon = value;
        break;
      }
      default:
        // Unknown flags (including Chromium's own switches) are ignored.
        // 未知のフラグ (Chromium 自身のスイッチを含む) は無視する。
        break;
    }
  }

  return args;
}
