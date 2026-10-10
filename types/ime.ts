export interface ImeCandidate {
  text: string;
  engineIndex?: number;
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
  sessionId?: string;
  revision?: number;
  engine?: 'zenzai' | 'azookey' | 'kana';
  elapsedMs?: number;
  rawKana: string;
  segments: ImeSegment[];
  candidates: ImeCandidate[];
  candidateIndex: number;
  isConverting: boolean;
  preedit: string;
  selectedCandidate: string;
}

export interface ImeContext {
  sessionId?: string;
  revision?: number;
  previousText?: string;
  previousWord?: string;
  // Renderer commit snapshot; no learning is performed.
  expectedText?: string;
}

export interface ImeResponse {
  success: boolean;
  state?: ImeState;
  committed?: string;
  error?: string;
  code?: string;
}

export interface ImeTarget { sessionId: string; revision: number }
export interface ImeEngineStatus {
  state: string;
  engine?: 'zenzai' | 'azookey' | 'kana';
  reason?: string;
}
