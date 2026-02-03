/**
 * Sends messages via WebSocket to the local Node.js OSC bridge.
 * The browser connects to server.js (ws://localhost:8080), which uses node-osc to talk to VRChat.
 *
 * WebSocket経由でローカルのNode.js OSCブリッジにメッセージを送信します。
 * ブラウザはserver.js (ws://localhost:8080) に接続し、そこからnode-oscを使用してVRChatと通信します。
 */

import { TIMEOUTS } from '../constants';

interface OscResponse {
  success: boolean;
  error?: string;
}

export const sendOscMessage = async (
  text: string,
  bridgeUrl: string,
  direct: boolean = true,
  sound: boolean = true,
): Promise<OscResponse> => {
  return new Promise((resolve) => {
    let isResolved = false; // Flag to prevent multiple resolves / 複数回のresolveを防ぐフラグ

    const safeResolve = (result: OscResponse) => {
      if (!isResolved) {
        isResolved = true;
        resolve(result);
      }
    };

    try {
      // Auto-correct http/https to ws/wss if user forgot / ユーザーが忘れた場合にhttp/httpsをws/wssに自動修正
      let url = bridgeUrl;
      if (url.startsWith('http://')) url = url.replace('http://', 'ws://');
      if (url.startsWith('https://')) url = url.replace('https://', 'wss://');
      if (!url.startsWith('ws')) url = 'ws://' + url;

      const ws = new WebSocket(url);

      // Timeout to prevent hanging if server is down / サーバーがダウンしている場合のハングを防ぐためのタイムアウト
      const timeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.CLOSED) ws.close();
        safeResolve({
          success: false,
          error: "Timeout: Is 'node server.js' running?",
        });
      }, TIMEOUTS.OSC_CONNECTION);

      ws.onopen = () => {
        // Send payload / ペイロードを送信
        ws.send(JSON.stringify({ text, direct, sound }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          clearTimeout(timeout);
          ws.close(); // Close immediately to keep it stateless/simple / ステートレス/シンプルに保つために即座に閉じる

          if (data.success) {
            safeResolve({ success: true });
          } else {
            safeResolve({
              success: false,
              error: data.error || 'Bridge Error',
            });
          }
        } catch (e) {
          clearTimeout(timeout);
          ws.close();
          // If we got a message but couldn't parse JSON, assume success (legacy check) / メッセージを受信したがJSONを解析できなかった場合、成功と見なす（レガシーチェック）
          safeResolve({ success: true });
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        // Use safeResolve to prevent double resolution / 二重解決を防ぐためにsafeResolveを使用
        safeResolve({
          success: false,
          error: 'Connection Refused (Is server.js running?)',
        });
      };

      ws.onclose = () => {
        // Cleanup timeout if not already cleared / まだクリアされていない場合はタイムアウトをクリーンアップ
        clearTimeout(timeout);
        // Fallback resolve if neither onerror nor onmessage handled it / onerrorもonmessageも処理しなかった場合のフォールバック
        safeResolve({
          success: false,
          error: 'Connection closed unexpectedly',
        });
      };
    } catch (error: any) {
      safeResolve({
        success: false,
        error: error.message || 'WebSocket Error',
      });
    }
  });
};
