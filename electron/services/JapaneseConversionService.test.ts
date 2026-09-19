import { describe, expect, it, vi } from 'vitest';
import { JapaneseConversionService } from './JapaneseConversionService.js';

type FakeCandidate = {
  text: string;
  reading: string;
  source?: string;
  dictSource?: string;
  score?: number;
};

// The service only needs hasReading / getCandidates from a provider, so a
// duck-typed object is enough. Passing one explicitly keeps createDefaultProvider
// unevaluated, so no Mozc shard, sqlite file or electron import is touched.
// サービスがプロバイダーに求めるのは hasReading / getCandidates だけなので、
// ダックタイピングのオブジェクトで足りる。明示的に渡すことで createDefaultProvider が
// 評価されず、Mozc シャードも sqlite も electron も一切触らない。
const createProvider = (
  entries: Record<string, FakeCandidate[]>,
  extra: Record<string, unknown> = {},
) => ({
  hasReading: (reading: string) => entries[reading] !== undefined,
  getCandidates: (reading: string) => entries[reading] ?? [],
  ...extra,
});

// A dictionary-sourced candidate, i.e. dictSource !== 'fallback'
// 辞書由来の候補。つまり dictSource !== 'fallback' のもの
const dictCandidate = (
  text: string,
  reading: string,
  score = 1000,
): FakeCandidate => ({
  text,
  reading,
  source: 'dictionary',
  dictSource: 'mozc',
  score,
});

// An empty fallback keeps the built-in MicroDictionaryProvider out of the results.
// 空のフォールバックにして、組み込みの MicroDictionaryProvider を結果から締め出す。
const createService = (
  entries: Record<string, FakeCandidate[]>,
  options: Record<string, unknown> = {},
) =>
  new JapaneseConversionService(createProvider(entries) as any, {
    fallbackProvider: createProvider({}),
    ...options,
  } as any);

