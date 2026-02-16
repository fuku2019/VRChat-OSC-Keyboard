// Helper functions for color conversion and palette generation

type RGB = { r: number; g: number; b: number };
type HSL = { h: number; s: number; l: number };

const HEX6_COLOR_REGEX = /^#?[0-9a-f]{6}$/i;

export const isPresetAccentColor = (color?: string): boolean =>
  !color || color === 'cyan' || color === 'purple';

export const normalizeCustomAccentColor = (color: string): string =>
  color.startsWith('#') ? color.toLowerCase() : `#${color.toLowerCase()}`;

export const isValidCustomAccentColor = (color: string): boolean =>
  HEX6_COLOR_REGEX.test(color);

export const sanitizeAccentColor = (
  color: unknown,
  fallback: string = 'cyan',
): string => {
  if (typeof color !== 'string') return fallback;
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
export const PRESET_PALETTES: Record<string, Record<number, string>> = {
  cyan: {
    50: '#ecfeff',
    100: '#cffafe',
    200: '#a5f3fc',
    300: '#67e8f9',
    400: '#22d3ee',
    500: '#06b6d4',
    600: '#0891b2',
    700: '#0e7490',
    800: '#155e75',
    900: '#164e63',
  },
  purple: {
    50: '#faf5ff',
    100: '#f3e8ff',
    200: '#e9d5ff',
    300: '#d8b4fe',
    400: '#c084fc',
    500: '#a855f7',
    600: '#9333ea',
    700: '#7e22ce',
    800: '#6b21a8',
    900: '#581c87',
  },
};
