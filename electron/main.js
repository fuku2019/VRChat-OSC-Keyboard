import { app, BrowserWindow, dialog } from 'electron';
import { WebSocketServer } from 'ws';
import { Client } from 'node-osc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

// --- OSC Bridge Logic (Integrated) ---
const OSC_IP = '127.0.0.1';
const OSC_PORT = 9000;
const WS_PORT = 8080;
const WS_HOST = '127.0.0.1'; // Explicitly bind to localhost for security

let oscClient;
let wss;

function startBridge() {
  console.log('⚡ Starting OSC Bridge in Electron Main Process...');
  try {
    oscClient = new Client(OSC_IP, OSC_PORT);
    
    // Bind specifically to localhost to avoid triggering firewall "Public Network" warnings
    wss = new WebSocketServer({ port: WS_PORT, host: WS_HOST });

    console.log(`⚡ WebSocket listening on ws://${WS_HOST}:${WS_PORT}`);
    console.log(`➡️  Forwarding to VRChat at ${OSC_IP}:${OSC_PORT}`);

    wss.on('connection', (ws) => {
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.text) {
            oscClient.send('/chatbox/input', [data.text, true]);
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
        // Optional: Show error dialog to user
        // dialog.showErrorBox('Port Conflict', `Port ${WS_PORT} is already in use. Is the app already open?`);
      }
    });

  } catch (err) {
    console.error('Failed to start bridge:', err);
  }
}

// --- Electron Window Logic ---

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 700,
    frame: true,
    transparent: false,
    backgroundColor: '#020617', // Match slate-950
    icon: path.join(__dirname, '../dist/icon.ico'), // Try to load icon if available
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: !app.isPackaged 
    },
  });

  // Hide menu bar for cleaner look
  mainWindow.setMenuBarVisibility(false);

  // In development, load from Vite server. In production, load built file.
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
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
    // Close bridge connections
    if (wss) wss.close();
    if (oscClient) oscClient.close();
    app.quit();
  }
});
