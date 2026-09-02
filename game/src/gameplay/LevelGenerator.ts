import { CONFIG } from '../data/config';
import { createRng, randRange, pick } from '../core/math';
import { getScene, type Scene } from '../data/scenes';
import { ObjectPool } from '../core/ObjectPool';

export type PropKind =
  | 'building' | 'tree' | 'pole' | 'bench' | 'bin' | 'sign'
  | 'car' | 'pedestrian' | 'hydrant' | 'cone' | 'bike' | 'scooter' | 'pothole'
  | 'palm' | 'bleacher';

export interface Prop {
  kind: PropKind;
  /** Coordenada lateral em metros. */
  x: number;
  /** Coordenada de mundo ao longo da rua (m). */
  z: number;
  width: number;
  height: number;
  depth: number;
  color: string;
  accent: string;
  /** Fase de animação (pedestres, carros). */
  phase: number;
  /** Velocidade própria (carros/pedestres), m/s no eixo z. */
  speed: number;
  /** Obstáculo = interage com o craque. */
  solid: boolean;
}

export interface Segment {
  z: number;
  props: Prop[];
  /** Alterna a cor das faixas do asfalto. */
  parity: number;
}

const CAR_COLORS = ['#d94f45', '#3f7fd9', '#e8b02b', '#4a4a52', '#e6e6ea', '#2fa36b'];
const SHIRT_COLORS = ['#e8734a', '#5aa9e6', '#f2c14e', '#8b6fd6', '#54c08a', '#e0577f'];

/**
 * §7 — geração procedural infinita. Segmentos entram e saem de um pool; a
 * memória do jogo é constante, independente da distância percorrida.
 */
export class LevelGenerator {
  private segments: Segment[] = [];
  private rng = createRng(1);
  private nextZ = 0;
  private parity = 0;
  private propPool: ObjectPool<Prop>;
  private scene: Scene = getScene('rua');

  constructor() {
    this.propPool = new ObjectPool<Prop>(
      () => ({
        kind: 'tree', x: 0, z: 0, width: 1, height: 1, depth: 1,
        color: '#fff', accent: '#fff', phase: 0, speed: 0, solid: false,
      }),
      (p) => { p.speed = 0; p.solid = false; p.phase = 0; },
      160,
    );
  }

  get activeScene(): Scene { return this.scene; }

  reset(seed = Math.floor(Math.random() * 1e9), scene: Scene = this.scene): void {
    this.scene = scene;
    for (const s of this.segments) for (const p of s.props) this.propPool.release(p);
    this.segments.length = 0;
    this.rng = createRng(seed);
    this.nextZ = -CONFIG.world.segmentLength * CONFIG.world.segmentsBehind;
    this.parity = 0;
    for (let i = 0; i < CONFIG.world.segmentsAhead + CONFIG.world.segmentsBehind; i++) {
      this.segments.push(this.buildSegment(0));
    }
  }

  /** Chamado a cada frame com a distância do craque e a taxa de obstáculos. */
  update(playerZ: number, obstacleRate: number): void {
    const { segmentLength, segmentsAhead, segmentsBehind } = CONFIG.world;
    // Recicla o que ficou para trás.
    while (this.segments.length && this.segments[0].z < playerZ - segmentLength * segmentsBehind) {
      const seg = this.segments.shift()!;
      for (const p of seg.props) this.propPool.release(p);
      seg.props.length = 0;
    }
    // Gera à frente.
    while (this.nextZ < playerZ + segmentLength * segmentsAhead) {
      this.segments.push(this.buildSegment(obstacleRate));
    }
    // Move props dinâmicos (carros, pedestres).
    for (const seg of this.segments) {
      for (const p of seg.props) {
        if (p.speed !== 0) p.z += p.speed * (1 / 60);
      }
    }
  }

  get all(): readonly Segment[] { return this.segments; }

  /** Obstáculos ativos perto do craque, para o ObstacleManager. */
  collectSolids(out: Prop[], fromZ: number, toZ: number): Prop[] {
    out.length = 0;
    for (const seg of this.segments) {
      if (seg.z + CONFIG.world.segmentLength < fromZ || seg.z > toZ) continue;
      for (const p of seg.props) if (p.solid && p.z >= fromZ && p.z <= toZ) out.push(p);
    }
    return out;
  }

