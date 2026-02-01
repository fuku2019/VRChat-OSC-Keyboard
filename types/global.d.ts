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

interface ElectronAPI {
  updateOscPort: (port: number) => Promise<UpdateOscPortResult>;
  getOscPort: () => Promise<GetOscPortResult>;
  checkForUpdate: () => Promise<CheckUpdateResult>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  logConfigChange: (key: string, oldValue: any, newValue: any) => Promise<void>;
  sendTypingStatus: (isTyping: boolean) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  // APP_VERSION is defined in vite.config.ts via `define` option / APP_VERSIONはvite.config.tsの`define`オプションで定義される
  const APP_VERSION: string;

  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
