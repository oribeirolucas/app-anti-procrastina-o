import type { Records, RunStats } from '../core/types';

/**
 * §16 — abstração de armazenamento. Hoje `LocalStorageAdapter`; trocar por um
 * `ApiAdapter` (Fase 4: conta de usuário / cloud save / ranking) não exige
 * mudar nenhuma linha de gameplay.
 */
export interface StorageAdapter {
  read<T>(key: string): T | null;
  write<T>(key: string, value: T): void;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private prefix = 'street-emb:') {}

  read<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
  }

  write<T>(key: string, value: T): void {
    try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); } catch { /* quota/privado */ }
  }
}

const EMPTY: Records = {
  bestDistance: 0, bestScore: 0, bestCombo: 0, bestPerfects: 0,
  lastCharacterId: 'maestro', totalRuns: 0,
};

export class SaveManager {
  private records: Records;

  constructor(private storage: StorageAdapter = new LocalStorageAdapter()) {
    this.records = { ...EMPTY, ...(this.storage.read<Records>('records') ?? {}) };
  }

  get all(): Readonly<Records> { return this.records; }

  get tutorialSeen(): boolean { return this.storage.read<boolean>('tutorial') === true; }
  markTutorialSeen(): void { this.storage.write('tutorial', true); }

  get selectedCharacter(): string { return this.records.lastCharacterId; }

  /** §24 — loadout escolhido pelo jogador (craque + bola + cenário). */
  get loadout(): { ballId: string; sceneId: string } {
    return this.storage.read<{ ballId: string; sceneId: string }>('loadout')
      ?? { ballId: 'street', sceneId: 'rua' };
  }

  setLoadout(patch: Partial<{ ballId: string; sceneId: string }>): void {
    this.storage.write('loadout', { ...this.loadout, ...patch });
  }

  get storageAdapter(): StorageAdapter { return this.storage; }
  selectCharacter(id: string): void {
    this.records.lastCharacterId = id;
    this.persist();
  }

  /** Retorna quais recordes foram batidos nesta tentativa. */
  submitRun(stats: RunStats): { distance: boolean; score: boolean; combo: boolean } {
    const beat = {
      distance: stats.distance > this.records.bestDistance,
      score: stats.score > this.records.bestScore,
      combo: stats.bestCombo > this.records.bestCombo,
    };
    if (beat.distance) this.records.bestDistance = stats.distance;
    if (beat.score) this.records.bestScore = stats.score;
    if (beat.combo) this.records.bestCombo = stats.bestCombo;
    if (stats.perfects > this.records.bestPerfects) this.records.bestPerfects = stats.perfects;
    this.records.lastCharacterId = stats.characterId;
    this.records.totalRuns++;
    this.persist();
    return beat;
  }

  private persist(): void { this.storage.write('records', this.records); }
}
