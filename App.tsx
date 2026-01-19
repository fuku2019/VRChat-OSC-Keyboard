import React, { useState, useEffect, useRef } from 'react';
import { Settings, WifiOff } from 'lucide-react';
import VirtualKeyboard from './components/VirtualKeyboard';
import SettingsModal from './components/SettingsModal';
import { InputMode, OscConfig } from './types';
import { sendOscMessage } from './services/oscService';
import { useIME } from './hooks/useIME';
import { TRANSLATIONS } from './constants';

const App: React.FC = () => {
  const { 
    input, buffer, mode, setMode, setInput, overwriteInput,
    handleCharInput, handleBackspace, handleClear, handleSpace, commitBuffer 
  } = useIME(InputMode.HIRAGANA);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [config, setConfig] = useState<OscConfig>(() => {
    const saved = localStorage.getItem('vrc_osc_config');
    return saved ? JSON.parse(saved) : {
      bridgeUrl: 'ws://127.0.0.1:8080',
      autoSend: false,
      language: 'ja' // Default to Japanese
    };
  });

  // Ensure config has language if loaded from old state
  useEffect(() => {
    if (!config.language) {
      setConfig(prev => ({ ...prev, language: 'ja' }));
    }
  }, []);

  const t = TRANSLATIONS[config.language || 'ja'];

  const saveConfig = (newConfig: OscConfig) => {
    setConfig(newConfig);
    localStorage.setItem('vrc_osc_config', JSON.stringify(newConfig));
  };

  const handleSend = async () => {
    let textToSend = input;
    if (buffer.length > 0) {
      textToSend += buffer;
      commitBuffer();
    }

    if (!textToSend.trim()) return;

    setIsSending(true);
    setError(null);
    
    try {
      const result = await sendOscMessage(textToSend, config.bridgeUrl);
      
      if (result.success) {
        setLastSent(textToSend);
        setInput(''); 
        setTimeout(() => setLastSent(null), 3000);
      } else {
        console.error("OSC Send Failed:", result.error);
        setError(result.error || t.status.error);
        setTimeout(() => setError(null), 5000);
      }
    } catch (e: any) {
      setError(e.message || t.status.error);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  };

  const toggleMode = () => {
    commitBuffer();
    if (mode === InputMode.ENGLISH) setMode(InputMode.HIRAGANA);
    else if (mode === InputMode.HIRAGANA) setMode(InputMode.KATAKANA);
    else setMode(InputMode.ENGLISH);
    textareaRef.current?.focus();
  };

  const handleVirtualKey = (action: () => void) => {
    action();
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Enter') {
      if (!e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      toggleMode();
    } else if (e.key === 'Escape') {
      handleClear();
    }
  };

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="h-screen w-screen bg-slate-950/90 flex flex-col items-center justify-center p-2 overflow-hidden">
      <div className="w-full max-w-5xl flex justify-between items-center mb-4 px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]"></div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-100 tracking-wider drop-shadow-md">
            VRC OSC <span className="text-cyan-400">{t.appTitle}</span>
          </h1>
        </div>
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 bg-slate-800/80 rounded-full hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
        >
          <Settings size={20} />
        </button>
      </div>

      <div className="w-full max-w-5xl mb-4 relative shrink-0 group">
        <div className={`
          relative w-full h-24 md:h-32 bg-slate-900/80 rounded-2xl border-2 
          flex flex-col px-6 py-2 shadow-inner backdrop-blur transition-colors
          ${error ? 'border-red-500/50' : 'border-slate-700 focus-within:border-cyan-500/50'}
        `}>
          <div className="absolute top-2 right-4 flex gap-2 items-center pointer-events-none z-10">
            {isSending && <span className="text-[10px] text-cyan-400 font-mono animate-pulse">{t.status.sending}</span>}
            {lastSent && <span className="text-[10px] text-green-400 font-mono">{t.status.sent}</span>}
            {error && (
              <span className="text-[10px] text-red-400 font-mono flex items-center gap-1 bg-red-900/20 px-1 rounded border border-red-900/50">
                <WifiOff size={10}/> {error}
              </span>
            )}
          </div>
          
          <div className="absolute top-2 left-4 z-10">
             <button 
               className="cursor-pointer text-[10px] font-bold bg-slate-800 px-2 py-0.5 rounded text-slate-400 border border-slate-700 hover:text-white hover:border-cyan-500 transition-colors"
               onClick={toggleMode}
               tabIndex={-1}
             >
               {t.modes[mode]}
             </button>
          </div>

          <textarea
            ref={textareaRef}
            value={input + buffer}
            onChange={(e) => overwriteInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-full bg-transparent text-2xl md:text-4xl text-white font-medium resize-none outline-none mt-6 leading-tight break-all font-sans"
            spellCheck="false"
            autoFocus
          />
        </div>
      </div>

      <div className="w-full max-w-5xl shrink-0">
        <VirtualKeyboard 
          onChar={(c) => handleVirtualKey(() => handleCharInput(c))}
          onBackspace={() => handleVirtualKey(handleBackspace)}
          onClear={() => handleVirtualKey(handleClear)}
          onSend={() => handleVirtualKey(handleSend)}
          onSpace={() => handleVirtualKey(handleSpace)}
          mode={mode}
          onToggleMode={() => handleVirtualKey(toggleMode)}
          buffer={buffer}
          language={config.language || 'ja'}
        />
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          textareaRef.current?.focus();
        }}
        config={config}
        onSave={saveConfig}
      />
    </div>
  );
};

export default App;