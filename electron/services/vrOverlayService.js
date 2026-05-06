import fs from 'fs';

import { getOverlayManager, toggleOverlayAll } from '../overlay.js';
import {
  ensureSteamVrInputFiles,
  ensureSteamVrManifestRegistered,
  getSteamVrAppKey,
} from './SteamVrManifestService.js';

const DEFAULT_POLL_HZ = 60;
export const STEAMVR_APP_KEY = getSteamVrAppKey();

const state = {
  initialized: false,
  disabled: false,
  timer: null,
};

function getManager() {
  return getOverlayManager();
}

function getManifestPath() {
  return ensureSteamVrInputFiles().actionsPath;
}

function registerManifestForBindings() {
  const result = ensureSteamVrManifestRegistered();
  if (!result?.success) {
    console.warn(
      '[SteamVR Input] manifest registration failed:',
      result?.error || 'unknown error',
    );
  }
  return result;
}

export function init() {
  if (state.disabled || state.initialized) {
    return state.initialized;
  }

  const manager = getManager();
  if (!manager || typeof manager.initInput !== 'function') {
    state.disabled = true;
    return false;
  }

  const manifestPath = getManifestPath();
  if (!fs.existsSync(manifestPath)) {
    console.warn(`[SteamVR Input] actions.json not found: ${manifestPath}`);
    state.disabled = true;
    return false;
  }

  try {
    registerManifestForBindings();
    manager.initInput(manifestPath);
    state.initialized = true;
    return true;
  } catch (error) {
    console.warn('[SteamVR Input] init failed:', error);
    state.disabled = true;
    return false;
  }
}

export function startPolling(hz = DEFAULT_POLL_HZ) {
  if (state.timer || state.disabled) {
    return;
  }
  if (!state.initialized && !init()) {
    return;
  }

  const manager = getManager();
  if (!manager || typeof manager.pollToggleClicked !== 'function') {
    return;
  }

  const intervalMs = Math.max(1, Math.floor(1000 / hz));
  state.timer = setInterval(() => {
    try {
      if (manager.pollToggleClicked()) {
        toggleOverlayAll();
      }
    } catch (error) {
      console.warn('[SteamVR Input] poll failed, stopping:', error);
      stop();
      state.disabled = true;
    }
  }, intervalMs);
}

export function stop() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

export function getCurrentBindings() {
  if (!state.initialized && !init()) {
    return {
      initialized: false,
      toggleOverlay: [],
      triggerBindings: [],
      gripBindings: [],
      triggerBound: false,
      gripBound: false,
    };
  }

  const manager = getManager();
  if (!manager || typeof manager.getCurrentBindings !== 'function') {
    return {
      initialized: false,
      toggleOverlay: [],
      triggerBindings: [],
      gripBindings: [],
      triggerBound: false,
      gripBound: false,
    };
  }

  return manager.getCurrentBindings();
}

export function openBindingUI(showOnDesktop = false) {
  registerManifestForBindings();
  if (!state.initialized && !init()) {
    throw new Error('SteamVR input is not initialized');
  }

  const manager = getManager();
  if (!manager || typeof manager.openBindingUi !== 'function') {
    throw new Error('openBindingUi is not available');
  }

  manager.openBindingUi(STEAMVR_APP_KEY, showOnDesktop);
}

export function getState() {
  return { ...state };
}

export function _resetForTests() {
  stop();
  state.initialized = false;
  state.disabled = false;
}
