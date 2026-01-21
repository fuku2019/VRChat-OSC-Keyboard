// Application configuration constants / アプリケーション設定定数

// LocalStorage keys / LocalStorageのキー
export const STORAGE_KEYS = {
  OSC_CONFIG: 'vrc_osc_config',
  HAS_SEEN_TUTORIAL: 'vrc_osc_has_seen_tutorial',
  WINDOW_POSITION: 'vrc_osc_window_position', // Window position (x, y) / ウィンドウ位置（x, y）
} as const;

// Default configuration values / デフォルト設定値
export const DEFAULT_CONFIG = {
  BRIDGE_URL: 'ws://127.0.0.1:8080',
  AUTO_SEND: false,
  LANGUAGE: 'ja' as const,
} as const;

// Timeout values (in milliseconds) / タイムアウト値（ミリ秒）
export const TIMEOUTS = {
  OSC_CONNECTION: 2000, // OSC connection timeout / OSC接続タイムアウト
  SENT_NOTIFICATION: 3000, // "Sent" message display duration / 「送信完了」メッセージ表示時間
  ERROR_NOTIFICATION: 5000, // Error message display duration / エラーメッセージ表示時間
  MODAL_ANIMATION: 200, // Modal open/close animation duration / モーダル開閉アニメーション時間
  LONG_PRESS_THRESHOLD: 500, // Long press detection threshold / 長押し検出しきい値
  FOCUS_DELAY: 100, // Delay before focusing textarea / テキストエリアにフォーカスするまでの遅延
} as const;

// Grid layout configuration / グリッドレイアウト設定
export const KEYBOARD_GRID = {
  COLUMNS: 30,
  ROW_HEIGHT: '3.5rem',
} as const;

// VRChat chatbox limits / VRChatチャットボックスの制限
export const CHATBOX = {
  MAX_LENGTH: 144, // Maximum characters allowed in VRChat chatbox / VRChatチャットボックスで許可される最大文字数
  WARNING_THRESHOLD: 120, // Show warning when approaching limit / 制限に近づいたときに警告を表示
} as const;
