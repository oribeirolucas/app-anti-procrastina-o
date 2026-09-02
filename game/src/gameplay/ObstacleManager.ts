import { CONFIG } from '../data/config';
import type { LevelGenerator, Prop } from './LevelGenerator';

export interface ObstacleHit { prop: Prop; push: number; }

/**
 * §8 — obstáculos nunca matam sozinhos. Eles empurram o craque lateralmente,
 * o que estraga a linha da bola. A morte continua sendo "a bola caiu".
 */
export class ObstacleManager {
  private scratch: Prop[] = [];
  private hitIds = new WeakSet<Prop>();

  reset(): void { this.hitIds = new WeakSet<Prop>(); this.scratch.length = 0; }

  /** Obstáculo mais próximo à frente (para o aviso no HUD). */
  nearest(level: LevelGenerator, playerZ: number, playerX: number): Prop | null {
    const list = level.collectSolids(this.scratch, playerZ, playerZ + CONFIG.obstacles.influenceRange);
    let best: Prop | null = null;
    let bestD = Infinity;
    for (const p of list) {
      if (Math.abs(p.x - playerX) > 1.6) continue;
      const d = p.z - playerZ;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  /** Resolve colisões desta frame e devolve os empurrões aplicados. */
  resolve(level: LevelGenerator, playerZ: number, playerX: number): ObstacleHit | null {
    const list = level.collectSolids(this.scratch, playerZ - 0.6, playerZ + 0.8);
    for (const p of list) {
      if (this.hitIds.has(p)) continue;
      const halfW = p.width * 0.5 + 0.35;
      if (Math.abs(p.x - playerX) > halfW) continue;
      this.hitIds.add(p);
      // Empurra para o lado com mais espaço livre.
      const dir = playerX >= p.x ? 1 : -1;
      const strength = p.kind === 'pothole' ? 0.6 : 1;
      return { prop: p, push: dir * CONFIG.obstacles.dodgePush * strength };
    }
    return null;
  }
}
