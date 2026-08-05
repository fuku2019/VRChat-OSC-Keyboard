export enum InputMode {
  ENGLISH = 'ENGLISH',
  HIRAGANA = 'HIRAGANA',
  KATAKANA = 'KATAKANA',
}

export type Language = 'ja' | 'en';
export type KeySoundVariant = 'soft' | 'mechanical';

export interface KeyConfig {
  label: string;
  value: string;
  shiftValue?: string;

  // Grid Layout Props / グリッドレイアウトのプロパティ
  gridCols?: number; // Span columns (base 30) / 列のスパン（30ベース）
  gridRows?: number; // Span rows / 行のスパン

  action?:
    | 'backspace'
    | 'enter'
    | 'space'
    | 'shift'
    | 'mode'
    | 'clear'
    | 'send'
    | 'tab'
    | 'history-up'
    | 'history-down';
  isSpacer?: boolean; // Layout placeholder / レイアウトプレースホルダー
}

// Update check interval type / 更新確認間隔の型
export type UpdateCheckInterval = 'startup' | 'daily' | 'weekly' | 'manual';

export interface OscConfig {
  bridgeUrl: string;
  oscPort: number; // VRChat OSC port (default: 9000) / VRChat OSCポート（デフォルト: 9000）
  autoSend: boolean;
  copyMode: boolean;
  autoSendBeforeCopyMode: boolean;
  keySoundEnabled: boolean;
  keySoundVariant: KeySoundVariant;
  language: Language;
  theme: 'light' | 'dark' | 'pure-black';
  accentColor: string;
  updateCheckInterval: UpdateCheckInterval;
  disableOverlay: boolean;
  steamVrAutoLaunch: boolean;
  historyMaxCount: number; // Max send history entries / 送信履歴の最大保持件数
  historyPersistEnabled: boolean; // Persist history on restart / 再起動時に履歴を保持
}
