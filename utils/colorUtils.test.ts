/**
 * colorUtils tests / colorUtilsテスト
 */
import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  getLuminance,
  generatePalette,
  PRESET_PALETTES,
} from './colorUtils';

describe('hexToRgb / HEXからRGBへの変換', () => {
  it('converts valid 6-digit hex to RGB', () => {
    expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('#00FF00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb('#0000FF')).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('converts hex without # prefix', () => {
    expect(hexToRgb('FF0000')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('converts lowercase hex', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('converts white and black', () => {
    expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('returns null for invalid hex', () => {
    expect(hexToRgb('#GGG')).toBeNull();
    expect(hexToRgb('invalid')).toBeNull();
    expect(hexToRgb('')).toBeNull();
  });
});

describe('getLuminance / 輝度の計算', () => {
  it('returns 0 for black', () => {
    expect(getLuminance('#000000')).toBe(0);
  });

  it('returns ~1 for white', () => {
    const luminance = getLuminance('#FFFFFF');
    expect(luminance).toBeCloseTo(1, 1);
  });

  it('returns intermediate value for gray', () => {
    const luminance = getLuminance('#808080');
    expect(luminance).toBeGreaterThan(0);
    expect(luminance).toBeLessThan(1);
  });

  it('returns 0 for invalid hex', () => {
    expect(getLuminance('invalid')).toBe(0);
  });
});

describe('generatePalette / パレット生成', () => {
  it('generates palette with all shade levels', () => {
    const palette = generatePalette('#3B82F6');

    expect(palette).toHaveProperty('50');
    expect(palette).toHaveProperty('100');
    expect(palette).toHaveProperty('200');
    expect(palette).toHaveProperty('300');
    expect(palette).toHaveProperty('400');
    expect(palette).toHaveProperty('500');
    expect(palette).toHaveProperty('600');
    expect(palette).toHaveProperty('700');
    expect(palette).toHaveProperty('800');
    expect(palette).toHaveProperty('900');
  });

  it('returns empty object for invalid hex', () => {
    const palette = generatePalette('invalid');
    expect(palette).toEqual({});
  });

  it('generates valid hex colors for each shade', () => {
    const palette = generatePalette('#3B82F6');

    Object.values(palette).forEach((hex) => {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/i);
    });
  });

  it('handles dark theme', () => {
    const palette = generatePalette('#3B82F6', 'dark');
    expect(Object.keys(palette).length).toBe(10);
  });

  it('handles pure-black theme', () => {
    const palette = generatePalette('#3B82F6', 'pure-black');
    expect(Object.keys(palette).length).toBe(10);
  });

  it('handles white/very light colors in dark mode', () => {
    const palette = generatePalette('#FFFFFF', 'dark');
    expect(Object.keys(palette).length).toBe(10);
    // Shade 500 should be very bright in dark mode with white / ダークモードで白の場合、shade 500は非常に明るいはず
    const shade500Luminance = getLuminance(palette[500]);
    expect(shade500Luminance).toBeGreaterThan(0.5);
  });
});

describe('PRESET_PALETTES / プリセットパレット', () => {
  it('contains cyan preset', () => {
    expect(PRESET_PALETTES).toHaveProperty('cyan');
    expect(PRESET_PALETTES.cyan).toHaveProperty('500');
  });

  it('contains purple preset', () => {
    expect(PRESET_PALETTES).toHaveProperty('purple');
    expect(PRESET_PALETTES.purple).toHaveProperty('500');
  });

  it('cyan preset has valid hex colors', () => {
    Object.values(PRESET_PALETTES.cyan).forEach((hex) => {
      expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it('purple preset has valid hex colors', () => {
    Object.values(PRESET_PALETTES.purple).forEach((hex) => {
      expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});
