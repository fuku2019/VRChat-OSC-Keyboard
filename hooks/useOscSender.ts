import { useState, useMemo } from 'react';
import { useConfigStore } from '../stores/configStore';
import { sendOscMessage } from '../services/oscService';
import { throttle } from '../utils/throttle';
import { TRANSLATIONS, TIMEOUTS } from '../constants';

/**
 * Hook to handle OSC message sending, including manual and throttled auto-sending
 * 手動送信およびスロットル制御された自動送信を含む、OSCメッセージ送信を処理するフック
 */
export const useOscSender = (
  input: string,
  buffer: string,
  setInput: (val: string) => void,
  sendTypingStatus: (isTyping: boolean) => void,
  cancelTypingTimeout: () => void,
  commitBuffer: () => void,
) => {
  const config = useConfigStore((state) => state.config);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

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
      }, 750), // 750ms throttle
    [],
  );

  const handleSend = async (
    textareaRef: React.RefObject<HTMLTextAreaElement>,
  ) => {
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
        // Stop typing indicator on successful send / 送信成功時にタイピングインジケーターを停止
        sendTypingStatus(false);
        cancelTypingTimeout();

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

  return {
    isSending,
    lastSent,
    error,
    throttledAutoSend,
    handleSend,
  };
};
