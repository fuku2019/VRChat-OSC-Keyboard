import { describe, it, expect } from 'vitest';
import { JapaneseConversionService } from './JapaneseConversionService.js';
import { MicroDictionaryProvider } from './ime/MicroDictionaryProvider.js';

describe('JapaneseConversionService', () => {
  it('starts conversion with dictionary + fallback candidates', () => {
    const service = new JapaneseConversionService(new MicroDictionaryProvider());
    const state = service.convert('てすと');

    expect(state.isConverting).toBe(true);
    expect(state.rawKana).toBe('てすと');
    expect(state.candidates.length).toBeGreaterThan(0);
    expect(state.candidates[0].text).toBe('てすと');
    expect(state.candidates.some((candidate) => candidate.text === 'テスト')).toBe(
      true,
    );
  });

  it('cycles candidate index forward and backward', () => {
    const service = new JapaneseConversionService(new MicroDictionaryProvider());
    service.convert('かな');
    const initial = service.buildState().candidateIndex;

    const next = service.nextCandidate();
    expect(next.candidateIndex).toBe((initial + 1) % next.candidates.length);

    const prev = service.prevCandidate();
    expect(prev.candidateIndex).toBe(initial);
  });

  it('commits selected candidate and resets conversion state', () => {
    const service = new JapaneseConversionService(new MicroDictionaryProvider());
    service.convert('かな');
    const committedCandidate = service.buildState().candidates[0].text;

    const result = service.commit();
    expect(result.committed).toBe(committedCandidate);
    expect(result.state.isConverting).toBe(false);
    expect(result.state.rawKana).toBe('');
  });

  it('commits with direct index selection', () => {
    const service = new JapaneseConversionService(new MicroDictionaryProvider());
    const state = service.convert('かな');
    expect(state.candidates.length).toBeGreaterThan(1);

    const result = service.commit(1);
    expect(result.committed).toBe(state.candidates[1].text);
  });

  it('cancels conversion and keeps raw kana', () => {
    const service = new JapaneseConversionService(new MicroDictionaryProvider());
    service.convert('かな');

    const state = service.cancel();
    expect(state.isConverting).toBe(false);
    expect(state.rawKana).toBe('かな');
    expect(state.candidates).toEqual([]);
  });

  it('handles operations safely when not converting', () => {
    const service = new JapaneseConversionService(new MicroDictionaryProvider());

    expect(service.nextCandidate().isConverting).toBe(false);
    expect(service.prevCandidate().isConverting).toBe(false);
    expect(service.commit().committed).toBe('');
  });

  it('collapses multi-segment fallback into whole-text fallback candidates', () => {
    const emptyProvider = {
      hasReading: () => false,
      hasReadingPrefix: () => false,
      getCandidates: () => [],
    } as any;
    const service = new JapaneseConversionService(emptyProvider, {
      fallbackProvider: new MicroDictionaryProvider(),
    });

    const state = service.convert('にほん');
    expect(state.segments).toHaveLength(1);
    expect(state.candidates[0].text).toBe('にほん');
    expect(state.candidates[1].text).toBe('ニホン');
  });
});
