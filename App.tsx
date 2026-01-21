import { useState, useEffect, useRef } from 'react';
import { Settings, WifiOff } from 'lucide-react';
import VirtualKeyboard from './components/VirtualKeyboard';
import SettingsModal from './components/SettingsModal';
import TutorialOverlay from './components/TutorialOverlay';
import { InputMode, OscConfig } from './types';
import { sendOscMessage } from './services/oscService';
import { useIME } from './hooks/useIME';
import { TRANSLATIONS, STORAGE_KEYS, DEFAULT_CONFIG, TIMEOUTS, CHATBOX } from './constants';

const App = () => {
  const { 
    input, buffer, mode, setMode, setInput, overwriteInput,
    handleCharInput, handleBackspace, handleClear, handleSpace, commitBuffer 
  } = useIME(InputMode.HIRAGANA);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preCompositionValue = useRef<string>(''); // Store value before IME composition / IME構成前の値を保存
  const isComposing = useRef<boolean>(false); // Track if IME is composing / IME構成中かどうかを追跡
  
  const [config, setConfig] = useState<OscConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.OSC_CONFIG);
    return saved ? JSON.parse(saved) : {
      bridgeUrl: DEFAULT_CONFIG.BRIDGE_URL,
      oscPort: DEFAULT_CONFIG.OSC_PORT,
      autoSend: DEFAULT_CONFIG.AUTO_SEND,
      language: DEFAULT_CONFIG.LANGUAGE
    };
  });

  // Ensure config has language if loaded from old state / 古い状態からロードされた場合にconfigが言語設定を持っていることを確認
  useEffect(() => {
    let needsUpdate = false;
    let newConfig = { ...config };
    
    if (!config.language) {
      newConfig.language = DEFAULT_CONFIG.LANGUAGE;
      needsUpdate = true;
    }
    if (!config.oscPort) {
      newConfig.oscPort = DEFAULT_CONFIG.OSC_PORT;
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      setConfig(newConfig);
    }
    
    // Sync OSC port with Electron on app load / アプリ読み込み時にElectronとOSCポートを同期
    if (window.electronAPI && config.oscPort) {
      window.electronAPI.updateOscPort(config.oscPort);
    }
  }, []);

  // Check for first launch to show tutorial / 初回起動を確認してチュートリアルを表示
  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem(STORAGE_KEYS.HAS_SEEN_TUTORIAL);
    if (!hasSeenTutorial) {
      setIsTutorialOpen(true);
    } else {
      textareaRef.current?.focus();
    }
  }, []);

  const t = TRANSLATIONS[config.language || DEFAULT_CONFIG.LANGUAGE];

  const saveConfig = (newConfig: OscConfig) => {
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEYS.OSC_CONFIG, JSON.stringify(newConfig));
  };

  const handleTutorialClose = () => {
    setIsTutorialOpen(false);
    localStorage.setItem(STORAGE_KEYS.HAS_SEEN_TUTORIAL, 'true');
    setTimeout(() => textareaRef.current?.focus(), TIMEOUTS.FOCUS_DELAY);
  };

  const handleOpenTutorialFromSettings = () => {
    setIsSettingsOpen(false);
    setIsTutorialOpen(true);
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
        setTimeout(() => setLastSent(null), TIMEOUTS.SENT_NOTIFICATION);
      } else {
        console.error("OSC Send Failed:", result.error);
        setError(result.error || t.status.error);
        setTimeout(() => setError(null), TIMEOUTS.ERROR_NOTIFICATION);
      }
    } catch (e: any) {
      setError(e.message || t.status.error);
      setTimeout(() => setError(null), TIMEOUTS.ERROR_NOTIFICATION);
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

  // Store current value when IME composition starts / IME構成開始時に現在の値を保存
  const handleCompositionStart = () => {
    isComposing.current = true;
    preCompositionValue.current = input + buffer;
  };

  // When IME composition ends, apply the value with limit check / IME構成終了時に制限チェックして値を適用
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposing.current = false;
    const newValue = e.currentTarget.value;
    
    if (newValue.length > CHATBOX.MAX_LENGTH) {
      // Revert to pre-composition value if over limit / 制限を超えたら構成前の値に戻す
      overwriteInput(preCompositionValue.current);
    } else {
      // Apply the new value / 新しい値を適用
      overwriteInput(newValue);
    }
  };

  // Handle textarea onChange - allow during IME composition for proper display / textareaのonChange処理 - IME表示のため構成中も許可
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    
    // During IME composition, allow all input (limit check happens in handleCompositionEnd)
    // IME構成中はすべての入力を許可（制限チェックはhandleCompositionEndで行う）
    if (isComposing.current) {
      overwriteInput(newValue);
      return;
    }
    
    // For non-IME input, apply character limit / 非IME入力は文字数制限を適用
    if (newValue.length <= CHATBOX.MAX_LENGTH) {
      overwriteInput(newValue);
    }
  };

  return (
    <div className="h-full min-h-screen w-full bg-slate-950/90 flex flex-col items-center justify-center p-4 overflow-y-auto overflow-x-hidden">
      <TutorialOverlay 
        isOpen={isTutorialOpen} 
        onClose={handleTutorialClose} 
        language={config.language || DEFAULT_CONFIG.LANGUAGE} 
      />

      <div className="w-full max-w-5xl flex justify-between items-center mb-4 px-2 shrink-0 pt-4 md:pt-0">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]"></div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-100 tracking-wider drop-shadow-md">
            {t.appTitlePrefix} <span className="text-cyan-400">{t.appTitle}</span>
          </h1>
        </div>
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 bg-slate-800/80 rounded-full hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
        >
          <Settings size={20} />
        </button>
      </div>

      <div className="w-full max-w-5xl mb-4 relative shrink-0 group px-1">
        <div className={`
          relative w-full h-24 md:h-32 bg-slate-900/80 rounded-2xl border-2 
          flex flex-col px-6 py-2 shadow-inner backdrop-blur transition-colors
          ${error ? 'border-red-500/50' : 'border-slate-700 focus-within:border-cyan-500/50'}
        `}>
          <div className="absolute top-2 right-4 flex gap-3 items-center pointer-events-none z-10">
            {/* Character Counter / 文字数カウンター */}
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
              (input + buffer).length >= CHATBOX.MAX_LENGTH
                ? 'text-red-400 border-red-500/50 bg-red-900/20'
                : (input + buffer).length > CHATBOX.WARNING_THRESHOLD
                  ? 'text-amber-400 border-amber-500/50 bg-amber-900/20'
                  : 'text-slate-400 border-slate-600 bg-slate-800/50'
            }`}>
              {(input + buffer).length}/{CHATBOX.MAX_LENGTH}
            </span>
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
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onBlur={() => { isComposing.current = false; }}
            maxLength={CHATBOX.MAX_LENGTH}
            className="w-full h-full bg-transparent text-2xl md:text-4xl text-white font-medium resize-none outline-none mt-6 leading-tight break-all font-sans"
            spellCheck="false"
            autoFocus
          />
        </div>
      </div>

      <div className="w-full max-w-5xl shrink-0 px-1 pb-4">
        <VirtualKeyboard 
          onChar={(c) => handleVirtualKey(() => handleCharInput(c))}
          onBackspace={() => handleVirtualKey(handleBackspace)}
          onClear={() => handleVirtualKey(handleClear)}
          onSend={() => handleVirtualKey(handleSend)}
          onSpace={() => handleVirtualKey(handleSpace)}
          mode={mode}
          onToggleMode={() => handleVirtualKey(toggleMode)}
          buffer={buffer}
          language={config.language || DEFAULT_CONFIG.LANGUAGE}
        />
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSave={saveConfig}
        onLanguageChange={(lang) => saveConfig({ ...config, language: lang })}
        onShowTutorial={handleOpenTutorialFromSettings}
      />
    </div>
  );
};

export default App;
