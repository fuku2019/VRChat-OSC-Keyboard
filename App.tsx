/**
 * App - Main application component
 * メインアプリケーションコンポーネント
 */

import { useState, useEffect, useCallback } from 'react';
import { Settings, Zap, ZapOff, Copy, RefreshCw } from 'lucide-react';
import VirtualKeyboard from './components/VirtualKeyboard';
import SettingsModal from './components/SettingsModal';
import TutorialOverlay from './components/TutorialOverlay';
import NotificationToast from './components/NotificationToast';
import StatusDisplay from './components/StatusDisplay';
import CursorOverlay from './components/CursorOverlay';
import PreeditUnderline from './components/PreeditUnderline';
import { InputMode } from './types';
import { useIME } from './hooks/useIME';
import { useUpdateChecker } from './hooks/useUpdateChecker';
import { useConfigStore } from './stores/configStore';
import { useTheme } from './hooks/useTheme';
import { useTypingIndicator } from './hooks/useTypingIndicator';
import { useOscSender } from './hooks/useOscSender';
import { useKeyboardController } from './hooks/useKeyboardController';
import { useVrScrollSelectionGuard } from './hooks/useVrScrollSelectionGuard';
import { useSendHistory } from './hooks/useSendHistory';
import { TRANSLATIONS, STORAGE_KEYS, TIMEOUTS, CHATBOX } from './constants';

// Shared by the textarea and its preedit underline mirror so both wrap identically.
// テキストエリアと未確定下線のミラーで共有し、折り返し位置を一致させる。
const TEXT_LAYOUT_CLASS =
  'text-4xl font-normal leading-tight break-all font-sans';

// Header controls: borderless round buttons, tonal when on (Material 3).
// ヘッダーの操作ボタン。枠のない丸いボタンで、ON のときは tonal(Material 3)。
const HEADER_ICON_CLASS =
  'relative w-11 h-11 rounded-full flex items-center justify-center text-ink-muted';
const HEADER_PILL_CLASS =
  'h-11 px-4 rounded-full flex items-center gap-2 text-[15px]';
const HEADER_ON_CLASS = 'bg-tonal text-on-tonal font-medium';
const HEADER_OFF_CLASS = 'text-ink-muted';

// Copy text to clipboard / クリップボードへテキストをコピー
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

