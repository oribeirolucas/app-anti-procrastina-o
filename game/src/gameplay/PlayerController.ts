import { CONFIG } from '../data/config';
import type { Character } from '../data/characters';
import { clamp } from '../core/math';

/**
 * O craque corre sozinho para frente (§6). O jogador não controla a caminhada:
 * o deslocamento lateral é automático, perseguindo a bola — mas com velocidade
 * limitada. É essa limitação que transforma "bola torta" em derrota.
 */
export class PlayerController {
  /** Posição lateral (m). */
  x = 0;
  /** Distância total percorrida (m) — também é a coordenada z do mundo. */
  distance = 0;
  vx = 0;
  speed: number = CONFIG.player.baseSpeed;
  /** Fase da animação de corrida (0..1). */
  stride = 0;
  /** Animação de chute: 0 = parado, 1 = pé no alto. */
  kick = 0;
  private character: Character;

  constructor(character: Character) { this.character = character; }

  reset(character: Character): void {
    this.character = character;
    this.x = 0; this.vx = 0; this.distance = 0;
    this.stride = 0; this.kick = 0;
    this.speed = CONFIG.player.baseSpeed * character.attributes.velocidade;
  }

  setTargetSpeed(tierSpeed: number): void {
    this.speed = tierSpeed * this.character.attributes.velocidade;
  }

  update(dt: number, ballX: number): void {
    const maxStrafe = CONFIG.player.strafeSpeed * this.character.attributes.velocidade;
    const target = ballX - CONFIG.ball.footOffset;
    const desired = clamp((target - this.x) * 4.5, -maxStrafe, maxStrafe);
    this.vx += (desired - this.vx) * Math.min(1, CONFIG.player.strafeAccel * dt);
    this.x = clamp(this.x + this.vx * dt, -CONFIG.player.laneHalfWidth, CONFIG.player.laneHalfWidth);

    this.distance += this.speed * dt;
    this.stride = (this.stride + this.speed * dt * 0.55) % 1;
    if (this.kick > 0) this.kick = Math.max(0, this.kick - dt * 6);
  }

  triggerKick(): void { this.kick = 1; }
  push(lateral: number): void { this.vx += lateral; }
}