describe('JapaneseConversionService / 日本語変換サービス', () => {
  describe('convert / 変換開始', () => {
    it('puts the plain hiragana reading first in every segment', () => {
      const service = createService({
        にほん: [dictCandidate('日本', 'にほん')],
        ご: [dictCandidate('語', 'ご')],
      });

      const state = service.convert('にほんご');

      expect(state.segments.map((segment: any) => segment.raw)).toEqual([
        'にほん',
        'ご',
      ]);
      // The reading itself always outranks dictionary hits, so the user can
      // always fall back to kana. / 読みそのものが常に辞書ヒットより優先されるので、
      // ユーザーはいつでもかなに戻せる。
      for (const segment of state.segments) {
        expect(segment.candidates[0].text).toBe(segment.raw);
      }
      expect(state.candidates[0].text).toBe('にほんご');
    });

    it("feeds the previous segment's top candidate into the next lookup", () => {
      const entries: Record<string, FakeCandidate[]> = {
        にほん: [dictCandidate('日本', 'にほん')],
        ご: [dictCandidate('語', 'ご')],
      };
      const getCandidates = vi.fn(
        (reading: string, _context?: Record<string, unknown>) =>
          entries[reading] ?? [],
      );
      const service = new JapaneseConversionService(
        {
          hasReading: (reading: string) => entries[reading] !== undefined,
          getCandidates,
        } as any,
        { fallbackProvider: createProvider({}) } as any,
      );

      service.convert('にほんご', { previousWord: 'わたし' });

      expect(getCandidates).toHaveBeenCalledTimes(2);
      expect(getCandidates.mock.calls[0][1]).toMatchObject({
        previousWord: 'わたし',
      });
      // The top candidate is the hiragana reading, so that is what rolls
      // forward - not the kanji surface.
      // 先頭候補はひらがな読みなので、次へ引き継がれるのは漢字表記ではなく読み。
      expect(getCandidates.mock.calls[1][1]).toMatchObject({
        previousWord: 'にほん',
      });
    });

    it('collapses to a whole-reading fallback when nothing matched the dictionary', () => {
      const service = createService({});

      const state = service.convert('あいう');

      // Three single-char segments with no dictionary candidate become one.
      // 辞書候補のない1文字セグメント3つが1本にまとめられる。
      expect(state.segments).toHaveLength(1);
      expect(state.segments[0].raw).toBe('あいう');
      expect(state.candidates.map((candidate: any) => candidate.text)).toEqual([
        'あいう',
        'アイウ',
      ]);
    });

    it('keeps the segments when at least one of them has a dictionary candidate', () => {
      const service = createService({ あ: [dictCandidate('亜', 'あ')] });

      const state = service.convert('あいう');

      expect(state.segments.map((segment: any) => segment.raw)).toEqual([
        'あ',
        'い',
        'う',
      ]);
    });

    it('resets to an empty state for whitespace-only input', () => {
      const service = createService({ にほん: [dictCandidate('日本', 'にほん')] });
      service.convert('にほん');

      const state = service.convert('   ');

      expect(state.isConverting).toBe(false);
      expect(state.segments).toEqual([]);
      expect(state.rawKana).toBe('');
    });
  });

  describe('candidate cycling / 候補の巡回', () => {
    it('wraps from the last candidate back to the first', () => {
      const service = createService({
        にほん: [dictCandidate('日本', 'にほん'), dictCandidate('二本', 'にほん')],
      });
      const initial = service.convert('にほん');
      expect(initial.candidates).toHaveLength(3); // にほん / 日本 / 二本

      expect(service.nextCandidate().selectedCandidate).toBe('日本');
      expect(service.nextCandidate().selectedCandidate).toBe('二本');
      expect(service.nextCandidate().selectedCandidate).toBe('にほん');
      expect(service.nextCandidate().candidateIndex).toBe(1);
    });

    it('ignores a candidate index outside the list', () => {
      const service = createService({
        にほん: [dictCandidate('日本', 'にほん'), dictCandidate('二本', 'にほん')],
      });
      service.convert('にほん');

      expect(service.setCandidateIndex(2).candidateIndex).toBe(2);
      expect(service.setCandidateIndex(5).candidateIndex).toBe(2);
      expect(service.setCandidateIndex(-1).candidateIndex).toBe(2);
    });
  });

  describe('commit / 確定', () => {
    it('returns the composed text and leaves conversion inactive', () => {
      const service = createService({
        にほん: [dictCandidate('日本', 'にほん')],
        ご: [dictCandidate('語', 'ご')],
      });
      service.convert('にほんご');
      service.nextCandidate(); // Select 日本 for the active segment / アクティブセグメントで日本を選ぶ

      const { committed, state } = service.commit();

      expect(committed).toBe('日本ご');
      expect(state.isConverting).toBe(false);
      expect(state.segments).toEqual([]);
      expect(state.rawKana).toBe('');
    });

    it('commits the candidate selected by the given index', () => {
      const service = createService({
        にほん: [dictCandidate('日本', 'にほん'), dictCandidate('二本', 'にほん')],
      });
      service.convert('にほん');

      expect(service.commit(2).committed).toBe('二本');
    });

    it('records every segment with the previous surface as context', () => {
      const recordCommit = vi.fn();
      const service = createService(
        {
          にほん: [dictCandidate('日本', 'にほん')],
          ご: [dictCandidate('語', 'ご')],
        },
        {},
      );
      (service.provider as any).learningStore = { recordCommit };
      service.convert('にほんご');
      service.nextCandidate(); // 日本

      service.commit(undefined, { previousWord: 'わたし' });

      expect(recordCommit.mock.calls).toEqual([
        ['にほん', '日本', 'わたし'],
        ['ご', 'ご', '日本'],
      ]);
    });

    it('commits when the provider has no learning store', () => {
      // The MicroDictionaryProvider fallback has no learning store, so this is
      // the production path whenever Mozc is unavailable.
      // MicroDictionaryProvider へのフォールバックは学習ストアを持たないため、
      // Mozc が使えないときはこれが本番経路になる。
      const service = createService({ にほん: [dictCandidate('日本', 'にほん')] });
      service.convert('にほん');

      expect(service.commit(1).committed).toBe('日本');
    });

    it('returns an empty commit when nothing is being converted', () => {
      const service = createService({});

      const { committed, state } = service.commit();

      expect(committed).toBe('');
      expect(state.isConverting).toBe(false);
    });
  });

  describe('error containment / エラーの封じ込め', () => {
    it('falls through to the fallback provider when the primary one throws', () => {
      const service = new JapaneseConversionService(
        {
          hasReading: () => true,
          getCandidates: () => {
            throw new Error('dictionary exploded');
          },
        } as any,
        {
          fallbackProvider: createProvider({
            にほん: [dictCandidate('日本', 'にほん')],
          }),
        } as any,
      );

      const state = service.convert('にほん');

      expect(state.isConverting).toBe(true);
      expect(state.candidates.map((candidate: any) => candidate.text)).toEqual([
        'にほん',
        '日本',
      ]);
    });
  });

  describe('state isolation / 状態の隔離', () => {
    it('does not let callers mutate the internals through the returned snapshot', () => {
      const service = createService({
        にほん: [dictCandidate('日本', 'にほん'), dictCandidate('二本', 'にほん')],
      });

      const state = service.convert('にほん');
      state.segments[0].candidates[0].text = 'HACKED';
      state.candidates[0].text = 'HACKED';

      const reread = service.setCandidateIndex(0);
      expect(reread.segments[0].candidates[0].text).toBe('にほん');
      expect(reread.candidates[0].text).toBe('にほん');
      expect(service.commit().committed).toBe('にほん');
    });
  });

  describe('cancel / キャンセル', () => {
    it('clears the conversion but keeps the raw kana', () => {
      const service = createService({ にほん: [dictCandidate('日本', 'にほん')] });
      service.convert('にほん');

      const state = service.cancel();

      expect(state.isConverting).toBe(false);
      expect(state.segments).toEqual([]);
      expect(state.candidates).toEqual([]);
      // cancel() uses clearConversionState, which deliberately keeps rawKana so
      // the caller can restore the unconverted reading.
      // cancel() は clearConversionState を使い、未変換の読みを呼び出し側が復元できるよう
      // 意図的に rawKana を残す。
      expect(state.rawKana).toBe('にほん');
    });
  });
});
