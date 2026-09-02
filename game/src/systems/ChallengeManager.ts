import { CHALLENGES, readMetric, type ChallengeDef } from '../data/challenges';
import type { RunStats } from '../core/types';
import type { StorageAdapter } from './SaveManager';
import { createRng } from '../core/math';

export interface ChallengeProgress {
  id: string;
  best: number;
  done: boolean;
  claimed: boolean;
}

interface DailyState {
  /** Data UTC no formato YYYY-MM-DD. */
  day: string;
  ids: string[];
  progress: Record<string, ChallengeProgress>;
}

const KEY = 'challenges';

const utcDay = (d: Date): string => d.toISOString().slice(0, 10);
const daySeed = (day: string): number => {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

/**
 * §23 — três desafios por dia, sorteados deterministicamente pela data: um de
 * cada tier, então sempre há um fácil (dopamina), um médio e um difícil.
 * Todo jogador pega os mesmos no mesmo dia — pré-requisito para eventos e
 * ranking sazonal na Fase 4.
 */
export class ChallengeManager {
  private state: DailyState;

  constructor(private storage: StorageAdapter, now: Date = new Date()) {
    this.state = this.ensureDay(this.storage.read<DailyState>(KEY), now);
  }

  /** Rola o dia se necessário. Chamar ao abrir o menu. */
  refresh(now: Date = new Date()): void {
    const next = this.ensureDay(this.state, now);
    if (next !== this.state) { this.state = next; this.persist(); }
  }

  private ensureDay(saved: DailyState | null, now: Date): DailyState {
    const day = utcDay(now);
    if (saved && saved.day === day) return saved;
    const rng = createRng(daySeed(day));
    const ids: string[] = [];
    for (const tier of [1, 2, 3] as const) {
      const pool = CHALLENGES.filter((c) => c.tier === tier);
      ids.push(pool[Math.floor(rng() * pool.length) % pool.length].id);
    }
    const progress: Record<string, ChallengeProgress> = {};
    for (const id of ids) progress[id] = { id, best: 0, done: false, claimed: false };
    return { day, ids, progress };
  }

  get today(): Array<{ def: ChallengeDef; progress: ChallengeProgress }> {
    return this.state.ids
      .map((id) => {
        const def = CHALLENGES.find((c) => c.id === id);
        return def ? { def, progress: this.state.progress[id] } : null;
      })
      .filter((x): x is { def: ChallengeDef; progress: ChallengeProgress } => x !== null);
  }

  /** Aplica uma tentativa e devolve os desafios recém-concluídos. */
  applyRun(stats: RunStats): ChallengeDef[] {
    const completed: ChallengeDef[] = [];
    for (const { def, progress } of this.today) {
      const value = readMetric(stats, def.metric);
      if (value > progress.best) progress.best = value;
      if (!progress.done && value >= def.target) {
        progress.done = true;
        completed.push(def);
      }
    }
    this.persist();
    return completed;
  }

  /** Marca como resgatado e devolve o total de moedas a creditar. */
  claimAll(): number {
    let total = 0;
    for (const { def, progress } of this.today) {
      if (progress.done && !progress.claimed) { progress.claimed = true; total += def.reward; }
    }
    if (total > 0) this.persist();
    return total;
  }

  get pendingRewards(): number {
    return this.today.reduce((sum, c) => sum + (c.progress.done && !c.progress.claimed ? c.def.reward : 0), 0);
  }

  private persist(): void { this.storage.write(KEY, this.state); }
}
