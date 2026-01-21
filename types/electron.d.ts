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

interface ElectronAPI {
  updateOscPort: (port: number) => Promise<UpdateOscPortResult>;
  getOscPort: () => Promise<GetOscPortResult>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
