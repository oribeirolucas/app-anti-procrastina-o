import { CONFIG } from '../data/config';
import type { Character } from '../data/characters';
import type { TouchQuality, TouchResult } from '../core/types';
import { clamp, sign } from '../core/math';
import {
  type BallState,
  integrate,
  timeToDescendingHeight,
  timeToGround,
  apexHeight,
} from './BallPhysics';

export interface TouchInput {
  /** Direção do gesto: 0 = tap, -1 = swipe esquerda, 1 = direita, 2 = swipe up. */
  gesture: 'tap' | 'left' | 'right' | 'up';
  /** Força normalizada do gesto (0..1), derivada do comprimento do swipe. */
  power: number;
}

/**
 * Dono do estado da bola e do sistema de embaixadinhas (§3).
 * Não conhece render, UI nem score — devolve um TouchResult puro.
 */
export class BallController {
  readonly state: BallState = { x: CONFIG.ball.footOffset, y: 1.0, z: 2.45, vx: 0, vy: 0, vz: 0, spin: 0 };

  private character: Character;
  /** Instabilidade acumulada: cresce com toques ruins e com a dificuldade. */
  private instability = 0;
  /** Toques desperdiçados desde o último contato — trava o spam de tap. */
  private whiffStreak = 0;
  private touchCount = 0;
  private lastQuality: TouchQuality | null = null;
  /** Drift imposto pelo DifficultyManager (m/s por toque). */
  driftPerTouch = 0;

  constructor(character: Character) {
    this.character = character;
  }

  reset(character: Character): void {
    this.character = character;
    const s = this.state;
    s.x = CONFIG.ball.footOffset; s.y = 1.35; s.z = 2.45;
    s.vx = 0; s.vy = 0; s.vz = 0; s.spin = 0;
    this.instability = 0;
    this.whiffStreak = 0;
    this.touchCount = 0;
    this.lastQuality = null;
    this.driftPerTouch = 0;
  }

  update(dt: number): void {
    integrate(this.state, dt);
  }

  /** True quando a bola encostou no asfalto — condição única de Game Over. */
  hasFallen(): boolean {
    return this.state.y <= CONFIG.physics.groundY + CONFIG.ball.radius;
  }

  get timeToGround(): number { return timeToGround(this.state); }
  get apex(): number { return apexHeight(this.state); }
  get instabilityLevel(): number { return this.instability; }

  /** Erro de timing atual, em segundos (negativo = cedo). Usado pelo HUD. */
  timingErrorNow(): number {
    return -timeToDescendingHeight(this.state, CONFIG.ball.contactHeight);
  }

  /** Ponto de domínio: vertical do pé de apoio do craque. */
  private anchorX(playerX: number): number { return playerX + CONFIG.ball.footOffset; }

  /** A bola está fisicamente ao alcance do pé do craque? */
  canReach(playerX: number): boolean {
    const s = this.state;
    const dx = Math.abs(s.x - this.anchorX(playerX));
    return dx <= CONFIG.ball.reachX * this.character.attributes.precisao
      && s.y <= CONFIG.ball.reachYMax
      && s.y > CONFIG.physics.groundY + CONFIG.ball.radius;
  }

  /**
   * Processa um input do jogador. Retorna null quando o gesto não conectou
   * (whiff) — não é Game Over, mas encarece o próximo toque.
   */
  touch(input: TouchInput, playerX: number): TouchResult | null {
    const s = this.state;
    const attr = this.character.attributes;

    if (!this.canReach(playerX)) {
      this.whiffStreak++;
      return null;
    }

    const timingError = this.timingErrorNow();
    const abs = Math.abs(timingError);
    const perfectWindow = CONFIG.timing.perfect * attr.controle;
    const goodWindow = CONFIG.timing.good * attr.controle;

    let quality: TouchQuality;
    if (abs <= perfectWindow) quality = 'PERFECT';
    else if (abs <= goodWindow) quality = 'GOOD';
    else quality = 'BAD';

    // Anti-spam: martelar a tela não pode virar estratégia. A partir de 2 gestos
    // desperdiçados, o próximo contato é rebaixado.
    if (this.whiffStreak >= 2 && quality !== 'BAD') {
      quality = quality === 'PERFECT' ? 'GOOD' : 'BAD';
    }
    this.whiffStreak = 0;

    this.applyImpulse(quality, input, playerX);
    this.touchCount++;
    this.lastQuality = quality;

    const points =
      quality === 'PERFECT' ? CONFIG.score.perfect
      : quality === 'GOOD' ? CONFIG.score.good
      : CONFIG.score.bad;

    return { quality, timingError, height: s.y, points };
  }

  private applyImpulse(quality: TouchQuality, input: TouchInput, rawPlayerX: number): void {
    const s = this.state;
    const playerX = this.anchorX(rawPlayerX);
    const attr = this.character.attributes;
    const b = CONFIG.ball;

    let factor = 1;
    if (quality === 'PERFECT') factor = b.perfectImpulseFactor;
    else if (quality === 'BAD') factor = b.badImpulseFactor + 0.12 * (attr.tecnica - 1);

    const swipeUp = input.gesture === 'up';
    const powerBonus = swipeUp ? 1 + (b.swipeUpImpulse - 1) * clamp(input.power, 0.3, 1) : 1;
    s.vy = b.baseImpulse * factor * powerBonus;
    s.vz += 0.4;

    // Correção lateral explícita do jogador (§4).
    if (input.gesture === 'left') s.vx -= b.swipeCorrection * attr.precisao * clamp(input.power, 0.3, 1);
    if (input.gesture === 'right') s.vx += b.swipeCorrection * attr.precisao * clamp(input.power, 0.3, 1);

    // Estabilização automática por qualidade: o timing perfeito "limpa" a bola.
    if (quality === 'PERFECT') {
      s.vx *= 0.5;
      s.x += (playerX - s.x) * 0.55;
      this.instability = Math.max(0, this.instability - 0.35);
    } else if (quality === 'GOOD') {
      s.vx *= 0.82;
      s.x += (playerX - s.x) * 0.2;
      this.instability = Math.max(0, this.instability - 0.08);
    } else {
      // BAD: a bola sai torta e mais baixa — o próximo toque fica mais difícil.
      const dir = sign(s.x - playerX) || (this.touchCount % 2 === 0 ? 1 : -1);
      s.vx += dir * (b.badLateralKick / attr.tecnica) * (1 + this.instability * 0.3);
      this.instability = Math.min(3, this.instability + 0.5);
    }

    // Drift de dificuldade: determinístico (onda), nunca aleatório.
    if (this.driftPerTouch > 0) {
      const wobble = Math.sin(this.touchCount * 1.7) ;
      s.vx += (wobble * this.driftPerTouch) / attr.equilibrio;
    }

    // Trava de segurança: a bola nunca sai da rua.
    s.x = clamp(s.x, -CONFIG.player.laneHalfWidth, CONFIG.player.laneHalfWidth);
  }

  /** Empurrão externo (obstáculo raspando no craque). */
  disturb(lateral: number): void {
    this.state.vx += lateral / this.character.attributes.equilibrio;
    this.instability = Math.min(3, this.instability + 0.25);
  }

  get lastTouchQuality(): TouchQuality | null { return this.lastQuality; }
  get totalTouches(): number { return this.touchCount; }
}
