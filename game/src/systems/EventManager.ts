import type { GameEvent } from '../data/events';
import type { GameApi } from '../net/GameApi';

/**
 * Fase 4 — eventos com janela de tempo. A lista vem da `GameApi`, então o
 * backend pode publicar um evento novo sem update de app; sem backend, cai no
 * calendário local de `data/events.ts`.
 */
export class EventManager {
  private events: GameEvent[] = [];

  constructor(private api: GameApi) {}

  async refresh(): Promise<void> {
    try {
      this.events = await this.api.getEvents();
    } catch {
      // Evento é conteúdo extra: se a rede falhar, o jogo segue sem ele.
      this.events = [];
    }
  }

  get active(): GameEvent | null {
    const now = Date.now();
    return this.events.find(
      (e) => Date.parse(e.startsAt) <= now && now < Date.parse(e.endsAt),
    ) ?? null;
  }

  get coinMultiplier(): number { return this.active?.coinMultiplier ?? 1; }
  get scoreMultiplier(): number { return this.active?.scoreMultiplier ?? 1; }
  get forcedSceneId(): string | null { return this.active?.forcedSceneId ?? null; }
}
