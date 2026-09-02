export type GameState =
  | 'boot'
  | 'menu'
  | 'characters'
  | 'tutorial'
  | 'playing'
  | 'gameover'
  | 'challenges'
  | 'ranking'
  | 'store';

/** Qualidade de um toque na bola (§3 do brief). */
export type TouchQuality = 'PERFECT' | 'GOOD' | 'BAD' | 'MISS';

export interface TouchResult {
  quality: TouchQuality;
  /** Erro de timing em segundos (negativo = cedo demais, positivo = tarde). */
  timingError: number;
  /** Altura da bola no instante do contato (m). */
  height: number;
  points: number;
}

export interface RunStats {
  distance: number;
  score: number;
  touches: number;
  perfects: number;
  goods: number;
  bads: number;
  bestCombo: number;
  accuracy: number;
  characterId: string;
}

export interface Records {
  bestDistance: number;
  bestScore: number;
  bestCombo: number;
  bestPerfects: number;
  lastCharacterId: string;
  totalRuns: number;
}
