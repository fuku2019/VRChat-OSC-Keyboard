/**
 * oscService tests - Focus on sendOscMessage function
 * oscServiceテスト - sendOscMessage関数に注目
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendOscMessage } from './oscService';

// Mock WebSocket / WebSocketをモック
class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  readyState: number = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send = vi.fn();
  close = vi.fn();

  // Helper methods for tests / テスト用ヘルパーメソッド
  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  simulateMessage(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateError() {
    this.onerror?.();
  }

  simulateClose() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }
}

// Store original WebSocket / 元のWebSocketを保存
const originalWebSocket = global.WebSocket;

describe('sendOscMessage / OSCメッセージ送信', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    // Replace global WebSocket / グローバルWebSocketを置き換え
    (global as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restore original WebSocket / 元のWebSocketを復元
    (global as any).WebSocket = originalWebSocket;
  });

  describe('URL correction / URL補正', () => {
    it('converts http:// to ws://', async () => {
      const promise = sendOscMessage('test', 'http://localhost:8080');
      const ws = MockWebSocket.instances[0];
      expect(ws.url).toBe('ws://localhost:8080');
      ws.simulateOpen();
      ws.simulateMessage({ success: true });
      await promise;
    });

    it('converts https:// to wss://', async () => {
      const promise = sendOscMessage('test', 'https://localhost:8080');
      const ws = MockWebSocket.instances[0];
      expect(ws.url).toBe('wss://localhost:8080');
      ws.simulateOpen();
      ws.simulateMessage({ success: true });
      await promise;
    });

    it('adds ws:// prefix if missing', async () => {
      const promise = sendOscMessage('test', 'localhost:8080');
      const ws = MockWebSocket.instances[0];
      expect(ws.url).toBe('ws://localhost:8080');
      ws.simulateOpen();
      ws.simulateMessage({ success: true });
      await promise;
    });

    it('preserves ws:// prefix', async () => {
      const promise = sendOscMessage('test', 'ws://localhost:8080');
      const ws = MockWebSocket.instances[0];
      expect(ws.url).toBe('ws://localhost:8080');
      ws.simulateOpen();
      ws.simulateMessage({ success: true });
      await promise;
    });
  });

  describe('message sending / メッセージ送信', () => {
    it('sends correct payload on open', async () => {
      const promise = sendOscMessage('Hello', 'ws://localhost:8080', true, true);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ text: 'Hello', direct: true, sound: true }),
      );

      ws.simulateMessage({ success: true });
      await promise;
    });

    it('sends correct payload with direct=false, sound=false', async () => {
      const promise = sendOscMessage(
        'Silent',
        'ws://localhost:8080',
        false,
        false,
      );
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ text: 'Silent', direct: false, sound: false }),
      );

      ws.simulateMessage({ success: true });
      await promise;
    });
  });

  describe('success response / 成功レスポンス', () => {
    it('returns success: true when server responds with success', async () => {
      const promise = sendOscMessage('test', 'ws://localhost:8080');
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      ws.simulateMessage({ success: true });

      const result = await promise;
      expect(result).toEqual({ success: true });
    });
  });

  describe('error handling / エラーハンドリング', () => {
    it('returns error when server responds with error', async () => {
      const promise = sendOscMessage('test', 'ws://localhost:8080');
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      ws.simulateMessage({ success: false, error: 'Bridge Error' });

      const result = await promise;
      expect(result).toEqual({ success: false, error: 'Bridge Error' });
    });

    it('returns error on connection failure', async () => {
      const promise = sendOscMessage('test', 'ws://localhost:8080');
      const ws = MockWebSocket.instances[0];

      ws.simulateError();

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection Refused');
    });

    it('returns error on unexpected close', async () => {
      const promise = sendOscMessage('test', 'ws://localhost:8080');
      const ws = MockWebSocket.instances[0];

      ws.simulateClose();

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('closed unexpectedly');
    });
  });

  describe('timeout handling / タイムアウト処理', () => {
    it('times out if server does not respond', async () => {
      const promise = sendOscMessage('test', 'ws://localhost:8080');
      const ws = MockWebSocket.instances[0];

      // Advance time past timeout / タイムアウトを過ぎるまで時間を進める
      vi.advanceTimersByTime(5000);

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');
      expect(ws.close).toHaveBeenCalled();
    });
  });

  describe('legacy compatibility / レガシー互換性', () => {
    it('assumes success for valid non-JSON response', async () => {
      const promise = sendOscMessage('test', 'ws://localhost:8080');
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      // Simulate non-JSON response / 非JSONレスポンスをシミュレート
      ws.onmessage?.({ data: 'OK' });

      const result = await promise;
      expect(result).toEqual({ success: true });
    });
  });
});
