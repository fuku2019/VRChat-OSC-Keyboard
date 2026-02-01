import { useEffect } from 'react';
import { useConfigStore } from '../stores/configStore';
import { generatePalette, PRESET_PALETTES, hexToRgb, getLuminance } from '../utils/colorUtils';
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
    const accentColor = config.accentColor || DEFAULT_CONFIG.ACCENT_COLOR;

    let palette;
    if (accentColor === 'cyan') {
      palette = PRESET_PALETTES.cyan;
    } else if (accentColor === 'purple') {
      palette = PRESET_PALETTES.purple;
    } else {
      palette = generatePalette(accentColor, config.theme);
    }

    Object.entries(palette).forEach(([shade, hex]) => {
      const rgb = hexToRgb(hex as string);
      if (rgb) {
        root.style.setProperty(
          `--rgb-primary-${shade}`,
          `${rgb.r} ${rgb.g} ${rgb.b}`,
        );
      }
    });

    // Calculate on-primary color (text color on primary background)
    // Primary backgroundのテキスト色を計算（on-primary color）
    // We check shade 600 as it's often used for buttons
    // ボタンによく使われるshade 600をチェック
    const primary600 = palette[600];
    if (primary600) {
      const lum = getLuminance(primary600);
      // If luminance is high (bright), text should be black. Otherwise white.
      // 輝度が高い（明るい）場合はテキストを黒、それ以外は白にする
      // Threshold around 0.5-0.6 usually works.
      // 閾値は0.5-0.6あたりが通常機能する
      const onPrimary = lum > 0.6 ? '0 0 0' : '255 255 255';
      root.style.setProperty('--rgb-on-primary', onPrimary);
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
