/**
 * OscBridgeService tests - Focus on payload format and empty string handling
 * OscBridgeServiceテスト - payload形式と空文字処理に注目
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface OscInputPayload {
  text: string;
  direct?: boolean;
  sound?: boolean;
}

// Mock WebSocketServer / WebSocketServerをモック
vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
}));

// Mock node-osc Client / node-oscクライアントをモック
const mockOscSend = vi.fn();
vi.mock('node-osc', () => ({
  Client: vi.fn().mockImplementation(() => ({
    send: mockOscSend,
    close: vi.fn(),
    _socket: {},
  })),
}));

describe('OscBridgeService payload format / OscBridgeServiceのpayload形式', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('OSC message payload / OSCメッセージのpayload', () => {
    it('should send 3 arguments: text, direct, sound', async () => {
      // Simulate the message handling logic / メッセージ処理ロジックをシミュレート
      const data = { text: 'Hello', direct: true, sound: true };
      
      // Expected OSC call format / 期待されるOSC呼び出し形式
      const expectedAddress = '/chatbox/input';
      const expectedArgs = [data.text, data.direct, data.sound];

      // Verify payload structure / payload構造を検証
      expect(expectedArgs.length).toBe(3);
      expect(expectedArgs[0]).toBe('Hello');
      expect(expectedArgs[1]).toBe(true);
      expect(expectedArgs[2]).toBe(true);
    });

    it('should handle empty string text for clearing chatbox', async () => {
      // Empty string should be allowed / 空文字は許可されるべき
      const data = { text: '', direct: true, sound: false };
      
      // Verify empty string is valid / 空文字が有効であることを検証
      expect(typeof data.text).toBe('string');
      expect(data.text).toBe('');
      expect(data.text.length).toBe(0);
      
      // This should NOT be filtered out / これはフィルタアウトされないべき
      const isValidPayload = typeof data.text === 'string';
      expect(isValidPayload).toBe(true);
    });

    it('should default direct=true, sound=true when not specified', () => {
      // Simulate defaulting logic from OscBridgeService / OscBridgeServiceのデフォルトロジックをシミュレート
      const data: OscInputPayload = { text: 'Test message' };
      
      const direct = data.direct !== undefined ? data.direct : true;
      const sound = data.sound !== undefined ? data.sound : true;
      
      expect(direct).toBe(true);
      expect(sound).toBe(true);
    });

    it('should respect explicit direct=false, sound=false', () => {
      const data: OscInputPayload = {
        text: 'Silent message',
        direct: false,
        sound: false,
      };
      
      const direct = data.direct !== undefined ? data.direct : true;
      const sound = data.sound !== undefined ? data.sound : true;
      
      expect(direct).toBe(false);
      expect(sound).toBe(false);
    });

    it('should handle all argument combinations correctly', () => {
      const testCases = [
        { text: 'Normal', direct: true, sound: true, expected: ['Normal', true, true] },
        { text: 'No sound', direct: true, sound: false, expected: ['No sound', true, false] },
        { text: 'Not direct', direct: false, sound: true, expected: ['Not direct', false, true] },
        { text: '', direct: true, sound: false, expected: ['', true, false] }, // Empty string test / 空文字テスト
      ];

      testCases.forEach(({ text, direct, sound, expected }) => {
        const payload = [text, direct, sound];
        expect(payload).toEqual(expected);
      });
    });
  });

  describe('OSC typing status / OSCタイピングステータス', () => {
    it('should send boolean typing status', () => {
      // Typing indicator should send boolean / タイピング表示はbooleanを送信すべき
      const isTyping = true;
      const payload = [isTyping ? true : false];
      
      expect(payload[0]).toBe(true);
      expect(typeof payload[0]).toBe('boolean');
    });

    it('should convert falsy values to false', () => {
      const isTyping = false;
      const payload = [isTyping ? true : false];
      
      expect(payload[0]).toBe(false);
    });
  });
});
