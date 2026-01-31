import { ROMAJI_MAP, HIRAGANA_TO_KATAKANA } from '../constants';

export const toKana = (
  input: string,
  buffer: string,
): { output: string; newBuffer: string } => {
  const nextBuffer = buffer + input;

  // Check for exact match / 完全一致を確認
  if (ROMAJI_MAP[nextBuffer]) {
    return { output: ROMAJI_MAP[nextBuffer], newBuffer: '' };
  }

  // Check for "n" special case (single n followed by non-vowel or end) / "n"の特殊ケースを確認（単一のnの後に母音以外または末尾が続く場合）
  // Actually, standard behavior: type 'n' -> 'n'. type 'a' -> 'na'. type 'n' -> 'nn' -> 'ん'. / 実際には標準動作: 'n' -> 'n'. 'a' -> 'na'. 'n' -> 'nn' -> 'ん'.
  if (nextBuffer === 'nn') {
    return { output: 'ん', newBuffer: '' };
  }

  // Check for "n" + consonant (except y) -> ん
  if (
    nextBuffer.length === 2 &&
    nextBuffer[0] === 'n' &&
    !['a', 'i', 'u', 'e', 'o', 'n', 'y'].includes(nextBuffer[1])
  ) {
    return { output: 'ん', newBuffer: nextBuffer[1] };
  }

  // Small tsu (double consonant) / 促音（二重子音）
  // If we have 'tt', 'ss', 'kk' etc. / 'tt', 'ss', 'kk' などがある場合
  if (
    nextBuffer.length >= 2 &&
    nextBuffer[0] === nextBuffer[1] &&
    !['a', 'i', 'u', 'e', 'o', 'n'].includes(nextBuffer[0])
  ) {
    return { output: 'っ', newBuffer: nextBuffer.substring(1) };
  }

  // If buffer gets too long and no match, flush first char / バッファが長すぎてマッチしない場合、最初の文字をフラッシュする
  // Also check if the buffer is a valid prefix for any romaji. If not, flush immediately. / また、バッファがローマ字の有効な接頭辞であるかどうかも確認します。そうでない場合は、すぐにフラッシュします。
  const isPrefix = Object.keys(ROMAJI_MAP).some((key) =>
    key.startsWith(nextBuffer),
  );

  if (!isPrefix && nextBuffer.length > 0) {
    return { output: nextBuffer[0], newBuffer: nextBuffer.slice(1) };
  }

  // Maximum buffer length check - handles edge cases like 'ttya' (4+ chars) / 最大バッファ長チェック - 'ttya'（4文字以上）のようなエッジケースに対応
  // If buffer exceeds 4 chars and still no match, flush aggressively / バッファが4文字を超えてもマッチしない場合、積極的にフラッシュ
  if (nextBuffer.length > 4) {
    return { output: nextBuffer[0], newBuffer: nextBuffer.slice(1) };
  }

  return { output: '', newBuffer: nextBuffer };
};

export const convertToKatakana = (text: string): string => {
  // First try to convert multi-character sequences, then single characters
  // まず複数文字のシーケンスを変換し、次に単一文字を変換
  let result = text;

  // Sort keys by length (longest first) to handle multi-char sequences properly
  // 複数文字シーケンスを適切に処理するため、キーを長さ順（最長優先）でソート
  const sortedKeys = Object.keys(HIRAGANA_TO_KATAKANA).sort(
    (a, b) => b.length - a.length,
  );

  for (const key of sortedKeys) {
    if (result.includes(key)) {
      result = result.split(key).join(HIRAGANA_TO_KATAKANA[key]);
    }
  }

  return result;
};
