// TypeScript declarations for Electron API exposed via preload
// preload経由で公開されるElectron APIのTypeScript宣言

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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
