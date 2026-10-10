import fs from 'node:fs';
import path from 'node:path';
// Keep this fork separate from upstream installs and SteamVR registrations.
// 上流版の設定保存先とSteamVR登録を共有しない。
export const APP_ID = 'io.github.vrcliveime';
export const APP_NAME = 'VrcLiveIme';
export const STEAMVR_APP_KEY = 'vrcliveime.keyboard';
// Configure a fork-owned feed before enabling updates. Never use upstream's feed.
export const UPDATE_API_URL = null;

export function configureAppIdentity(app) {
  app.setName(APP_NAME);
  const userData = path.join(app.getPath('appData'), APP_NAME);
  fs.mkdirSync(userData, { recursive: true });
  app.setPath('userData', userData);
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
}
