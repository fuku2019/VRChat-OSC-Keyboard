import { useState, useEffect, useRef } from 'react';
import { Settings, WifiOff, X } from 'lucide-react';
import VirtualKeyboard from './components/VirtualKeyboard';
import SettingsModal from './components/SettingsModal';
import TutorialOverlay from './components/TutorialOverlay';
import { InputMode, OscConfig } from './types';
import { sendOscMessage } from './services/oscService';
import { useIME } from './hooks/useIME';
import { TRANSLATIONS, STORAGE_KEYS, DEFAULT_CONFIG, TIMEOUTS, CHATBOX } from './constants';

declare const APP_VERSION: string;

const App = () => {
  const { 
    input, buffer, displayText, mode, setMode, setInput, overwriteInput,
    handleCharInput, handleBackspace, handleClear, handleSpace, commitBuffer 
  } = useIME(InputMode.HIRAGANA);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isToastDismissed, setIsToastDismissed] = useState(false); // Track if update toast is dismissed / 更新トーストが閉じられたか追跡
  const [isToastClosing, setIsToastClosing] = useState(false); // Track toast closing animation / トースト終了アニメーション追跡
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preCompositionValue = useRef<string>(''); // Store value before IME composition / IME構成前の値を保存
  const isComposing = useRef<boolean>(false); // Track if IME is composing / IME構成中かどうかを追跡
  const lastCursorPosition = useRef<number | null>(null); // Store cursor position before virtual key click / 仮想キークリック前のカーソル位置を保存
  
  const [config, setConfig] = useState<OscConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.OSC_CONFIG);
    return saved ? JSON.parse(saved) : {
      bridgeUrl: DEFAULT_CONFIG.BRIDGE_URL,
      oscPort: DEFAULT_CONFIG.OSC_PORT,
      autoSend: DEFAULT_CONFIG.AUTO_SEND,
      language: DEFAULT_CONFIG.LANGUAGE,
      theme: DEFAULT_CONFIG.THEME,
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
    if (!config.theme) {
      newConfig.theme = DEFAULT_CONFIG.THEME;
      needsUpdate = true;
    }
    if (!config.updateCheckInterval) {
      newConfig.updateCheckInterval = DEFAULT_CONFIG.UPDATE_CHECK_INTERVAL;
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

  // Load persisted update info on mount / マウント時に永続化された更新情報を読み込む
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; url: string } | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.UPDATE_AVAILABLE);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Check if the persisted update matches current version (already updated) / 保存された更新が現在のバージョンと一致するか確認（更新済み）
        // Normalize versions to handle 'v' prefix logic / 'v'プレフィックスを処理するためにバージョンを正規化
        const normalize = (v: string) => v.replace(/^v/, '');
        
        // APP_VERSION is defined in vite config
        if (parsed.version && normalize(parsed.version) === normalize(APP_VERSION)) {
           // Already updated to this version, clear persistence / 既にこのバージョンに更新済みなので、永続化情報をクリア
           localStorage.removeItem(STORAGE_KEYS.UPDATE_AVAILABLE);
           return null;
        }
        return parsed;
      } catch {
        return null;
      }
    }
    return null;
  });

  // Update Check Logic - runs only once on mount / 更新確認ロジック - マウント時に1回のみ実行
  useEffect(() => {
    const checkUpdate = async () => {
      if (!window.electronAPI) return;
      
      // Get current interval from localStorage to ensure we use the latest value / 最新の値を使用するためlocalStorageから取得
      const savedConfig = localStorage.getItem(STORAGE_KEYS.OSC_CONFIG);
      const currentInterval = savedConfig ? JSON.parse(savedConfig).updateCheckInterval : config.updateCheckInterval;
      
      if (!currentInterval || currentInterval === 'manual') return;

      const lastCheck = localStorage.getItem(STORAGE_KEYS.LAST_UPDATE_CHECK);
      const now = Date.now();
      let shouldCheck = false;

      if (currentInterval === 'startup') {
        shouldCheck = true;
      } else if (currentInterval === 'daily') {
        // Check if 24 hours passed / 24時間経過したか確認
        if (!lastCheck || now - parseInt(lastCheck) > 24 * 60 * 60 * 1000) {
          shouldCheck = true;
        }
      } else if (currentInterval === 'weekly') {
        // Check if 7 days passed / 7日経過したか確認
        if (!lastCheck || now - parseInt(lastCheck) > 7 * 24 * 60 * 60 * 1000) {
          shouldCheck = true;
        }
      }

      if (shouldCheck) {
        try {
          const result = await window.electronAPI.checkForUpdate();
          localStorage.setItem(STORAGE_KEYS.LAST_UPDATE_CHECK, now.toString());
          
          
          if (result.success && result.updateAvailable && result.latestVersion) {
            const updateInfo = {
              version: result.latestVersion,
              url: result.url || 'https://github.com/fuku2019/VRC-OSC-Keyboard/releases'
            };
            setUpdateAvailable(updateInfo);
            // Reset toast dismissed state to show toast for new update / 新しい更新のためにトースト非表示状態をリセット
            setIsToastDismissed(false);
            // Persist to localStorage / localStorageに永続化
            localStorage.setItem(STORAGE_KEYS.UPDATE_AVAILABLE, JSON.stringify(updateInfo));
          } else if (result.success && !result.updateAvailable) {
            // No update available, clear persisted info / 更新なし、保存情報をクリア
            setUpdateAvailable(null);
            localStorage.removeItem(STORAGE_KEYS.UPDATE_AVAILABLE);
          }
        } catch (e) {
          console.error("Auto update check failed:", e);
        }
      }
    };

    checkUpdate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount / マウント時に1回のみ実行

  // Handle toast dismissal with animation / アニメーション付きでトーストを閉じる
  const handleToastDismiss = () => {
    setIsToastClosing(true);
    setTimeout(() => {
      setIsToastDismissed(true);
      setIsToastClosing(false);
    }, 200); // Match animation duration (0.2s)
  };

  // Theme effect / テーマ反映
  useEffect(() => {
    const root = window.document.documentElement;
    if (config.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [config.theme]);

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
    const savedPosition = lastCursorPosition.current;
    const oldLength = displayText.length; // Save text length before action / アクション前のテキスト長を保存
    action();
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        if (savedPosition !== null) {
          // Calculate cursor position based on text length change / テキスト長の変化に基づいてカーソル位置を計算
          const newLength = textareaRef.current.value.length;
          const newPos = Math.min(savedPosition + (newLength - oldLength), newLength);
          textareaRef.current.selectionStart = newPos;
          textareaRef.current.selectionEnd = newPos;
          lastCursorPosition.current = newPos; // Update saved position / 保存位置を更新
        } else {
          // No saved position, move to end / 保存位置なし、末尾に移動
          const len = textareaRef.current.value.length;
          textareaRef.current.selectionStart = len;
          textareaRef.current.selectionEnd = len;
        }
      }
    }, 0);
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
    <div className="h-full min-h-screen w-full dark:bg-slate-950/90 bg-slate-50 flex flex-col items-center justify-center p-4 overflow-y-auto overflow-x-hidden transition-colors duration-300">
      <TutorialOverlay 
        isOpen={isTutorialOpen} 
        onClose={handleTutorialClose} 
        language={config.language || DEFAULT_CONFIG.LANGUAGE} 
      />

      <div className="w-full max-w-5xl flex justify-between items-center mb-4 px-2 shrink-0 pt-4 md:pt-0">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]"></div>
          <h1 className="text-xl md:text-2xl font-bold dark:text-slate-100 text-slate-800 tracking-wider drop-shadow-md">
            {t.appTitlePrefix}<span className="ml-0 px-1.5 py-1 bg-[#06b6d4]/40 dark:bg-[#034445]/80 rounded-md border border-[#06b6d4]/60 dark:border-[#06b6d4]/30 shadow-lg backdrop-blur-sm">{t.appTitle}</span>
          </h1>
        </div>
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="relative p-2 dark:bg-slate-800/80 bg-white/80 rounded-full dark:hover:bg-slate-700 hover:bg-slate-100 dark:text-slate-300 text-slate-500 transition-colors border dark:border-slate-700 border-slate-200 shadow-sm"
        >
          <Settings size={20} />
          {updateAvailable && (
            <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 dark:border-slate-900 border-white animate-pulse" />
          )}
        </button>
      </div>

      <div className="w-full max-w-5xl mb-4 relative shrink-0 group px-1">
        <div className={`
          relative w-full h-24 md:h-32 dark:bg-slate-900/80 bg-white/80 rounded-2xl border-2 
          flex flex-col px-6 py-2 shadow-inner backdrop-blur transition-colors
          ${error ? 'border-red-500/50' : 'dark:border-slate-700 border-slate-200 focus-within:border-cyan-500/50'}
        `}>
          <div className="absolute top-2 right-4 flex gap-3 items-center pointer-events-none z-10">
            {/* Character Counter / 文字数カウンター */}
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
              displayText.length >= CHATBOX.MAX_LENGTH
                ? 'text-red-400 border-red-500/50 bg-red-900/20'
                : displayText.length > CHATBOX.WARNING_THRESHOLD
                  ? 'text-amber-400 border-amber-500/50 bg-amber-900/20'
                  : 'dark:text-slate-400 text-slate-500 dark:border-slate-600 border-slate-200 dark:bg-slate-800/50 bg-slate-100/50'
            }`}>
              {displayText.length}/{CHATBOX.MAX_LENGTH}
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
                className="cursor-pointer text-[10px] font-bold dark:bg-slate-800 bg-slate-100 px-2 py-0.5 rounded dark:text-slate-400 text-slate-500 border dark:border-slate-700 border-slate-200 hover:text-cyan-600 dark:hover:text-white hover:border-cyan-500 transition-colors"
                onClick={toggleMode}
               tabIndex={-1}
             >
               {t.modes[mode]}
             </button>
          </div>

          <textarea
            ref={textareaRef}
            value={displayText}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onBlur={() => { isComposing.current = false; }}
            onSelect={(e) => { lastCursorPosition.current = e.currentTarget.selectionStart; }}
            maxLength={CHATBOX.MAX_LENGTH}
            className="w-full h-full bg-transparent text-2xl md:text-4xl dark:text-white text-slate-900 font-medium resize-none outline-none mt-6 leading-tight break-all font-sans"
            spellCheck="false"
            autoFocus
          />
        </div>
      </div>

      <div className="w-full max-w-5xl shrink-0 px-1 pb-4">
        <VirtualKeyboard 
          onChar={(c) => handleVirtualKey(() => handleCharInput(c, lastCursorPosition.current ?? undefined))}
          onBackspace={() => handleVirtualKey(() => handleBackspace(lastCursorPosition.current ?? undefined))}
          onClear={() => handleVirtualKey(handleClear)}
          onSend={() => handleVirtualKey(handleSend)}
          onSpace={() => handleVirtualKey(() => handleSpace(lastCursorPosition.current ?? undefined))}
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
        updateAvailableVersion={updateAvailable?.version}
        onUpdateAvailable={(version, url) => {
          if (version === null) {
            setUpdateAvailable(null);
          } else if (url) {
            setUpdateAvailable({ version, url });
          }
        }}
      />

      {/* Update Notification Toast / アップデート通知トースト */}
      {updateAvailable && !isSettingsOpen && !isToastDismissed && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 ${isToastClosing ? 'animate-fade-out' : 'animate-bounce-in'}`}>
          <div className="flex items-center justify-between gap-4 dark:bg-slate-800 bg-white p-4 rounded-xl shadow-2xl border dark:border-cyan-500/50 border-cyan-500 ring-1 ring-cyan-500/20 w-full">
            <div className="flex flex-col">
              <span className="text-sm font-bold dark:text-white text-slate-800 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
                {t.settings.updateAvailable.replace('{version}', updateAvailable.version)}
              </span>
            </div>
            <div className="flex gap-2">
               <button 
                onClick={() => {
                  if (window.electronAPI && updateAvailable.url) {
                    window.electronAPI.openExternal(updateAvailable.url);
                  }
                }}
                className="px-3 py-1.5 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
              >
                {t.settings.openReleasePage}
              </button>
              <button 
                onClick={handleToastDismiss}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default App;
