import { app, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// Allowed domains for download URLs / ダウンロードURL用の許可ドメイン
const ALLOWED_DOWNLOAD_DOMAINS = [
  'github.com',
  'objects.githubusercontent.com',
];

const isInstallerVersion = (debugConfig) => {
  if (debugConfig.enableDebugMode) {
    return debugConfig.forceInstallerVersion;
  }
  if (!app.isPackaged) return false;
  try {
    const exeDir = path.dirname(app.getPath('exe'));
    const uninstallerPath = path.join(
      exeDir,
      'Uninstall VRChat-OSC-Keyboard.exe',
    );
    return fs.existsSync(uninstallerPath);
  } catch (error) {
    return false;
  }
};
// GitHub repository info / GitHubリポジトリ情報
const GITHUB_API_URL =
  'https://api.github.com/repos/fuku2019/VRC-OSC-Keyboard/releases/latest';

export function isSafeExternalUrl(url) {
  if (typeof url !== 'string' || !url.trim()) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Validate URL is safe for downloading (domain whitelist) / ダウンロード用URLの安全性を検証（ドメインホワイトリスト）
 */
export function isSafeDownloadUrl(url) {
  if (!isSafeExternalUrl(url)) return false;
  try {
    const parsed = new URL(url);
    return ALLOWED_DOWNLOAD_DOMAINS.some(
      (domain) =>
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

/**
 * Helper for semantic version comparison / セマンティックバージョン比較用ヘルパー
 */
export function compareVersions(v1, v2) {
  // Handle non-string inputs / 文字列以外が渡された場合の対処
  if (typeof v1 !== 'string' || typeof v2 !== 'string') return 0;

  const clean = (v) =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((part) => {
        const num = parseInt(part, 10);
        return isNaN(num) ? 0 : num; // Treat non-numeric parts as 0 / 数値以外は0として扱う
      });

  const parts1 = clean(v1);
  const parts2 = clean(v2);
  const len = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < len; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * Register System related IPC handlers / システム関連のIPCハンドラを登録
 */
export function registerSystemIpcHandlers(
  APP_VERSION,
  debugConfig = { enableDebugMode: false },
) {
  // Check for updates / 更新を確認
  ipcMain.handle('check-for-update', async () => {
    try {
      if (debugConfig.enableDebugMode) {
        const isInstaller = isInstallerVersion(debugConfig);
        return {
          success: true,
          updateAvailable: debugConfig.forceUpdateAvailable,
          latestVersion: debugConfig.mockLatestVersion,
          url: 'https://github.com/fuku2019/VRC-OSC-Keyboard/releases',
          isInstaller,
          installerUrl: isInstaller
            ? 'https://example.com/dummy-installer.exe'
            : undefined,
        };
      }

      // Disable cache to ensure fresh data / キャッシュを無効化して最新データを確保
      const response = await fetch(GITHUB_API_URL, {
        headers: {
          'Cache-Control': 'no-cache',
          'User-Agent': `VRC-OSC-Keyboard/${APP_VERSION}`, // Add User-Agent as per GitHub API requirements
        },
      });

      if (!response.ok) {
        // #10: Handle rate limit specifically / レート制限を個別に処理
        if (response.status === 403 || response.status === 429) {
          console.warn(
            `GitHub API rate limit reached: ${response.status} ${response.statusText}`,
          );
          throw new Error(
            'GitHub API rate limit reached. Please try again later.',
          );
        }
        console.error(
          `GitHub API Error: ${response.status} ${response.statusText}`,
        );
        throw new Error(
          `GitHub API Error: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      const latestVersion = data.tag_name;

      // Validate response data / レスポンスデータの検証
      if (!latestVersion) {
        throw new Error('Invalid response from GitHub: tag_name missing');
      }

      const currentVersion = APP_VERSION.startsWith('v')
        ? APP_VERSION
        : `v${APP_VERSION}`;

      // Compare versions using semver logic / セマンティックバージョニングロジックで比較
      // latest > current => update available
      const updateAvailable =
        compareVersions(latestVersion, currentVersion) > 0;

      let isInstaller = false;
      let installerUrl = undefined;

      if (updateAvailable) {
        isInstaller = isInstallerVersion(debugConfig);
        if (isInstaller && data.assets && Array.isArray(data.assets)) {
          // Find the executable asset / 実行ファイルアセットを検索
          const exeAsset = data.assets.find(
            (asset) =>
              asset.name.endsWith('.exe') &&
              !asset.name.startsWith('Uninstall'),
          );
          if (exeAsset) {
            installerUrl = exeAsset.browser_download_url;
          }
        }
      }

      return {
        success: true,
        updateAvailable,
        latestVersion,
        url: data.html_url,
        isInstaller,
        installerUrl,
      };
    } catch (error) {
      console.error('Failed to check for updates:', error);
      return { success: false, error: error.message };
    }
  });

  // Open external URL / 外部URLを開く
  ipcMain.handle('open-external', async (event, url) => {
    try {
      if (!isSafeExternalUrl(url)) {
        return { success: false, error: 'Invalid or unsupported URL' };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Failed to open external URL:', error);
      return { success: false, error: error.message };
    }
  });

  let updateAbortController = null;

  // Download update / アップデートをダウンロード
  ipcMain.handle('download-update', async (event, url) => {
    try {
      // #3: Prevent concurrent downloads / 並行ダウンロードを防止
      if (updateAbortController) {
        return { success: false, error: 'A download is already in progress' };
      }

      if (debugConfig.enableDebugMode) {
        // #9: Log URL validation in debug mode / デバッグモードでもURL検証結果をログ出力
        console.log(
          `[DEBUG] download-update called with url: ${url} (safe=${isSafeDownloadUrl(url)})`,
        );
        // Simulate progress for debugging / デバッグ用の進捗シミュレーション
        updateAbortController = new AbortController();
        for (let i = 0; i <= 100; i += 2) {
          if (!updateAbortController || updateAbortController.signal.aborted) {
            // #5: Clear AbortController on cancel / キャンセル時にAbortControllerをクリア
            updateAbortController = null;
            return { success: false, cancelled: true };
          }
          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('update-download-progress', { progress: i });
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        updateAbortController = null;
        return { success: true, isDebug: true, destPath: 'dummy-path.exe' };
      }

      // #1: Validate download URL domain / ダウンロードURLのドメインを検証
      if (!isSafeDownloadUrl(url)) {
        return { success: false, error: 'Invalid or untrusted download URL' };
      }

      const tempDir = app.getPath('temp');
      const fileName = 'VRC-OSC-Keyboard-Update.exe';
      const destPath = path.join(tempDir, fileName);

      updateAbortController = new AbortController();

      // Download the file / ファイルをダウンロード
      const response = await fetch(url, {
        signal: updateAbortController.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Failed to download: ${response.status} ${response.statusText}`,
        );
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;
      let lastSentProgress = -1;
      // #6: Track indeterminate state to avoid repeated IPC sends / 不確定状態を追跡してIPC送信の繰り返しを防止
      let indeterminateSent = false;

      const reader = response.body.getReader();
      // #4/#8: Stream to file instead of buffering in memory / メモリにバッファリングせずファイルにストリーム書き込み
      const writeStream = fs.createWriteStream(destPath);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value) {
            // Write chunk directly to file / チャンクを直接ファイルに書き込む
            await new Promise((resolve, reject) => {
              if (!writeStream.write(value)) {
                writeStream.once('drain', resolve);
              } else {
                resolve();
              }
              writeStream.once('error', reject);
            });
            loaded += value.length;
            if (event.sender && !event.sender.isDestroyed()) {
              if (total > 0) {
                const progress = Math.round((loaded / total) * 100);
                // Only send when progress changes / 進捗が変化した時のみ送信
                if (progress !== lastSentProgress) {
                  event.sender.send('update-download-progress', { progress });
                  lastSentProgress = progress;
                }
              } else if (!indeterminateSent) {
                // #6: Send indeterminate progress only once / 不確定な進捗は1回のみ送信
                event.sender.send('update-download-progress', { progress: -1 });
                indeterminateSent = true;
              }
            }
          }
        }
      } finally {
        // Ensure write stream is closed / 書き込みストリームを確実に閉じる
        await new Promise((resolve) => writeStream.end(resolve));
      }

      // Ensure 100% progress is sent at the end / 最後に確実に100%の進捗を送信
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('update-download-progress', { progress: 100 });
      }

      // #11: Verify downloaded file size if content-length was available / content-lengthが利用可能な場合、ダウンロードファイルサイズを検証
      if (total > 0) {
        const stat = fs.statSync(destPath);
        if (stat.size !== total) {
          // Remove incomplete file / 不完全なファイルを削除
          fs.unlinkSync(destPath);
          throw new Error(
            `Downloaded file size mismatch: expected ${total} bytes, got ${stat.size} bytes`,
          );
        }
      }

      updateAbortController = null;
      return { success: true, destPath };
    } catch (error) {
      updateAbortController = null;
      if (error.name === 'AbortError') {
        // Clean up partial download on cancel / キャンセル時に途中のダウンロードファイルを削除
        try {
          const tempDir = app.getPath('temp');
          const partialPath = path.join(tempDir, 'VRC-OSC-Keyboard-Update.exe');
          if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath);
        } catch {
          /* Ignore cleanup errors / クリーンアップエラーを無視 */
        }
        return { success: false, cancelled: true };
      }
      console.error('Failed to download update:', error);
      return { success: false, error: error.message };
    }
  });

  // Cancel download / ダウンロードをキャンセル
  ipcMain.handle('cancel-update-download', async () => {
    if (updateAbortController) {
      updateAbortController.abort();
      updateAbortController = null;
      return { success: true };
    }
    return { success: false, error: 'No active download' };
  });

  // Install update / アップデートをインストール
  ipcMain.handle('install-update', async (event, destPath) => {
    try {
      if (debugConfig.enableDebugMode) {
        console.log(`[DEBUG] install-update called with destPath: ${destPath}`);
        return { success: true, isDebug: true };
      }
      if (!destPath || !fs.existsSync(destPath)) {
        return { success: false, error: 'Installer file not found' };
      }

      // #2: Validate destPath is within temp directory / destPathがtempディレクトリ内であることを検証
      const tempDir = app.getPath('temp');
      const resolvedPath = path.resolve(destPath);
      if (!resolvedPath.startsWith(path.resolve(tempDir))) {
        return { success: false, error: 'Invalid installer path' };
      }

      // Run the installer / インストーラーを実行
      const installer = spawn(resolvedPath, [], {
        detached: true,
        stdio: 'ignore',
      });
      installer.unref();

      // Quit the app so the installer can run / インストーラーが実行できるようアプリを終了
      app.quit();
      return { success: true };
    } catch (error) {
      console.error('Failed to install update:', error);
      return { success: false, error: error.message };
    }
  });

  // Log config change / 設定変更をログ出力
  ipcMain.handle('log-config-change', (event, { key, oldValue, newValue }) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ⚙️ Config Changed: ${key}`);
    console.log(`    Old: ${JSON.stringify(oldValue)}`);
    console.log(`    New: ${JSON.stringify(newValue)}`);
    console.log('----------------------------------------');
    return { success: true };
  });

  ipcMain.handle('restart-app', () => {
    try {
      app.relaunch();
      app.exit(0);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Check if running in debug mode  デバッグモードが有効か確認
  ipcMain.handle('is-debug-mode', () => {
    return debugConfig.enableDebugMode;
  });
}
