import { FC, useState, useEffect, useRef } from 'react';
import { OscConfig } from '../../types';
import { HexColorPicker } from 'react-colorful';
import { Palette, ChevronDown, ChevronUp } from 'lucide-react';

interface AccentColorSectionProps {
  localConfig: OscConfig;
  t: {
    accentColor: string;
    accentColorCyan: string;
    accentColorPurple: string;
    accentColorCustom: string;
  };
  onAccentColorChange: (color: string) => void;
}

export const AccentColorSection: FC<AccentColorSectionProps> = ({
  localConfig,
  t,
  onAccentColorChange,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const isCustom = localConfig.accentColor !== 'cyan' && localConfig.accentColor !== 'purple';
  
  // Custom color management
  // カスタムカラー管理
  const [customColor, setCustomColor] = useState(
    isCustom && localConfig.accentColor ? localConfig.accentColor : '#ff0000'
  );

  // Sync custom color when config changes externally (or initial load)
  // 外部からの設定変更（または初期ロード）時にカスタムカラーを同期
  useEffect(() => {
    if (isCustom && localConfig.accentColor) {
      setCustomColor(localConfig.accentColor);
    }
  }, [localConfig.accentColor, isCustom]);

  const handleCustomColorChange = (color: string) => {
    setCustomColor(color);
    onAccentColorChange(color);
  };

  return (
    <section className='pt-4 border-t dark:border-slate-700/50 border-slate-200'>
      <label className='block dark:text-slate-300 text-slate-600 mb-3 text-sm font-semibold uppercase tracking-wider'>
        {t.accentColor}
      </label>
      <div className='flex flex-col gap-4'>
        {/* Presets Row */}
        <div className='flex gap-2'>
          <button
            onClick={() => onAccentColorChange('cyan')}
            className={`flex-1 py-3 px-4 rounded-xl border transition-all flex items-center justify-center gap-2 ${
              localConfig.accentColor === 'cyan' || !localConfig.accentColor
                ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]'
                : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'
            }`}
          >
            <div className='w-3 h-3 rounded-full bg-[#06b6d4]' />
            <span className='text-xs md:text-sm whitespace-nowrap'>
              {t.accentColorCyan}
            </span>
          </button>
          <button
            onClick={() => onAccentColorChange('purple')}
            className={`flex-1 py-3 px-4 rounded-xl border transition-all flex items-center justify-center gap-2 ${
              localConfig.accentColor === 'purple'
                ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]'
                : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'
            }`}
          >
            <div className='w-3 h-3 rounded-full bg-[#a855f7]' />
            <span className='text-xs md:text-sm whitespace-nowrap'>
              {t.accentColorPurple}
            </span>
          </button>

          {/* Custom Toggle Button */}
          <button
            onClick={() => {
              if (!isCustom) {
                onAccentColorChange(customColor);
              }
              setShowPicker(!showPicker);
            }}
            className={`flex-1 py-3 px-4 rounded-xl border transition-all flex items-center justify-center gap-2 relative ${
              isCustom
                ? 'dark:bg-primary-900/40 bg-primary-50 border-primary-500 dark:text-primary-300 text-primary-700 shadow-[0_0_15px_rgb(var(--color-primary-500)_/_0.15)]'
                : 'dark:bg-slate-900 bg-slate-50 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'
            }`}
          >
            <div
              className='w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600'
              style={{
                background: isCustom
                  ? customColor
                  : 'linear-gradient(135deg, #f00, #0f0, #00f)',
              }}
            />
            <span className='text-xs md:text-sm whitespace-nowrap'>
              {t.accentColorCustom}
            </span>
            {isCustom && (
              <div className="ml-1">
                {showPicker ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            )}
          </button>
        </div>

        {/* Color Picker Area */}
        {/* Only show if custom mode is active and picker is toggled open */}
        {/* カスタムモードがアクティブで、ピッカーが開いている場合のみ表示 */}
        {isCustom && showPicker && (
          <div className="w-full flex justify-center p-4 bg-slate-100 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 animate-slide-up">
            <div className="flex flex-col items-center gap-4">
              <HexColorPicker
                color={customColor}
                onChange={handleCustomColorChange}
              />
              <div className="flex items-center gap-3 w-full">
                <div 
                  className="w-10 h-10 rounded-lg shadow-inner border dark:border-slate-600 border-slate-300"
                  style={{ backgroundColor: customColor }}
                />
                <div className="flex-1">
                  <span className="text-xs uppercase text-slate-500 dark:text-slate-400 font-mono block mb-1">
                    Hex Code
                  </span>
                  <input
                    type="text"
                    value={customColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomColor(val);
                      if (/^#[0-9A-F]{6}$/i.test(val)) {
                        onAccentColorChange(val);
                      }
                    }}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm font-mono text-slate-700 dark:text-slate-200 uppercase focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
