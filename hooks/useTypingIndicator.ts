import { useRef, useEffect, useMemo } from 'react';
import { throttle } from '../utils/throttle';

/**
 * Hook to handle typing indicator status sending with throttling
 * タイピングインジケーターの状態送信とスロットリングを処理するフック
 */
export const useTypingIndicator = () => {
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Debounce timer for typing indicator / タイピングインジケーター用のデバウンスタイマー
  const isTypingRef = useRef<boolean>(false); // Track if currently typing / 現在タイピング中かどうかを追跡

  // Cleanup typing timeout on unmount / アンマウント時にタイピングタイムアウトをクリーンアップ
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Throttled sender for typing=true (prevents excessive OSC messages)
  // typing=true送信用のスロットル関数（過剰なOSCメッセージを防ぐ）
  const throttledSendTypingTrue = useMemo(
    () =>
      throttle(
        () => {
          if (window.electronAPI?.sendTypingStatus) {
            window.electronAPI.sendTypingStatus(true);
          }
        },
        2000, // Send at most once per 2 seconds / 最大2秒に1回送信
        { leading: true, trailing: true }, // Send immediately on first call, then throttle / 最初の呼び出しは即実行、その後スロットル
      ),
    [],
  );

  // Send typing status to VRChat / VRChatにタイピング状態を送信
  const sendTypingStatus = (isTyping: boolean) => {
    if (!isTyping) {
      // Stop typing: cancel pending throttle and send false immediately
      // 入力停止: 保留中のスロットルをキャンセルし、即座にfalseを送信
      throttledSendTypingTrue.cancel();

      // If already not typing, skip sending to prevent spamming false
      // 既にタイピング中でない場合は、falseの連送を防ぐためにスキップ
      if (!isTypingRef.current) return;

      isTypingRef.current = false;
      if (window.electronAPI?.sendTypingStatus) {
        window.electronAPI.sendTypingStatus(false);
      }
      return;
    }

    // Start/continue typing: use throttled sender
    // 入力開始/継続: スロットル送信を使用
    isTypingRef.current = true;
    throttledSendTypingTrue();
  };

  // Reset typing debounce timer / タイピングデバウンスタイマーをリセット
  const resetTypingTimeout = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(false);
    }, 3000); // 3 seconds debounce / 3秒のデバウンス
  };

  const cancelTypingTimeout = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };

  return {
    sendTypingStatus,
    resetTypingTimeout,
    cancelTypingTimeout,
    isTypingRef,
  };
};
