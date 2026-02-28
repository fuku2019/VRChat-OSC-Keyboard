import { describe, expect, it } from 'vitest';
import { Segmenter } from './Segmenter.js';

describe('Segmenter', () => {
  it('applies forward longest segmentation', () => {
    const provider = {
      hasReading: (reading: string) => ['にほん', 'ご', 'にほんご'].includes(reading),
      getCandidates: (reading: string) => [{ text: reading, reading, source: 'dictionary' }],
    };
    const segmenter = new Segmenter(provider as any, { maxLength: 8 });

    const segments = segmenter.segment('にほんご', {});
    // Longest match should pick "にほんご" first because it exists.
    expect(segments).toHaveLength(1);
    expect(segments[0].raw).toBe('にほんご');
  });

  it('falls back to single-char progression when no match', () => {
    const provider = {
      hasReading: () => false,
      getCandidates: () => [],
    };
    const segmenter = new Segmenter(provider as any, { maxLength: 8 });

    const segments = segmenter.segment('かな', {});
    expect(segments).toHaveLength(2);
    expect(segments[0].raw).toBe('か');
    expect(segments[1].raw).toBe('な');
  });
});
