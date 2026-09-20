import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { writeFileAtomicSync } from './atomicWrite.js';

const SETTINGS_FILE_NAME = 'steamvr.vrsettings';
const APPLICATIONS_SECTION = 'applications';
const AUTO_LAUNCH_KEY = 'AutoLaunch';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveWindowsSteamPathFromRegistry() {
  try {
    const output = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { encoding: 'utf-8', windowsHide: true },
    );
    const lines = output.split(/\r?\n/);
    const line = lines.find((entry) => entry.includes('SteamPath'));
    if (!line) return null;
    const parts = line.trim().split(/\s{2,}/);
    const value = parts[parts.length - 1];
    return value ? value.replace(/\//g, path.sep) : null;
  } catch {
    return null;
  }
}

function getSteamVrSettingsPaths() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const steamFromRegistry = resolveWindowsSteamPathFromRegistry();
    const candidates = [
      steamFromRegistry
        ? path.join(steamFromRegistry, 'config', SETTINGS_FILE_NAME)
        : null,
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Steam', 'config', SETTINGS_FILE_NAME),
      path.join(process.env.PROGRAMFILES || '', 'Steam', 'config', SETTINGS_FILE_NAME),
      path.join(localAppData, 'openvr', SETTINGS_FILE_NAME),
    ].filter(Boolean);
    return [...new Set(candidates)];
  }

  if (process.platform === 'linux') {
    const candidates = [
      path.join(home, '.steam', 'steam', 'config', SETTINGS_FILE_NAME),
      path.join(home, '.local', 'share', 'Steam', 'config', SETTINGS_FILE_NAME),
      path.join(
        home,
        '.var',
        'app',
        'com.valvesoftware.Steam',
        '.local',
        'share',
        'Steam',
        'config',
        SETTINGS_FILE_NAME,
      ),
    ];
    return candidates;
  }

  if (process.platform === 'darwin') {
    return [
      path.join(
        home,
        'Library',
        'Application Support',
        'Steam',
        'config',
        SETTINGS_FILE_NAME,
      ),
      path.join(
        home,
        'Library',
        'Application Support',
        'OpenVR',
        SETTINGS_FILE_NAME,
      ),
    ];
  }

  return [path.join(home, '.steam', 'steam', 'config', SETTINGS_FILE_NAME)];
}

function loadSettingsFile(settingsPath) {
  if (!fs.existsSync(settingsPath)) {
    return {};
  }

  const raw = fs.readFileSync(settingsPath, 'utf-8');
  if (!raw.trim()) {
    return {};
  }

  const parsed = JSON.parse(raw);
  if (!isObject(parsed)) {
    throw new Error(`${settingsPath} root is not a JSON object`);
  }
  return parsed;
}

