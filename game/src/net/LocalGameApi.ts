import type { StorageAdapter } from '../systems/SaveManager';
import { localEvents, type GameEvent } from '../data/events';
import {
  type GameApi, type Profile, type RunRecord, type LeaderboardEntry,
  type LeaderboardPeriod, type SubmitResult, newId, newDuelCode,
} from './GameApi';

const KEY = {
  profile: 'profile',
  runs: 'runs',
  duels: 'duels',
} as const;

/**
 * Implementação offline-first. É a fonte da verdade enquanto não há backend —
 * e continua sendo o cache local depois que houver.
 */
export class LocalGameApi implements GameApi {
  readonly kind = 'local' as const;

  constructor(private storage: StorageAdapter) {}

  async getProfile(): Promise<Profile> {
    const saved = this.storage.read<Profile>(KEY.profile);
    if (saved) return saved;
    const fresh: Profile = {
      id: newId(),
      nickname: 'CRAQUE DA RUA',
      linked: false,
      coins: 0,
      entitlements: [],
      owned: [],
    };
    this.storage.write(KEY.profile, fresh);
    return fresh;
  }

  async updateProfile(patch: Partial<Profile>): Promise<Profile> {
    const next = { ...(await this.getProfile()), ...patch };
    this.storage.write(KEY.profile, next);
    return next;
  }

  async submitRun(run: RunRecord): Promise<SubmitResult> {
    const runs = this.storage.read<RunRecord[]>(KEY.runs) ?? [];
    runs.push(run);
    // Mantém só as 50 melhores: o histórico local não pode crescer sem limite.
    runs.sort((a, b) => b.score - a.score);
    this.storage.write(KEY.runs, runs.slice(0, 50));
    const rank = runs.findIndex((r) => r.runId === run.runId) + 1;
    return { accepted: true, coinsAwarded: 0, rank: rank > 0 ? rank : undefined };
  }

  async getLeaderboard(period: LeaderboardPeriod, limit: number): Promise<LeaderboardEntry[]> {
    const runs = this.storage.read<RunRecord[]>(KEY.runs) ?? [];
    const profile = await this.getProfile();
    const cutoff = period === 'daily' ? Date.now() - 86400000 : 0;
    return runs
      .filter((r) => Date.parse(r.playedAt) >= cutoff)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r, i) => ({
        rank: i + 1,
        playerId: r.playerId,
        nickname: r.nickname,
        score: r.score,
        distance: r.distance,
        characterId: r.characterId,
        isSelf: r.playerId === profile.id,
      }));
  }

  async getEvents(): Promise<GameEvent[]> {
    return localEvents(new Date());
  }

  async publishDuel(run: RunRecord): Promise<{ code: string }> {
    const duels = this.storage.read<Record<string, RunRecord>>(KEY.duels) ?? {};
    const code = newDuelCode();
    duels[code] = run;
    this.storage.write(KEY.duels, duels);
    return { code };
  }

  async getDuel(code: string): Promise<RunRecord | null> {
    const duels = this.storage.read<Record<string, RunRecord>>(KEY.duels) ?? {};
    return duels[code.toUpperCase()] ?? null;
  }
}
