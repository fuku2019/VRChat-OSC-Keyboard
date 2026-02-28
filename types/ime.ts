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
}

export interface ImeResponse {
  success: boolean;
  state?: ImeState;
  committed?: string;
  error?: string;
}
