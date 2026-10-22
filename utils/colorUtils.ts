// Helper functions for color conversion and palette generation

type RGB = { r: number; g: number; b: number };
type HSL = { h: number; s: number; l: number };

const HEX6_COLOR_REGEX = /^#?[0-9a-f]{6}$/i;

// Built-in accent ids. 'cyan' was the default until the Gboard redesign and is
// still found in saved configs; sanitizeAccentColor maps it to the fallback.
// 組み込みのアクセントID。'cyan' は Gboard 風への刷新まで既定値で、保存済みの設定に
// まだ残っている。sanitizeAccentColor がフォールバックへ移す。
export const PRESET_ACCENT_IDS = ['blue', 'purple'] as const;
export type PresetAccentId = (typeof PRESET_ACCENT_IDS)[number];
const LEGACY_ACCENT_IDS = ['cyan'];

export const isPresetAccentId = (color: unknown): color is PresetAccentId =>
  (PRESET_ACCENT_IDS as readonly unknown[]).includes(color);

export const isPresetAccentColor = (color?: string): boolean =>
  !color || isPresetAccentId(color);

export const normalizeCustomAccentColor = (color: string): string =>
  color.startsWith('#') ? color.toLowerCase() : `#${color.toLowerCase()}`;

export const isValidCustomAccentColor = (color: string): boolean =>
  HEX6_COLOR_REGEX.test(color);

export const sanitizeAccentColor = (
  color: unknown,
  fallback: string = 'blue',
): string => {
  if (typeof color !== 'string') return fallback;
  if (LEGACY_ACCENT_IDS.includes(color)) return fallback;
  if (isPresetAccentColor(color)) return color || fallback;
  if (isValidCustomAccentColor(color)) {
    return normalizeCustomAccentColor(color);
  }
  return fallback;
};

export function hexToRgb(hex: string): RGB | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s, l };
}

function hslToRgb({ h, s, l }: HSL): RGB {
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    h /= 360;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

function rgbToHex({ r, g, b }: RGB): string {
  return (
    '#' +
    ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
  );
}

// Calculate luminance of a hex color
export function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  // Relative luminance formula
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const Rs = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const Gs = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const Bs = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  return 0.2126 * Rs + 0.7152 * Gs + 0.0722 * Bs;
}

// WCAG contrast ratio between two hex colors
export function getContrastRatio(a: string, b: string): number {
  const la = getLuminance(a);
  const lb = getLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Pick a text color for a background: the first candidate that reaches 4.5:1,
// otherwise the candidate with the highest contrast. A fixed luminance threshold
// put white text on yellow accents (2.2:1).
// 背景に載せる文字色を選ぶ。4.5:1 に届く最初の候補、どれも届かなければ最もコントラストの
// 高い候補を返す。輝度の固定しきい値では、黄色のアクセントに白文字(2.2:1)が載っていた。
export function pickTextColor(background: string, candidates: string[]): string {
  const found = candidates.find((c) => getContrastRatio(background, c) >= 4.5);
  if (found) return found;
  return candidates.reduce((best, c) =>
    getContrastRatio(background, c) > getContrastRatio(background, best) ? c : best,
  );
}

// Generate a palette based on a single hex color
// Generates shades 50-900
export const generatePalette = (
  baseHex: string,
  theme: 'light' | 'dark' | 'pure-black' = 'dark',
): Record<number, string> => {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return {};

  const hsl = rgbToHsl(rgb);
  const isWhiteOrVeryLight = hsl.l > 0.9;

  // Define lightness curve mapping for Tailwind-like shades
  let shadeLightness: Record<number, number> = {
    50: 0.95,
    100: 0.9,
    200: 0.8,
    300: 0.7,
    400: 0.6,
    500: 0.5,
    600: 0.4,
    700: 0.3,
    800: 0.2,
    900: 0.1,
  };

  // Special handling for white/very light colors in dark mode
  // User wants "bright white" in dark mode, but "standard gray" in light mode (to be visible)
  if (isWhiteOrVeryLight && (theme === 'dark' || theme === 'pure-black')) {
    // In dark mode with white color, we want the primary accents (usually 500/600) to be bright.
    // So we shift the lightness curve upwards significantly.
    shadeLightness = {
      50: 0.98,
      100: 0.96,
      200: 0.94,
      300: 0.92,
      400: 0.9,
      500: 0.88, // Main accent is very bright
      600: 0.8, // Hover state slightly darker
      700: 0.7,
      800: 0.6,
      900: 0.5,
    };
    // Force low saturation to keep it greyscale/white
    hsl.s = 0;
  } else if (isWhiteOrVeryLight) {
    // In light mode, white needs to be darker to be visible on white background.
    // The default shadeLightness (mapping 500 to 0.5) works well for white input (turns it into grey).
    // So we keep default behavior.
    hsl.s = 0;
  }

  const palette: Record<number, string> = {};

  Object.entries(shadeLightness).forEach(([shade, targetL]) => {
    palette[Number(shade)] = rgbToHex(
      hslToRgb({ h: hsl.h, s: hsl.s, l: targetL }),
    );
  });

  return palette;
};

// Preset Palettes
export const PRESET_PALETTES: Record<PresetAccentId, Record<number, string>> = {
  // Google Material 3 baseline tones (Gboard's default blue) / Google Material 3 ベースラインのトーン(Gboard 既定の青)
  blue: {
    50: '#eef4ff',
    100: '#d3e3fd',
    200: '#a8c7fa',
    300: '#7cacf8',
    400: '#4c8df6',
    500: '#1b6ef3',
    600: '#0b57d0',
    700: '#0842a0',
    800: '#062e6f',
    900: '#041e49',
  },
  // Material 3 baseline tones, like blue / blue と同じく Material 3 ベースラインのトーン
  purple: {
    50: '#f6edff',
    100: '#eaddff',
    200: '#d0bcff',
    300: '#b69df8',
    400: '#9a82db',
    500: '#7f67be',
    600: '#6750a4',
    700: '#4f378b',
    800: '#381e72',
    900: '#21005d',
  },
};
