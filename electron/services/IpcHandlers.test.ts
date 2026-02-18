/**
 * IpcHandlers tests - Focus on compareVersions logic
 * IpcHandlersテスト - compareVersionsロジックに注目
 */
import { describe, it, expect } from 'vitest';
import { compareVersions, isSafeExternalUrl } from './IpcHandlers.js';

describe('compareVersions / バージョン比較', () => {
  describe('basic comparison / 基本比較', () => {
    it('returns 1 when v1 > v2', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    });

    it('returns -1 when v1 < v2', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    });

    it('returns 0 when v1 == v2', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.3.4', '2.3.4')).toBe(0);
    });
  });

  describe('v prefix handling / vプレフィックス処理', () => {
    it('handles v prefix on first argument', () => {
      expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('v2.0.0', '1.0.0')).toBe(1);
    });

    it('handles v prefix on second argument', () => {
      expect(compareVersions('1.0.0', 'v1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', 'v2.0.0')).toBe(-1);
    });

    it('handles v prefix on both arguments', () => {
      expect(compareVersions('v1.0.0', 'v1.0.0')).toBe(0);
      expect(compareVersions('v2.0.0', 'v1.0.0')).toBe(1);
    });
  });

  describe('different version lengths / 異なるバージョン長', () => {
    it('handles missing patch version', () => {
      expect(compareVersions('1.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.0')).toBe(0);
    });

    it('handles missing minor and patch versions', () => {
      expect(compareVersions('1', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '1')).toBe(0);
    });

    it('handles extended version numbers', () => {
      expect(compareVersions('1.0.0.1', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.0', '1.0.0.1')).toBe(-1);
    });
  });

  describe('edge cases / エッジケース', () => {
    it('returns 0 for non-string inputs', () => {
      expect(compareVersions(null, '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', null)).toBe(0);
      expect(compareVersions(undefined, undefined)).toBe(0);
      expect(compareVersions(123, '1.0.0')).toBe(0);
    });

    it('handles large version numbers', () => {
      expect(compareVersions('10.20.30', '10.20.29')).toBe(1);
      expect(compareVersions('100.0.0', '99.99.99')).toBe(1);
    });

    it('treats non-numeric parts as 0', () => {
      expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.0.0-alpha')).toBe(0);
    });
  });

  describe('real-world scenarios / 実際のシナリオ', () => {
    it('correctly identifies update available', () => {
      // Current: 1.3.4, Latest: 1.3.5 => update available / 更新あり
      expect(compareVersions('v1.3.5', 'v1.3.4')).toBe(1);
    });

    it('correctly identifies no update needed', () => {
      // Current: 1.3.5, Latest: 1.3.4 => no update / 更新なし
      expect(compareVersions('v1.3.4', 'v1.3.5')).toBe(-1);
    });

    it('correctly identifies same version', () => {
      // Current: 1.3.4, Latest: 1.3.4 => same / 同じ
      expect(compareVersions('v1.3.4', 'v1.3.4')).toBe(0);
    });
  });
});

describe('isSafeExternalUrl / 外部URL検証', () => {
  it('allows only http/https URLs', () => {
    expect(isSafeExternalUrl('https://example.com')).toBe(true);
    expect(isSafeExternalUrl('http://example.com/path')).toBe(true);
  });

  it('rejects dangerous or invalid URLs', () => {
    expect(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
    expect(isSafeExternalUrl('not-a-url')).toBe(false);
  });
});
