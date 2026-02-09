/**
 * OSC Bridge Service - Handles OSC/WebSocket communication logic
 * OSCブリッジサービス - OSC/WebSocket通信ロジックを処理
 */

import { WebSocketServer } from 'ws';
import { Client } from 'node-osc';

// Network configuration / ネットワーク設定
const OSC_IP = '127.0.0.1';
const WS_PORT_START = 8080;
const WS_PORT_END = 8099;
const WS_HOST = '127.0.0.1';

// Module state / モジュール状態
let oscClient = null;
let wss = null;
let OSC_PORT = 9000;
let ACTIVE_WS_PORT = null;

/**
 * Get current OSC port / 現在のOSCポートを取得
 */
export function getOscPort() {
  return OSC_PORT;
}

/**
 * Get active WebSocket port / アクティブなWebSocketポートを取得
 */
export function getActiveWsPort() {
  return ACTIVE_WS_PORT;
}

/**
 * Recreate OSC client with new port / 新しいポートでOSCクライアントを再作成
 */
export function updateOscClient(newPort) {
  if (OSC_PORT === newPort) {
    return;
  }

  console.log(`⚡ Updating OSC port from ${OSC_PORT} to ${newPort}`);
  OSC_PORT = newPort;

  // Close existing client / 既存のクライアントを閉じる
  if (oscClient && oscClient._socket) {
    try {
      oscClient.close();
    } catch (e) {
      // Log warning but continue - old client may already be closed / 警告をログに出力するが続行 - 古いクライアントは既に閉じている可能性がある
      console.warn(
        '[OSC] Warning closing old client (may already be closed):',
        e.message,
      );
    }
  }

  // Create new client with updated port / 更新されたポートで新しいクライアントを作成
  oscClient = new Client(OSC_IP, OSC_PORT);
  console.log(`➡️  Now forwarding to VRChat at ${OSC_IP}:${OSC_PORT}`);
}

/**
 * Try to start WebSocket server on a specific port / 特定のポートでWebSocketサーバーを起動を試みる
 */
function tryStartWebSocket(port) {
  return new Promise((resolve) => {
    let resolved = false; // Prevent multiple resolves / 複数回のresolveを防ぐ

    const testWss = new WebSocketServer({ port, host: WS_HOST });

    const cleanup = (success, data) => {
      if (resolved) return;
      resolved = true;

      if (!success && testWss) {
        try {
          testWss.close();
        } catch (e) {
          // Ignore cleanup errors / クリーンアップエラーを無視
        }
      }
      resolve(data);
    };

    testWss.on('listening', () => {
      cleanup(true, { success: true, wss: testWss });
    });

    testWss.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        cleanup(false, { success: false, error: 'Port in use' });
      } else {
        cleanup(false, { success: false, error: e.message });
      }
    });

    // Timeout in case events don't fire / イベントが発火しない場合のタイムアウト
    setTimeout(() => {
      cleanup(false, { success: false, error: 'Timeout' });
    }, 1000);
  });
}

/**
 * Start OSC Bridge / OSCブリッジを開始
 */
export async function startBridge() {
  console.log('⚡ Starting OSC Bridge in Electron Main Process...');
  try {
    oscClient = new Client(OSC_IP, OSC_PORT);

    // Try ports from WS_PORT_START to WS_PORT_END / WS_PORT_STARTからWS_PORT_ENDまでポートを試行
    for (let port = WS_PORT_START; port <= WS_PORT_END; port++) {
      console.log(`🔍 Trying port ${port}...`);
      const result = await tryStartWebSocket(port);

      if (result.success) {
        wss = result.wss;
        ACTIVE_WS_PORT = port;
        console.log(
          `✅ WebSocket listening on ws://${WS_HOST}:${ACTIVE_WS_PORT}`,
        );
        console.log(`➡️  Forwarding to VRChat at ${OSC_IP}:${OSC_PORT}`);

        // Setup WebSocket event handlers / WebSocketイベントハンドラを設定
        wss.on('connection', (ws) => {
          ws.on('message', async (message) => {
            try {
              const data = JSON.parse(message.toString());
              // Allow empty string for clearing chatbox / チャットボックスをクリアするための空文字を許可
              if (typeof data.text === 'string') {
                // Default to direct=true, sound=true if not specified / 指定がない場合はdirect=true, sound=trueをデフォルトとする
                const direct = data.direct !== undefined ? data.direct : true;
                const sound = data.sound !== undefined ? data.sound : true;

                await oscClient.send('/chatbox/input', [
                  data.text,
                  direct,
                  sound,
                ]);
                ws.send(JSON.stringify({ success: true }));
              }
            } catch (e) {
              console.error('[OSC Bridge] Error:', e);
              ws.send(
                JSON.stringify({ success: false, error: 'Bridge Error' }),
              );
            }
          });
        });

        wss.on('error', (e) => {
          console.error('[WS Server] Error:', e);
        });

        return; // Success - exit function / 成功 - 関数を終了
      } else {
        console.log(`⚠️ Port ${port} is in use, trying next...`);
      }
    }

    // All ports failed / すべてのポートが失敗
    console.error(`❌ All ports (${WS_PORT_START}-${WS_PORT_END}) are in use.`);
    const { dialog } = await import('electron');
    dialog.showErrorBox(
      'Port Unavailable / ポート使用不可',
      `All WebSocket ports (${WS_PORT_START}-${WS_PORT_END}) are in use.\nPlease close other applications and restart.\n\nすべてのWebSocketポート(${WS_PORT_START}-${WS_PORT_END})が使用中です。\n他のアプリケーションを終了して再起動してください。`,
    );
  } catch (err) {
    console.error('Failed to start bridge:', err);
  }
}

/**
 * Send typing status via OSC / OSC経由でタイピング状態を送信
 */
export async function sendTypingStatus(isTyping) {
  try {
    if (oscClient) {
      await oscClient.send('/chatbox/typing', [isTyping ? true : false]);
    }
    return { success: true };
  } catch (error) {
    console.error('[OSC] Failed to send typing status:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Cleanup bridge resources / ブリッジリソースをクリーンアップ
 */
export function cleanup() {
  if (wss) wss.close();
  if (oscClient && oscClient._socket) {
    try {
      oscClient.close();
    } catch (e) {
      console.warn('[OSC] Warning closing client on exit:', e.message);
    }
  }
}
