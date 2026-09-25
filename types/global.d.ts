// Global TypeScript declarations / グローバルTypeScript宣言
// This file defines global types and constants / このファイルはグローバル型と定数を定義

import type { ImeContext, ImeResponse } from './ime';
import type { OscConfig, VrStatus } from '../types';

// Electron API exposed via preload / preload経由で公開されるElectron API
interface UpdateOscPortResult {
  success: boolean;
  port?: number;
  error?: string;
}

interface GetOscPortResult {
  port: number;
}

interface CheckUpdateResult {
  success: boolean;
  updateAvailable: boolean;
  latestVersion?: string;
  url?: string;
  isInstaller?: boolean;
  installerUrl?: string;
  error?: string;
}

interface SteamVrAutoLaunchResult {
  success: boolean;
  enabled?: boolean;
  path?: string;
  error?: string;
}

interface ElectronAPI {
  updateOscPort: (port: number) => Promise<UpdateOscPortResult>;
  getOscPort: () => Promise<GetOscPortResult>;
  getBridgePort: () => Promise<{ port: number | null }>; // Get current WebSocket bridge port / 現在のWebSocketブリッジポートを取得
  checkForUpdate: () => Promise<CheckUpdateResult>;
  downloadUpdate: (url: string) => Promise<{ success: boolean; cancelled?: boolean; error?: string; isDebug?: boolean; destPath?: string }>;
  cancelUpdateDownload: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: (destPath: string) => Promise<{ success: boolean; error?: string; isDebug?: boolean }>;
  onUpdateDownloadProgress: (callback: (data: { progress: number }) => void) => void;
  removeUpdateDownloadProgress: (callback: (data: { progress: number }) => void) => void;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  logConfigChange: (
    key: string,
    oldValue: any,
    newValue: any,
  ) => Promise<{ success: boolean; error?: string }>;
  sendTypingStatus: (isTyping: boolean) => Promise<{ success: boolean; error?: string }>;
  imeConvert: (kana: string, context?: ImeContext) => Promise<ImeResponse>;
  imeNextCandidate: () => Promise<ImeResponse>;
  imeCommitCandidate: (
    candidateIndex?: number,
    context?: { previousWord?: string; currentInput?: string },
  ) => Promise<ImeResponse>;
  imeCancelConversion: () => Promise<ImeResponse>;
  resetOverlayPosition: () => Promise<{ success: boolean }>;
  restartApp: () => Promise<{ success: boolean; error?: string }>;
  // Check if running in debug mode  デバッグモードが有効か確認
  isDebugMode: () => Promise<boolean>;
  sendWindowSize: (width: number, height: number) => void;
  sendRendererMetrics: (metrics: {
    width: number;
    height: number;
    devicePixelRatio: number;
  }) => void;
  sendVrClickMode: (data: { controllerId: number; mode: 'press' | 'hold' | null }) => void;
  getSteamVrAutoLaunch: () => Promise<SteamVrAutoLaunchResult>;
  setSteamVrAutoLaunch: (enabled: boolean) => Promise<SteamVrAutoLaunchResult>;
  getSteamVrBindings: () => Promise<{
    success: boolean;
    bindings?: {
      initialized: boolean;
      toggleOverlay: string[];
      triggerBindings: string[];
      gripBindings: string[];
      triggerBound: boolean;
      gripBound: boolean;
    };
    error?: string;
  }>;
  openSteamVrBindingUi: () => Promise<{ success: boolean; error?: string }>;
  onCursorMove: (callback: (data: { u: number; v: number; controllerId?: number }) => void) => void;
  removeCursorMoveListener: (callback: (data: { u: number; v: number; controllerId?: number }) => void) => void;
  onCursorHide: (callback: (data: { controllerId?: number }) => void) => void;
  removeCursorHideListener: (callback: (data: { controllerId?: number }) => void) => void;
  onTriggerState: (callback: (data: { controllerId?: number; pressed?: boolean; value?: number }) => void) => void;
  removeTriggerStateListener: (callback: (data: { controllerId?: number; pressed?: boolean; value?: number }) => void) => void;
  onInputScroll: (callback: (data: { deltaY: number }) => void) => void;
  removeInputScrollListener: (callback: (data: { deltaY: number }) => void) => void;

  // Cross-window config sync / ウィンドウ間の設定同期
  broadcastConfig: (config: OscConfig) => void;
  onConfigBroadcast: (callback: (config: OscConfig) => void) => void;
  removeConfigBroadcastListener: (callback: (config: OscConfig) => void) => void;

  // Actions the settings window delegates to the keyboard window
  // 設定ウィンドウがキーボードウィンドウへ委譲する操作
  requestShowTutorial: () => Promise<{ success: boolean }>;
  requestClearHistory: () => Promise<{ success: boolean }>;
  onShowTutorial: (callback: () => void) => void;
  removeShowTutorialListener: (callback: () => void) => void;
  onClearHistory: (callback: () => void) => void;
  removeClearHistoryListener: (callback: () => void) => void;

  // Which window this is, and whether VR mode is active / 自分がどのウィンドウか、VRモードが有効か
  getLaunchInfo: () => Promise<{
    windowMode: 'vr' | 'desktop';
    isOsr: boolean;
    debug: boolean;
  }>;

  // Whether the SteamVR overlay is up yet / SteamVR オーバーレイが立ち上がったか
  getVrStatus: () => Promise<VrStatus>;
  onVrStatusChanged: (callback: (status: VrStatus) => void) => void;
  removeVrStatusChangedListener: (callback: (status: VrStatus) => void) => void;
}

declare global {
  // APP_VERSION is defined in vite.config.ts via `define` option / APP_VERSIONはvite.config.tsの`define`オプションで定義される
  const APP_VERSION: string;

  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