  private buildSegment(obstacleRate: number): Segment {
    const z = this.nextZ;
    this.nextZ += CONFIG.world.segmentLength;
    this.parity ^= 1;
    const seg: Segment = { z, props: [], parity: this.parity };
    const rng = this.rng;
    const road = CONFIG.world.roadHalfWidth;
    const walk = road + CONFIG.world.sidewalkWidth;

    // Volumes altos dos dois lados — é o que cria o "corredor" e dá a sensação
    // de velocidade. O tipo vem do cenário: prédio, coqueiro ou arquibancada.
    for (const side of [-1, 1] as const) {
      const count = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < count; i++) {
        const p = this.propPool.acquire();
        p.kind = this.scene.structure;
        p.x = side * (walk + randRange(rng, 3.5, 7));
        p.z = z + randRange(rng, 0, CONFIG.world.segmentLength);
        if (this.scene.structure === 'palm') {
          p.width = 0.45; p.height = randRange(rng, 6, 10); p.depth = 0.45;
        } else if (this.scene.structure === 'bleacher') {
          p.width = randRange(rng, 8, 12); p.height = randRange(rng, 3, 5); p.depth = randRange(rng, 5, 8);
        } else {
          p.width = randRange(rng, 6, 11); p.height = randRange(rng, 9, 26); p.depth = randRange(rng, 6, 10);
        }
        p.color = pick(rng, this.scene.structureColors);
        p.accent = '#f4d98a';
        p.phase = rng();
        seg.props.push(p);
      }
    }

    // Mobiliário na calçada (decorativo, não colide).
    const decorCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < decorCount; i++) {
      const p = this.propPool.acquire();
      p.kind = pick(rng, this.scene.decor);
      if (p.kind === 'car') { p.kind = 'bench'; }
      const side = rng() < 0.5 ? -1 : 1;
      p.x = side * randRange(rng, road + 0.5, walk - 0.2);
      p.z = z + randRange(rng, 0, CONFIG.world.segmentLength);
      p.phase = rng();
      p.color = '#6b7280';
      p.accent = '#2f7d4f';
      p.width = 0.5; p.depth = 0.5;
      p.height = p.kind === 'pole' ? 5.5 : p.kind === 'tree' ? 4.2 : 0.9;
      seg.props.push(p);
    }

    // Carros estacionados junto ao meio-fio.
    if (this.scene.decor.includes('car') && rng() < 0.55) {
      const p = this.propPool.acquire();
      p.kind = 'car';
      const side = rng() < 0.5 ? -1 : 1;
      p.x = side * (road - 1.1);
      p.z = z + randRange(rng, 1, CONFIG.world.segmentLength - 4);
      p.width = 1.8; p.height = 1.45; p.depth = 4.2;
      p.color = pick(rng, CAR_COLORS);
      p.accent = '#9fd7f2';
      p.phase = rng();
      seg.props.push(p);
    }

    // §8 — obstáculos na trajetória do craque, dosados pela dificuldade.
    if (obstacleRate > 0 && rng() < obstacleRate) {
      const p = this.propPool.acquire();
      p.kind = pick(rng, this.scene.obstacles);
      // Nunca no centro exato logo à frente: sempre há rota de fuga.
      p.x = randRange(rng, -2.6, 2.6);
      p.z = z + randRange(rng, 2, CONFIG.world.segmentLength - 2);
      p.solid = true;
      p.phase = rng();
      switch (p.kind) {
        case 'pedestrian':
          p.width = 0.55; p.height = 1.75; p.depth = 0.4;
          p.color = pick(rng, SHIRT_COLORS); p.accent = '#2b2b33';
          p.speed = rng() < 0.5 ? -1.1 : 0.9;
          break;
        case 'cone':
          p.width = 0.42; p.height = 0.65; p.depth = 0.42;
          p.color = '#f0630f'; p.accent = '#ffffff';
          break;
        case 'bin':
          p.width = 0.7; p.height = 1.0; p.depth = 0.7;
          p.color = '#2f7d4f'; p.accent = '#1c4f31';
          break;
        case 'bike':
          p.width = 1.6; p.height = 1.0; p.depth = 0.4;
          p.color = '#d0d4dc'; p.accent = '#22262e';
          break;
        case 'scooter':
          p.width = 1.1; p.height = 1.15; p.depth = 0.35;
          p.color = '#e8e83a'; p.accent = '#22262e';
          break;
        default: // pothole
          p.width = 1.2; p.height = 0.02; p.depth = 1.0;
          p.color = '#15171c'; p.accent = '#2a2e38';
          break;
      }
      seg.props.push(p);
    }

    return seg;
  }
}
