/**
 * useSendHistory - Hook to manage chat send history
 * チャット送信履歴を管理するフック
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useConfigStore } from '../stores/configStore';
import { STORAGE_KEYS } from '../constants';

// Load history from localStorage / localStorageから履歴を読み込む
const loadHistory = (): string[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.SEND_HISTORY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('[SendHistory] Failed to load history:', e);
  }
  return [];
};

// Save history to localStorage / localStorageに履歴を保存する
const saveHistory = (history: string[]) => {
  try {
    localStorage.setItem(STORAGE_KEYS.SEND_HISTORY, JSON.stringify(history));
  } catch (e) {
    console.warn('[SendHistory] Failed to save history:', e);
  }
};

export const useSendHistory = () => {
  const config = useConfigStore((state) => state.config);

  // History array (newest first, index 0) / 履歴配列（最新が先頭、index 0）
  const [history, setHistory] = useState<string[]>(() => {
    if (config.historyPersistEnabled) return loadHistory();
    return [];
  });

  // Current navigation index (-1 = not navigating, 0 = newest) / 現在のナビインデックス（-1 = 走査外）
  const indexRef = useRef<number>(-1);
  // Draft text saved before navigation / 走査開始前に退避した入力テキスト
  const draftRef = useRef<string>('');

  // Persist when history or persist setting changes / 履歴・永続化設定変更時に保存
  useEffect(() => {
    if (config.historyPersistEnabled) {
      saveHistory(history);
    }
  }, [history, config.historyPersistEnabled]);

  // Push a new entry to history / 新しいエントリを履歴に追加
  const pushHistory = useCallback(
    (text: string) => {
      if (!text.trim()) return; // Ignore empty/whitespace-only / 空文字・空白のみは無視

      setHistory((prev) => {
        // Remove duplicate if exists / 重複があれば除去
        const filtered = prev.filter((item) => item !== text);
        // Prepend newest entry / 最新を先頭に追加
        const updated = [text, ...filtered];
        // Trim to max count / 上限を超えたら切り詰め
        const maxCount = useConfigStore.getState().config.historyMaxCount;
        return updated.slice(0, maxCount);
      });

      // Reset navigation state after send / 送信後にナビゲーション状態をリセット
      indexRef.current = -1;
      draftRef.current = '';
    },
    [],
  );

  // Navigate up (older history) / 上キーで古い履歴へ移動
  const navigateUp = useCallback(
    (currentText: string): string | null => {
      if (history.length === 0) return null;

      const nextIndex = indexRef.current + 1;
      if (nextIndex >= history.length) return null; // Already at oldest / 最古に到達済み

      // Save draft on first navigation / 初回走査時にドラフトを退避
      if (indexRef.current === -1) {
        draftRef.current = currentText;
      }

      indexRef.current = nextIndex;
      return history[nextIndex];
    },
    [history],
  );

  // Navigate down (newer history or back to draft) / 下キーで新しい履歴またはドラフトへ戻る
  const navigateDown = useCallback((): string | null => {
    if (indexRef.current <= -1) return null; // Not navigating / 走査中でない

    const nextIndex = indexRef.current - 1;

    if (nextIndex < 0) {
      // Return to draft / ドラフトに戻る
      indexRef.current = -1;
      return draftRef.current;
    }

    indexRef.current = nextIndex;
    return history[nextIndex];
  }, [history]);

  // Reset navigation state / ナビゲーション状態をリセット
  const resetNavigation = useCallback(() => {
    indexRef.current = -1;
    draftRef.current = '';
  }, []);

  // Clear all history / 全履歴を削除
  const clearHistory = useCallback(() => {
    setHistory([]);
    indexRef.current = -1;
    draftRef.current = '';
    try {
      localStorage.removeItem(STORAGE_KEYS.SEND_HISTORY);
    } catch (e) {
      console.warn('[SendHistory] Failed to clear history:', e);
    }
  }, []);

  return {
    history,
    pushHistory,
    navigateUp,
    navigateDown,
    resetNavigation,
    clearHistory,
  };
};
