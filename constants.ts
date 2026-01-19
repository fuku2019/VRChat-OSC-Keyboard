import { KeyConfig } from './types';

export const TRANSLATIONS = {
  ja: {
    settings: {
      title: '設定',
      language: '言語 / Language',
      oscUrl: 'OSCブリッジ URL',
      defaultUrl: 'デフォルト: ws://127.0.0.1:8080',
      instructionsTitle: '使い方',
      instructions: [
        'アプリを起動すると自動的に接続されます。',
        'VRChatのOSCを有効にしてください。'
      ],
      save: '保存して閉じる'
    },
    status: {
      sending: '送信中...',
      sent: '送信完了',
      error: 'エラー'
    },
    appTitle: 'キーボード',
    keys: {
      send: '送信',
      clear: 'クリア',
      space: '空白',
      enter: 'Enter',
      backspace: 'BS',
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
      defaultUrl: 'Default: ws://127.0.0.1:8080',
      instructionsTitle: 'Instructions',
      instructions: [
        'App connects automatically on launch.',
        'Ensure VRChat OSC is enabled.'
      ],
      save: 'Save & Close'
    },
    status: {
      sending: 'SENDING...',
      sent: 'SENT OK',
      error: 'ERROR'
    },
    appTitle: 'KEYBOARD',
    keys: {
      send: 'Send',
      clear: 'Clear',
      space: 'Space',
      enter: 'Enter',
      backspace: 'BS',
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

export const ROMAJI_MAP: Record<string, string> = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ',
  ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', fu: 'ふ', hu: 'ふ', he: 'へ', ho: 'ほ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  wa: 'わ', wo: 'を',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  za: 'ざ', ji: 'じ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  nn: 'ん',
  '-': 'ー',
};

export const HIRAGANA_TO_KATAKANA: Record<string, string> = {
  'あ': 'ア', 'い': 'イ', 'う': 'ウ', 'え': 'エ', 'お': 'オ',
  'か': 'カ', 'き': 'キ', 'く': 'ク', 'け': 'ケ', 'こ': 'コ',
  'さ': 'サ', 'し': 'シ', 'す': 'ス', 'せ': 'セ', 'そ': 'ソ',
  'た': 'タ', 'ち': 'チ', 'つ': 'ツ', 'て': 'テ', 'と': 'ト',
  'な': 'ナ', 'に': 'ニ', 'ぬ': 'ヌ', 'ね': 'ネ', 'の': 'ノ',
  'は': 'ハ', 'ひ': 'ヒ', 'ふ': 'フ', 'へ': 'ヘ', 'ほ': 'ホ',
  'ま': 'マ', 'み': 'ミ', 'む': 'ム', 'め': 'メ', 'も': 'モ',
  'や': 'ヤ', 'ゆ': 'ユ', 'よ': 'ヨ',
  'ら': 'ラ', 'り': 'リ', 'る': 'ル', 'れ': 'レ', 'ろ': 'ロ',
  'わ': 'ワ', 'を': 'ヲ', 'ん': 'ン',
  'が': 'ガ', 'ぎ': 'ギ', 'ぐ': 'グ', 'げ': 'ゲ', 'ご': 'ゴ',
  'ざ': 'ザ', 'じ': 'ジ', 'ず': 'ズ', 'ぜ': 'ゼ', 'ぞ': 'ゾ',
  'だ': 'ダ', 'ぢ': 'ヂ', 'づ': 'ヅ', 'で': 'デ', 'ど': 'ド',
  'ば': 'バ', 'び': 'ビ', 'ぶ': 'ブ', 'べ': 'ベ', 'ぼ': 'ボ',
  'ぱ': 'パ', 'ぴ': 'ピ', 'ぷ': 'プ', 'ぺ': 'ペ', 'ぽ': 'ポ',
  'っ': 'ッ', 'ー': 'ー'
};

// JIS Layout (30 columns grid)
export const KEYBOARD_LAYOUT: KeyConfig[] = [
  // ROW 1 (13 keys * 2 + 1 * 4 = 30)
  { label: '1', value: '1', shiftValue: '!', gridCols: 2 },
  { label: '2', value: '2', shiftValue: '"', gridCols: 2 },
  { label: '3', value: '3', shiftValue: '#', gridCols: 2 },
  { label: '4', value: '4', shiftValue: '$', gridCols: 2 },
  { label: '5', value: '5', shiftValue: '%', gridCols: 2 },
  { label: '6', value: '6', shiftValue: '&', gridCols: 2 },
  { label: '7', value: '7', shiftValue: "'", gridCols: 2 },
  { label: '8', value: '8', shiftValue: '(', gridCols: 2 },
  { label: '9', value: '9', shiftValue: ')', gridCols: 2 },
  { label: '0', value: '0', shiftValue: '', gridCols: 2 },
  { label: '-', value: '-', shiftValue: '=', gridCols: 2 },
  { label: '^', value: '^', shiftValue: '~', gridCols: 2 },
  { label: '¥', value: '¥', shiftValue: '|', gridCols: 2 },
  { label: 'BS', value: 'backspace', action: 'backspace', gridCols: 4 },

  // ROW 2 (3 + 12*2 + 3 = 30)
  { label: 'Tab', value: 'tab', action: 'tab', gridCols: 3 },
  { label: 'q', value: 'q', gridCols: 2 },
  { label: 'w', value: 'w', gridCols: 2 },
  { label: 'e', value: 'e', gridCols: 2 },
  { label: 'r', value: 'r', gridCols: 2 },
  { label: 't', value: 't', gridCols: 2 },
  { label: 'y', value: 'y', gridCols: 2 },
  { label: 'u', value: 'u', gridCols: 2 },
  { label: 'i', value: 'i', gridCols: 2 },
  { label: 'o', value: 'o', gridCols: 2 },
  { label: 'p', value: 'p', gridCols: 2 },
  { label: '@', value: '@', shiftValue: '`', gridCols: 2 },
  { label: '[', value: '[', shiftValue: '{', gridCols: 2 },
  { label: 'Enter', value: 'enter', action: 'send', gridCols: 3, gridRows: 2 },

  // ROW 3 (3 + 12*2 = 27 + Enter's 3 = 30)
  { label: 'Mode', value: 'mode', action: 'mode', gridCols: 3 },
  { label: 'a', value: 'a', gridCols: 2 },
  { label: 's', value: 's', gridCols: 2 },
  { label: 'd', value: 'd', gridCols: 2 },
  { label: 'f', value: 'f', gridCols: 2 },
  { label: 'g', value: 'g', gridCols: 2 },
  { label: 'h', value: 'h', gridCols: 2 },
  { label: 'j', value: 'j', gridCols: 2 },
  { label: 'k', value: 'k', gridCols: 2 },
  { label: 'l', value: 'l', gridCols: 2 },
  { label: ';', value: ';', shiftValue: '+', gridCols: 2 },
  { label: ':', value: ':', shiftValue: '*', gridCols: 2 },
  { label: ']', value: ']', shiftValue: '}', gridCols: 2 },
  // Enter spans here (3 cols)

  // ROW 4 (4 + 11*2 + 4 = 30)
  { label: 'Shift', value: 'shift', action: 'shift', gridCols: 4 },
  { label: 'z', value: 'z', gridCols: 2 },
  { label: 'x', value: 'x', gridCols: 2 },
  { label: 'c', value: 'c', gridCols: 2 },
  { label: 'v', value: 'v', gridCols: 2 },
  { label: 'b', value: 'b', gridCols: 2 },
  { label: 'n', value: 'n', gridCols: 2 },
  { label: 'm', value: 'm', gridCols: 2 },
  { label: ',', value: ',', shiftValue: '<', gridCols: 2 },
  { label: '.', value: '.', shiftValue: '>', gridCols: 2 },
  { label: '/', value: '/', shiftValue: '?', gridCols: 2 },
  { label: '_', value: '_', shiftValue: '_', gridCols: 2 }, // Ro
  { label: 'Shift', value: 'shift', action: 'shift', gridCols: 4 },

  // ROW 5 (4 + 22 + 4 = 30)
  { label: 'Clear', value: 'clear', action: 'clear', gridCols: 4 },
  { label: 'Space', value: ' ', action: 'space', gridCols: 22 },
  { label: 'Send', value: 'send', action: 'send', gridCols: 4 }
];