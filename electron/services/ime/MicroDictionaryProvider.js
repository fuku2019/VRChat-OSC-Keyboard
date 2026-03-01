// Minimal built-in dictionary provider for offline fallback / オフラインフォールバック用の最小組み込み辞書プロバイダー
import {
  dedupeCandidates,
  extractLastWord,
  toHiragana,
  toKatakana,
} from './textUtils.js';

// Hardcoded micro dictionary for common Japanese words / 一般的な日本語単語のハードコード小規模辞書
const MICRO_DICTIONARY = {
  あい: ['愛', '藍', '合い'],
  あした: ['明日'],
  あしたは: ['明日は'],
  ありがとう: ['ありがとう', '有難う'],
  いま: ['今'],
  うみ: ['海'],
  えいご: ['英語'],
  おはよう: ['おはよう', 'お早う'],
  かいしゃ: ['会社'],
  かえる: ['帰る', '変える'],
  かぞく: ['家族'],
  かたかな: ['カタカナ'],
  かな: ['かな', '仮名'],
  かんじ: ['漢字'],
  きょう: ['今日', '教'],
  きょうは: ['今日は'],
  くるま: ['車'],
  こんにちは: ['こんにちは', '今日は'],
  こんばんは: ['こんばんは', '今晩は'],
  じかん: ['時間'],
  じぶん: ['自分'],
  しごと: ['仕事'],
  すき: ['好き'],
  すごい: ['凄い', 'すごい'],
  せかい: ['世界'],
  せんせい: ['先生'],
  そうだね: ['そうだね'],
  だいじょうぶ: ['大丈夫'],
  たのしい: ['楽しい'],
  ちょっと: ['ちょっと', '一寸'],
  てすと: ['テスト'],
  でんしゃ: ['電車'],
  とうきょう: ['東京'],
  どうも: ['どうも', '如何も'],
  どうぶつ: ['動物'],
  にほん: ['日本'],
  にほんご: ['日本語'],
  ねこ: ['猫'],
  のみもの: ['飲み物'],
  はい: ['はい'],
  はじめまして: ['はじめまして', '初めまして'],
  ひらがな: ['ひらがな', '平仮名'],
  ふつう: ['普通'],
  へや: ['部屋'],
  ほん: ['本'],
  まじで: ['マジで'],
  みず: ['水'],
  みんな: ['みんな', '皆'],
  むずかしい: ['難しい'],
  めっちゃ: ['めっちゃ'],
  やさしい: ['優しい', '易しい'],
  よろしく: ['よろしく', '宜しく'],
  りょうかい: ['了解'],
  わかった: ['わかった', '分かった'],
  わたし: ['私'],
};

// Context-aware bigram boost table: "previousWord|currentReading" -> boosted surfaces
// コンテキスト対応バイグラムブーストテーブル: "前の単語|現在の読み" -> ブーストする表層形
const CONTEXT_BOOST = {
  '今日|は': ['は'],
  '明日|は': ['は'],
  '日本|語': ['語'],
};

// Provides IME candidates from the built-in micro dictionary.
// 組み込み小規模辞書からIME候補を提供する。
export class MicroDictionaryProvider {
  constructor(maxCandidates = 20) {
    this.maxCandidates = maxCandidates;
  }

  // Check if an exact reading exists in the dictionary / 辞書に完全一致する読みが存在するか確認
  hasReading(reading) {
    return Boolean(MICRO_DICTIONARY[toHiragana(reading)]?.length);
  }

  // Check if any dictionary entry starts with the given prefix / 辞書エントリが指定の接頭辞で始まるか確認
  hasReadingPrefix(prefix) {
    const normalizedPrefix = toHiragana(prefix);
    return Object.keys(MICRO_DICTIONARY).some((key) =>
      key.startsWith(normalizedPrefix),
    );
  }

  // Get conversion candidates for a reading with optional context boosting / 読みの変換候補を取得（コンテキストブースト付き）
  getCandidates(reading, context = {}) {
    const normalizedReading = toHiragana(reading);
    const direct = MICRO_DICTIONARY[normalizedReading] || [];
    const previousWord =
      context.previousWord || extractLastWord(context.previousText || '');
    const contextKey = previousWord
      ? `${toHiragana(previousWord)}|${normalizedReading}`
      : '';
    const contextBoost = contextKey ? CONTEXT_BOOST[contextKey] || [] : [];

    // Build ranked candidate list: context-boosted > dictionary > hiragana fallback > katakana fallback
    // ランク付き候補リスト構築: コンテキストブースト > 辞書 > ひらがなフォールバック > カタカナフォールバック
    const candidates = [
      ...contextBoost.map((text) => ({
        text,
        reading: normalizedReading,
        source: 'context',
        dictSource: 'context',
        score: 100,
      })),
      ...direct.map((text, index) => ({
        text,
        reading: normalizedReading,
        source: 'dictionary',
        dictSource: 'fallback',
        score: 80 - index,
      })),
      {
        text: normalizedReading,
        reading: normalizedReading,
        source: 'fallback',
        dictSource: 'fallback',
        score: 20,
      },
      {
        text: toKatakana(normalizedReading),
        reading: normalizedReading,
        source: 'fallback',
        dictSource: 'fallback',
        score: 10,
      },
    ];

    return dedupeCandidates(candidates, this.maxCandidates);
  }
}
