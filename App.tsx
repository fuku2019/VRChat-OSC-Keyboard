/**
 * App - Main application component
 * メインアプリケーションコンポーネント
 */

import { useState, useEffect } from 'react';
import { Settings, Zap, ZapOff, Copy, RefreshCw } from 'lucide-react';
import VirtualKeyboard from './components/VirtualKeyboard';
import SettingsModal from './components/SettingsModal';
import TutorialOverlay from './components/TutorialOverlay';
import NotificationToast from './components/NotificationToast';
import StatusDisplay from './components/StatusDisplay';
import CursorOverlay from './components/CursorOverlay';
import { InputMode } from './types';
import { useIME } from './hooks/useIME';
import { useUpdateChecker } from './hooks/useUpdateChecker';
import { useConfigStore } from './stores/configStore';
import { useTheme } from './hooks/useTheme';
import { useTypingIndicator } from './hooks/useTypingIndicator';
import { useOscSender } from './hooks/useOscSender';
import { useKeyboardController } from './hooks/useKeyboardController';
import { TRANSLATIONS, STORAGE_KEYS, TIMEOUTS, CHATBOX } from './constants';

const App = () => {
  const config = useConfigStore((state) => state.config);
  const updateConfig = useConfigStore((state) => state.updateConfig);
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

  // Use custom hooks / カスタムフックを使用
  useTheme();
  const { sendTypingStatus, resetTypingTimeout, cancelTypingTimeout } =
    useTypingIndicator();
  const {
    isSending,
    lastSent,
    error,
    throttledAutoSend,
    handleSend: triggerSend,
  } = useOscSender(
    displayText,
    setInput,
    sendTypingStatus,
    cancelTypingTimeout,
    commitBuffer,
  );

  // Use update checker hook / アップデート確認フックを使用
  const { updateAvailable, setUpdateAvailable } = useUpdateChecker();

  // Common handler for input side effects (Typing indicator, Auto-send)
  // 入力副作用の共通ハンドラ（タイピングインジケーター、自動送信）
  const handleInputEffect = (text: string) => {
    if (config.copyMode) {
      cancelTypingTimeout();
      sendTypingStatus(false);
      return;
    }

    // Typing Indicator Logic
    if (text.length > 0) {
      sendTypingStatus(true);
      resetTypingTimeout();
    } else {
      // If text is empty, stop typing indicator immediately / テキストが空なら即座に停止
      cancelTypingTimeout();
      sendTypingStatus(false);
    }

    // Auto-Send Logic
    if (config.autoSend) {
      throttledAutoSend(text, config.bridgeUrl);
    }
  };

  // Use keyboard controller hook / キーボードコントローラーフックを使用
  const {
    textareaRef,
    toggleMode,
    handleKeyDown,
    handleCompositionStart,
    handleCompositionEnd,
    handleTextareaChange,
    handleSelect,
    createVirtualKeyHandlers,
  } = useKeyboardController({
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
    handlePrimaryAction,
    handleInputEffect,
  });

  const virtualKeyHandlers = createVirtualKeyHandlers();

  const t = TRANSLATIONS[config.language];

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

  // Handle textarea blur - stop typing indicator / textarea ブラー時 - タイピングインジケーターを停止
  const handleBlur = () => {
    cancelTypingTimeout();
    sendTypingStatus(false);
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

  const handleAutoSendToggle = () => {
    if (config.copyMode) return;
    updateConfig('autoSend', !config.autoSend);
  };

  const handleCopyModeToggle = () => {
    if (!config.copyMode) {
      updateConfig('autoSendBeforeCopyMode', config.autoSend);
      updateConfig('copyMode', true);
      updateConfig('autoSend', false);
      cancelTypingTimeout();
      sendTypingStatus(false);
      return;
    }

    updateConfig('copyMode', false);
    updateConfig('autoSend', config.autoSendBeforeCopyMode);
  };

  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      console.warn(
        '[Clipboard] navigator.clipboard failed, fallback to execCommand:',
        error,
      );
    }

    let tempTextarea: HTMLTextAreaElement | null = null;
    try {
      tempTextarea = document.createElement('textarea');
      tempTextarea.value = text;
      tempTextarea.setAttribute('readonly', '');
      tempTextarea.style.position = 'fixed';
      tempTextarea.style.top = '-9999px';
      document.body.appendChild(tempTextarea);
      tempTextarea.focus();
      tempTextarea.select();
      return document.execCommand('copy');
    } catch (error) {
      console.error('[Clipboard] execCommand copy failed:', error);
      return false;
    } finally {
      if (tempTextarea?.parentNode) {
        tempTextarea.parentNode.removeChild(tempTextarea);
      }
    }
  };

  async function handlePrimaryAction() {
    if (!config.copyMode) {
      await triggerSend(textareaRef);
      return;
    }

    if (!displayText.trim()) return;

    const copied = await copyTextToClipboard(displayText);
    if (!copied) {
      console.error('[Clipboard] Copy failed');
      return;
    }

    overwriteInput('');
    cancelTypingTimeout();
    sendTypingStatus(false);
    textareaRef.current?.focus();
  }

  return (
    <div className='h-full min-h-screen w-full dark:bg-slate-950/90 pure-black:bg-black bg-slate-50 flex flex-col items-center justify-center p-4 overflow-y-auto overflow-x-hidden transition-colors duration-300'>
      <TutorialOverlay
        isOpen={isTutorialOpen}
        onClose={handleTutorialClose}
        language={config.language}
      />

      {/* Header / ヘッダー */}
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

        <div className='flex items-center gap-3'>
          <button
            onClick={handleCopyModeToggle}
            className={`
              relative p-2 rounded-full transition-all border shadow-sm flex items-center gap-2 px-3
              ${
                config.copyMode
                  ? 'bg-blue-500/10 border-blue-500/50 text-blue-600 dark:text-blue-400'
                  : 'dark:bg-slate-800/80 bg-white/80 dark:hover:bg-slate-700 hover:bg-slate-100 dark:text-slate-500 text-slate-400 border-slate-200 dark:border-slate-700'
              }
            `}
            title={config.copyMode ? t.controls.copyModeOn : t.controls.copyModeOff}
          >
            <Copy size={20} />
            <span className='text-xs font-bold hidden md:inline'>
              {config.copyMode ? t.controls.copyOnShort : t.controls.copyOffShort}
            </span>
          </button>

          <button
            onClick={handleAutoSendToggle}
            disabled={config.copyMode}
            className={`
              relative p-2 rounded-full transition-all border shadow-sm flex items-center gap-2 px-3
              ${
                config.copyMode
                  ? 'dark:bg-slate-800/60 bg-slate-100/70 dark:text-slate-600 text-slate-400 border-slate-300 dark:border-slate-700 cursor-not-allowed opacity-70'
                  : config.autoSend
                    ? 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400'
                    : 'dark:bg-slate-800/80 bg-white/80 dark:hover:bg-slate-700 hover:bg-slate-100 dark:text-slate-500 text-slate-400 border-slate-200 dark:border-slate-700'
              }
            `}
            title={
              config.copyMode
                ? t.controls.autoSendDisabledByCopyMode
                : config.autoSend
                  ? t.controls.autoSendOn
                  : t.controls.autoSendOff
            }
          >
            {config.autoSend ? <Zap size={20} /> : <ZapOff size={20} />}
            <span className='text-xs font-bold hidden md:inline'>
              {config.autoSend ? 'AUTO' : 'MANUAL'}
            </span>
          </button>

          <button
            onClick={() => window.electronAPI?.resetOverlayPosition?.()}
            className='relative p-2 dark:bg-slate-800/80 bg-white/80 rounded-full dark:hover:bg-slate-700 hover:bg-slate-100 dark:text-slate-300 text-slate-500 transition-colors border dark:border-slate-700 border-slate-200 shadow-sm'
            title='Reset Overlay to Front'
          >
            <RefreshCw size={20} />
          </button>

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
      </div>

      {/* Text Input Area / テキスト入力エリア */}
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
            onBlur={handleBlur}
            onSelect={handleSelect}
            maxLength={CHATBOX.MAX_LENGTH}
            className='w-full h-full bg-transparent text-2xl md:text-4xl dark:text-white text-slate-900 font-medium resize-none outline-none mt-6 leading-tight break-all font-sans'
            spellCheck='false'
            autoFocus
          />
        </div>
      </div>

      {/* Virtual Keyboard / 仮想キーボード */}
      <div className='w-full max-w-5xl shrink-0 px-1 pb-4'>
        <VirtualKeyboard
          {...virtualKeyHandlers}
          mode={mode}
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

      {/* VR Controller Cursor / VRコントローラーカーソル */}
      <CursorOverlay />
    </div>
  );
};

export default App;
