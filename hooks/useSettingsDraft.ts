import { useState, useEffect, useRef } from 'react';
import { OscConfig, UpdateConfigFn } from '../types';
import { useConfigStore } from '../stores/configStore';
import {
  isPresetAccentColor,
  isValidCustomAccentColor,
  normalizeCustomAccentColor,
} from '../utils/colorUtils';

const DEFAULT_CUSTOM_ACCENT_COLOR = '#ff0000';

interface UseSettingsDraftReturn {
  localConfig: OscConfig;
  updateConfig: UpdateConfigFn;
  oscPortInput: string;
  setOscPortInput: (value: string) => void;
  historyMaxCountInput: string;
  setHistoryMaxCountInput: (value: string) => void;
  lastCustomAccentColor: string;
  handleAccentColorChange: (color: string) => void;
  handleCustomAccentSelect: () => void;
  handleOscPortCommit: () => void;
  handleOscPortKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleHistoryMaxCountCommit: () => void;
  handleHistoryMaxCountKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Custom hook holding the settings modal's local draft of the config.
 * The draft is re-synced from the store only when the modal opens, but every change is written through to the store immediately.
 * 設定モーダルが保持するローカルのドラフト設定を管理するカスタムフック。
 * ドラフトはモーダルを開いた瞬間にだけストアから再同期されるが、変更は即座にストアへ書き戻される。
 *
 * @param isOpen - Whether the modal is open / モーダルが開いているかどうか
 * @returns Draft config, number-input state and their handlers / ドラフト設定、数値入力の状態とそのハンドラー
 */
export const useSettingsDraft = (isOpen: boolean): UseSettingsDraftReturn => {
  const config = useConfigStore((state) => state.config);
  const setConfig = useConfigStore((state) => state.setConfig);
  const [localConfig, setLocalConfig] = useState(config);
  const [oscPortInput, setOscPortInput] = useState(String(config.oscPort));
  const [historyMaxCountInput, setHistoryMaxCountInput] = useState(
    String(config.historyMaxCount),
  );
  const [lastCustomAccentColor, setLastCustomAccentColor] = useState<string>(
    DEFAULT_CUSTOM_ACCENT_COLOR,
  );
  const wasOpenRef = useRef(false);

  // Sync local state when opening / 開くときにローカル状態を同期する
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setLocalConfig(config);
      setOscPortInput(String(config.oscPort));
      setHistoryMaxCountInput(String(config.historyMaxCount));
      if (
        !isPresetAccentColor(config.accentColor) &&
        isValidCustomAccentColor(config.accentColor)
      ) {
        setLastCustomAccentColor(normalizeCustomAccentColor(config.accentColor));
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, config]);

  const saveConfigImmediately = (
    update: (currentConfig: OscConfig) => OscConfig,
  ) => {
    setLocalConfig((currentConfig) => {
      const nextConfig = update(currentConfig);
      if (nextConfig === currentConfig) return currentConfig;
      setConfig(nextConfig);
      return nextConfig;
    });
  };

  // Generic single-field config updater / 汎用単一フィールド設定更新
  const updateConfig: UpdateConfigFn = (key, value) => {
    saveConfigImmediately((c) => (c[key] === value ? c : { ...c, [key]: value }));
  };

  // Handle accent color change / アクセントカラー変更の処理
  const handleAccentColorChange = (color: string) => {
    if (color === 'cyan' || color === 'purple') {
      updateConfig('accentColor', color);
      return;
    }
    if (!isValidCustomAccentColor(color)) return;
    const normalizedColor = normalizeCustomAccentColor(color);
    setLastCustomAccentColor(normalizedColor);
    updateConfig('accentColor', normalizedColor);
  };

  const handleCustomAccentSelect = () => {
    if (!isPresetAccentColor(localConfig.accentColor)) return;
    handleAccentColorChange(lastCustomAccentColor);
  };

  // Handle OSC port commit / OSCポート変更の確定処理
  const handleOscPortCommit = () => {
    const trimmedValue = oscPortInput.trim();
    const portNum = parseInt(trimmedValue, 10);
    if (!isNaN(portNum) && portNum >= 1 && portNum <= 65535) {
      if (portNum !== localConfig.oscPort) {
        updateConfig('oscPort', portNum);
      } else {
        setOscPortInput(String(localConfig.oscPort));
      }
      return;
    }
    // Revert invalid input back to current config value / 無効な入力は現在の設定値に戻す
    setOscPortInput(String(localConfig.oscPort));
  };

  const handleOscPortKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleOscPortCommit();
      e.currentTarget.blur();
    }
  };

  // Commit history size on blur/Enter like the OSC port field. Validating on
  // every keystroke rejected intermediate values, so a two-digit number could
  // never be typed (pressing "5" of "50" was discarded as out of range).
  // OSCポートと同じくフォーカスアウト/Enterで確定する。キー入力ごとに検証すると
  // 途中の値が弾かれ、2桁の入力ができなかった（"50"の"5"が範囲外として捨てられた）。
  const handleHistoryMaxCountCommit = () => {
    const parsed = parseInt(historyMaxCountInput.trim(), 10);
    if (!isNaN(parsed)) {
      const clamped = Math.min(100, Math.max(10, parsed));
      updateConfig('historyMaxCount', clamped);
      setHistoryMaxCountInput(String(clamped));
      return;
    }
    setHistoryMaxCountInput(String(localConfig.historyMaxCount));
  };

  const handleHistoryMaxCountKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleHistoryMaxCountCommit();
      e.currentTarget.blur();
    }
  };

  return {
    localConfig,
    updateConfig,
    oscPortInput,
    setOscPortInput,
    historyMaxCountInput,
    setHistoryMaxCountInput,
    lastCustomAccentColor,
    handleAccentColorChange,
    handleCustomAccentSelect,
    handleOscPortCommit,
    handleOscPortKeyDown,
    handleHistoryMaxCountCommit,
    handleHistoryMaxCountKeyDown,
  };
};
