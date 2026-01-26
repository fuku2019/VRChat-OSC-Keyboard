import { useState, useEffect, useRef } from 'react';
import { Settings } from 'lucide-react';
import VirtualKeyboard from './components/VirtualKeyboard';
import SettingsModal from './components/SettingsModal';
import TutorialOverlay from './components/TutorialOverlay';
import NotificationToast from './components/NotificationToast';
import StatusDisplay from './components/StatusDisplay';
import { InputMode } from './types';
import { sendOscMessage } from './services/oscService';
import { useIME } from './hooks/useIME';
import { useUpdateChecker } from './hooks/useUpdateChecker';
import { useConfigStore } from './stores/configStore';
import {
  TRANSLATIONS,
  STORAGE_KEYS,
  TIMEOUTS,
  CHATBOX,
} from './constants';
import { generatePalette, PRESET_PALETTES, hexToRgb, getLuminance } from './utils/colorUtils';
import { DEFAULT_CONFIG } from './constants/appConfig';

const App = () => {
  const config = useConfigStore((state) => state.config);
  const {
    input,
    buffer,
    displayText,
    mode,
    setMode,
    setInput,
    overwriteInput,
    handleCharInput,
    handleBackspace,
    handleClear,
    handleSpace,
    commitBuffer,
  } = useIME(InputMode.HIRAGANA);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isToastDismissed, setIsToastDismissed] = useState(false); // Track if update toast is dismissed / 更新トーストが閉じられたか追跡
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preCompositionValue = useRef<string>(''); // Store value before IME composition / IME構成前の値を保存
  const isComposing = useRef<boolean>(false); // Track if IME is composing / IME構成中かどうかを追跡
  const lastCursorPosition = useRef<number | null>(null); // Store cursor position before virtual key click / 仮想キークリック前のカーソル位置を保存

  // Use update checker hook / アップデート確認フックを使用
  const { updateAvailable, setUpdateAvailable } = useUpdateChecker();

  // Accent Color Effect / アクセントカラー反映
  useEffect(() => {
    const root = window.document.documentElement;
    const accentColor = config.accentColor || DEFAULT_CONFIG.ACCENT_COLOR;
    
    let palette;
    if (accentColor === 'cyan') {
      palette = PRESET_PALETTES.cyan;
    } else if (accentColor === 'purple') {
      palette = PRESET_PALETTES.purple;
    } else {
      palette = generatePalette(accentColor, config.theme as any);
    }

    Object.entries(palette).forEach(([shade, hex]) => {
      const rgb = hexToRgb(hex as string);
      if (rgb) {
        root.style.setProperty(`--rgb-primary-${shade}`, `${rgb.r} ${rgb.g} ${rgb.b}`);
      }
    });

    // Calculate on-primary color (text color on primary background)
    // We check shade 600 as it's often used for buttons
    const primary600 = palette[600]; 
    if (primary600) {
        const lum = getLuminance(primary600);
        // If luminance is high (bright), text should be black. Otherwise white.
        // Threshold around 0.5-0.6 usually works.
        const onPrimary = lum > 0.6 ? '0 0 0' : '255 255 255';
        root.style.setProperty('--rgb-on-primary', onPrimary);
    }

  }, [config.accentColor, config.theme]);

  // Theme effect / テーマ反映
  useEffect(() => {
    const root = window.document.documentElement;
    if (config.theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('pure-black');
    } else if (config.theme === 'pure-black') {
      root.classList.add('dark');
      root.classList.add('pure-black');
    } else {
      root.classList.remove('dark');
      root.classList.remove('pure-black');
    }
  }, [config.theme]);

  // Check for first launch to show tutorial / 初回起動を確認してチュートリアルを表示
  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem(
      STORAGE_KEYS.HAS_SEEN_TUTORIAL,
    );
    if (!hasSeenTutorial) {
      setIsTutorialOpen(true);
    } else {
      textareaRef.current?.focus();
    }
  }, []);

  const t = TRANSLATIONS[config.language];



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
        console.error('OSC Send Failed:', result.error);
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
          const newPos = Math.min(
            savedPosition + (newLength - oldLength),
            newLength,
          );
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
  const handleCompositionEnd = (
    e: React.CompositionEvent<HTMLTextAreaElement>,
  ) => {
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
    <div className='h-full min-h-screen w-full dark:bg-slate-950/90 pure-black:bg-black bg-slate-50 flex flex-col items-center justify-center p-4 overflow-y-auto overflow-x-hidden transition-colors duration-300'>
      <TutorialOverlay
        isOpen={isTutorialOpen}
        onClose={handleTutorialClose}
        language={config.language}
      />

      <div className='w-full max-w-5xl flex justify-between items-center mb-4 px-2 shrink-0 pt-4 md:pt-0'>
        <div className='flex items-center gap-3'>
          <div className='w-3 h-3 rounded-full bg-primary-500 shadow-[0_0_10px_rgb(var(--color-primary-500)_/_0.8)]'></div>
          <h1 className='text-xl md:text-2xl font-bold dark:text-slate-100 text-slate-800 tracking-wider drop-shadow-md'>
            {t.appTitlePrefix}
            <span className='ml-0 px-1.5 py-1 bg-primary-500/40 dark:bg-primary-900/80 rounded-md border border-primary-500/60 dark:border-primary-500/30 shadow-lg backdrop-blur-sm'>
              {t.appTitle}
            </span>
          </h1>
        </div>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className='relative p-2 dark:bg-slate-800/80 bg-white/80 rounded-full dark:hover:bg-slate-700 hover:bg-slate-100 dark:text-slate-300 text-slate-500 transition-colors border dark:border-slate-700 border-slate-200 shadow-sm'
        >
          <Settings size={20} />
          {updateAvailable && (
            <span className='absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 dark:border-slate-900 border-white animate-pulse' />
          )}
        </button>
      </div>

      <div className='w-full max-w-5xl mb-4 relative shrink-0 group px-1'>
        <div
          className={`
          relative w-full h-24 md:h-32 dark:bg-slate-900/80 bg-white/80 rounded-2xl border-2 
          flex flex-col px-6 py-2 shadow-inner backdrop-blur transition-colors
          ${error ? 'border-red-500/50' : 'dark:border-slate-700 border-slate-200 focus-within:border-primary-500/50'}
        `}
        >
          <StatusDisplay
            displayTextLength={displayText.length}
            isSending={isSending}
            lastSent={lastSent}
            error={error}
            sendingText={t.status.sending}
            sentText={t.status.sent}
          />

          <div className='absolute top-2 left-4 z-10'>
            <button
              className='cursor-pointer text-[10px] font-bold dark:bg-slate-800 bg-slate-100 px-2 py-0.5 rounded dark:text-slate-400 text-slate-500 border dark:border-slate-700 border-slate-200 hover:text-primary-600 dark:hover:text-[rgb(var(--rgb-on-primary))] hover:border-primary-500 transition-colors'
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
            onBlur={() => {
              isComposing.current = false;
            }}
            onSelect={(e) => {
              lastCursorPosition.current = e.currentTarget.selectionStart;
            }}
            maxLength={CHATBOX.MAX_LENGTH}
            className='w-full h-full bg-transparent text-2xl md:text-4xl dark:text-white text-slate-900 font-medium resize-none outline-none mt-6 leading-tight break-all font-sans'
            spellCheck='false'
            autoFocus
          />
        </div>
      </div>

      <div className='w-full max-w-5xl shrink-0 px-1 pb-4'>
        <VirtualKeyboard
          onChar={(c) =>
            handleVirtualKey(() =>
              handleCharInput(c, lastCursorPosition.current ?? undefined),
            )
          }
          onBackspace={() =>
            handleVirtualKey(() =>
              handleBackspace(lastCursorPosition.current ?? undefined),
            )
          }
          onClear={() => handleVirtualKey(handleClear)}
          onSend={() => handleVirtualKey(handleSend)}
          onSpace={() =>
            handleVirtualKey(() =>
              handleSpace(lastCursorPosition.current ?? undefined),
            )
          }
          mode={mode}
          onToggleMode={() => handleVirtualKey(toggleMode)}
          buffer={buffer}
          language={config.language}
        />
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
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
        <NotificationToast
          updateAvailable={updateAvailable}
          language={config.language}
          onClose={() => setIsToastDismissed(true)}
        />
      )}
    </div>
  );
};

export default App;
