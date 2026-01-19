import React, { useState } from 'react';
import { KEYBOARD_LAYOUT, TRANSLATIONS } from '../constants';
import { KeyConfig, InputMode, Language } from '../types';
import Key from './Key';

interface VirtualKeyboardProps {
  onChar: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSend: () => void;
  onSpace: () => void;
  mode: InputMode;
  onToggleMode: () => void;
  buffer: string;
  language: Language;
}

const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({ 
  onChar, onBackspace, onClear, onSend, onSpace, mode, onToggleMode, buffer, language
}) => {
  const [shift, setShift] = useState(false);
  const tKeys = TRANSLATIONS[language].keys;

  const handleKeyPress = (key: KeyConfig) => {
    switch (key.action) {
      case 'shift': setShift(!shift); return;
      case 'backspace': onBackspace(); return;
      case 'clear': onClear(); return;
      case 'send': onSend(); return;
      case 'space': onSpace(); return;
      case 'mode': onToggleMode(); return;
      case 'tab': return;
    }

    let char = key.value;
    if (shift) {
      if (key.shiftValue) char = key.shiftValue;
      else char = key.value.toUpperCase();
    }
    onChar(char);
    if (shift) setShift(false);
  };

  return (
    <div className="flex flex-col w-full max-w-5xl mx-auto p-2 bg-slate-900/90 rounded-2xl shadow-2xl border border-slate-700 select-none backdrop-blur-sm">
      <div className="h-8 mb-2 px-4 flex items-center text-cyan-300 font-mono text-lg overflow-hidden">
        {buffer && (
          <span className="border-b-2 border-cyan-500 animate-pulse bg-cyan-900/30 px-1 rounded">
            {buffer}
          </span>
        )}
      </div>

      <div 
        className="grid gap-1 w-full"
        style={{
          gridTemplateColumns: 'repeat(30, 1fr)',
          gridAutoRows: '3.5rem'
        }}
      >
        {KEYBOARD_LAYOUT.map((key, index) => {
          let displayKey = { ...key };
          
          // Localization
          if (key.action === 'send') displayKey.label = tKeys.send;
          if (key.action === 'clear') displayKey.label = tKeys.clear;
          if (key.action === 'space' && key.label.trim() === '') displayKey.label = tKeys.space;
          if (key.action === 'backspace' && key.label === '←') displayKey.label = tKeys.backspace;
          
          // Dynamic Labels
          if (key.action === 'mode') {
             displayKey.label = mode === InputMode.ENGLISH ? 'ENG' : mode === InputMode.HIRAGANA ? 'あ' : 'ア';
          }

          return (
            <Key 
              key={index} 
              config={displayKey} 
              onPress={handleKeyPress}
              highlight={key.action === 'shift' && shift}
              isShiftActive={shift}
            />
          );
        })}
      </div>
      
      <div className="mt-2 flex justify-between px-4 text-slate-500 text-xs">
         <span>JIS Layout (Standard)</span>
         <span>VRChat OSC Keyboard</span>
      </div>
    </div>
  );
};

export default VirtualKeyboard;