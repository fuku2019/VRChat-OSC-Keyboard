import { useState, useMemo, useEffect, useRef } from 'react';
import { useConfigStore } from '../stores/configStore';
import { sendOscMessage } from '../services/oscService';
import { throttle } from '../utils/throttle';
import { TRANSLATIONS, TIMEOUTS, THROTTLE } from '../constants';

/**
 * Hook to handle OSC message sending, including manual and throttled auto-sending
 * 手動送信およびスロットル制御された自動送信を含む、OSCメッセージ送信を処理するフック
 */
export const useOscSender = (
  displayText: string,
  setInput: (val: string) => void,
  sendTypingStatus: (isTyping: boolean) => void,
  cancelTypingTimeout: () => void,
  commitBuffer: () => void,
) => {
  const config = useConfigStore((state) => state.config);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const lastSentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = TRANSLATIONS[config.language];

  // Throttled sender for auto-send mode / 自動送信モード用のスロットル送信関数
  const throttledAutoSend = useMemo(
    () =>
      throttle((text: string, url: string) => {
        // Double check autoSend state to prevent lingering sends after disable
        // OFF切り替え後の送信残りを防ぐためにautoSend状態をダブルチェック
        if (!useConfigStore.getState().config.autoSend) return;
        if (!text) return;
        sendOscMessage(text, url, true, false); // direct=true, sound=false
      }, THROTTLE.AUTO_SEND), // 750ms throttle
    [],
  );

  // Cleanup throttled sender on unmount / アンマウント時にスロットル送信をクリーンアップ
  useEffect(() => {
    return () => {
      throttledAutoSend.cancel();
      if (lastSentTimerRef.current) {
        clearTimeout(lastSentTimerRef.current);
        lastSentTimerRef.current = null;
      }
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };
  }, [throttledAutoSend]);

  const handleSend = async (
    textareaRef: React.RefObject<HTMLTextAreaElement>,
  ) => {
    const textToSend = displayText;

    if (!textToSend.trim()) return;

    // Keep input state consistent with what is sent (flush pending IME buffer)
    // 送信テキストと状態を一致させるため、未確定バッファを確定
    commitBuffer();

    setIsSending(true);
    setError(null);

    try {
      const result = await sendOscMessage(textToSend, config.bridgeUrl);

      if (result.success) {
        setLastSent(textToSend);
        setInput('');
        // Stop typing indicator on successful send / 送信成功時にタイピングインジケーターを停止
        sendTypingStatus(false);
        cancelTypingTimeout();

        if (lastSentTimerRef.current) {
          clearTimeout(lastSentTimerRef.current);
        }
        lastSentTimerRef.current = setTimeout(
          () => setLastSent(null),
          TIMEOUTS.SENT_NOTIFICATION,
        );
      } else {
        console.error('OSC Send Failed:', result.error);
        setError(result.error || t.status.error);
        if (errorTimerRef.current) {
          clearTimeout(errorTimerRef.current);
        }
        errorTimerRef.current = setTimeout(
          () => setError(null),
          TIMEOUTS.ERROR_NOTIFICATION,
        );
      }
    } catch (e: any) {
      setError(e.message || t.status.error);
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
      errorTimerRef.current = setTimeout(
        () => setError(null),
        TIMEOUTS.ERROR_NOTIFICATION,
      );
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  };

  return {
    isSending,
    lastSent,
    error,
    throttledAutoSend,
    handleSend,
  };
};
