import { CONFIG, type DifficultyTier } from '../data/config';

/** §6/§18 — a dificuldade é função pura da distância. Zero aleatoriedade. */
export class DifficultyManager {
  private index = 0;

  onTierChange: (tier: DifficultyTier, index: number) => void = () => {};

  reset(): void { this.index = 0; }

  update(distance: number): DifficultyTier {
    let i = this.index;
    while (i + 1 < CONFIG.difficulty.length && distance >= CONFIG.difficulty[i + 1].from) i++;
    if (i !== this.index) {
      this.index = i;
      this.onTierChange(CONFIG.difficulty[i], i);
    }
    return CONFIG.difficulty[this.index];
  }

  get tier(): DifficultyTier { return CONFIG.difficulty[this.index]; }
  get tierIndex(): number { return this.index; }
}
