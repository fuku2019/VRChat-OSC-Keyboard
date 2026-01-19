import { ROMAJI_MAP, HIRAGANA_TO_KATAKANA } from '../constants';

export const toKana = (input: string, buffer: string): { output: string; newBuffer: string } => {
  const nextBuffer = buffer + input;
  
  // Check for exact match
  if (ROMAJI_MAP[nextBuffer]) {
    return { output: ROMAJI_MAP[nextBuffer], newBuffer: '' };
  }

  // Check for "n" special case (single n followed by non-vowel or end)
  // Actually, standard behavior: type 'n' -> 'n'. type 'a' -> 'na'. type 'n' -> 'nn' -> 'ん'.
  if (nextBuffer === 'nn') {
    return { output: 'ん', newBuffer: '' };
  }

  // Small tsu (double consonant)
  // If we have 'tt', 'ss', 'kk' etc.
  if (nextBuffer.length >= 2 && nextBuffer[0] === nextBuffer[1] && !['a','i','u','e','o','n'].includes(nextBuffer[0])) {
     return { output: 'っ', newBuffer: nextBuffer.substring(1) };
  }

  // If buffer gets too long (3 chars) and no match, flush first char
  if (nextBuffer.length > 3) {
    return { output: nextBuffer[0], newBuffer: nextBuffer.slice(1) };
  }

  return { output: '', newBuffer: nextBuffer };
};

export const convertToKatakana = (text: string): string => {
  return text.split('').map(char => HIRAGANA_TO_KATAKANA[char] || char).join('');
};