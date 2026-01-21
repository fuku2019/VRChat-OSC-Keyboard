import { app, BrowserWindow, screen, ipcMain, shell } from 'electron';
import { WebSocketServer } from 'ws';
import { Client } from 'node-osc';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Store from 'electron-store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load version info from package.json / package.jsonからバージョン情報を読み込む
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const APP_VERSION = packageJson.version;
const APP_TITLE = `VRChat OSC Keyboard ${APP_VERSION}`;

let mainWindow;

// --- OSC Bridge Logic (Integrated) --- / OSCブリッジロジック（統合済み）
const OSC_IP = '127.0.0.1';
let OSC_PORT = 9000; // Now mutable via IPC / IPCで変更可能
const WS_PORT = 8080;
const WS_HOST = '127.0.0.1'; // Explicitly bind to localhost for security / セキュリティのためにlocalhostに明示的にバインドする

let oscClient;
let wss;

// Recreate OSC client with new port / 新しいポートでOSCクライアントを再作成
function updateOscClient(newPort) {
  console.log(`⚡ Updating OSC port from ${OSC_PORT} to ${newPort}`);
  OSC_PORT = newPort;
  
  // Close existing client / 既存のクライアントを閉じる
  if (oscClient) {
    try {
      oscClient.close();
    } catch (e) {
      console.error('[OSC] Error closing old client:', e);
    }
  }
  
  // Create new client with updated port / 更新されたポートで新しいクライアントを作成
  oscClient = new Client(OSC_IP, OSC_PORT);
  console.log(`➡️  Now forwarding to VRChat at ${OSC_IP}:${OSC_PORT}`);
}

function startBridge() {
  console.log('⚡ Starting OSC Bridge in Electron Main Process...');
  try {
    oscClient = new Client(OSC_IP, OSC_PORT);

    // Bind specifically to localhost to avoid triggering firewall "Public Network" warnings / ファイアウォールの「パブリックネットワーク」警告のトリガーを避けるために、特にlocalhostにバインドする
    wss = new WebSocketServer({ port: WS_PORT, host: WS_HOST });

    console.log(`⚡ WebSocket listening on ws://${WS_HOST}:${WS_PORT}`);
    console.log(`➡️  Forwarding to VRChat at ${OSC_IP}:${OSC_PORT}`);

    wss.on('connection', (ws) => {
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.text) {
            await oscClient.send('/chatbox/input', [data.text, true]);
            ws.send(JSON.stringify({ success: true }));
          }
        } catch (e) {
          console.error('[OSC Bridge] Error:', e);
          ws.send(JSON.stringify({ success: false, error: 'Bridge Error' }));
        }
      });
    });

    wss.on('error', (e) => {
      console.error('[WS Server] Error:', e);
      if (e.code === 'EADDRINUSE') {
        console.error(`Port ${WS_PORT} is already in use.`);
        // Optional: Show error dialog to user / オプション: ユーザーにエラーダイアログを表示する
        // dialog.showErrorBox('Port Conflict', `Port ${WS_PORT} is already in use. Is the app already open?`);
      }
    });
  } catch (err) {
    console.error('Failed to start bridge:', err);
  }
}

// --- IPC Handlers for OSC Port --- / OSCポート用のIPCハンドラ

// Handle OSC port update from renderer / レンダラーからのOSCポート更新を処理
ipcMain.handle('update-osc-port', (event, port) => {
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return { success: false, error: 'Invalid port number' };
  }
  updateOscClient(portNum);
  return { success: true, port: portNum };
});

// Get current OSC port / 現在のOSCポートを取得
ipcMain.handle('get-osc-port', () => {
  return { port: OSC_PORT };
});

