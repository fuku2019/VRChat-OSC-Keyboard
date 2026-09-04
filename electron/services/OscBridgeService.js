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

function closeOscClient() {
  // Always attempt close() rather than gating on node-osc's private _socket:
  // if that internal field ever changes shape the UDP socket would silently
  // leak. A close() on a half-constructed client just throws and is ignored.
  // node-osc の内部フィールド _socket の有無で判定せず、常に close() を試みる。
  // 内部実装が変わるとUDPソケットが黙ってリークするため。未初期化のクライアントに
  // 対する close() は例外になるだけなので握りつぶす。
  if (oscClient) {
    try {
      oscClient.close();
    } catch (e) {
      console.warn('[OSC] Warning closing client:', e.message);
    }
  }
  oscClient = null;
}

function closeWebSocketServer() {
  if (wss) {
    try {
      wss.close();
    } catch (e) {
      console.warn('[WS] Warning closing server:', e.message);
    }
  }
  wss = null;
  ACTIVE_WS_PORT = null;
}

export function parseChatboxMessagePayload(data) {
  if (!data || typeof data !== 'object') {
    return { success: false, error: 'Invalid payload' };
  }
  if (typeof data.text !== 'string') {
    return { success: false, error: 'text must be a string' };
  }

  const direct = data.direct !== undefined ? data.direct : true;
  const sound = data.sound !== undefined ? data.sound : true;
  if (typeof direct !== 'boolean' || typeof sound !== 'boolean') {
    return { success: false, error: 'direct and sound must be booleans' };
  }

  return { success: true, args: [data.text, direct, sound] };
}

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
  closeOscClient();

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
    let timeoutId = null;

    const testWss = new WebSocketServer({ port, host: WS_HOST });

    const cleanup = (success, data) => {
      if (resolved) return;
      resolved = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

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
    timeoutId = setTimeout(() => {
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
    // Ensure idempotent start and avoid stale resource leaks.
    closeWebSocketServer();
    closeOscClient();
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
              const payload = parseChatboxMessagePayload(data);
              if (!payload.success) {
                ws.send(
                  JSON.stringify({
                    success: false,
                    error: payload.error,
                  }),
                );
                return;
              }

              await oscClient.send('/chatbox/input', payload.args);
              ws.send(JSON.stringify({ success: true }));
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
    closeOscClient();
    const { dialog } = await import('electron');
    dialog.showErrorBox(
      'Port Unavailable / ポート使用不可',
      `All WebSocket ports (${WS_PORT_START}-${WS_PORT_END}) are in use.\nPlease close other applications and restart.\n\nすべてのWebSocketポート(${WS_PORT_START}-${WS_PORT_END})が使用中です。\n他のアプリケーションを終了して再起動してください。`,
    );
  } catch (err) {
    console.error('Failed to start bridge:', err);
    closeWebSocketServer();
    closeOscClient();
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
  closeWebSocketServer();
  closeOscClient();
}
