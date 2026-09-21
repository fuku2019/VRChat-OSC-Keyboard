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
  loggedNotReady: false,
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

/**
 * `state.disabled` is a permanent latch, so only a permanent failure may set
 * it. "The overlay manager does not exist yet" is not one.
 * `state.disabled` は一度立つと戻らないラッチなので、恒久的な失敗だけが立てて
 * よい。「オーバーレイマネージャーがまだ存在しない」はそれに当たらない。
 *
 * The manager is created by the SteamVR bootstrap, which is deliberately
 * deferred to a later tick and shells out to vrpathreg and tasklist before it
 * gets there. Anything that asks about bindings in the meantime used to latch
 * this service off for the rest of the session, silently. In VR mode the
 * settings window opens at startup and asks immediately, so SteamVR input was
 * dead for the whole session - no bindings, no overlay toggle - while every
 * OpenVR call the app did make reported success. Desktop mode has no settings
 * window at startup and so never hit it, and in development the renderer loads
 * from the Vite server slowly enough that the bootstrap usually won the race.
 * マネージャーはSteamVR初期化処理が作るが、この処理は意図的に後のティックへ回され、
 * しかもそこへ至る前に vrpathreg と tasklist を起動する。その間にバインディングを
 * 問い合わせたものは、これまでこのサービスをセッション中ずっと無言で無効化して
 * いた。VRモードでは設定ウィンドウが起動時に開いて即座に問い合わせるため、
 * SteamVR入力はセッション中ずっと死んでいた - バインディングもオーバーレイの
 * トグルも効かない - にもかかわらず、アプリが実際に行ったOpenVR呼び出しはすべて
 * 成功を報告していた。デスクトップモードは起動時に設定ウィンドウを持たないため
 * 踏まず、開発時はレンダラーがViteサーバーから読み込まれる分だけ遅く、初期化処理が
 * 競争に勝つのが通常だった。
 */
export function init() {
  if (state.disabled) return false;
  if (state.initialized) return true;

  const manager = getManager();
  if (!manager || typeof manager.initInput !== 'function') {
    if (!state.loggedNotReady) {
      state.loggedNotReady = true;
      console.log(
        '[SteamVR Input] overlay manager not ready yet, deferring initialization',
      );
    }
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
