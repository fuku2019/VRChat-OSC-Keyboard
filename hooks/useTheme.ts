import { useEffect } from 'react';
import { useConfigStore } from '../stores/configStore';
import {
  generatePalette,
  PRESET_PALETTES,
  hexToRgb,
  isPresetAccentId,
  pickTextColor,
  sanitizeAccentColor,
} from '../utils/colorUtils';
import { DEFAULT_CONFIG } from '../constants/appConfig';

/**
 * Hook to handle theme and accent color application
 * テーマとアクセントカラーの適用を処理するフック
 */
export const useTheme = () => {
  const config = useConfigStore((state) => state.config);

  // Accent Color Effect / アクセントカラー反映
  useEffect(() => {
    const root = window.document.documentElement;
    const accentColor = sanitizeAccentColor(
      config.accentColor,
      DEFAULT_CONFIG.ACCENT_COLOR,
    );

    const palette = isPresetAccentId(accentColor)
      ? PRESET_PALETTES[accentColor]
      : generatePalette(accentColor, config.theme);

    Object.entries(palette).forEach(([shade, hex]) => {
      const rgb = hexToRgb(hex as string);
      if (rgb) {
        root.style.setProperty(
          `--rgb-primary-${shade}`,
          `${rgb.r} ${rgb.g} ${rgb.b}`,
        );
      }
    });

    const setRgbVar = (name: string, hex: string) => {
      const rgb = hexToRgb(hex);
      if (rgb) root.style.setProperty(name, `${rgb.r} ${rgb.g} ${rgb.b}`);
    };

    // Text on the accent fill (Enter, primary buttons). The accent is shade 600 in
    // light and shade 200 in dark themes (index.css). Prefer white in light and
    // the deep tone of the palette in dark, like Gboard, unless it fails 4.5:1.
    // accent の塗り(Enter、主ボタン)に載せる文字色。accent は light で 600、
    // dark 系で 200(index.css)。Gboard と同じく light は白、dark はパレットの
    // 濃いトーンを優先し、4.5:1 に届かなければほかを選ぶ。
    const isLight = config.theme === 'light';
    const tonalHex = isLight ? palette[100] : palette[700];
    if (tonalHex) {
      // Tonal fill (selected candidate, toggles, Shift on in dark). Generated
      // palettes for white accents make 700 a light grey, so it is checked too.
      // tonal の塗り(選択中の候補、トグル、dark の Shift ON)。白系アクセントの生成
      // パレットでは 700 が明るい灰色になるため、ここも確かめる。
      setRgbVar(
        '--rgb-on-tonal',
        pickTextColor(
          tonalHex,
          isLight
            ? [palette[800], '#000000', '#ffffff']
            : [palette[100], '#ffffff', '#000000'],
        ),
      );
    }

    const accentHex = isLight ? palette[600] : palette[200];
    if (accentHex) {
      setRgbVar(
        '--rgb-on-accent',
        pickTextColor(
          accentHex,
          isLight
            ? ['#ffffff', palette[900], '#000000']
            : [palette[900], '#000000', '#ffffff'],
        ),
      );
    }
  }, [config.accentColor, config.theme]);

  // Theme effect / テーマ反映
  useEffect(() => {
    const root = window.document.documentElement;
    if (config.theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('pure-black');
    } else if (config.theme === 'pure-black') {
      root.classList.add('dark');
      root.classList.add('pure-black');
    } else {
      root.classList.remove('dark');
      root.classList.remove('pure-black');
    }
  }, [config.theme]);
};
