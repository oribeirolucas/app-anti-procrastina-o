import type { GameEvent } from '../data/events';
import {
  ApiError, type GameApi, type Profile, type RunRecord, type LeaderboardEntry,
  type LeaderboardPeriod, type SubmitResult,
} from './GameApi';

export interface HttpOptions {
  baseUrl: string;
  /** Token do jogador (Fase 4: emitido pelo provedor de auth). */
  getToken?: () => string | null;
  timeoutMs?: number;
  retries?: number;
}

/**
 * Cliente do backend do jogo. O contrato REST está documentado em
 * `docs/api-contract.md` — este arquivo é a única implementação dele.
 *
 * Regras: timeout explícito (uma rede móvel ruim não pode pendurar a UI),
 * retry só em erro retriável, e erro tipado para o SyncQueue decidir se
 * guarda a operação para depois.
 */
export class HttpGameApi implements GameApi {
  readonly kind = 'http' as const;
  private timeout: number;
  private retries: number;

  constructor(private opts: HttpOptions) {
    this.timeout = opts.timeoutMs ?? 8000;
    this.retries = opts.retries ?? 2;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}${path}`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      try {
        const token = this.opts.getToken?.();
        const res = await fetch(url, {
          ...init,
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(init?.headers ?? {}),
          },
        });
        if (!res.ok) {
          // 5xx e 429 são transitórios; 4xx é erro de contrato e não adianta repetir.
          const retriable = res.status >= 500 || res.status === 429;
          throw new ApiError(`HTTP ${res.status} em ${path}`, res.status, retriable);
        }
        return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
      } catch (err) {
        lastError = err;
        const retriable = err instanceof ApiError ? err.retriable : true; // rede/abort
        if (!retriable || attempt === this.retries) break;
        // Backoff exponencial com teto.
        await new Promise((r) => setTimeout(r, Math.min(2 ** attempt * 400, 3000)));
      } finally {
        clearTimeout(timer);
      }
    }
    if (lastError instanceof ApiError) throw lastError;
    throw new ApiError(`Falha de rede em ${path}`, undefined, true);
  }

  getProfile(): Promise<Profile> {
    return this.request<Profile>('/v1/profile');
  }

  updateProfile(patch: Partial<Profile>): Promise<Profile> {
    return this.request<Profile>('/v1/profile', { method: 'PATCH', body: JSON.stringify(patch) });
  }

  submitRun(run: RunRecord): Promise<SubmitResult> {
    return this.request<SubmitResult>('/v1/runs', { method: 'POST', body: JSON.stringify(run) });
  }

  getLeaderboard(period: LeaderboardPeriod, limit: number): Promise<LeaderboardEntry[]> {
    return this.request<LeaderboardEntry[]>(`/v1/leaderboard?period=${period}&limit=${limit}`);
  }

  getEvents(): Promise<GameEvent[]> {
    return this.request<GameEvent[]>('/v1/events');
  }

  publishDuel(run: RunRecord): Promise<{ code: string }> {
    return this.request<{ code: string }>('/v1/duels', { method: 'POST', body: JSON.stringify(run) });
  }

  async getDuel(code: string): Promise<RunRecord | null> {
    try {
      return await this.request<RunRecord>(`/v1/duels/${encodeURIComponent(code.toUpperCase())}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }
}
