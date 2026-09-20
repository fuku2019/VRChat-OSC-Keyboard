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
  // Mirror of the draft, so consecutive updates inside one handler build on each
  // other without reading the draft from inside a state updater.
  // ドラフトのミラー。1つのハンドラー内で連続して更新しても、state更新関数の
  // 内部からドラフトを読まずに前の変更を引き継げるようにする。
  const localConfigRef = useRef(localConfig);

  // Sync local state when opening / 開くときにローカル状態を同期する
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      localConfigRef.current = config;
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

  // The store write must stay outside the setState updater: React may call an
  // updater more than once (StrictMode, a re-rendered attempt), which made
  // setConfig run twice per change and warned about updating another component
  // while rendering.
  // ストアへの書き込みは setState の更新関数の外で行う。Reactは更新関数を複数回
  // 呼ぶことがあり(StrictMode、レンダーの再試行)、1回の変更で setConfig が2度走って
  // 「レンダー中に別コンポーネントを更新した」警告が出ていた。
  const saveConfigImmediately = (
    update: (currentConfig: OscConfig) => OscConfig,
  ) => {
    const currentConfig = localConfigRef.current;
    const nextConfig = update(currentConfig);
    if (nextConfig === currentConfig) return;
    localConfigRef.current = nextConfig;
    setLocalConfig(nextConfig);

    // Write only the keys this edit actually changed, on top of the live store
    // config. Pushing the whole draft would revert fields the app synced into
    // the store after the modal opened - most importantly bridgeUrl, which the
    // startup bridge-port sync resolves asynchronously. Reverting it points OSC
    // at a dead WebSocket port and sending fails without any message.
    // この編集で実際に変わったキーだけを、現在のストア設定に重ねて書き込む。
    // ドラフト全体を書き戻すと、モーダルを開いた後にアプリがストアへ同期した値が
    // 巻き戻る。特に bridgeUrl は起動時のブリッジポート同期が非同期に解決するため、
    // 巻き戻ると OSC の宛先が死んだWebSocketポートになり、送信が無言で失敗する。
    const changedKeys = (Object.keys(nextConfig) as (keyof OscConfig)[]).filter(
      (key) => nextConfig[key] !== currentConfig[key],
    );
    const merged = { ...useConfigStore.getState().config };
    for (const key of changedKeys) {
      merged[key] = nextConfig[key] as never;
    }
    setConfig(merged);
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
