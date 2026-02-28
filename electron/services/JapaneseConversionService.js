import { MicroDictionaryProvider } from './ime/MicroDictionaryProvider.js';
import { MozcDictionaryProvider } from './ime/MozcDictionaryProvider.js';
import { Segmenter } from './ime/Segmenter.js';
import { dedupeCandidates, toHiragana, toKatakana } from './ime/textUtils.js';

const MAX_CANDIDATES = 20;
const FALLBACK_SOURCE = 'fallback';
let hasLoggedMozcFallback = false;

function createDefaultProvider() {
  try {
    return new MozcDictionaryProvider({ maxCandidates: MAX_CANDIDATES });
  } catch (error) {
    if (!hasLoggedMozcFallback) {
      console.warn('[IME] Mozc provider unavailable, fallback to micro dictionary:', error.message);
      hasLoggedMozcFallback = true;
    }
    return new MicroDictionaryProvider(MAX_CANDIDATES);
  }
}

function cloneSegments(segments) {
  return (segments || []).map((segment) => ({
    raw: segment.raw,
    selectedIndex: segment.selectedIndex,
    candidates: cloneCandidates(segment.candidates),
  }));
}

function cloneCandidates(candidates) {
  return (candidates || []).map((candidate) => ({ ...candidate }));
}

function buildFallbackCandidate(reading, score = 0) {
  return {
    text: reading,
    reading,
    source: FALLBACK_SOURCE,
    dictSource: FALLBACK_SOURCE,
    score,
  };
}

function normalizeSelectedIndex(index, size) {
  if (size <= 0) return 0;
  if (!Number.isInteger(index)) return 0;
  return Math.max(0, Math.min(index, size - 1));
}

export class JapaneseConversionService {
  constructor(provider = createDefaultProvider(), options = {}) {
    this.provider = provider;
    this.fallbackProvider =
      options.fallbackProvider || new MicroDictionaryProvider(MAX_CANDIDATES);
    this.segmenter = options.segmenter || new Segmenter(this.provider, { maxLength: 8 });
    this.maxCandidates = options.maxCandidates || MAX_CANDIDATES;
    this.resetState();
  }

  resetState() {
    this.rawKana = '';
    this.clearConversionState();
  }

  clearConversionState() {
    this.segments = [];
    this.isConverting = false;
    this.activeSegmentIndex = 0;
    this.clearCandidateList();
  }

  clearCandidateList() {
    this.candidates = [];
    this.candidateIndex = 0;
  }

  getActiveSegment() {
    if (!this.isConverting || this.segments.length === 0) return null;
    return this.segments[this.activeSegmentIndex] || this.segments[0] || null;
  }

  getProviderCandidates(provider, reading, context = {}) {
    if (!provider?.getCandidates) return [];
    try {
      const candidates = provider.getCandidates(reading, context);
      return Array.isArray(candidates) ? candidates : [];
    } catch {
      return [];
    }
  }

  selectBestActiveSegment() {
    const index = this.segments.findIndex(
      (segment) => (segment.candidates?.length || 0) > 1,
    );
    this.activeSegmentIndex = index >= 0 ? index : 0;
  }

  composeSegmentText(overrideIndex = null, overrideCandidateIndex = null) {
    return this.segments
      .map((segment, segmentIndex) => {
        const candidates = segment.candidates || [];
        if (candidates.length === 0) return segment.raw;

        const selectedIndex =
          overrideIndex === segmentIndex && Number.isInteger(overrideCandidateIndex)
            ? overrideCandidateIndex
            : segment.selectedIndex || 0;
        const safeIndex = normalizeSelectedIndex(selectedIndex, candidates.length);
        return candidates[safeIndex]?.text || segment.raw;
      })
      .join('');
  }

  buildComposedCandidates(activeSegment) {
    const segmentCandidates = activeSegment.candidates || [];
    const composed = segmentCandidates.map((candidate, index) => ({
      ...candidate,
      text: this.composeSegmentText(this.activeSegmentIndex, index),
    }));

    const seen = new Set();
    const result = [];
    for (const candidate of composed) {
      if (!candidate?.text || seen.has(candidate.text)) continue;
      seen.add(candidate.text);
      result.push(candidate);
      if (result.length >= this.maxCandidates) break;
    }
    return result;
  }

  rebuildCandidates() {
    const activeSegment = this.getActiveSegment();
    if (!activeSegment) {
      this.clearCandidateList();
      return;
    }

    this.candidates = this.buildComposedCandidates(activeSegment);

    const safeIndex = normalizeSelectedIndex(
      activeSegment.selectedIndex || 0,
      this.candidates.length,
    );
    this.candidateIndex = safeIndex;
    activeSegment.selectedIndex = this.candidateIndex;
  }

  buildState() {
    const preedit = this.composeSegmentText();
    const selectedCandidate =
      this.candidates[this.candidateIndex]?.text || preedit || this.rawKana;
    return {
      rawKana: this.rawKana,
      segments: cloneSegments(this.segments),
      candidates: cloneCandidates(this.candidates),
      candidateIndex: this.candidateIndex,
      isConverting: this.isConverting,
      preedit: selectedCandidate || '',
      selectedCandidate: selectedCandidate || '',
    };
  }

