import { CONFIG } from '../data/config';
import { damp } from '../core/math';

/**
 * §5 — câmera em 3ª pessoa: atrás e acima do craque, com follow suave.
 * Faz a projeção perspectiva manual usada pelo Renderer.
 */
export class Camera {
  x = 0;
  y: number = CONFIG.camera.height;
  z: number = -CONFIG.camera.distance;
  /** Deslocamento vertical do alvo (a bola puxa levemente a câmera). */
  private lookY: number = CONFIG.camera.lookHeight;
  shake = 0;
  private shakeOffset = 0;

  private width = 1;
  private height = 1;
  private focal = 1;

  reset(): void {
    this.x = 0; this.y = CONFIG.camera.height; this.z = -CONFIG.camera.distance;
    this.lookY = CONFIG.camera.lookHeight; this.shake = 0; this.shakeOffset = 0;
  }

  resize(width: number, height: number): void {
    this.width = width; this.height = height;
    this.focal = (height * 0.5) / Math.tan(CONFIG.camera.fov * 0.5);
  }

  update(dt: number, playerX: number, playerZ: number, ballY: number): void {
    const c = CONFIG.camera;
    this.x = damp(this.x, playerX * 0.62, c.followSpeed, dt);
    this.z = damp(this.z, playerZ - c.distance, c.followSpeed * 1.6, dt);
    this.y = damp(this.y, c.height + Math.max(0, ballY - 1.2) * 0.12, c.followSpeed, dt);
    this.lookY = damp(this.lookY, c.lookHeight + Math.max(0, ballY - 0.9) * 0.22, 4, dt);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 3.2);
      this.shakeOffset = Math.sin(performance.now() * 0.05) * this.shake * 9;
    } else this.shakeOffset = 0;
  }

  addShake(amount: number): void { this.shake = Math.min(1, this.shake + amount); }

  /**
   * Projeta um ponto do mundo na tela. Retorna null quando está atrás da câmera.
   * `scale` converte metros em pixels naquela profundidade.
   *
   * A câmera tem um pitch fixo (olha para `lookY` a ~10m de distância), o que
   * mantém o horizonte na parte superior e o asfalto sempre visível.
   */
  project(x: number, y: number, z: number): { sx: number; sy: number; scale: number } | null {
    const dz = z - this.z;
    if (dz < 0.35) return null;
    const scale = this.focal / dz;
    const pitchPx = ((this.y - this.lookY) / (CONFIG.camera.distance + 4)) * this.focal;
    return {
      sx: this.width * 0.5 + (x - this.x) * scale + this.shakeOffset,
      sy: this.height * 0.5 - (y - this.y) * scale - pitchPx,
      scale,
    };
  }

  get depth(): number { return this.z; }
  get viewWidth(): number { return this.width; }
  get viewHeight(): number { return this.height; }
}
