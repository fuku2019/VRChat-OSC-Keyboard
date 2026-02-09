import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { app } from 'electron';
import { getAssetPath } from '../overlay/native.js';

const MANIFEST_FILE_NAME = 'vrchat-osc-keyboard.vrmanifest';

function resolveSteamPathFromRegistry() {
  try {
    const output = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { encoding: 'utf-8', windowsHide: true },
    );
    const line = output
      .split(/\r?\n/)
      .find((entry) => entry.toLowerCase().includes('steampath'));
    if (!line) return null;
    const parts = line.trim().split(/\s{2,}/);
    const value = parts[parts.length - 1];
    return value ? value.replace(/\//g, path.sep) : null;
  } catch {
    return null;
  }
}

function getVrPathRegCandidates() {
  const fromRegistry = resolveSteamPathFromRegistry();
  const steamRoots = [
    fromRegistry,
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Steam'),
    path.join(process.env.PROGRAMFILES || '', 'Steam'),
  ].filter(Boolean);

  const candidates = [];
  for (const root of steamRoots) {
    candidates.push(
      path.join(root, 'steamapps', 'common', 'SteamVR', 'bin', 'win64', 'vrpathreg.exe'),
    );
    candidates.push(
      path.join(root, 'steamapps', 'common', 'SteamVR', 'bin', 'win32', 'vrpathreg.exe'),
    );
  }
  return [...new Set(candidates)];
}

function findVrPathReg() {
  const candidates = getVrPathRegCandidates();
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function getSteamConfigPath() {
  const fromRegistry = resolveSteamPathFromRegistry();
  const candidates = [
    fromRegistry ? path.join(fromRegistry, 'config') : null,
    process.env['PROGRAMFILES(X86)']
      ? path.join(process.env['PROGRAMFILES(X86)'], 'Steam', 'config')
      : null,
    process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, 'Steam', 'config')
      : null,
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0] || null;
}

function getAppBinaryPath() {
  if (process.platform === 'win32') {
    return process.execPath;
  }
  return process.execPath;
}

function buildManifestContent() {
  const appKey = 'VRChat-OSC-Keyboard';
  const actionsPath = getAssetPath(path.join('steamvr', 'actions.json'));
  const bindingsDir = getAssetPath(path.join('steamvr', 'bindings'));
  const bindings = [
    'knuckles',
    'vive_controller',
    'holographic_controller',
    'oculus_touch',
    'pico_controller',
  ].map((controllerType) => ({
    controller_type: controllerType,
    binding_url: `file://${path.join(bindingsDir, `${controllerType}.json`).replace(/\\/g, '/')}`,
  }));

  return {
    source: 'builtin',
    applications: [
      {
        app_key: appKey,
        launch_type: 'binary',
        binary_path_windows: getAppBinaryPath(),
        is_dashboard_overlay: true,
        strings: {
          en_us: { name: 'VRChat OSC Keyboard' },
          ja_jp: { name: 'VRChat OSC Keyboard' },
        },
        action_manifest_path: actionsPath,
        default_bindings: bindings,
      },
    ],
  };
}

function ensureManifestFile() {
  const dir = path.join(app.getPath('userData'), 'steamvr');
  fs.mkdirSync(dir, { recursive: true });
  const manifestPath = path.join(dir, MANIFEST_FILE_NAME);
  const content = buildManifestContent();
  fs.writeFileSync(manifestPath, `${JSON.stringify(content, null, 2)}\n`, 'utf-8');
  return manifestPath;
}

function ensureManifestPathInAppConfig(manifestPath) {
  const configPath = getSteamConfigPath();
  if (!configPath) {
    return { success: false, error: 'Steam config path not found' };
  }

  const appConfigPath = path.join(configPath, 'appconfig.json');
  let appConfig = {};
  if (fs.existsSync(appConfigPath)) {
    const raw = fs.readFileSync(appConfigPath, 'utf-8');
    appConfig = raw.trim() ? JSON.parse(raw) : {};
  }

  const currentPaths = Array.isArray(appConfig.manifest_paths)
    ? appConfig.manifest_paths.filter((entry) => typeof entry === 'string')
    : [];

  const hasManifest = currentPaths.some(
    (entry) => path.normalize(entry) === path.normalize(manifestPath),
  );
  if (hasManifest) {
    return { success: true, appConfigPath, updated: false };
  }

  const next = {
    ...appConfig,
    manifest_paths: [...currentPaths, manifestPath],
  };
  fs.writeFileSync(appConfigPath, `${JSON.stringify(next, null, 3)}\n`, 'utf-8');
  return { success: true, appConfigPath, updated: true };
}

export function ensureSteamVrManifestRegistered() {
  try {
    if (process.platform !== 'win32') {
      return { success: false, error: 'SteamVR manifest registration is currently implemented for Windows only' };
    }

    const vrpathreg = findVrPathReg();
    if (!vrpathreg) {
      return { success: false, error: 'vrpathreg.exe not found (SteamVR may not be installed)' };
    }

    const manifestPath = ensureManifestFile();
    try {
      execFileSync(vrpathreg, ['removemanifest', manifestPath], {
        encoding: 'utf-8',
        windowsHide: true,
      });
    } catch {
      // Ignore remove errors (first registration case)
    }

    execFileSync(vrpathreg, ['addmanifest', manifestPath], {
      encoding: 'utf-8',
      windowsHide: true,
    });

    const appConfigSync = ensureManifestPathInAppConfig(manifestPath);
    if (!appConfigSync.success) {
      return {
        success: false,
        error: `Manifest add succeeded, but appconfig sync failed: ${appConfigSync.error}`,
      };
    }

    return {
      success: true,
      manifestPath,
      vrpathreg,
      appConfigPath: appConfigSync.appConfigPath,
      appConfigUpdated: appConfigSync.updated,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