  buildWholeFallbackCandidates(raw, context = {}) {
    const primaryFallback = [
      buildFallbackCandidate(raw, 100),
      {
        ...buildFallbackCandidate(raw, 99),
        text: toKatakana(raw),
      },
    ];

    const providerFallback = this.getProviderCandidates(
      this.fallbackProvider,
      raw,
      context,
    );

    return dedupeCandidates(
      [...primaryFallback, ...providerFallback],
      this.maxCandidates,
    );
  }

  withHiraganaCandidateFirst(raw, candidates = []) {
    const normalizedRaw = toHiragana(raw || '');
    if (!normalizedRaw) return dedupeCandidates(candidates, this.maxCandidates);
    return dedupeCandidates(
      [
        buildFallbackCandidate(normalizedRaw, 100),
        ...(candidates || []),
      ],
      this.maxCandidates,
    );
  }

  shouldCollapseToWholeFallback(segments) {
    if (!Array.isArray(segments) || segments.length <= 1) return false;
    const allSingleChar = segments.every((segment) => (segment.raw || '').length === 1);
    if (!allSingleChar) return false;

    const hasAnyDictionaryCandidate = segments.some((segment) =>
      (segment.candidates || []).some(
        (candidate) => candidate?.dictSource && candidate.dictSource !== 'fallback',
      ),
    );
    return !hasAnyDictionaryCandidate;
  }

  getCandidatesForSegment(raw, context = {}) {
    const normalizedRaw = toHiragana(raw || '');
    const fromPrimary = this.getProviderCandidates(
      this.provider,
      normalizedRaw,
      context,
    );
    const withFallback =
      fromPrimary.length > 0
        ? fromPrimary
        : this.getProviderCandidates(this.fallbackProvider, normalizedRaw, context);

    const candidates =
      withFallback.length > 0
        ? withFallback
        : [buildFallbackCandidate(normalizedRaw, 0)];

    return this.withHiraganaCandidateFirst(normalizedRaw, candidates);
  }

  convert(kana, context = {}) {
    const text = toHiragana(String(kana || ''));
    if (!text.trim()) {
      this.resetState();
      return this.buildState();
    }

    const rawSegments = this.segmenter.segment(text, context);
    this.rawKana = text;
    const mappedSegments = [];
    let rollingPrev = context.previousWord || '';
    for (const segment of rawSegments) {
      const segmentCandidates = this.getCandidatesForSegment(segment.raw, {
        ...context,
        previousWord: rollingPrev,
      });
      mappedSegments.push({
        raw: segment.raw,
        selectedIndex: 0,
        candidates: segmentCandidates,
      });
      rollingPrev = segmentCandidates[0]?.text || segment.raw;
    }

    if (this.shouldCollapseToWholeFallback(mappedSegments)) {
      this.segments = [
        {
          raw: text,
          selectedIndex: 0,
          candidates: this.buildWholeFallbackCandidates(text, context),
        },
      ];
    } else {
      this.segments = mappedSegments;
    }
    this.isConverting = true;
    this.selectBestActiveSegment();
    this.rebuildCandidates();
    return this.buildState();
  }

  shiftCandidateSelection(step) {
    const activeSegment = this.getActiveSegment();
    if (!activeSegment || this.candidates.length === 0) {
      return this.buildState();
    }

    const segmentCandidateCount = activeSegment.candidates?.length || 0;
    if (segmentCandidateCount === 0) {
      return this.buildState();
    }

    const current = normalizeSelectedIndex(
      activeSegment.selectedIndex || 0,
      segmentCandidateCount,
    );
    activeSegment.selectedIndex =
      (current + step + segmentCandidateCount) % segmentCandidateCount;
    this.rebuildCandidates();
    return this.buildState();
  }

  nextCandidate() {
    return this.shiftCandidateSelection(1);
  }

  prevCandidate() {
    return this.shiftCandidateSelection(-1);
  }

  setCandidateIndex(index) {
    if (!this.isConverting || !Number.isInteger(index)) {
      return this.buildState();
    }
    if (index < 0 || index >= this.candidates.length) {
      return this.buildState();
    }
    const activeSegment = this.getActiveSegment();
    if (!activeSegment) return this.buildState();
    activeSegment.selectedIndex = index;
    this.rebuildCandidates();
    return this.buildState();
  }

  recordLearning(context = {}) {
    const previousWord = context.previousWord || '';
    let rollingPrev = previousWord;

    for (const segment of this.segments) {
      const selectedCandidate =
        segment.candidates?.[segment.selectedIndex]?.text || segment.raw;
      const selectedReading =
        segment.candidates?.[segment.selectedIndex]?.reading || segment.raw;
      if (this.provider?.learningStore?.recordCommit) {
        this.provider.learningStore.recordCommit(
          selectedReading,
          selectedCandidate,
          rollingPrev,
        );
      }
      rollingPrev = selectedCandidate;
    }
  }

  commit(index, context = {}) {
    if (Number.isInteger(index)) {
      this.setCandidateIndex(index);
    }
    if (!this.isConverting || this.segments.length === 0) {
      return { committed: '', state: this.buildState() };
    }

    const committed = this.composeSegmentText();
    this.recordLearning(context);
    this.resetState();
    return { committed, state: this.buildState() };
  }

  cancel() {
    this.clearConversionState();
    return this.buildState();
  }
}

let singletonService = null;

export function getJapaneseConversionService() {
  if (!singletonService) {
    singletonService = new JapaneseConversionService();
  }
  return singletonService;
}

export function _resetJapaneseConversionServiceForTests() {
  singletonService = null;
}
