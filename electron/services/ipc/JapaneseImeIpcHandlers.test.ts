import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handlers, mockService } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  mockService: {
    convert: vi.fn(),
    nextCandidate: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      handlers[channel] = handler;
    }),
  },
}));

vi.mock('../JapaneseConversionService.js', () => ({
  getJapaneseConversionService: () => mockService,
}));

describe('JapaneseImeIpcHandlers', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((key) => delete handlers[key]);
    vi.clearAllMocks();
  });

  it('registers all required handlers', async () => {
    const { registerJapaneseImeIpcHandlers } = await import(
      './JapaneseImeIpcHandlers.js'
    );

    registerJapaneseImeIpcHandlers();

    expect(Object.keys(handlers).sort()).toEqual(
      [
        'jp-ime:cancel',
        'jp-ime:commit',
        'jp-ime:convert',
        'jp-ime:next-candidate',
      ].sort(),
    );
  });

  it('returns unified success payloads', async () => {
    const state = {
      rawKana: 'かな',
      segments: [],
      candidates: [{ text: '仮名' }],
      candidateIndex: 0,
      isConverting: true,
      preedit: '仮名',
      selectedCandidate: '仮名',
    };

    mockService.convert.mockReturnValue(state);
    mockService.nextCandidate.mockReturnValue(state);
    mockService.commit.mockReturnValue({ committed: '仮名', state });
    mockService.cancel.mockReturnValue(state);

    const { registerJapaneseImeIpcHandlers } = await import(
      './JapaneseImeIpcHandlers.js'
    );
    registerJapaneseImeIpcHandlers();

    expect(handlers['jp-ime:convert']({}, 'かな', {})).toEqual({
      success: true,
      state,
    });
    expect(handlers['jp-ime:next-candidate']({})).toEqual({
      success: true,
      state,
    });
    expect(handlers['jp-ime:commit']({}, 0, { previousWord: '私' })).toEqual({
      success: true,
      committed: '仮名',
      state,
    });
    expect(mockService.commit).toHaveBeenCalledWith(0, { previousWord: '私' });
    expect(handlers['jp-ime:cancel']({})).toEqual({
      success: true,
      state,
    });
  });

  it('returns safe error payload on exception', async () => {
    mockService.convert.mockImplementation(() => {
      throw new Error('convert failed');
    });

    const { registerJapaneseImeIpcHandlers } = await import(
      './JapaneseImeIpcHandlers.js'
    );
    registerJapaneseImeIpcHandlers();

    const response = handlers['jp-ime:convert']({}, 'かな', {});
    expect(response.success).toBe(false);
    expect(response.error).toContain('convert failed');
  });
});
