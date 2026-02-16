// Application configuration constants / アプリケーション設定定数

// LocalStorage keys / LocalStorageのキー
export const STORAGE_KEYS = {
  OSC_CONFIG: 'vrc_osc_config',
  HAS_SEEN_TUTORIAL: 'vrc_osc_has_seen_tutorial',
  WINDOW_POSITION: 'vrc_osc_window_position', // Window position (x, y) / ウィンドウ位置（x, y）
  LAST_UPDATE_CHECK: 'vrc_osc_last_update_check',
  UPDATE_AVAILABLE: 'vrc_osc_update_available', // Stores {version, url} or null / 更新情報を保存
} as const;

// Default configuration values / デフォルト設定値
export const DEFAULT_CONFIG = {
  BRIDGE_URL: 'ws://127.0.0.1:8080',
  OSC_PORT: 9000, // VRChat default OSC port / VRChatデフォルトOSCポート
  AUTO_SEND: false,
  COPY_MODE: false,
  AUTO_SEND_BEFORE_COPY_MODE: false,
  LANGUAGE: 'ja' as const,
  THEME: 'dark' as const,
  ACCENT_COLOR: 'cyan',
  UPDATE_CHECK_INTERVAL: 'weekly' as const,
  DISABLE_OVERLAY: false,
  STEAMVR_AUTO_LAUNCH: false,
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
  COLUMNS: 60,
  ROW_HEIGHT: '3.5rem',
} as const;

// VRChat chatbox limits / VRChatチャットボックスの制限
export const CHATBOX = {
  MAX_LENGTH: 144, // Maximum characters allowed in VRChat chatbox / VRChatチャットボックスで許可される最大文字数
  WARNING_THRESHOLD: 120, // Show warning when approaching limit / 制限に近づいたときに警告を表示
} as const;

// Throttle/Debounce intervals (in milliseconds) / スロットル/デバウンス間隔（ミリ秒）
export const THROTTLE = {
  TYPING_INDICATOR: 2000, // Typing status send interval / タイピング状態送信間隔
  TYPING_TIMEOUT: 3000, // Typing indicator timeout / タイピングインジケータータイムアウト
  AUTO_SEND: 750, // Auto-send throttle interval / 自動送信スロットル間隔
} as const;

// GitHub repository info / GitHubリポジトリ情報
export const GITHUB = {
  REPO_OWNER: 'fuku2019',
  REPO_NAME: 'VRC-OSC-Keyboard',
  API_URL:
    'https://api.github.com/repos/fuku2019/VRC-OSC-Keyboard/releases/latest',
  RELEASES_URL: 'https://github.com/fuku2019/VRC-OSC-Keyboard/releases',
} as const;

// Network defaults / ネットワークデフォルト
export const NETWORK = {
  LOCALHOST: '127.0.0.1',
  WS_PORT_START: 8080, // Starting port for auto-selection / 自動選択の開始ポート
  WS_PORT_END: 8099, // Ending port for auto-selection / 自動選択の終了ポート
} as const;
