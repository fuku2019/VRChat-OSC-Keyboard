import { dedupeCandidates, extractLastWord, toHiragana, toKatakana } from './textUtils.js';

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

const CONTEXT_BOOST = {
  '今日|は': ['は'],
  '明日|は': ['は'],
  '日本|語': ['語'],
};

export class MicroDictionaryProvider {
  constructor(maxCandidates = 20) {
    this.maxCandidates = maxCandidates;
  }

  hasReading(reading) {
    return Boolean(MICRO_DICTIONARY[toHiragana(reading)]?.length);
  }

  hasReadingPrefix(prefix) {
    const normalizedPrefix = toHiragana(prefix);
    return Object.keys(MICRO_DICTIONARY).some((key) =>
      key.startsWith(normalizedPrefix),
    );
  }

  getCandidates(reading, context = {}) {
    const normalizedReading = toHiragana(reading);
    const direct = MICRO_DICTIONARY[normalizedReading] || [];
    const previousWord =
      context.previousWord || extractLastWord(context.previousText || '');
    const contextKey = previousWord
      ? `${toHiragana(previousWord)}|${normalizedReading}`
      : '';
    const contextBoost = contextKey ? CONTEXT_BOOST[contextKey] || [] : [];

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
