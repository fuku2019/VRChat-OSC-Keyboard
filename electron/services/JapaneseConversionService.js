// Main Japanese conversion service orchestrating segmentation and candidate management
// メインの日本語変換サービス。セグメンテーションと候補管理をオーケストレーションする。
import { MicroDictionaryProvider } from './ime/MicroDictionaryProvider.js';
import { MozcDictionaryProvider } from './ime/MozcDictionaryProvider.js';
import { Segmenter } from './ime/Segmenter.js';
import { dedupeCandidates, toHiragana, toKatakana } from './ime/textUtils.js';

const MAX_CANDIDATES = 20; // Maximum candidates to return / 返す候補の最大数
const FALLBACK_SOURCE = 'fallback'; // Source label for fallback candidates / フォールバック候補のソースラベル
let hasLoggedMozcFallback = false; // Prevent duplicate fallback log / フォールバックログの重複防止

// Create default dictionary provider with Mozc -> MicroDictionary fallback
// Mozc -> MicroDictionaryフォールバック付きのデフォルト辞書プロバイダーを作成
function createDefaultProvider() {
  try {
    return new MozcDictionaryProvider({ maxCandidates: MAX_CANDIDATES });
  } catch (error) {
    if (!hasLoggedMozcFallback) {
      console.warn(
        '[IME] Mozc provider unavailable, fallback to micro dictionary:',
        error.message,
      );
      hasLoggedMozcFallback = true;
    }
    return new MicroDictionaryProvider(MAX_CANDIDATES);
  }
}

// Deep clone segments array to prevent external mutation / 外部変更を防ぐためセグメント配列をディープクローン
function cloneSegments(segments) {
  return (segments || []).map((segment) => ({
    raw: segment.raw,
    selectedIndex: segment.selectedIndex,
    candidates: cloneCandidates(segment.candidates),
  }));
}

// Shallow clone candidates array / 候補配列をシャロークローン
function cloneCandidates(candidates) {
  return (candidates || []).map((candidate) => ({ ...candidate }));
}

// Build a minimal fallback candidate from reading text / 読みテキストから最小フォールバック候補を構築
function buildFallbackCandidate(reading, score = 0) {
  return {
    text: reading,
    reading,
    source: FALLBACK_SOURCE,
    dictSource: FALLBACK_SOURCE,
    score,
  };
}

// Clamp index to valid range [0, size-1] / インデックスを有効範囲[0, size-1]にクランプ
function normalizeSelectedIndex(index, size) {
  if (size <= 0) return 0;
  if (!Number.isInteger(index)) return 0;
  return Math.max(0, Math.min(index, size - 1));
}

// Orchestrates kana-to-kanji conversion using a dictionary provider and segmenter.
// Manages conversion state, candidate cycling, and learning feedback.
// 辞書プロバイダーとセグメンターを使用したかな→漢字変換をオーケストレーションする。
// 変換状態、候補切り替え、学習フィードバックを管理する。
export class JapaneseConversionService {
  constructor(provider = createDefaultProvider(), options = {}) {
    this.provider = provider;
    this.fallbackProvider =
      options.fallbackProvider || new MicroDictionaryProvider(MAX_CANDIDATES);
    this.segmenter =
      options.segmenter || new Segmenter(this.provider, { maxLength: 8 });
    this.maxCandidates = options.maxCandidates || MAX_CANDIDATES;
    this.resetState();
  }

  // Reset all state to initial / すべての状態を初期化にリセット
  resetState() {
    this.rawKana = '';
    this.clearConversionState();
  }

  // Clear conversion-specific state while preserving rawKana / rawKanaを保持しつつ変換固有の状態をクリア
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

  // Get the currently active segment being converted / 現在変換中のアクティブセグメントを取得
  getActiveSegment() {
    if (!this.isConverting || this.segments.length === 0) return null;
    return this.segments[this.activeSegmentIndex] || this.segments[0] || null;
  }

  // Safely get candidates from a provider with error handling / エラーハンドリング付きでプロバイダーから候補を安全に取得
  getProviderCandidates(provider, reading, context = {}) {
    if (!provider?.getCandidates) return [];
    try {
      const candidates = provider.getCandidates(reading, context);
      return Array.isArray(candidates) ? candidates : [];
    } catch {
      return [];
    }
  }

  // Find the best segment to activate (first with multiple candidates) / アクティブにする最適なセグメントを検索（複数候補を持つ最初のセグメント）
  selectBestActiveSegment() {
    const index = this.segments.findIndex(
      (segment) => (segment.candidates?.length || 0) > 1,
    );
    this.activeSegmentIndex = index >= 0 ? index : 0;
  }

