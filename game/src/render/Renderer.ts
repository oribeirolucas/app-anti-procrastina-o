import { CONFIG } from '../data/config';
import type { Camera } from './Camera';
import type { LevelGenerator, Prop } from '../gameplay/LevelGenerator';
import type { PlayerController } from '../gameplay/PlayerController';
import type { BallController } from '../gameplay/BallController';
import type { Character } from '../data/characters';
import { clamp } from '../core/math';
import type { Scene } from '../data/scenes';

type P = { sx: number; sy: number; scale: number };

/**
 * Renderer 2D com projeção pseudo-3D (painter's algorithm).
 * Regras de performance (§18): zero alocação por frame no caminho quente,
 * culling por distância e ordenação em um array reutilizado.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private drawList: Prop[] = [];
  private skylineSeed: number[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponível neste dispositivo.');
    this.ctx = ctx;
    for (let i = 0; i < 80; i++) this.skylineSeed.push(Math.random());
  }

  resize(camera: Camera): void {
    // Cap de DPR: em telas 3x o custo de fill dobra sem ganho visual real.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    camera.resize(w, h);
  }

  render(
    camera: Camera,
    level: LevelGenerator,
    player: PlayerController,
    ball: BallController,
    character: Character,
    timeOfRun: number,
  ): void {
    const ctx = this.ctx;
    const w = camera.viewWidth;
    const h = camera.viewHeight;
    const horizon = this.horizonY(camera, h);
    const scene = level.activeScene;

    this.drawSky(ctx, w, h, horizon, scene);
    this.drawSkyline(ctx, w, horizon, player.distance, scene);
    this.drawGround(ctx, w, h, horizon, scene);
    this.drawRoad(ctx, camera, level, player, scene);

    // Painter: mais longe primeiro.
    this.drawList.length = 0;
    const maxZ = player.distance + CONFIG.world.drawDistance;
    for (const seg of level.all) {
      for (const p of seg.props) {
        if (p.z > maxZ || p.z < camera.depth) continue;
        this.drawList.push(p);
      }
    }
    this.drawList.sort((a, b) => b.z - a.z);
    for (const p of this.drawList) this.drawProp(ctx, camera, p, timeOfRun, scene);

    this.drawBallShadow(ctx, camera, ball, player);
    this.drawPlayer(ctx, camera, player, character);
    this.drawBall(ctx, camera, ball, player);
    this.drawTimingRing(ctx, camera, ball, player);
  }

  private horizonY(camera: Camera, h: number): number {
    const far = camera.project(0, camera.y, camera.depth + 1000);
    return far ? far.sy : h * 0.4;
  }

  private drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, horizon: number, scene: Scene): void {
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(horizon, 1));
    g.addColorStop(0, scene.sky.top);
    g.addColorStop(0.55, scene.sky.middle);
    g.addColorStop(1, scene.sky.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, Math.max(horizon, 0));
    if (horizon < h) {
      ctx.fillStyle = '#5b6070';
      ctx.fillRect(0, Math.max(horizon, 0), w, h - Math.max(horizon, 0));
    }
  }

  /** Skyline parallax: barato e vende a ideia de cidade grande. */
  private drawSkyline(ctx: CanvasRenderingContext2D, w: number, horizon: number, distance: number, scene: Scene): void {
    const offset = (distance * 1.6) % 200;
    ctx.fillStyle = scene.skyline;
    for (let i = 0; i < this.skylineSeed.length; i++) {
      const s = this.skylineSeed[i];
      const bw = 24 + s * 40;
      const bh = 30 + s * 90;
      const x = ((i * 46 - offset) % (w + 200)) - 100;
      ctx.fillRect(x, horizon - bh, bw, bh);
    }
  }

  private drawGround(ctx: CanvasRenderingContext2D, w: number, h: number, horizon: number, scene: Scene): void {
    const g = ctx.createLinearGradient(0, horizon, 0, h);
    g.addColorStop(0, scene.ground.far);
    g.addColorStop(1, scene.ground.near);
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, w, h - horizon);
  }

  private quad(ctx: CanvasRenderingContext2D, a: P, b: P, c: P, d: P, fill: string): void {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(c.sx, c.sy);
    ctx.lineTo(d.sx, d.sy);
    ctx.closePath();
    ctx.fill();
  }

  private drawRoad(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    level: LevelGenerator,
    player: PlayerController,
    scene: Scene,
  ): void {
    const road = CONFIG.world.roadHalfWidth;
    const walk = road + CONFIG.world.sidewalkWidth;
    const segs = level.all;
    // Longe -> perto.
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      const near = cam.depth + 0.6;
      // Clipa o segmento contra o near plane. Sem isso, qualquer segmento com um
      // vértice atrás da câmera era descartado inteiro e o asfalto "acabava" a
      // poucos metros do craque.
      const z0 = Math.max(s.z, near);
      const z1 = Math.max(s.z + CONFIG.world.segmentLength, near);
      if (z1 - z0 < 0.05 || z0 > player.distance + CONFIG.world.drawDistance) continue;

      // Calçadas: dois quads laterais. Um único quad de largura total passaria
      // por baixo do asfalto e apareceria como uma faixa branca atravessando a tela.
      for (const side of [-1, 1] as const) {
        const inner = side * road;
        const outer = side * walk;
        const a = cam.project(inner, 0.14, z1);
        const b = cam.project(outer, 0.14, z1);
        const c = cam.project(outer, 0.14, z0);
        const d = cam.project(inner, 0.14, z0);
        if (a && b && c && d) this.quad(ctx, a, b, c, d, s.parity ? scene.sidewalk.a : scene.sidewalk.b);
      }

      const rfl = cam.project(-road, 0, z1);
      const rfr = cam.project(road, 0, z1);
      const rnl = cam.project(-road, 0, z0);
      const rnr = cam.project(road, 0, z0);
      if (!rfl || !rfr || !rnl || !rnr) continue;
      this.quad(ctx, rfl, rfr, rnr, rnl, s.parity ? scene.road.a : scene.road.b);

      // Faixa central tracejada.
      if (s.parity && z1 - z0 > 6.5) {
        const cfl = cam.project(-0.12, 0.01, z1 - 3);
        const cfr = cam.project(0.12, 0.01, z1 - 3);
        const cnl = cam.project(-0.12, 0.01, z0 + 3);
        const cnr = cam.project(0.12, 0.01, z0 + 3);
        if (cfl && cfr && cnl && cnr) this.quad(ctx, cfl, cfr, cnr, cnl, scene.laneMark);
      }
      // Meio-fio.
      for (const side of [-1, 1] as const) {
        const a = cam.project(side * road, 0.14, z1);
        const b = cam.project(side * (road + 0.25), 0.14, z1);
        const c = cam.project(side * (road + 0.25), 0.14, z0);
        const d = cam.project(side * road, 0.14, z0);
        if (a && b && c && d) this.quad(ctx, a, b, c, d, scene.curb);
      }
    }
  }

  /** Caixa 3D simplificada: face frontal + topo. Suficiente e barato. */
  private box(
    ctx: CanvasRenderingContext2D, cam: Camera,
    x: number, y: number, z: number,
    w: number, hgt: number, d: number,
    front: string, top: string,
  ): void {
    const nearZ = z - d * 0.5;
    const bl = cam.project(x - w / 2, y, nearZ);
    const br = cam.project(x + w / 2, y, nearZ);
    const tl = cam.project(x - w / 2, y + hgt, nearZ);
    const tr = cam.project(x + w / 2, y + hgt, nearZ);
    if (!bl || !br || !tl || !tr) return;
    const ftl = cam.project(x - w / 2, y + hgt, z + d * 0.5);
    const ftr = cam.project(x + w / 2, y + hgt, z + d * 0.5);
    if (ftl && ftr) this.quad(ctx, ftl, ftr, tr, tl, top);
    this.quad(ctx, tl, tr, br, bl, front);
  }

  private drawProp(ctx: CanvasRenderingContext2D, cam: Camera, p: Prop, t: number, scene: Scene): void {
    switch (p.kind) {
      case 'building': {
        this.box(ctx, cam, p.x, 0, p.z, p.width, p.height, p.depth, p.color, '#8a94aa');
        // Janelas: grid barato em cima da face frontal.
        const base = cam.project(p.x - p.width / 2, 0, p.z - p.depth * 0.5);
        const topP = cam.project(p.x + p.width / 2, p.height, p.z - p.depth * 0.5);
        if (!base || !topP) return;
        const wpx = topP.sx - base.sx;
        const hpx = base.sy - topP.sy;
        if (wpx < 24 || hpx < 24) return;
        // Cap obrigatório: um prédio colado na câmera projeta milhares de pixels
        // de altura e a grade viraria milhares de fillRect num único frame.
        const cols = clamp(Math.floor(wpx / 16), 2, 10);
        const rows = clamp(Math.floor(hpx / 18), 2, 26);
        const cw = wpx / cols, ch = hpx / rows;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const lit = scene.litWindows && ((r * 7 + c * 13 + Math.floor(p.phase * 100)) % 5) < 2;
            ctx.fillStyle = lit ? 'rgba(244,217,138,0.85)' : 'rgba(20,26,40,0.55)';
            ctx.fillRect(base.sx + c * cw + cw * 0.22, topP.sy + r * ch + ch * 0.22, cw * 0.56, ch * 0.5);
          }
        }
        break;
      }
      case 'palm': {
        // Coqueiro: tronco fino levemente inclinado + folhas em leque.
        this.box(ctx, cam, p.x, 0, p.z, p.width, p.height, p.depth, '#8a6a3f', '#a07f4d');
        const top = cam.project(p.x, p.height, p.z);
        if (!top) return;
        ctx.fillStyle = p.color;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + p.phase;
          ctx.beginPath();
          ctx.ellipse(
            top.sx + Math.cos(a) * 1.1 * top.scale, top.sy + Math.sin(a) * 0.45 * top.scale,
            Math.max(3, 1.0 * top.scale), Math.max(2, 0.3 * top.scale), a, 0, Math.PI * 2,
          );
          ctx.fill();
        }
        break;
      }
      case 'bleacher': {
        // Arquibancada: três degraus em profundidade.
        for (let i = 0; i < 3; i++) {
          this.box(
            ctx, cam, p.x, i * (p.height / 3), p.z + i * 1.1,
            p.width, p.height / 3, p.depth / 3,
            i % 2 ? p.color : this.shade(p.color, 1.15), this.shade(p.color, 1.3),
          );
        }
        break;
      }
      case 'tree': {
        this.box(ctx, cam, p.x, 0, p.z, 0.28, 2.0, 0.28, '#6b4a2f', '#7d5836');
        const c = cam.project(p.x, 3.0, p.z);
        if (!c) return;
        ctx.fillStyle = '#2f7d4f';
        ctx.beginPath();
        ctx.arc(c.sx, c.sy, Math.max(3, 1.35 * c.scale), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'pole': {
        this.box(ctx, cam, p.x, 0, p.z, 0.18, 5.5, 0.18, '#767d8a', '#8c93a0');
        const lamp = cam.project(p.x, 5.6, p.z);
        if (lamp) {
          ctx.fillStyle = '#ffe9a8';
          ctx.beginPath();
          ctx.arc(lamp.sx, lamp.sy, Math.max(2, 0.28 * lamp.scale), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'bench':
        this.box(ctx, cam, p.x, 0.25, p.z, 1.8, 0.5, 0.6, '#8a5a33', '#a06c40');
        break;
      case 'bin':
        this.box(ctx, cam, p.x, 0, p.z, p.width, p.height, p.depth, p.color, p.accent);
        break;
      case 'sign':
        this.box(ctx, cam, p.x, 0, p.z, 0.1, 2.2, 0.1, '#9aa1ad', '#b1b8c4');
        this.box(ctx, cam, p.x, 2.2, p.z, 0.9, 0.6, 0.06, '#2f6bd6', '#4a86ee');
        break;
      case 'hydrant':
        this.box(ctx, cam, p.x, 0, p.z, 0.32, 0.75, 0.32, '#d43b2f', '#f05244');
        break;
      case 'car': {
        this.box(ctx, cam, p.x, 0, p.z, p.width, 0.75, p.depth, p.color, this.shade(p.color, 1.15));
        this.box(ctx, cam, p.x, 0.75, p.z, p.width * 0.8, 0.6, p.depth * 0.55, p.accent, this.shade(p.color, 0.9));
        break;
      }
      case 'pedestrian': {
        const bob = Math.sin(t * 6 + p.phase * 10) * 0.06;
        this.box(ctx, cam, p.x, 0, p.z, 0.42, 0.85, 0.3, '#2b3242', '#394052');
        this.box(ctx, cam, p.x, 0.85 + bob, p.z, 0.55, 0.62, 0.34, p.color, this.shade(p.color, 1.2));
        const head = cam.project(p.x, 1.62 + bob, p.z);
        if (head) {
          ctx.fillStyle = '#e0ac69';
          ctx.beginPath();
          ctx.arc(head.sx, head.sy, Math.max(2, 0.13 * head.scale), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'cone': {
        const b = cam.project(p.x, 0, p.z);
        const tp = cam.project(p.x, p.height, p.z);
        if (!b || !tp) return;
        const half = 0.22 * b.scale;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(tp.sx, tp.sy);
        ctx.lineTo(b.sx + half, b.sy);
        ctx.lineTo(b.sx - half, b.sy);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'bike':
      case 'scooter': {
        this.box(ctx, cam, p.x, 0.1, p.z, p.width, p.height * 0.35, p.depth, p.accent, '#3a3f4b');
        this.box(ctx, cam, p.x, p.height * 0.45, p.z, p.width * 0.15, p.height * 0.55, p.depth, p.color, p.color);
        break;
      }
      case 'pothole': {
        const a = cam.project(p.x - p.width / 2, 0.005, p.z + p.depth / 2);
        const b = cam.project(p.x + p.width / 2, 0.005, p.z + p.depth / 2);
        const c = cam.project(p.x + p.width / 2, 0.005, p.z - p.depth / 2);
        const d = cam.project(p.x - p.width / 2, 0.005, p.z - p.depth / 2);
        if (a && b && c && d) this.quad(ctx, a, b, c, d, '#15171c');
        break;
      }
    }
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D, cam: Camera,
    player: PlayerController, ch: Character,
  ): void {
    const x = player.x;
    const z = player.distance;
    const swing = Math.sin(player.stride * Math.PI * 2);
    const kick = player.kick;

    // Sombra.
    const foot = cam.project(x, 0.01, z);
    if (foot) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(foot.sx, foot.sy, 0.42 * foot.scale, 0.16 * foot.scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const c = ch.colors;
    // Pernas (a de trás oscila; a da frente é a que chuta).
    const legLift = kick * 0.45;
    this.box(ctx, cam, x - 0.14, 0, z, 0.2, 0.82 - swing * 0.06, 0.2, '#2b2f3a', '#3a3f4b');
    this.box(ctx, cam, x + 0.14, legLift, z - 0.12, 0.2, 0.82 + swing * 0.06 - legLift * 0.5, 0.2, '#2b2f3a', '#3a3f4b');
    // Chuteiras.
    this.box(ctx, cam, x - 0.14, 0, z + 0.06, 0.24, 0.12, 0.34, '#f2f4f8', '#ffffff');
    this.box(ctx, cam, x + 0.14, legLift, z - 0.06, 0.24, 0.12, 0.34, '#f2f4f8', '#ffffff');
    // Shorts + camisa.
    this.box(ctx, cam, x, 0.8, z, 0.56, 0.3, 0.3, c.secondary, this.shade(c.secondary, 1.2));
    this.box(ctx, cam, x, 1.1, z, 0.62, 0.55, 0.34, c.primary, this.shade(c.primary, 1.25));
    // Braços.
    this.box(ctx, cam, x - 0.4, 1.05, z, 0.16, 0.5 + swing * 0.05, 0.16, c.skin, c.skin);
    this.box(ctx, cam, x + 0.4, 1.05, z, 0.16, 0.5 - swing * 0.05, 0.16, c.skin, c.skin);
    // Cabeça.
    const head = cam.project(x, 1.85, z);
    if (head) {
      ctx.fillStyle = c.skin;
      ctx.beginPath();
      ctx.arc(head.sx, head.sy, Math.max(3, 0.16 * head.scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.hair;
      ctx.beginPath();
      ctx.arc(head.sx, head.sy - 0.05 * head.scale, Math.max(3, 0.16 * head.scale), Math.PI, Math.PI * 2);
      ctx.fill();
    }
    // Número nas costas.
    const back = cam.project(x, 1.3, z - 0.18);
    if (back && back.scale > 40) {
      ctx.fillStyle = c.secondary;
      ctx.font = `bold ${Math.round(0.28 * back.scale)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ch.number), back.sx, back.sy);
    }
  }

  private drawBallShadow(
    ctx: CanvasRenderingContext2D, cam: Camera,
    ball: BallController, player: PlayerController,
  ): void {
    const s = ball.state;
    // s.z é relativo ao craque; a sombra vive nas coordenadas do mundo.
    const p = cam.project(s.x, 0.012, player.distance + s.z);
    if (!p) return;
    const tight = clamp(1 - s.y / 2.6, 0.25, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.34 * tight})`;
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy, ball.radius * 1.7 * p.scale * tight, ball.radius * 0.8 * p.scale * tight, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBall(
    ctx: CanvasRenderingContext2D, cam: Camera,
    ball: BallController, player: PlayerController,
  ): void {
    const s = ball.state;
    const skin = ball.equipped;
    const p = cam.project(s.x, s.y, player.distance + s.z);
    if (!p) return;
    const r = Math.max(4, skin.radius * p.scale);

    // Halo: a bola precisa ser trivial de acompanhar (§17).
    const halo = ctx.createRadialGradient(p.sx, p.sy, r * 0.8, p.sx, p.sy, r * 2.6);
    halo.addColorStop(0, skin.colors.glow);
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 2.6, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = skin.colors.base;
    ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2); ctx.fill();

    // O padrão gira junto com a bola: leitura instantânea da rotação.
    ctx.save();
    ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = skin.colors.accent;
    const spin = s.spin;
    switch (skin.pattern) {
      case 'classic':
        for (let i = 0; i < 4; i++) {
          const a = spin + (i * Math.PI) / 2;
          ctx.beginPath();
          ctx.arc(p.sx + Math.cos(a) * r * 0.52, p.sy + Math.sin(a) * r * 0.52, r * 0.26, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'stripes':
        for (let i = 0; i < 3; i++) {
          const off = (((spin * 0.35 + i / 3) % 1) * 2 - 1) * r;
          ctx.fillRect(p.sx + off - r * 0.16, p.sy - r, r * 0.32, r * 2);
        }
        break;
      case 'grid':
        ctx.lineWidth = Math.max(1, r * 0.1);
        ctx.strokeStyle = skin.colors.accent;
        for (let i = -1; i <= 1; i++) {
          const off = (((spin * 0.3 + (i + 1) / 3) % 1) * 2 - 1) * r;
          ctx.beginPath(); ctx.moveTo(p.sx + off, p.sy - r); ctx.lineTo(p.sx + off, p.sy + r); ctx.stroke();
        }
        break;
      case 'flame':
        for (let i = 0; i < 3; i++) {
          const a = spin * 1.4 + (i * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.ellipse(p.sx + Math.cos(a) * r * 0.4, p.sy + Math.sin(a) * r * 0.4, r * 0.42, r * 0.16, a, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'solid':
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(p.sx + Math.cos(spin) * r * 0.35, p.sy + Math.sin(spin) * r * 0.35, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(10,12,18,0.75)';
    ctx.lineWidth = Math.max(1.5, r * 0.13);
    ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2); ctx.stroke();
  }

  /**
   * Anel de timing em volta da bola: encolhe conforme ela desce até a altura
   * de contato. É o que faz o jogador entender a mecânica em <10s (§4).
   */
  private drawTimingRing(
    ctx: CanvasRenderingContext2D, cam: Camera,
    ball: BallController, player: PlayerController,
  ): void {
    const s = ball.state;
    const err = ball.timingErrorNow(); // negativo = ainda vai descer
    if (err > 0.16) return;            // já passou: sem anel
    const p = cam.project(s.x, s.y, player.distance + s.z);
    if (!p) return;
    const r = Math.max(4, ball.radius * p.scale);
    const t = clamp(-err / 0.45, 0, 1); // 1 = longe, 0 = agora
    const ringR = r * (1.5 + t * 3.4);
    const inWindow = Math.abs(err) <= CONFIG.timing.good;
    ctx.strokeStyle = inWindow
      ? (Math.abs(err) <= CONFIG.timing.perfect ? '#7dfcb0' : '#ffe066')
      : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(2, r * (inWindow ? 0.28 : 0.16));
    ctx.beginPath(); ctx.arc(p.sx, p.sy, ringR, 0, Math.PI * 2); ctx.stroke();
  }

  /** Clareia/escurece um hex sem alocar strings intermediárias caras. */
  private shade(hex: string, factor: number): string {
    const v = parseInt(hex.slice(1), 16);
    const r = clamp(Math.round(((v >> 16) & 255) * factor), 0, 255);
    const g = clamp(Math.round(((v >> 8) & 255) * factor), 0, 255);
    const b = clamp(Math.round((v & 255) * factor), 0, 255);
    return `rgb(${r},${g},${b})`;
  }
}
