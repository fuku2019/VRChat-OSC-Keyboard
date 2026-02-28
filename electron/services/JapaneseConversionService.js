import { MicroDictionaryProvider } from './ime/MicroDictionaryProvider.js';
import { MozcDictionaryProvider } from './ime/MozcDictionaryProvider.js';
import { Segmenter } from './ime/Segmenter.js';
import { dedupeCandidates, toHiragana, toKatakana } from './ime/textUtils.js';

const MAX_CANDIDATES = 20;
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
    candidates: (segment.candidates || []).map((candidate) => ({ ...candidate })),
  }));
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
    this.segments = [];
    this.candidates = [];
    this.candidateIndex = 0;
    this.isConverting = false;
    this.activeSegmentIndex = 0;
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
        const safeIndex = Math.max(0, Math.min(selectedIndex, candidates.length - 1));
        return candidates[safeIndex]?.text || segment.raw;
      })
      .join('');
  }

  rebuildCandidates() {
    if (!this.isConverting || this.segments.length === 0) {
      this.candidates = [];
      this.candidateIndex = 0;
      return;
    }

    const activeSegment =
      this.segments[this.activeSegmentIndex] || this.segments[0] || null;
    if (!activeSegment) {
      this.candidates = [];
      this.candidateIndex = 0;
      return;
    }

    const segmentCandidates = activeSegment.candidates || [];
    const composed = segmentCandidates.map((candidate, index) => ({
      ...candidate,
      text: this.composeSegmentText(this.activeSegmentIndex, index),
    }));

    const seen = new Set();
    this.candidates = [];
    for (const candidate of composed) {
      if (!candidate?.text || seen.has(candidate.text)) continue;
      seen.add(candidate.text);
      this.candidates.push(candidate);
      if (this.candidates.length >= this.maxCandidates) break;
    }

    const safeIndex = Math.max(
      0,
      Math.min(activeSegment.selectedIndex || 0, this.candidates.length - 1),
    );
    this.candidateIndex = Number.isFinite(safeIndex) ? safeIndex : 0;
    activeSegment.selectedIndex = this.candidateIndex;
  }

  buildState() {
    const preedit = this.composeSegmentText();
    const selectedCandidate =
      this.candidates[this.candidateIndex]?.text || preedit || this.rawKana;
    return {
      rawKana: this.rawKana,
      segments: cloneSegments(this.segments),
      candidates: this.candidates.map((candidate) => ({ ...candidate })),
      candidateIndex: this.candidateIndex,
      isConverting: this.isConverting,
      preedit: selectedCandidate || '',
      selectedCandidate: selectedCandidate || '',
    };
  }

  buildWholeFallbackCandidates(raw, context = {}) {
    const candidates = [
      {
        text: raw,
        reading: raw,
        source: 'fallback',
        dictSource: 'fallback',
        score: 100,
      },
      {
        text: toKatakana(raw),
        reading: raw,
        source: 'fallback',
        dictSource: 'fallback',
        score: 99,
      },
    ];

    let providerFallback = [];
    try {
      providerFallback = this.fallbackProvider.getCandidates(raw, context);
    } catch {
      providerFallback = [];
    }

    return dedupeCandidates(
      [...candidates, ...(providerFallback || [])],
      this.maxCandidates,
    );
  }

  withHiraganaCandidateFirst(raw, candidates = []) {
    const normalizedRaw = toHiragana(raw || '');
    if (!normalizedRaw) return dedupeCandidates(candidates, this.maxCandidates);
    return dedupeCandidates(
      [
        {
          text: normalizedRaw,
          reading: normalizedRaw,
          source: 'fallback',
          dictSource: 'fallback',
          score: 100,
        },
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
    let candidates = [];
    try {
      candidates = this.provider.getCandidates(normalizedRaw, context);
    } catch {
      candidates = [];
    }

    if (!candidates || candidates.length === 0) {
      candidates = this.fallbackProvider.getCandidates(normalizedRaw, context);
    }

    if (!candidates || candidates.length === 0) {
      candidates = [
        {
          text: normalizedRaw,
          reading: normalizedRaw,
          source: 'fallback',
          dictSource: 'fallback',
          score: 0,
        },
      ];
    }

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

  nextCandidate() {
    if (!this.isConverting || this.segments.length === 0 || this.candidates.length === 0) {
      return this.buildState();
    }

    const activeSegment = this.segments[this.activeSegmentIndex];
    if (!activeSegment || (activeSegment.candidates?.length || 0) === 0) {
      return this.buildState();
    }

    activeSegment.selectedIndex =
      (activeSegment.selectedIndex + 1) % activeSegment.candidates.length;
    this.rebuildCandidates();
    return this.buildState();
  }

  prevCandidate() {
    if (!this.isConverting || this.segments.length === 0 || this.candidates.length === 0) {
      return this.buildState();
    }

    const activeSegment = this.segments[this.activeSegmentIndex];
    if (!activeSegment || (activeSegment.candidates?.length || 0) === 0) {
      return this.buildState();
    }

    activeSegment.selectedIndex =
      (activeSegment.selectedIndex - 1 + activeSegment.candidates.length) %
      activeSegment.candidates.length;
    this.rebuildCandidates();
    return this.buildState();
  }

  setCandidateIndex(index) {
    if (!this.isConverting || !Number.isInteger(index)) {
      return this.buildState();
    }
    if (index < 0 || index >= this.candidates.length) {
      return this.buildState();
    }
    const activeSegment = this.segments[this.activeSegmentIndex];
    if (!activeSegment) return this.buildState();
    activeSegment.selectedIndex = index;
    this.rebuildCandidates();
    return this.buildState();
  }

  commit(index, context = {}) {
    if (Number.isInteger(index)) {
      this.setCandidateIndex(index);
    }
    if (!this.isConverting || this.segments.length === 0) {
      return { committed: '', state: this.buildState() };
    }

    const committed = this.composeSegmentText();
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

    this.resetState();
    return { committed, state: this.buildState() };
  }

  cancel() {
    this.isConverting = false;
    this.segments = [];
    this.candidates = [];
    this.candidateIndex = 0;
    this.activeSegmentIndex = 0;
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
