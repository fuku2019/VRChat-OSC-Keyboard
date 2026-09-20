export interface ImeCandidate {
  text: string;
  reading?: string;
  cost?: number;
  posId?: number;
  dictSource?: 'mozc' | 'fallback' | 'learned' | 'context';
  source?: 'dictionary' | 'fallback' | 'learned' | 'context';
  score?: number;
}

export interface ImeSegment {
  raw: string;
  candidates: ImeCandidate[];
  selectedIndex: number;
}

export interface ImeState {
  rawKana: string;
  segments: ImeSegment[];
  candidates: ImeCandidate[];
  candidateIndex: number;
  isConverting: boolean;
  preedit: string;
  selectedCandidate: string;
}

export interface ImeContext {
  previousText?: string;
  previousWord?: string;
  // Text the renderer actually committed. Main skips learning when it does not
  // match its own composition, i.e. when the two sides disagree on the pick.
  // レンダラーが実際に確定したテキスト。main側の合成結果と一致しないとき
  // （＝両者の選択が食い違っているとき）は学習をスキップする。
  expectedText?: string;
}

export interface ImeResponse {
  success: boolean;
  state?: ImeState;
  committed?: string;
  error?: string;
}
