import { Language } from '../types';

// Translation type definition / 翻訳の型定義
export interface TranslationStrings {
  settings: {
    title: string;
    language: string;
    oscUrl: string;
    defaultUrl: string;
    instructionsTitle: string;
    resetWelcome: string;
    save: string;
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
      oscUrl: 'OSCブリッジ URL',
      defaultUrl: '基本的に変更しないでください。デフォルト: ws://127.0.0.1:8080',
      instructionsTitle: 'ヘルプ',
      resetWelcome: 'チュートリアルを表示する',
      save: '保存して閉じる'
    },
    tutorial: {
      title: 'VRChat OSC Keyboardへようこそ',
      subtitle: 'このアプリはVRChatのチャットボックスへテキストを送信するためのツールです。',
      step1Title: 'OSCの有効化',
      step1Desc: 'VRChat内のアクションメニューからOSC設定を開きOSCを有効にしてください。',
      step2Title: '入力モード',
      step2Desc: 'Tabキーや画面ボタンで入力モードを切り替えられます。物理キーボードでの直接入力にも対応しています。',
      step3Title: '送信',
      step3Desc: 'Enterキー、または送信ボタンでVRChatへメッセージを飛ばします。',
      startButton: 'はじめる'
    },
    status: {
      sending: '送信中...',
      sent: '送信完了',
      error: 'エラー'
    },
    appTitle: 'Keyboard',
    appTitlePrefix: 'VRC OSC',
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
      oscUrl: 'OSC Bridge URL',
      defaultUrl: 'DO NOT modify unless necessary: ws://127.0.0.1:8080',
      instructionsTitle: 'Help',
      resetWelcome: 'Show Tutorial Guide',
      save: 'Save & Close'
    },
    tutorial: {
      title: 'Welcome to VRC OSC Keyboard',
      subtitle: 'This tool helps you send text to the VRChat chatbox easily.',
      step1Title: 'Prepare OSC',
      step1Desc: 'Enable OSC in VRChat via Action Menu > OSC > Enable.',
      step2Title: 'Input Modes',
      step2Desc: 'Switch Input modes using Tab or the UI button. You can also type directly using your physical keyboard.',
      step3Title: 'Send Message',
      step3Desc: 'Press Enter or the Send button to display your text in-game.',
      startButton: 'Get Started'
    },
    status: {
      sending: 'SENDING...',
      sent: 'SENT OK',
      error: 'ERROR'
    },
    appTitle: 'Keyboard',
    appTitlePrefix: 'VRC OSC',
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