// Compare two settings objects as they would be serialized to disk.
// ディスクに書き出した場合の内容が同じかどうかを比較する。
function isSameSettings(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function writeSettings(settingsPath, settings) {
  // This rewrites the whole steamvr.vrsettings, which holds settings unrelated
  // to this app, so it must never be left half-written.
  // steamvr.vrsettings は本アプリと無関係な設定も含むファイル全体を書き直すため、
  // 中途半端な状態で残してはならない。
  writeFileAtomicSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

function readAutoLaunchFromSettings(settings, appKey) {
  const applications = isObject(settings[APPLICATIONS_SECTION])
    ? settings[APPLICATIONS_SECTION]
    : {};
  const nestedApp = isObject(applications[appKey]) ? applications[appKey] : {};
  const rootApp = isObject(settings[appKey]) ? settings[appKey] : {};

  // Prefer current format under "applications". Only use root-level legacy keys
  // as a fallback when the app is not represented in applications.
  if (isObject(applications[appKey])) {
    const nestedCandidates = [nestedApp[AUTO_LAUNCH_KEY], nestedApp.autoLaunch];
    const nestedEnabled = nestedCandidates.find(
      (value) => typeof value === 'boolean',
    );
    return typeof nestedEnabled === 'boolean' ? nestedEnabled : false;
  }

  // If applications section exists but does not have this app, treat as disabled.
  if (isObject(settings[APPLICATIONS_SECTION])) {
    return false;
  }

  // Backward-compatible fallback for old format.
  const legacyCandidates = [rootApp[AUTO_LAUNCH_KEY], rootApp.autoLaunch];
  const legacyEnabled = legacyCandidates.find((value) => typeof value === 'boolean');
  return typeof legacyEnabled === 'boolean' ? legacyEnabled : false;
}

function applyAutoLaunchToSettings(settings, appKey, enabled) {
  const applications = isObject(settings[APPLICATIONS_SECTION])
    ? settings[APPLICATIONS_SECTION]
    : {};
  const nextApplications = { ...applications };
  const rootApp = isObject(settings[appKey]) ? settings[appKey] : null;
  const nextSettings = { ...settings };

  if (!enabled) {
    delete nextApplications[appKey];
    // Clean up legacy root-level app section so stale keys do not override status.
    if (rootApp) {
      delete nextSettings[appKey];
    }
    return {
      ...nextSettings,
      [APPLICATIONS_SECTION]: nextApplications,
    };
  }

  const existingNestedApp = isObject(applications[appKey])
    ? applications[appKey]
    : {};

  return {
    ...nextSettings,
    [APPLICATIONS_SECTION]: {
      ...nextApplications,
      [appKey]: {
        ...existingNestedApp,
        [AUTO_LAUNCH_KEY]: enabled,
      },
    },
  };
}

function resolveReadPaths() {
  const paths = getSteamVrSettingsPaths();
  const existing = paths.filter((candidate) => fs.existsSync(candidate));
  if (existing.length > 0) {
    return existing;
  }
  return paths;
}

function resolveWritePaths() {
  const paths = getSteamVrSettingsPaths();
  const existing = paths.filter((candidate) => fs.existsSync(candidate));
  // If some files already exist, update all of them for consistency.
  if (existing.length > 0) {
    return existing;
  }
  // First path is treated as primary create target when none exists.
  return paths.length > 0 ? [paths[0]] : [];
}

export function getSteamVrAutoLaunch(appKey) {
  try {
    const readPaths = resolveReadPaths();
    let fallbackPath = readPaths[0];
    let foundReadablePath = null;

    for (const settingsPath of readPaths) {
      try {
        const settings = loadSettingsFile(settingsPath);
        const enabled = readAutoLaunchFromSettings(settings, appKey);
        foundReadablePath = settingsPath;
        // In multi-path environments, prefer enabled=true if found in any path.
        // This matches observed runtime behavior better than first-path wins.
        if (enabled) {
          return { success: true, enabled: true, path: settingsPath };
        }
      } catch (error) {
        console.warn('[SteamVR] Failed to read settings file:', settingsPath, error);
      }
    }
    return {
      success: true,
      enabled: false,
      path: foundReadablePath || fallbackPath,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function setSteamVrAutoLaunch(appKey, enabled) {
  try {
    if (typeof enabled !== 'boolean') {
      throw new Error('enabled must be a boolean');
    }

    const writePaths = resolveWritePaths();
    if (writePaths.length === 0) {
      throw new Error('No steamvr.vrsettings path candidates found');
    }

    const errors = [];
    const updatedPaths = [];
    const unchangedPaths = [];
    for (const settingsPath of writePaths) {
      try {
        const exists = fs.existsSync(settingsPath);

        // Disabling has nothing to turn off in a file that does not exist yet,
        // and creating steamvr.vrsettings ourselves would hand SteamVR a file
        // it never wrote.
        // 存在しないファイルには無効化すべき設定がなく、こちらで
        // steamvr.vrsettings を作ると SteamVR が書いていないファイルを渡すことになる。
        if (!exists && !enabled) {
          unchangedPaths.push(settingsPath);
          continue;
        }

        const current = loadSettingsFile(settingsPath);
        const nextSettings = applyAutoLaunchToSettings(current, appKey, enabled);

        // Skip a no-op rewrite. main.js re-applies this setting on every launch
        // and steamvr.vrsettings is owned by SteamVR, so rewriting the whole
        // file each boot can clobber values SteamVR wrote in the meantime.
        // 変更がない場合は書き戻さない。main.js が起動のたびにこの設定を再適用し、
        // steamvr.vrsettings は SteamVR 所有のファイルであるため、毎回ファイル全体を
        // 書き直すと その間に SteamVR が書いた値を上書きしうる。
        if (exists && isSameSettings(current, nextSettings)) {
          unchangedPaths.push(settingsPath);
          continue;
        }

        writeSettings(settingsPath, nextSettings);
        updatedPaths.push(settingsPath);
      } catch (error) {
        errors.push(`${settingsPath}: ${error.message}`);
      }
    }

    if (updatedPaths.length === 0 && unchangedPaths.length === 0) {
      throw new Error(errors.join(' | '));
    }

    return {
      success: true,
      enabled,
      path: updatedPaths[0] || unchangedPaths[0],
      paths: updatedPaths,
      unchangedPaths: unchangedPaths.length > 0 ? unchangedPaths : undefined,
      warnings: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
