// Global TypeScript declarations / グローバルTypeScript宣言
// This file defines global types and constants / このファイルはグローバル型と定数を定義

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
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  logConfigChange: (
    key: string,
    oldValue: any,
    newValue: any,
  ) => Promise<{ success: boolean; error?: string }>;
  sendTypingStatus: (isTyping: boolean) => Promise<{ success: boolean; error?: string }>;
  resetOverlayPosition: () => Promise<{ success: boolean }>;
  sendWindowSize: (width: number, height: number) => void;
  sendRendererMetrics: (metrics: {
    width: number;
    height: number;
    devicePixelRatio: number;
  }) => void;
  getOverlaySettings: () => Promise<{ success: boolean; settings: { useOffscreenCapture: boolean; forceOpaqueAlpha: boolean; disableOverlay: boolean } }>;
  setOverlaySettings: (settings: { useOffscreenCapture?: boolean; forceOpaqueAlpha?: boolean; disableOverlay?: boolean }) => Promise<{ success: boolean; settings: { useOffscreenCapture: boolean; forceOpaqueAlpha: boolean; disableOverlay: boolean } }>;
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
}

declare global {
  // APP_VERSION is defined in vite.config.ts via `define` option / APP_VERSIONはvite.config.tsの`define`オプションで定義される
  const APP_VERSION: string;

  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
