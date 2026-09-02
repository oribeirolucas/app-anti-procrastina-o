import { CONFIG } from '../data/config';

export interface BallState {
  /** Posição lateral em metros (0 = centro da rua). */
  x: number;
  /** Altura em metros a partir do asfalto. */
  y: number;
  /** Distância à frente do craque, em metros. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
}

const { gravity } = CONFIG.physics;

/**
 * Integração semi-implícita de Euler com passo fixo.
 * Determinística: mesmos inputs => mesma trajetória, sempre. Isso é requisito
 * de design (§3): o jogador só pode perder por erro de execução.
 */
export function integrate(b: BallState, dt: number, dragMultiplier = 1): void {
  b.vy += gravity * dt;
  b.vx -= b.vx * CONFIG.physics.lateralDrag * dragMultiplier * dt;
  // z é uma mola leve em torno da posição de contato: a bola "respira" à frente
  // do craque sem nunca virar um eixo de falha.
  const zTarget = 2.45;
  b.vz += (zTarget - b.z) * 26 * dt;
  b.vz -= b.vz * 5 * dt;

  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  b.spin += (6 + Math.abs(b.vx) * 3) * dt;
}

/**
 * Tempo (s) até a bola cruzar `height` DESCENDO. Retorna valor negativo se ela
 * já passou desse ponto. É a referência de timing do sistema de embaixadinhas.
 */
export function timeToDescendingHeight(b: BallState, height: number): number {
  const g = gravity; // negativo
  // y(t) = y + vy t + 0.5 g t²  =>  0.5g t² + vy t + (y - height) = 0
  const a = 0.5 * g;
  const c = b.y - height;
  const disc = b.vy * b.vy - 4 * a * c;
  if (disc < 0) {
    // Nunca alcança essa altura (apex abaixo dela): o instante "ideal" é o apex.
    return -b.vy / g;
  }
  const root = Math.sqrt(disc);
  // Duas raízes; a maior é a passagem descendo.
  const t1 = (-b.vy + root) / (2 * a);
  const t2 = (-b.vy - root) / (2 * a);
  return Math.max(t1, t2);
}

/** Tempo até tocar o chão (usado para o indicador de urgência do HUD). */
export function timeToGround(b: BallState): number {
  const g = gravity;
  const target = CONFIG.physics.groundY + CONFIG.ball.radius;
  const a = 0.5 * g;
  const c = b.y - target;
  const disc = b.vy * b.vy - 4 * a * c;
  if (disc < 0) return Infinity;
  const root = Math.sqrt(disc);
  return Math.max((-b.vy + root) / (2 * a), (-b.vy - root) / (2 * a));
}

/** Altura máxima que a bola ainda vai atingir. */
export function apexHeight(b: BallState): number {
  if (b.vy <= 0) return b.y;
  return b.y + (b.vy * b.vy) / (-2 * gravity);
}
