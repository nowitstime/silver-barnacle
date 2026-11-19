/**
 * Small, fast, seedable PRNG (mulberry32). Call it for floats in [0, 1).
 * Its internal state is exposed so a run can be saved and resumed exactly.
 */
export interface Rng {
  (): number;
  state: number;
}

export function mulberry32(seed: number): Rng {
  const f = (() => {
    f.state = (f.state + 0x6d2b79f5) >>> 0;
    let t = f.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  f.state = seed >>> 0;
  return f;
}

/** Derive an independent stream from a base seed, so e.g. loot rolls never change the map. */
export function stream(seed: number, name: string): Rng {
  let h = seed >>> 0;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x9e3779b1) >>> 0;
  return mulberry32(h);
}

export const randInt = (rng: Rng | (() => number), min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

export function shuffle<T>(rng: Rng | (() => number), arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickWeighted<T>(rng: Rng | (() => number), items: T[], weight: (t: T) => number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rng() * total;
  for (const t of items) {
    r -= weight(t);
    if (r < 0) return t;
  }
  return items[items.length - 1];
}
