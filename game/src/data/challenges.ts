import type { RunStats } from '../core/types';

export type ChallengeMetric =
  | 'distance' | 'score' | 'touches' | 'perfects' | 'bestCombo' | 'accuracy';

export interface ChallengeDef {
  id: string;
  title: string;
  metric: ChallengeMetric;
  /** Meta a atingir NUMA ÚNICA tentativa. */
  target: number;
  reward: number;
  /** Dificuldade relativa, usada para montar o trio diário equilibrado. */
  tier: 1 | 2 | 3;
}

/** Extrai o valor de uma métrica de uma tentativa. */
export const readMetric = (stats: RunStats, metric: ChallengeMetric): number => {
  switch (metric) {
    case 'distance': return stats.distance;
    case 'score': return stats.score;
    case 'touches': return stats.touches;
    case 'perfects': return stats.perfects;
    case 'bestCombo': return stats.bestCombo;
    case 'accuracy': return stats.accuracy * 100;
  }
};

export const formatMetric = (metric: ChallengeMetric, value: number): string => {
  if (metric === 'distance') return `${Math.floor(value)}m`;
  if (metric === 'accuracy') return `${Math.round(value)}%`;
  return String(Math.floor(value));
};

/**
 * §23 — pool de desafios. O trio do dia é sorteado deterministicamente pela
 * data, então todo mundo pega os mesmos desafios no mesmo dia (pré-requisito
 * para eventos e ranking sazonal na Fase 4).
 */
export const CHALLENGES: readonly ChallengeDef[] = [
  { id: 'd100', title: 'Percorra 100m numa tentativa', metric: 'distance', target: 100, reward: 60, tier: 1 },
  { id: 'd250', title: 'Percorra 250m numa tentativa', metric: 'distance', target: 250, reward: 140, tier: 2 },
  { id: 'd500', title: 'Percorra 500m numa tentativa', metric: 'distance', target: 500, reward: 320, tier: 3 },
  { id: 't30', title: 'Faça 30 embaixadinhas', metric: 'touches', target: 30, reward: 50, tier: 1 },
  { id: 't80', title: 'Faça 80 embaixadinhas', metric: 'touches', target: 80, reward: 150, tier: 2 },
  { id: 't150', title: 'Faça 150 embaixadinhas', metric: 'touches', target: 150, reward: 300, tier: 3 },
  { id: 'p20', title: 'Acerte 20 PERFECT', metric: 'perfects', target: 20, reward: 70, tier: 1 },
  { id: 'p60', title: 'Acerte 60 PERFECT', metric: 'perfects', target: 60, reward: 180, tier: 2 },
  { id: 'c25', title: 'Chegue a uma sequência de 25', metric: 'bestCombo', target: 25, reward: 80, tier: 1 },
  { id: 'c50', title: 'Chegue a uma sequência de 50', metric: 'bestCombo', target: 50, reward: 160, tier: 2 },
  { id: 'c100', title: 'Chegue a uma sequência de 100', metric: 'bestCombo', target: 100, reward: 350, tier: 3 },
  { id: 's5k', title: 'Faça 5.000 pontos', metric: 'score', target: 5000, reward: 120, tier: 2 },
  { id: 's15k', title: 'Faça 15.000 pontos', metric: 'score', target: 15000, reward: 300, tier: 3 },
  { id: 'a80', title: 'Termine com 80% de precisão', metric: 'accuracy', target: 80, reward: 130, tier: 2 },
  { id: 'a90', title: 'Termine com 90% de precisão', metric: 'accuracy', target: 90, reward: 260, tier: 3 },
] as const;

export const getChallenge = (id: string): ChallengeDef | undefined =>
  CHALLENGES.find((c) => c.id === id);
