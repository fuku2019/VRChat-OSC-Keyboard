export enum InputMode {
  ENGLISH = 'ENGLISH',
  HIRAGANA = 'HIRAGANA',
  KATAKANA = 'KATAKANA',
}

export type Language = 'ja' | 'en';

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
    | 'tab';
}

export interface OscConfig {
  bridgeUrl: string;
  autoSend: boolean;
  language: Language;
}