const App = () => {
  const config = useConfigStore((state) => state.config);
  const updateConfig = useConfigStore((state) => state.updateConfig);
  const {
    candidates,
    candidateIndex,
    isConverting,
    displayText,
    displayCaret,
    displaySelectionEnd,
    preeditRange,
    caretRevision,
    mutationSeq,
    mode,
    setMode,
    handleCharInput,
    handleBackspace,
    handleClear,
    handleSpace,
    handleCommitCandidate,
    commitPreedit,
    setSelection,
    replaceAll,
    clearAll,
  } = useIME(InputMode.HIRAGANA);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isToastDismissed, setIsToastDismissed] = useState(false); // Track if update toast is dismissed / 更新トーストが閉じられたか追跡
  // State for debug mode  デバッグモードの状態
  const [isDebug, setIsDebug] = useState(false);

  useTheme();
  useVrScrollSelectionGuard();
  const {
    pushHistory,
    navigateUp,
    navigateDown,
    notifyInputChanged,
    clearHistory,
  } = useSendHistory();
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
    clearAll,
    sendTypingStatus,
    cancelTypingTimeout,
    commitPreedit,
    pushHistory,
  );

  // Use update checker hook / アップデート確認フックを使用
  const { updateAvailable, setUpdateAvailable, isDownloading, downloadProgress, downloadError, downloadedPath, startDownload, cancelDownload, installUpdate } = useUpdateChecker();

  // Common handler for input side effects (Typing indicator, Auto-send)
  // 入力副作用の共通ハンドラ（タイピングインジケーター、自動送信）
  // Stable so the controller's mutation effect does not re-run on every render.
  // コントローラの変異エフェクトが毎レンダー再実行されないよう安定化する。
  const handleInputEffect = useCallback((text: string) => {
    // Editing the text leaves history navigation / テキストを編集したら履歴走査を抜ける
    notifyInputChanged(text);

    if (config.copyMode) {
      cancelTypingTimeout();
      sendTypingStatus(false);
      return;
    }

    // Typing Indicator Logic タイピングインジケーターのロジック
    if (text.length > 0) {
      sendTypingStatus(true);
      resetTypingTimeout();
    } else {
      // If text is empty, stop typing indicator immediately / テキストが空なら即座に停止
      cancelTypingTimeout();
      sendTypingStatus(false);
    }

    // Auto-Send Logic 自動送信ロジック
    if (config.autoSend) {
      throttledAutoSend(text, config.bridgeUrl);
    }
  }, [
    notifyInputChanged,
    config.copyMode,
    config.autoSend,
    config.bridgeUrl,
    cancelTypingTimeout,
    sendTypingStatus,
    resetTypingTimeout,
    throttledAutoSend,
  ]);

  // Navigate history / 履歴を走査
  //
  // replaceAll returns the text that was actually applied. useSendHistory
  // compares that against what it handed out, so passing the untrimmed string
  // would make it think the user edited the text and drop out of navigation.
  // replaceAll は実際に適用されたテキストを返す。useSendHistory はそれを自分が渡した
  // 文字列と突き合わせるため、切り詰め前の文字列を渡すとユーザーが編集したと誤認され、
  // 履歴走査から抜けてしまう。
  const handleHistoryUp = useCallback(() => {
    const text = navigateUp(displayText);
    if (text !== null) replaceAll(text);
  }, [navigateUp, displayText, replaceAll]);

  const handleHistoryDown = useCallback(() => {
    const text = navigateDown();
    if (text !== null) replaceAll(text);
  }, [navigateDown, replaceAll]);

  // Handle primary action (Send or Copy) / プライマリアクション（送信またはコピー）の処理
  const handlePrimaryAction = useCallback(async () => {
    if (!config.copyMode) {
      await triggerSend();
      return;
    }

    if (!displayText.trim()) return;

    const copied = await copyTextToClipboard(displayText);
    if (!copied) {
      console.error('[Clipboard] Copy failed');
      return;
    }

    clearAll();
    cancelTypingTimeout();
    sendTypingStatus(false);
  }, [
    config.copyMode,
    triggerSend,
    displayText,
    clearAll,
    cancelTypingTimeout,
    sendTypingStatus,
  ]);

  // Use keyboard controller hook / キーボードコントローラーフックを使用
  const {
    textareaRef,
    handleTextareaChange,
    handleSelect,
    handlePointerDown,
    virtualKeyHandlers,
  } = useKeyboardController({
    displayText,
    displayCaret,
    displaySelectionEnd,
    caretRevision,
    mutationSeq,
    isConverting,
    mode,
    setMode,
    handleCharInput,
    handleBackspace,
    handleClear,
    handleSpace,
    handleCommitCandidate,
    commitPreedit,
    setSelection,
    handlePrimaryAction,
    handleInputEffect,
    onHistoryUp: handleHistoryUp,
    onHistoryDown: handleHistoryDown,
  });

  // Get translations / 翻訳を取得
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

  // Check if running in debug mode on mount  マウント時にデバッグモードで起動しているか確認
  useEffect(() => {
    const checkDebugMode = async () => {
      if (window.electronAPI?.isDebugMode) {
        const debugMode = await window.electronAPI.isDebugMode();
        setIsDebug(debugMode);
      }
    };
    checkDebugMode();
  }, []);

  // Serve requests from the desktop settings window. In VR mode that window is
  // the only one the user can click, but the tutorial and the send history live
  // here, so it asks the main process to relay the action to us.
  // デスクトップ設定ウィンドウからの依頼に応じる。VRモードではユーザーが操作できる
  // のはあちらのウィンドウだけだが、チュートリアルと送信履歴はこちらにあるため、
  // メインプロセスを経由して操作が中継されてくる。
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onShowTutorial || !api?.onClearHistory) return;

    const showTutorial = () => {
      setIsSettingsOpen(false);
      setIsTutorialOpen(true);
    };
    const clearSendHistory = () => clearHistory();

    api.onShowTutorial(showTutorial);
    api.onClearHistory(clearSendHistory);
    return () => {
      api.removeShowTutorialListener?.(showTutorial);
      api.removeClearHistoryListener?.(clearSendHistory);
    };
  }, [clearHistory]);

  // Handle textarea blur - stop typing indicator / textarea ブラー時 - タイピングインジケーターを停止
  const handleBlur = () => {
    cancelTypingTimeout();
    sendTypingStatus(false);
  };

  // Handle tutorial close / チュートリアルを閉じる処理
  const handleTutorialClose = () => {
    setIsTutorialOpen(false);
    localStorage.setItem(STORAGE_KEYS.HAS_SEEN_TUTORIAL, 'true');
    setTimeout(() => textareaRef.current?.focus(), TIMEOUTS.FOCUS_DELAY);
  };

  // Open tutorial from settings / 設定からチュートリアルを開く処理
  const handleOpenTutorialFromSettings = () => {
    setIsSettingsOpen(false);
    setIsTutorialOpen(true);
  };

  // Toggle auto-send mode / 自動送信モードの切り替え
  const handleAutoSendToggle = () => {
    if (config.copyMode) return;
    updateConfig('autoSend', !config.autoSend);
  };

  // Toggle copy mode / コピーモードの切り替え
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

  return (
    <div className='h-full min-h-screen w-full bg-canvas text-ink flex flex-col items-center justify-center px-4 py-4 overflow-y-auto overflow-x-hidden'>
      <TutorialOverlay
        isOpen={isTutorialOpen}
        onClose={handleTutorialClose}
        language={config.language}
      />

      {/* Header / ヘッダー */}
      <div className='w-full flex justify-between items-center mb-3 pl-2 shrink-0'>
        <h1 className='text-[17px] font-medium flex items-center gap-2'>
          {t.appTitlePrefix} {t.appTitle}
          {isDebug && (
            <span className='text-sm text-error select-none'>(Debug)</span>
          )}
        </h1>

        <div className='flex items-center gap-1'>
          <button
            onClick={handleCopyModeToggle}
            className={`${HEADER_PILL_CLASS} ${config.copyMode ? HEADER_ON_CLASS : HEADER_OFF_CLASS}`}
            title={
              config.copyMode ? t.controls.copyModeOn : t.controls.copyModeOff
            }
          >
            <Copy size={22} />
            <span>
              {config.copyMode
                ? t.controls.copyOnShort
                : t.controls.copyOffShort}
            </span>
          </button>

          <button
            onClick={handleAutoSendToggle}
            disabled={config.copyMode}
            className={`${HEADER_PILL_CLASS} ${
              config.copyMode
                ? `${HEADER_OFF_CLASS} opacity-40 cursor-not-allowed`
                : config.autoSend
                  ? HEADER_ON_CLASS
                  : HEADER_OFF_CLASS
            }`}
            title={
              config.copyMode
                ? t.controls.autoSendDisabledByCopyMode
                : config.autoSend
                  ? t.controls.autoSendOn
                  : t.controls.autoSendOff
            }
          >
            {config.autoSend ? <Zap size={22} /> : <ZapOff size={22} />}
            <span>
              {config.autoSend
                ? t.controls.autoSendOnShort
                : t.controls.autoSendOffShort}
            </span>
          </button>

          <button
            onClick={() => window.electronAPI?.resetOverlayPosition?.()}
            className={HEADER_ICON_CLASS}
            title={t.controls.resetOverlay}
            aria-label={t.controls.resetOverlay}
          >
            <RefreshCw size={22} />
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className={HEADER_ICON_CLASS}
            title={t.settings.title}
            aria-label={t.settings.title}
          >
            <Settings size={22} />
            {/* Static on purpose: a pulsing dot would make the offscreen window
                paint every frame for as long as an update is pending.
                あえて静止させている。点滅させると、更新がある間ずっと
                オフスクリーンのウィンドウが毎フレーム描画することになる。 */}
            {updateAvailable && (
              <span className='absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-error rounded-full' />
            )}
          </button>
        </div>
      </div>

      {/* Text Input Area / テキスト入力エリア */}
      <div className='w-full mb-3 shrink-0'>
        <div
          className={`
          relative w-full h-36 bg-key rounded-3xl flex flex-col px-6 pt-3 pb-2 overflow-hidden
          ${error ? 'outline-2 outline-error -outline-offset-2' : 'pure-black:border pure-black:border-line'}
        `}
        >
          <div className='absolute top-2 right-3 z-10'>
            <StatusDisplay
              displayTextLength={displayText.length}
              isSending={isSending}
              lastSent={lastSent}
              error={error}
              sendingText={t.status.sending}
              sentText={t.status.sent}
            />
          </div>

          <div className='relative w-full h-full mt-7'>
            <PreeditUnderline
              textareaRef={textareaRef}
              text={displayText}
              range={preeditRange}
              isConverting={isConverting}
              className={TEXT_LAYOUT_CLASS}
            />
            <textarea
              ref={textareaRef}
              value={displayText}
              onChange={handleTextareaChange}
              onBlur={handleBlur}
              onSelect={handleSelect}
              onPointerDown={handlePointerDown}
              maxLength={CHATBOX.MAX_LENGTH}
              className={`relative w-full h-full bg-transparent text-ink caret-accent resize-none outline-none ${TEXT_LAYOUT_CLASS}`}
              spellCheck='false'
              autoFocus
            />
          </div>
        </div>
      </div>

      {/* Virtual Keyboard / 仮想キーボード */}
      <div className='w-full shrink-0'>
        <VirtualKeyboard
          {...virtualKeyHandlers}
          mode={mode}
          candidates={candidates}
          candidateIndex={candidateIndex}
          isConverting={isConverting}
          onCommitCandidate={virtualKeyHandlers.onCommitCandidate}
          language={config.language}
          keySoundEnabled={config.keySoundEnabled}
          keySoundVariant={config.keySoundVariant}
          onHistoryUp={virtualKeyHandlers.onHistoryUp}
          onHistoryDown={virtualKeyHandlers.onHistoryDown}
        />
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onShowTutorial={handleOpenTutorialFromSettings}
        updateAvailable={updateAvailable}
        onUpdateAvailable={(version, url, isInstaller, installerUrl) => {
          if (version === null) {
            setUpdateAvailable(null);
          } else if (url) {
            setUpdateAvailable({ version, url, isInstaller, installerUrl });
          }
        }}
        isDownloading={isDownloading}
        downloadProgress={downloadProgress}
        downloadError={downloadError}
        downloadedPath={downloadedPath}
        startDownload={startDownload}
        cancelDownload={cancelDownload}
        installUpdate={installUpdate}
        onClearHistory={clearHistory}
      />

      {/* Update Notification Toast / アップデート通知トースト */}
      {updateAvailable && !isSettingsOpen && !isToastDismissed && (
        <NotificationToast
          updateAvailable={updateAvailable}
          language={config.language}
          onClose={() => setIsToastDismissed(true)}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
          downloadError={downloadError}
          downloadedPath={downloadedPath}
          startDownload={startDownload}
          cancelDownload={cancelDownload}
          installUpdate={installUpdate}
        />
      )}

      {/* VR Controller Cursor / VRコントローラーカーソル */}
      <CursorOverlay />
    </div>
  );
};

export default App;
