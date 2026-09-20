/**
 * Debug config loading / デバッグ設定の読み込み
 *
 * The repo-root `debug.config.json` is not shipped (it is absent from
 * package.json `build.files`), so packaged builds had no way to enable debug
 * mode at all. Reading a copy from userData first, and letting `--debug`
 * override everything, makes packaged builds debuggable without shipping the
 * repo file - which must stay unshipped because it carries update-mock flags
 * that would fire fake update notices for anyone who enabled debug mode.
 * リポジトリ直下の `debug.config.json` は出荷されない (package.json の
 * `build.files` に含まれない) ため、パッケージ版ではデバッグモードを有効化する
 * 手段が存在しなかった。userData 側のコピーを先に読み、`--debug` が全てを上書き
 * するようにすることで、リポジトリのファイルを出荷せずにパッケージ版をデバッグ
 * できるようにする。リポジトリのファイルはアップデータのモックフラグを含んでおり、
 * 出荷するとデバッグモードを有効にしたユーザーに偽の更新通知が出るため、
 * 出荷しないままにしなければならない。
 */

import fs from 'fs';
import path from 'path';

export const DEBUG_CONFIG_FILENAME = 'debug.config.json';

/**
 * The flags consumed elsewhere in the app, plus where the file came from.
 * アプリの他の箇所で参照されるフラグと、読み込み元のパス。
 *
 * @typedef {Object} DebugConfig
 * @property {boolean} enableDebugMode
 * @property {string} [source] - Path of the file that was used / 採用したファイルのパス
 * @property {boolean} [forceUpdateAvailable]
 * @property {string} [mockLatestVersion]
 * @property {boolean} [forceInstallerVersion]
 */

/** @type {DebugConfig} */
const DEFAULT_DEBUG_CONFIG = { enableDebugMode: false };

function readJsonIfPresent(target) {
  if (!target) return null;
  try {
    if (!fs.existsSync(target)) return null;
    const parsed = JSON.parse(fs.readFileSync(target, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn(`Ignoring ${target}: not a JSON object`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`Failed to load ${target}:`, err.message);
    return null;
  }
}

/**
 * Resolve the debug config. The first readable file wins; `--debug` then
 * forces debug mode on regardless of what the file said.
 * デバッグ設定を解決する。最初に読めたファイルが採用され、そのうえで `--debug` が
 * ファイルの内容にかかわらずデバッグモードを強制的に有効にする。
 *
 * @param {Object} options
 * @param {string} [options.userDataDir] - app.getPath('userData')
 * @param {string} [options.appDir] - Repository/app root holding the dev copy / 開発用コピーを置くアプリのルート
 * @param {{debug?: boolean}} [options.launchArgs] - Parsed launch args / 解析済みの起動引数
 * @returns {DebugConfig}
 */
export function loadDebugConfig({
  userDataDir = null,
  appDir = null,
  launchArgs = {},
} = {}) {
  const candidates = [];
  if (userDataDir) candidates.push(path.join(userDataDir, DEBUG_CONFIG_FILENAME));
  if (appDir) candidates.push(path.join(appDir, DEBUG_CONFIG_FILENAME));

  /** @type {DebugConfig} */
  let config = { ...DEFAULT_DEBUG_CONFIG };
  for (const candidate of candidates) {
    const parsed = readJsonIfPresent(candidate);
    if (parsed) {
      config = { ...DEFAULT_DEBUG_CONFIG, ...parsed, source: candidate };
      break;
    }
  }

  if (launchArgs.debug === true) {
    config.enableDebugMode = true;
  }

  return config;
}