// Helper for semantic version comparison / セマンティックバージョン比較用ヘルパー
function compareVersions(v1, v2) {
  // Handle non-string inputs / 文字列以外が渡された場合の対処
  if (typeof v1 !== 'string' || typeof v2 !== 'string') return 0;

  const clean = (v) => v.replace(/^v/, '').split('.').map(part => {
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

// Check for updates / 更新を確認
ipcMain.handle('check-for-update', async () => {
  try {
    // Disable cache to ensure fresh data / キャッシュを無効化して最新データを確保
    const response = await fetch('https://api.github.com/repos/fuku2019/VRC-OSC-Keyboard/releases/latest', {
      headers: {
        'Cache-Control': 'no-cache',
        'User-Agent': `VRC-OSC-Keyboard/${APP_VERSION}` // Add User-Agent as per GitHub API requirements
      }
    });

    if (!response.ok) {
      console.error(`GitHub API Error: ${response.status} ${response.statusText}`);
      throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latestVersion = data.tag_name;
    
    // Validate response data / レスポンスデータの検証
    if (!latestVersion) {
        throw new Error('Invalid response from GitHub: tag_name missing');
    }

    const currentVersion = APP_VERSION.startsWith('v') ? APP_VERSION : `v${APP_VERSION}`; 
    
    // Compare versions using semver logic / セマンティックバージョニングロジックで比較
    // latest > current => update available
    const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;

    return { 
      success: true, 
      updateAvailable, 
      latestVersion, 
      url: data.html_url 
    };
  } catch (error) {
    console.error('Failed to check for updates:', error);
    return { success: false, error: error.message };
  }
});

// Open external URL / 外部URLを開く
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Failed to open external URL:', error);
    return { success: false, error: error.message };
  }
});

// --- Electron Window Logic --- / Electronウィンドウロジック

// Initialize electron-store for window position persistence / ウィンドウ位置の永続化用にelectron-storeを初期化
const store = new Store({
  name: 'window-state',
  defaults: {
    windowPosition: null, // { x: number, y: number } or null
  },
});

// Check if position is visible on any screen / 位置がいずれかの画面に表示されるかチェック
function isPositionOnScreen(x, y) {
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const { x: dx, y: dy, width, height } = display.bounds;
    // Check if position is within display bounds with some margin / 位置がディスプレイ境界内にあるかマージン付きでチェック
    return x >= dx - 100 && x < dx + width && y >= dy - 100 && y < dy + height;
  });
}

// Save window position / ウィンドウ位置を保存
function saveWindowPosition() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    store.set('windowPosition', { x: bounds.x, y: bounds.y });
  }
}

// Get saved window position or null / 保存されたウィンドウ位置を取得（存在しない場合はnull）
function getSavedWindowPosition() {
  const position = store.get('windowPosition');
  if (position && typeof position.x === 'number' && typeof position.y === 'number') {
    // Validate position is on a visible screen / 位置が表示可能な画面上にあるか検証
    if (isPositionOnScreen(position.x, position.y)) {
      return position;
    }
  }
  return null;
}


function createWindow() {
  // Get saved window position / 保存されたウィンドウ位置を取得
  const savedPosition = getSavedWindowPosition();

  const windowOptions = {
    title: APP_TITLE,
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 700,
    frame: true,
    transparent: false,
    backgroundColor: '#020617', // Match slate-950
    icon: path.join(__dirname, '../dist/icon.ico'), // Try to load icon if available / 利用可能な場合はアイコンをロードしようとする
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'), // Add preload script / プリロードスクリプトを追加
      devTools: !app.isPackaged,
    },
  };

  // Apply saved position if available / 保存された位置があれば適用
  if (savedPosition) {
    windowOptions.x = savedPosition.x;
    windowOptions.y = savedPosition.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Hide menu bar for cleaner look / 見た目をすっきりさせるためにメニューバーを隠す
  mainWindow.setMenuBarVisibility(false);

  // Prevent window title overwrite by HTML title tag / HTMLのtitleタグによるウィンドウタイトルの上書きを防ぐ
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  // Save window position when moved / ウィンドウ移動時に位置を保存
  mainWindow.on('move', () => {
    saveWindowPosition();
  });

  // In development, load from Vite server. In production, load built file. / 開発中はViteサーバーからロードする。本番環境ではビルドされたファイルをロードする。
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools(); // Open DevTools in debug mode. / デバックモード中にDevToolsを開く
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  startBridge();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Close bridge connections / ブリッジ接続を閉じる
    if (wss) wss.close();
    if (oscClient) oscClient.close();
    app.quit();
  }
});
