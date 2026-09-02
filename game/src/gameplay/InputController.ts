import type { TouchInput } from './BallController';

const SWIPE_THRESHOLD = 26;   // px
const SWIPE_MAX = 160;        // px — referência para power = 1
const GESTURE_TIMEOUT = 260;  // ms

/**
 * Traduz eventos de ponteiro/teclado em gestos de jogo (§4).
 * Decide o gesto no *fim* do toque, mas dispara imediatamente quando o dedo
 * ultrapassa o threshold — latência percebida ~0 num tap simples.
 */
export class InputController {
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  private active = false;
  private fired = false;
  private detach: Array<() => void> = [];

  /** Callback preenchido pelo GameManager. */
  onGesture: (input: TouchInput) => void = () => {};
  /** Habilita/desabilita sem remover listeners (menu vs partida). */
  enabled = false;

  attach(target: HTMLElement): void {
    const down = (e: PointerEvent) => {
      if (!this.enabled) return;
      this.startX = e.clientX; this.startY = e.clientY;
      this.startTime = performance.now();
      this.active = true; this.fired = false;
      target.setPointerCapture?.(e.pointerId);
    };

    const move = (e: PointerEvent) => {
      if (!this.enabled || !this.active || this.fired) return;
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      if (Math.hypot(dx, dy) < SWIPE_THRESHOLD) return;
      this.fire(dx, dy);
    };

    const up = () => {
      if (!this.enabled || !this.active) return;
      this.active = false;
      if (this.fired) return;
      if (performance.now() - this.startTime <= GESTURE_TIMEOUT) {
        this.onGesture({ gesture: 'tap', power: 0 });
      }
    };

    const key = (e: KeyboardEvent) => {
      if (!this.enabled) return;
      const map: Record<string, TouchInput | undefined> = {
        Space: { gesture: 'tap', power: 0 },
        ArrowUp: { gesture: 'up', power: 1 },
        KeyW: { gesture: 'up', power: 1 },
        ArrowLeft: { gesture: 'left', power: 1 },
        KeyA: { gesture: 'left', power: 1 },
        ArrowRight: { gesture: 'right', power: 1 },
        KeyD: { gesture: 'right', power: 1 },
      };
      const g = map[e.code];
      if (!g) return;
      e.preventDefault();
      if (e.repeat) return;
      this.onGesture(g);
    };

    target.addEventListener('pointerdown', down);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);

    this.detach = [
      () => target.removeEventListener('pointerdown', down),
      () => target.removeEventListener('pointermove', move),
      () => target.removeEventListener('pointerup', up),
      () => target.removeEventListener('pointercancel', up),
      () => window.removeEventListener('keydown', key),
    ];
  }

  private fire(dx: number, dy: number): void {
    this.fired = true;
    const power = Math.min(1, Math.hypot(dx, dy) / SWIPE_MAX);
    if (dy < 0 && Math.abs(dy) > Math.abs(dx)) this.onGesture({ gesture: 'up', power });
    else if (dx < 0) this.onGesture({ gesture: 'left', power });
    else this.onGesture({ gesture: 'right', power });
  }

  dispose(): void {
    for (const fn of this.detach) fn();
    this.detach = [];
  }
}
