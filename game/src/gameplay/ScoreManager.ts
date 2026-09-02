import { CONFIG } from '../data/config';
import type { RunStats, TouchQuality } from '../core/types';

/** §9 — DISTÂNCIA + EMBAIXADINHAS + PRECISÃO + COMBO. */
export class ScoreManager {
  private touchPoints = 0;
  private distancePoints = 0;
  private counted = { PERFECT: 0, GOOD: 0, BAD: 0, MISS: 0 };
  private touches = 0;

  reset(): void {
    this.touchPoints = 0;
    this.distancePoints = 0;
    this.counted = { PERFECT: 0, GOOD: 0, BAD: 0, MISS: 0 };
    this.touches = 0;
  }

  addTouch(quality: TouchQuality, basePoints: number, multiplier: number): number {
    const gained = basePoints * multiplier;
    this.touchPoints += gained;
    this.counted[quality]++;
    this.touches++;
    return gained;
  }

  setDistance(meters: number): void {
    this.distancePoints = Math.floor(meters) * CONFIG.score.perMeter;
  }

  get total(): number { return Math.floor(this.touchPoints + this.distancePoints); }
  get touchCount(): number { return this.touches; }

  /** Precisão = PERFECT vale 1, GOOD vale 0.6, BAD vale 0. */
  get accuracy(): number {
    if (this.touches === 0) return 0;
    return (this.counted.PERFECT + this.counted.GOOD * 0.6) / this.touches;
  }

  snapshot(distance: number, bestCombo: number, characterId: string): RunStats {
    return {
      distance,
      score: this.total,
      touches: this.touches,
      perfects: this.counted.PERFECT,
      goods: this.counted.GOOD,
      bads: this.counted.BAD,
      bestCombo,
      accuracy: this.accuracy,
      characterId,
    };
  }
}
