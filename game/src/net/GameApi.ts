import type { GameEvent } from '../data/events';

export interface Profile {
  /** Id estável do jogador. Local até virar conta de verdade. */
  id: string;
  nickname: string;
  /** true quando a conta foi vinculada a um backend (Fase 4). */
  linked: boolean;
  coins: number;
  /** Compras permanentes (ex.: 'double_coins'). */
  entitlements: string[];
  /** Ids de personagens, bolas e cenários desbloqueados. */
  owned: string[];
}

export interface RunRecord {
  runId: string;
  playerId: string;
  nickname: string;
  characterId: string;
  ballId: string;
  sceneId: string;
  distance: number;
  score: number;
  touches: number;
  perfects: number;
  bestCombo: number;
  accuracy: number;
  /** ISO 8601. */
  playedAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  nickname: string;
  score: number;
  distance: number;
  characterId: string;
  /** true quando é a linha do próprio jogador. */
  isSelf: boolean;
}

export type LeaderboardPeriod = 'daily' | 'alltime';

export interface SubmitResult {
  accepted: boolean;
  coinsAwarded: number;
  /** Posição no ranking depois desta tentativa, quando o backend informa. */
  rank?: number;
}

/**
 * Fase 4 — TODA comunicação com o mundo externo passa por aqui.
 * `LocalGameApi` hoje (localStorage), `HttpGameApi` quando existir backend.
 * Nenhum módulo de gameplay conhece esta interface: só o GameManager e os
 * managers de meta-jogo. Trocar a implementação é uma linha em `createGameApi`.
 */
export interface GameApi {
  readonly kind: 'local' | 'http';
  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Pick<Profile, 'nickname' | 'coins' | 'entitlements' | 'owned'>>): Promise<Profile>;
  submitRun(run: RunRecord): Promise<SubmitResult>;
  getLeaderboard(period: LeaderboardPeriod, limit: number): Promise<LeaderboardEntry[]>;
  getEvents(): Promise<GameEvent[]>;
  /** Duelo assíncrono: publica a tentativa e devolve um código para compartilhar. */
  publishDuel(run: RunRecord): Promise<{ code: string }>;
  /** Busca a tentativa de um rival pelo código. */
  getDuel(code: string): Promise<RunRecord | null>;
}

export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly retriable = false) {
    super(message);
    this.name = 'ApiError';
  }
}

export const newId = (): string => {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Código curto e legível em voz alta, para o duelo assíncrono. */
export const newDuelCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
};