  // Compose full text by joining selected candidates from all segments / 全セグメントの選択候補を結合してフルテキストを構成
  composeSegmentText(overrideIndex = null, overrideCandidateIndex = null) {
    return this.segments
      .map((segment, segmentIndex) => {
        const candidates = segment.candidates || [];
        if (candidates.length === 0) return segment.raw;

        const selectedIndex =
          overrideIndex === segmentIndex &&
          Number.isInteger(overrideCandidateIndex)
            ? overrideCandidateIndex
            : segment.selectedIndex || 0;
        const safeIndex = normalizeSelectedIndex(
          selectedIndex,
          candidates.length,
        );
        return candidates[safeIndex]?.text || segment.raw;
      })
      .join('');
  }

  // Build composed candidates by varying the active segment's selection / アクティブセグメントの選択を変えて構成候補を構築
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

  // Rebuild the flat candidate list from active segment's composed candidates / アクティブセグメントの構成候補からフラット候補リストを再構築
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

  // Build a snapshot of current conversion state / 現在の変換状態のスナップショットを構築
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

  // Build fallback candidates when no dictionary match exists / 辞書一致がない場合のフォールバック候補を構築
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

  // Prepend hiragana as the first candidate to ensure it's always available / ひらがなを最初の候補として追加し常に利用可能にする
  withHiraganaCandidateFirst(raw, candidates = []) {
    const normalizedRaw = toHiragana(raw || '');
    if (!normalizedRaw) return dedupeCandidates(candidates, this.maxCandidates);
    return dedupeCandidates(
      [buildFallbackCandidate(normalizedRaw, 100), ...(candidates || [])],
      this.maxCandidates,
    );
  }

  // Check if multi-segment result should collapse to single whole-text fallback / 複数セグメント結果を単一フルテキストフォールバックに折りたたむべきか判定
  shouldCollapseToWholeFallback(segments) {
    if (!Array.isArray(segments) || segments.length <= 1) return false;
    const allSingleChar = segments.every(
      (segment) => (segment.raw || '').length === 1,
    );
    if (!allSingleChar) return false;

    const hasAnyDictionaryCandidate = segments.some((segment) =>
      (segment.candidates || []).some(
        (candidate) =>
          candidate?.dictSource && candidate.dictSource !== 'fallback',
      ),
    );
    return !hasAnyDictionaryCandidate;
  }

  // Get candidates for a single segment with primary -> fallback provider chain / 単一セグメントの候補をプライマリ→フォールバックプロバイダーチェーンで取得
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
        : this.getProviderCandidates(
            this.fallbackProvider,
            normalizedRaw,
            context,
          );

    const candidates =
      withFallback.length > 0
        ? withFallback
        : [buildFallbackCandidate(normalizedRaw, 0)];

    return this.withHiraganaCandidateFirst(normalizedRaw, candidates);
  }

  // Start conversion for given kana reading / 指定されたかな読みの変換を開始
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

  // Shift active segment's candidate selection by step amount (+1/-1) / アクティブセグメントの候補選択をステップ量(+1/-1)で移動
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

  // Move to next candidate / 次の候補に移動
  nextCandidate() {
    return this.shiftCandidateSelection(1);
  }

  // Jump to a specific candidate by index / インデックスで特定の候補にジャンプ
  setCandidateIndex(index) {
    if (!this.isConverting || !Number.isInteger(index)) {
      return this.buildState();
    }
    if (index < 0 || index >= this.candidates.length) {
      return this.buildState();
    }
    const activeSegment = this.getActiveSegment();
    if (!activeSegment) return this.buildState();
    // Clamp to segment candidate count to prevent out-of-range / セグメント候補数でクランプして範囲外を防止
    const segCandidateCount = activeSegment.candidates?.length || 0;
    activeSegment.selectedIndex = normalizeSelectedIndex(index, segCandidateCount);
    this.rebuildCandidates();
    return this.buildState();
  }

  // Record selected candidates to learning store for future ranking / 将来のランキングのため選択された候補を学習ストアに記録
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

  // Commit the current conversion and return committed text / 現在の変換を確定し確定テキストを返す
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

  // Cancel conversion and return to unconverted state / 変換をキャンセルし未変換状態に戻る
  cancel() {
    this.clearConversionState();
    return this.buildState();
  }
}

let singletonService = null;

// Singleton accessor for the conversion service / 変換サービスのシングルトンアクセサー
export function getJapaneseConversionService() {
  if (!singletonService) {
    singletonService = new JapaneseConversionService();
  }
  return singletonService;
}

// Reset singleton for test isolation / テスト分離のためシングルトンをリセット
export function _resetJapaneseConversionServiceForTests() {
  singletonService = null;
}
