import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

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

function writeSettings(settingsPath, settings) {
  const dir = path.dirname(settingsPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
}

function readAutoLaunchFromSettings(settings, appKey) {
  const applications = isObject(settings[APPLICATIONS_SECTION])
    ? settings[APPLICATIONS_SECTION]
    : {};
  const nestedApp = isObject(applications[appKey]) ? applications[appKey] : {};
  const rootApp = isObject(settings[appKey]) ? settings[appKey] : {};

  const candidates = [
    nestedApp[AUTO_LAUNCH_KEY],
    nestedApp.autoLaunch,
    rootApp[AUTO_LAUNCH_KEY],
    rootApp.autoLaunch,
  ];
  const enabled = candidates.find((value) => typeof value === 'boolean');
  return typeof enabled === 'boolean' ? enabled : false;
}

function applyAutoLaunchToSettings(settings, appKey, enabled) {
  const applications = isObject(settings[APPLICATIONS_SECTION])
    ? settings[APPLICATIONS_SECTION]
    : {};
  const nextApplications = { ...applications };

  if (!enabled) {
    delete nextApplications[appKey];
    return {
      ...settings,
      [APPLICATIONS_SECTION]: nextApplications,
    };
  }

  const existingNestedApp = isObject(applications[appKey])
    ? applications[appKey]
    : {};

  return {
    ...settings,
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
    for (const settingsPath of readPaths) {
      try {
        const settings = loadSettingsFile(settingsPath);
        const enabled = readAutoLaunchFromSettings(settings, appKey);
        return { success: true, enabled, path: settingsPath };
      } catch (error) {
        console.warn('[SteamVR] Failed to read settings file:', settingsPath, error);
      }
    }
    return { success: true, enabled: false, path: readPaths[0] };
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
    for (const settingsPath of writePaths) {
      try {
        const current = loadSettingsFile(settingsPath);
        const nextSettings = applyAutoLaunchToSettings(current, appKey, enabled);
        writeSettings(settingsPath, nextSettings);
        updatedPaths.push(settingsPath);
      } catch (error) {
        errors.push(`${settingsPath}: ${error.message}`);
      }
    }

    if (updatedPaths.length === 0) {
      throw new Error(errors.join(' | '));
    }

    return {
      success: true,
      enabled,
      path: updatedPaths[0],
      paths: updatedPaths,
      warnings: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
