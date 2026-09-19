import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSendHistory } from './useSendHistory';
import { useConfigStore } from '../stores/configStore';
import { STORAGE_KEYS } from '../constants';

const setConfig = (patch: Record<string, unknown>) =>
  useConfigStore.setState((state) => ({
    config: { ...state.config, ...patch },
  }));

const readStored = () => localStorage.getItem(STORAGE_KEYS.SEND_HISTORY);

const writeStored = (value: unknown) =>
  localStorage.setItem(
    STORAGE_KEYS.SEND_HISTORY,
    typeof value === 'string' ? value : JSON.stringify(value),
  );

beforeEach(() => {
  localStorage.clear();
  // The store is a module singleton, so the config has to be restored per test.
  // ストアはモジュールシングルトンなので、テストごとに設定を戻す必要がある。
  setConfig({ historyPersistEnabled: true, historyMaxCount: 30 });
});

describe('useSendHistory', () => {
  describe('pushHistory / 履歴への追加', () => {
    it('prepends the newest entry', () => {
      const { result } = renderHook(() => useSendHistory());

      act(() => {
        result.current.pushHistory('first');
        result.current.pushHistory('second');
      });

      expect(result.current.history).toEqual(['second', 'first']);
    });

    it('ignores whitespace-only text', () => {
      const { result } = renderHook(() => useSendHistory());

      act(() => {
        result.current.pushHistory('');
        result.current.pushHistory('   ');
      });

      expect(result.current.history).toEqual([]);
    });

    it('moves a duplicate back to the front instead of storing it twice', () => {
      const { result } = renderHook(() => useSendHistory());

      act(() => {
        result.current.pushHistory('b');
        result.current.pushHistory('a');
        result.current.pushHistory('b');
      });

      expect(result.current.history).toEqual(['b', 'a']);
    });

    it('trims the history to the max count current at push time', () => {
      const { result } = renderHook(() => useSendHistory());

      // pushHistory reads historyMaxCount straight from the store, so a change
      // applies without waiting for a re-render.
      // pushHistoryはhistoryMaxCountをストアから直接読むため、再レンダーを待たずに反映される。
      act(() => {
        setConfig({ historyMaxCount: 2 });
      });
      act(() => {
        result.current.pushHistory('a');
        result.current.pushHistory('b');
        result.current.pushHistory('c');
      });

      expect(result.current.history).toEqual(['c', 'b']);
    });
  });

  describe('persistence / 永続化', () => {
    it('restores the stored history on mount when persistence is enabled', () => {
      writeStored(['a', 'b']);

      const { result } = renderHook(() => useSendHistory());

      expect(result.current.history).toEqual(['a', 'b']);
    });

    it('starts empty and stores nothing when persistence is disabled', () => {
      writeStored(['a', 'b']);
      setConfig({ historyPersistEnabled: false });

      const { result } = renderHook(() => useSendHistory());
      expect(result.current.history).toEqual([]);

      act(() => {
        result.current.pushHistory('c');
      });

      // The stored copy must stay untouched while persistence is off.
      // 永続化がOFFの間、保存済みのコピーは触られてはならない。
      expect(JSON.parse(readStored() ?? 'null')).toEqual(['a', 'b']);
    });

    it('drops non-string entries from a corrupted stored history', () => {
      writeStored('["a", 1, null, "b"]');

      const { result } = renderHook(() => useSendHistory());

      expect(result.current.history).toEqual(['a', 'b']);
    });

    it('starts empty when the stored value is not a JSON array', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      writeStored('not json at all');

      const { result } = renderHook(() => useSendHistory());
      expect(result.current.history).toEqual([]);

      writeStored('{"notAnArray": true}');
      const second = renderHook(() => useSendHistory());
      expect(second.result.current.history).toEqual([]);

      warn.mockRestore();
    });

    it('merges the stored history instead of overwriting it when persistence is turned back on', () => {
      writeStored(['old1', 'old2']);
      setConfig({ historyPersistEnabled: false });

      const { result } = renderHook(() => useSendHistory());
      act(() => {
        result.current.pushHistory('new');
      });
      expect(result.current.history).toEqual(['new']);

      act(() => {
        setConfig({ historyPersistEnabled: true });
      });

      // Turning persistence on must not overwrite the stored entries with the
      // current session. / 永続化をONにしたとき、現在のセッションで保存済みの
      // エントリを上書きしてはならない。
      expect(result.current.history).toEqual(['new', 'old1', 'old2']);
      expect(JSON.parse(readStored() ?? 'null')).toEqual([
        'new',
        'old1',
        'old2',
      ]);
    });

    it('caps the merged history at the max count', () => {
      writeStored(['old1', 'old2']);
      setConfig({ historyPersistEnabled: false, historyMaxCount: 2 });

      const { result } = renderHook(() => useSendHistory());
      act(() => {
        result.current.pushHistory('new');
      });
      act(() => {
        setConfig({ historyPersistEnabled: true });
      });

      expect(result.current.history).toEqual(['new', 'old1']);
    });
  });

  describe('navigation / 履歴のナビゲーション', () => {
    const renderWithHistory = () => {
      const rendered = renderHook(() => useSendHistory());
      act(() => {
        rendered.result.current.pushHistory('b');
        rendered.result.current.pushHistory('a');
      });
      return rendered;
    };

    it('walks back through the entries and stops at the oldest', () => {
      const { result } = renderWithHistory();

      expect(result.current.navigateUp('draft')).toBe('a');
      expect(result.current.navigateUp('a')).toBe('b');
      expect(result.current.navigateUp('b')).toBeNull();
      // A refused Up must not move the cursor / 拒否された↑でカーソルが動いてはならない
      expect(result.current.navigateDown()).toBe('a');
    });

    it('restores the draft text when walking back down past the newest entry', () => {
      const { result } = renderWithHistory();

      expect(result.current.navigateUp('draft')).toBe('a');
      expect(result.current.navigateDown()).toBe('draft');
      expect(result.current.navigateDown()).toBeNull();
    });

    it('keeps the position while the text still matches what navigation returned', () => {
      const { result } = renderWithHistory();

      expect(result.current.navigateUp('draft')).toBe('a');
      result.current.notifyInputChanged('a');

      expect(result.current.navigateUp('a')).toBe('b');
    });

    it('leaves navigation once the user edits the text', () => {
      const { result } = renderWithHistory();

      expect(result.current.navigateUp('draft')).toBe('a');
      result.current.notifyInputChanged('a!');

      // The next Up starts from the newest entry again / 次の↑は再び最新から始まる
      expect(result.current.navigateUp('a!')).toBe('a');
      expect(result.current.navigateDown()).toBe('a!');
    });

    it('resets navigation after a new entry is pushed', () => {
      const { result } = renderWithHistory();
      expect(result.current.navigateUp('draft')).toBe('a');

      act(() => {
        result.current.pushHistory('z');
      });

      expect(result.current.navigateUp('draft')).toBe('z');
    });
  });

  describe('clearHistory / 全履歴の削除', () => {
    it('empties the history and leaves nothing stored', () => {
      const { result } = renderHook(() => useSendHistory());
      act(() => {
        result.current.pushHistory('a');
      });

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.history).toEqual([]);
      // clearHistory removes the key, but the persist effect immediately writes
      // an empty array back, so assert the effective result rather than absence.
      // clearHistoryはキーを消すが、永続化エフェクトが直後に空配列を書き戻すため、
      // キーの不在ではなく実効結果を検証する。
      expect(JSON.parse(readStored() ?? '[]')).toEqual([]);
      expect(result.current.navigateUp('draft')).toBeNull();
    });
  });
});
