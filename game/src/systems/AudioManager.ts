/**
 * Áudio 100% sintetizado via WebAudio — zero assets para baixar (§18).
 * Cada som é um envelope curto; nenhum nó fica vivo depois de tocar.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /** Precisa ser chamado a partir de um gesto do usuário (política dos browsers). */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain: number, sweepTo?: number): void {
    if (this.muted || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env); env.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  perfect(): void { this.blip(880, 0.16, 'triangle', 0.5, 1620); }
  good(): void { this.blip(520, 0.1, 'sine', 0.35); }
  bad(): void { this.blip(190, 0.13, 'sawtooth', 0.22, 130); }
  whiff(): void { this.blip(140, 0.07, 'sine', 0.12); }
  comboUp(): void {
    this.blip(660, 0.12, 'square', 0.3, 990);
    setTimeout(() => this.blip(990, 0.16, 'triangle', 0.3, 1320), 90);
  }
  gameOver(): void { this.blip(330, 0.5, 'sawtooth', 0.3, 70); }
  uiTap(): void { this.blip(600, 0.05, 'sine', 0.18); }

  setMuted(v: boolean): void { this.muted = v; }
}

/** §10 — vibração curta no combo, sem travar o gameplay. */
export const vibrate = (pattern: number | number[]): void => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch { /* ignorado */ }
  }
};
