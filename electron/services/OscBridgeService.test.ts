/**
 * OscBridgeService tests - Focus on payload format and empty string handling
 * OscBridgeServiceテスト - payload形式と空文字処理に注目
 */
import { describe, it, expect } from 'vitest';
import { parseChatboxMessagePayload } from './OscBridgeService.js';

describe('OscBridgeService payload format / OscBridgeServiceのpayload形式', () => {
  describe('OSC message payload / OSCメッセージのpayload', () => {
    it('validates payload shape before forwarding', () => {
      expect(parseChatboxMessagePayload(null).success).toBe(false);
      expect(parseChatboxMessagePayload({}).success).toBe(false);
      expect(parseChatboxMessagePayload({ text: 123 }).success).toBe(false);
      expect(
        parseChatboxMessagePayload({ text: 'ok', direct: 'yes', sound: true })
          .success,
      ).toBe(false);
    });

    it('accepts empty text and defaults flags to true', () => {
      const result = parseChatboxMessagePayload({ text: '' });
      expect(result).toEqual({ success: true, args: ['', true, true] });
    });
  });
});
