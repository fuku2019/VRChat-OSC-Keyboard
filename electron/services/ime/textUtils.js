// Text utility functions for IME processing / IME処理用テキストユーティリティ関数

// Convert katakana to hiragana / カタカナをひらがなに変換
export function toHiragana(text = '') {
  return String(text).replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  );
}

// Convert hiragana to katakana / ひらがなをカタカナに変換
export function toKatakana(text = '') {
  return String(text).replace(/[\u3041-\u3096]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60),
  );
}

// Extract the last whitespace-delimited word from text / テキストから最後の空白区切り単語を抽出
export function extractLastWord(text = '') {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1] || '';
}

// Deduplicate candidates by text, preserving order / テキストで候補を重複排除（順序を保持）
export function dedupeCandidates(candidates, max = 20) {
  const seen = new Set();
  const result = [];
  for (const candidate of candidates || []) {
    if (!candidate || typeof candidate.text !== 'string') continue;
    const text = candidate.text.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push({ ...candidate, text });
    if (result.length >= max) break;
  }
  return result;
}
