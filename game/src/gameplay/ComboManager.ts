import { CONFIG } from '../data/config';

export interface ComboTierEvent { tier: number; mult: number; touches: number; }

/** §10 — sequência de toques consecutivos e multiplicador em degraus. */
export class ComboManager {
  private streak = 0;
  private best = 0;
  private tierIndex = 0;

  onTierUp: (e: ComboTierEvent) => void = () => {};

  reset(): void { this.streak = 0; this.best = 0; this.tierIndex = 0; }

  /** Registra um toque bem-sucedido; devolve true se subiu de degrau. */
  register(): boolean {
    this.streak++;
    if (this.streak > this.best) this.best = this.streak;
    const next = CONFIG.comboTiers[this.tierIndex + 1];
    if (next && this.streak >= next.touches) {
      this.tierIndex++;
      this.onTierUp({ tier: this.tierIndex, mult: next.mult, touches: this.streak });
      return true;
    }
    return false;
  }

  /** Um toque BAD não zera a sequência, mas derruba um degrau do multiplicador. */
  degrade(): void {
    if (this.tierIndex > 0) this.tierIndex--;
  }

  get current(): number { return this.streak; }
  get bestStreak(): number { return this.best; }
  get multiplier(): number { return CONFIG.comboTiers[this.tierIndex].mult; }
  /** Progresso 0..1 até o próximo degrau (para a barra do HUD). */
  get progress(): number {
    const cur = CONFIG.comboTiers[this.tierIndex];
    const next = CONFIG.comboTiers[this.tierIndex + 1];
    if (!next) return 1;
    return (this.streak - cur.touches) / (next.touches - cur.touches);
  }
}
