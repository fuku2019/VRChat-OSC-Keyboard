import { KeyConfig } from '../types';

// JIS Layout (30 columns grid) / JIS配列（30列グリッド）
// JIS Layout (60 columns grid) / JIS配列（60列グリッド）
export const KEYBOARD_LAYOUT: KeyConfig[] = [
  // ROW 1 (13 keys * 4 + 1 * 8 = 60) / 1行目
  { label: '1', value: '1', shiftValue: '!', gridCols: 4 },
  { label: '2', value: '2', shiftValue: '"', gridCols: 4 },
  { label: '3', value: '3', shiftValue: '#', gridCols: 4 },
  { label: '4', value: '4', shiftValue: '$', gridCols: 4 },
  { label: '5', value: '5', shiftValue: '%', gridCols: 4 },
  { label: '6', value: '6', shiftValue: '&', gridCols: 4 },
  { label: '7', value: '7', shiftValue: "'", gridCols: 4 },
  { label: '8', value: '8', shiftValue: '(', gridCols: 4 },
  { label: '9', value: '9', shiftValue: ')', gridCols: 4 },
  { label: '0', value: '0', shiftValue: '', gridCols: 4 },
  { label: '-', value: '-', shiftValue: '=', gridCols: 4 },
  { label: '^', value: '^', shiftValue: '~', gridCols: 4 },
  { label: '¥', value: '¥', shiftValue: '|', gridCols: 4 },
  { label: '←', value: 'backspace', action: 'backspace', gridCols: 8 },

  // ROW 2 (6 + 12*4 + 6 = 60) / 2行目
  { label: 'Tab', value: 'tab', action: 'tab', gridCols: 6 },
  { label: 'q', value: 'q', gridCols: 4 },
  { label: 'w', value: 'w', gridCols: 4 },
  { label: 'e', value: 'e', gridCols: 4 },
  { label: 'r', value: 'r', gridCols: 4 },
  { label: 't', value: 't', gridCols: 4 },
  { label: 'y', value: 'y', gridCols: 4 },
  { label: 'u', value: 'u', gridCols: 4 },
  { label: 'i', value: 'i', gridCols: 4 },
  { label: 'o', value: 'o', gridCols: 4 },
  { label: 'p', value: 'p', gridCols: 4 },
  { label: '@', value: '@', shiftValue: '`', gridCols: 4 },
  { label: '[', value: '[', shiftValue: '{', gridCols: 4 },
  { label: 'Enter', value: 'enter', action: 'send', gridCols: 6, isSpacer: true },

  // ROW 3 (7 + 12*4 + 5 = 60) / 3行目
  { label: 'Mode', value: 'mode', action: 'mode', gridCols: 7 },
  { label: 'a', value: 'a', gridCols: 4 },
  { label: 's', value: 's', gridCols: 4 },
  { label: 'd', value: 'd', gridCols: 4 },
  { label: 'f', value: 'f', gridCols: 4 },
  { label: 'g', value: 'g', gridCols: 4 },
  { label: 'h', value: 'h', gridCols: 4 },
  { label: 'j', value: 'j', gridCols: 4 },
  { label: 'k', value: 'k', gridCols: 4 },
  { label: 'l', value: 'l', gridCols: 4 },
  { label: ';', value: ';', shiftValue: '+', gridCols: 4 },
  { label: ':', value: ':', shiftValue: '*', gridCols: 4 },
  { label: ']', value: ']', shiftValue: '}', gridCols: 4 },
  { label: 'Enter', value: 'enter', action: 'send', gridCols: 5, isSpacer: true },

  // ROW 4 (9 + 11*4 + 7 = 60) / 4行目
  { label: 'Shift', value: 'shift', action: 'shift', gridCols: 9 },
  { label: 'z', value: 'z', gridCols: 4 },
  { label: 'x', value: 'x', gridCols: 4 },
  { label: 'c', value: 'c', gridCols: 4 },
  { label: 'v', value: 'v', gridCols: 4 },
  { label: 'b', value: 'b', gridCols: 4 },
  { label: 'n', value: 'n', gridCols: 4 },
  { label: 'm', value: 'm', gridCols: 4 },
  { label: ',', value: ',', shiftValue: '<', gridCols: 4 },
  { label: '.', value: '.', shiftValue: '>', gridCols: 4 },
  { label: '/', value: '/', shiftValue: '?', gridCols: 4 },
  { label: '_', value: '_', shiftValue: '_', gridCols: 4 },
  { label: 'Shift', value: 'shift', action: 'shift', gridCols: 7 },

  // ROW 5 (8 + 44 + 8 = 60) / 5行目
  { label: 'Clear', value: 'clear', action: 'clear', gridCols: 8 },
  { label: 'Space', value: ' ', action: 'space', gridCols: 44 },
  { label: 'Clear', value: 'clear', action: 'clear', gridCols: 8 },
];
