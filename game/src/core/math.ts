export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Lerp independente de framerate. `speed` = fração recuperada por segundo. */
export const damp = (a: number, b: number, speed: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-speed * dt));

export const sign = (v: number): number => (v < 0 ? -1 : v > 0 ? 1 : 0);

/** PRNG determinístico (mulberry32). Usado no LevelGenerator para cenário reproduzível. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randRange = (rng: () => number, min: number, max: number): number =>
  min + rng() * (max - min);

export const pick = <T,>(rng: () => number, arr: readonly T[]): T =>
  arr[Math.floor(rng() * arr.length) % arr.length];
