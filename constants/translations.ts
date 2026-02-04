import { Language } from '../types';

// Translation type definition / 翻訳の型定義
export interface TranslationStrings {
  settings: {
    title: string;
    language: string;
    oscPort: string;
    oscPortDesc: string;
    overlayTitle: string;
    offscreenCapture: string;
    offscreenCaptureDesc: string;
    forceOpaqueAlpha: string;
    forceOpaqueAlphaDesc: string;
    instructionsTitle: string;
    resetWelcome: string;
    save: string;
    theme: string;
    themeLight: string;
    themeDark: string;
    themePureBlack: string;
    accentColor: string;
    accentColorCyan: string;
    accentColorPurple: string;
    accentColorCustom: string;
    checkInterval: string;
    checkNow: string;
    intervalStartup: string;
    intervalDaily: string;
    intervalWeekly: string;
    intervalManual: string;
    updateAvailable: string;
    openReleasePage: string;
    latestVersion: string;
    checking: string;
    updateError: string;
  };
  tutorial: {
    title: string;
    subtitle: string;
    step1Title: string;
    step1Desc: string;
    step2Title: string;
    step2Desc: string;
    step3Title: string;
    step3Desc: string;
    startButton: string;
  };
  status: {
    sending: string;
    sent: string;
    error: string;
  };
  appTitle: string;
  appTitlePrefix: string;
  keys: {
    send: string;
    clear: string;
    space: string;
    enter: string;
    backspace: string;
    shift: string;
    tab: string;
  };
  modes: {
    ENGLISH: string;
    HIRAGANA: string;
    KATAKANA: string;
  };
}

export type TranslationsMap = Record<Language, TranslationStrings>;

export const TRANSLATIONS: TranslationsMap = {
  ja: {
    settings: {
      title: '設定',
      language: '言語 / Language',
      oscPort: 'VRChat OSC ポート',
      oscPortDesc: 'VRChatにOSCメッセージを送信するポート（デフォルト: 9000）\n 注意:間違ったOSCポートを指定しても、エラーは表示されずVRChatにはチャットが送信されません。',
      overlayTitle: 'VRオーバーレイ',
      offscreenCapture: 'オフスクリーン描画を使う',
      offscreenCaptureDesc: 'paintイベント駆動で安定化します。変更は再起動後に反映されます。',
      forceOpaqueAlpha: 'アルファを不透明に固定',
      forceOpaqueAlphaDesc: '黒縁やちらつきが出る場合の暫定対策。画質に影響する可能性があります。',
      instructionsTitle: 'ヘルプ',
      resetWelcome: 'チュートリアルを表示する',
      save: '閉じる',
      theme: 'テーマ',
      themeLight: 'ライト',
      themeDark: 'ダーク',
      themePureBlack: 'ピュアブラック',
      accentColor: 'アクセントカラー',
      accentColorCyan: '水色',
      accentColorPurple: '紫',
      accentColorCustom: 'カスタム',
      checkInterval: '更新確認頻度',
      checkNow: '今すぐ確認',
      intervalStartup: '起動時',
      intervalDaily: '毎日',
      intervalWeekly: '毎週',
      intervalManual: '手動のみ',
      updateAvailable: 'アップデートがあります: {version}',
      openReleasePage: 'リリースページを開く',
      latestVersion: '最新です',
      checking: '確認中...',
      updateError: '確認エラー'
    },
    tutorial: {
      title: 'VRChat OSC Keyboardへようこそ',
      subtitle: 'このアプリはVRChatのチャットボックスへテキストを送信するためのツールです。',
      step1Title: 'OSCの有効化',
      step1Desc: 'VRChat内のアクションメニューからOSC設定を開きOSCを有効にしてください。',
      step2Title: '入力モード',
      step2Desc: 'Tabキーや画面ボタンで入力モードを切り替えられます。また、物理キーボードでの直接入力にも対応しています。',
      step3Title: '送信',
      step3Desc: 'Enterキー、または送信ボタンでVRChatへチャットを送信します。',
      startButton: 'はじめる'
    },
    status: {
      sending: '送信中...',
      sent: '送信完了',
      error: 'エラー'
    },
    appTitle: 'OSC Keyboard',
    appTitlePrefix: 'VRChat',
    keys: {
      send: '送信',
      clear: 'クリア',
      space: '空白',
      enter: 'Enter',
      backspace: '←',
      shift: 'Shift',
      tab: 'Tab'
    },
    modes: {
      ENGLISH: 'ENGLISH(TABで切り替え)',
      HIRAGANA: 'ひらがな(TABで切り替え)',
      KATAKANA: 'カタカナ(TABで切り替え)'
    }
  },
  en: {
    settings: {
      title: 'Settings',
      language: 'Language',
      oscPort: 'VRChat OSC Port',
      oscPortDesc: 'VRChat OSC Send Port (Default: 9000) \n Note: Incorrect port settings will not trigger an error, but chat will not be sent.',
      overlayTitle: 'VR Overlay',
      offscreenCapture: 'Use Offscreen Rendering',
      offscreenCaptureDesc: 'Enables paint-driven capture for stability. Takes effect after restart.',
      forceOpaqueAlpha: 'Force Opaque Alpha',
      forceOpaqueAlphaDesc: 'Workaround for black fringes or flicker. May affect visual quality.',
      instructionsTitle: 'Help',
      resetWelcome: 'Show Tutorial',
      save: 'Close',
      theme: 'Theme',
      themeLight: 'Light',
      themeDark: 'Dark',
      themePureBlack: 'Pure Black',
      accentColor: 'Accent Color',
      accentColorCyan: 'Cyan (Default)',
      accentColorPurple: 'Purple',
      accentColorCustom: 'Custom',
      checkInterval: 'Update Check Interval',
      checkNow: 'Check Now',
      intervalStartup: 'Every Startup',
      intervalDaily: 'Daily',
      intervalWeekly: 'Weekly',
      intervalManual: 'Manual Only',
      updateAvailable: 'Update Available: {version}',
      openReleasePage: 'Open Release Page',
      latestVersion: 'Latest',
      checking: 'Checking...',
      updateError: 'Check Error'
    },
    tutorial: {
      title: 'Welcome to VRC OSC Keyboard',
      subtitle: 'This tool helps you send text to the VRChat chatbox easily.',
      step1Title: 'Enable OSC',
      step1Desc: 'Enable OSC in VRChat via Action Menu > OSC > Enable.',
      step2Title: 'Input Modes',
      step2Desc: 'Switch input modes via the Tab key or the on-screen button. Physical keyboard input is also supported.',
      step3Title: 'Send Message',
      step3Desc: 'Send chat to VRChat using Enter or the Send button.',
      startButton: 'Get Started'
    },
    status: {
      sending: 'Sending...',
      sent: 'Sent',
      error: 'Error'
    },
    appTitle: 'OSC Keyboard',
    appTitlePrefix: 'VRChat',
    keys: {
      send: 'Send',
      clear: 'Clear',
      space: 'Space',
      enter: 'Enter',
      backspace: '←',
      shift: 'Shift',
      tab: 'Tab'
    },
    modes: {
      ENGLISH: 'English (Tab to Switch)',
      HIRAGANA: 'Hiragana (Tab to Switch)',
      KATAKANA: 'Katakana (Tab to Switch)'
    }
  }
};
