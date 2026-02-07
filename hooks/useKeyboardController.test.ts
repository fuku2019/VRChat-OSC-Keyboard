import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardController } from './useKeyboardController';
import { InputMode } from '../types';
import { CHATBOX } from '../constants';

/**
 * useKeyboardController tests - Focus on paste/long text trimming
 * useKeyboardControllerテスト - 貼り付け/長文トリミングに注目
 */
describe('useKeyboardController', () => {
  // Mock functions / モック関数
  const createMockProps = (overrides = {}) => ({
    input: '',
    buffer: '',
    displayText: '',
    mode: InputMode.HIRAGANA,
    setMode: vi.fn(),
    setInput: vi.fn(),
    overwriteInput: vi.fn((val: string) => val.slice(0, CHATBOX.MAX_LENGTH)),
    handleCharInput: vi.fn(),
    handleBackspace: vi.fn(),
    handleClear: vi.fn(),
    handleSpace: vi.fn(),
    commitBuffer: vi.fn(),
    handlePrimaryAction: vi.fn(),
    handleInputEffect: vi.fn(),
    ...overrides,
  });

  describe('paste long text trimming / 貼り付け長文トリミング', () => {
    it('trims pasted text that exceeds MAX_LENGTH', () => {
      const mockOverwriteInput = vi.fn((val: string) => val.slice(0, CHATBOX.MAX_LENGTH));
      const mockHandleInputEffect = vi.fn();
      
      const props = createMockProps({
        overwriteInput: mockOverwriteInput,
        handleInputEffect: mockHandleInputEffect,
      });

      const { result } = renderHook(() => useKeyboardController(props));

      // Simulate pasting a very long text / 非常に長いテキストの貼り付けをシミュレート
      const longText = 'あ'.repeat(200); // 200 characters, exceeds MAX_LENGTH of 144

      // Create a mock event for textarea change / textareaのchangeイベントをモック
      const mockEvent = {
        target: {
          value: longText,
        },
      } as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      // overwriteInput should be called with the long text / overwriteInputは長いテキストで呼ばれるべき
      expect(mockOverwriteInput).toHaveBeenCalledWith(longText);
      
      // The result should be trimmed to MAX_LENGTH / 結果はMAX_LENGTHにトリミングされるべき
      expect(mockOverwriteInput).toHaveReturnedWith('あ'.repeat(CHATBOX.MAX_LENGTH));
    });

    it('allows text within MAX_LENGTH limit', () => {
      const mockOverwriteInput = vi.fn((val: string) => val.slice(0, CHATBOX.MAX_LENGTH));
      const mockHandleInputEffect = vi.fn();
      
      const props = createMockProps({
        overwriteInput: mockOverwriteInput,
        handleInputEffect: mockHandleInputEffect,
      });

      const { result } = renderHook(() => useKeyboardController(props));

      // Text within limit / 制限内のテキスト
      const normalText = 'Hello, World!';

      const mockEvent = {
        target: {
          value: normalText,
        },
      } as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      // Should not be trimmed / トリミングされないべき
      expect(mockOverwriteInput).toHaveReturnedWith(normalText);
    });

    it('trims text at exact MAX_LENGTH boundary', () => {
      const mockOverwriteInput = vi.fn((val: string) => val.slice(0, CHATBOX.MAX_LENGTH));
      
      const props = createMockProps({
        overwriteInput: mockOverwriteInput,
      });

      const { result } = renderHook(() => useKeyboardController(props));

      // Text exactly at MAX_LENGTH + 1 / MAX_LENGTH + 1 のテキスト
      const boundaryText = 'x'.repeat(CHATBOX.MAX_LENGTH + 1);

      const mockEvent = {
        target: {
          value: boundaryText,
        },
      } as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      // Should be trimmed to exactly MAX_LENGTH / 正確にMAX_LENGTHにトリミングされるべき
      expect(mockOverwriteInput).toHaveReturnedWith('x'.repeat(CHATBOX.MAX_LENGTH));
    });
  });

  describe('IME composition handling / IME構成処理', () => {
    it('reverts to pre-composition value when exceeding MAX_LENGTH during IME', () => {
      const preCompositionValue = 'テスト';
      const mockOverwriteInput = vi.fn((val: string) => val.slice(0, CHATBOX.MAX_LENGTH));
      const mockHandleInputEffect = vi.fn();
      
      const props = createMockProps({
        input: preCompositionValue,
        buffer: '',
        overwriteInput: mockOverwriteInput,
        handleInputEffect: mockHandleInputEffect,
      });

      const { result } = renderHook(() => useKeyboardController(props));

      // Simulate composition start / 構成開始をシミュレート
      act(() => {
        result.current.handleCompositionStart();
      });

      // Simulate composition end with text exceeding limit / 制限を超えるテキストで構成終了をシミュレート
      const longComposedText = 'あ'.repeat(200);
      const mockCompositionEvent = {
        currentTarget: {
          value: longComposedText,
        },
      } as React.CompositionEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleCompositionEnd(mockCompositionEvent);
      });

      // Should revert to pre-composition value / 構成前の値に戻るべき
      expect(mockOverwriteInput).toHaveBeenCalledWith(preCompositionValue);
    });

    it('applies composed text when within MAX_LENGTH', () => {
      const mockOverwriteInput = vi.fn((val: string) => val);
      const mockHandleInputEffect = vi.fn();
      
      const props = createMockProps({
        overwriteInput: mockOverwriteInput,
        handleInputEffect: mockHandleInputEffect,
      });

      const { result } = renderHook(() => useKeyboardController(props));

      act(() => {
        result.current.handleCompositionStart();
      });

      const normalComposedText = 'こんにちは';
      const mockCompositionEvent = {
        currentTarget: {
          value: normalComposedText,
        },
      } as React.CompositionEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleCompositionEnd(mockCompositionEvent);
      });

      // Should apply the composed text / 構成されたテキストが適用されるべき
      expect(mockOverwriteInput).toHaveBeenCalledWith(normalComposedText);
    });
  });

  describe('handleInputEffect trigger / handleInputEffectの発火', () => {
    it('calls handleInputEffect after textarea change', () => {
      const mockHandleInputEffect = vi.fn();
      const mockOverwriteInput = vi.fn((val: string) => val);
      
      const props = createMockProps({
        overwriteInput: mockOverwriteInput,
        handleInputEffect: mockHandleInputEffect,
      });

      const { result } = renderHook(() => useKeyboardController(props));

      const mockEvent = {
        target: {
          value: 'test',
        },
      } as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      // handleInputEffect should be called / handleInputEffectが呼ばれるべき
      expect(mockHandleInputEffect).toHaveBeenCalledWith('test');
    });
  });

  describe('primary action routing / メインアクションの分岐', () => {
    it('calls handlePrimaryAction on Enter without Shift', () => {
      const handlePrimaryAction = vi.fn();
      const props = createMockProps({ handlePrimaryAction });
      const { result } = renderHook(() => useKeyboardController(props));

      const event = {
        key: 'Enter',
        shiftKey: false,
        preventDefault: vi.fn(),
        nativeEvent: { isComposing: false },
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleKeyDown(event);
      });

      expect(handlePrimaryAction).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    it('does not call handlePrimaryAction on Shift+Enter', () => {
      const handlePrimaryAction = vi.fn();
      const props = createMockProps({ handlePrimaryAction });
      const { result } = renderHook(() => useKeyboardController(props));

      const event = {
        key: 'Enter',
        shiftKey: true,
        preventDefault: vi.fn(),
        nativeEvent: { isComposing: false },
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleKeyDown(event);
      });

      expect(handlePrimaryAction).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('routes virtual keyboard send key to handlePrimaryAction', () => {
      const handlePrimaryAction = vi.fn();
      const props = createMockProps({ handlePrimaryAction });
      const { result } = renderHook(() => useKeyboardController(props));

      act(() => {
        result.current.createVirtualKeyHandlers().onSend();
      });

      expect(handlePrimaryAction).toHaveBeenCalledTimes(1);
    });
  });
});
