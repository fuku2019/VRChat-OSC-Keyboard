import { KeyConfig } from '../types';

// JIS Layout (30 columns grid) / JIS配列（30列グリッド）
export const KEYBOARD_LAYOUT: KeyConfig[] = [
  // ROW 1 (13 keys * 2 + 1 * 4 = 30) / 1行目
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
  { label: '←', value: 'backspace', action: 'backspace', gridCols: 4 },

  // ROW 2 (3 + 12*2 + 3 = 30) / 2行目
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

  // ROW 3 (3 + 12*2 = 27 + Enter's 3 = 30) / 3行目
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
  // Enter spans here (3 cols) / Enterキーはここにまたがる（3列）

  // ROW 4 (4 + 11*2 + 4 = 30) / 4行目
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
  { label: '_', value: '_', shiftValue: '_', gridCols: 2 },
  { label: 'Shift', value: 'shift', action: 'shift', gridCols: 4 },

  // ROW 5 (4 + 22 + 4 = 30) / 5行目
  { label: 'Clear', value: 'clear', action: 'clear', gridCols: 4 },
  { label: 'Space', value: ' ', action: 'space', gridCols: 22 },
  { label: 'Clear', value: 'clear', action: 'clear', gridCols: 4 }
];
