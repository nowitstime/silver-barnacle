import type { Rng } from '../core/rng';

export type BrickKind =
  | 'normal' | 'armored' | 'bomb' | 'splitter' | 'steel'
  | 'popper' | 'anchor' | 'balloon' | 'sponge' | 'shrinker' | 'spawner' | 'sprinter'
  | 'boss';

/** Non-solid things on the board that balls pass through. */
export type ItemKind = 'orb' | 'laserH' | 'laserV' | 'portal';

export interface BrickInfo {
  name: string;
  desc: string;
  hazard: boolean;
  /** Depth (row level) from which it can appear. */
  from: number;
  /** Relative spawn weight among special bricks. */
  weight: number;
  /** HP multiplier relative to a normal brick. */
  hp: number;
}

export const BRICKS: Record<Exclude<BrickKind, 'normal' | 'boss'>, BrickInfo> = {
  armored: { name: 'Armored', desc: 'Takes 1 damage per hit. Crits do full damage.', hazard: false, from: 4, weight: 10, hp: 0.35 },
  bomb: { name: 'Bomb', desc: 'Explodes when broken, damaging everything around it.', hazard: false, from: 4, weight: 9, hp: 0.6 },
  splitter: { name: 'Splitter', desc: 'Breaks into two smaller bricks.', hazard: false, from: 8, weight: 8, hp: 1 },
  steel: { name: 'Steel', desc: 'Unbreakable. Blocks shots until it scrolls away. Never ends your run.', hazard: false, from: 14, weight: 4, hp: 1 },
  popper: { name: 'Popper', desc: 'Breaks in one hit, but destroys the ball that hits it for this turn.', hazard: true, from: 8, weight: 7, hp: 0 },
  anchor: { name: 'Anchor', desc: 'The ball that hits it gets heavy and sinks to the floor.', hazard: true, from: 13, weight: 6, hp: 0.6 },
  balloon: { name: 'Balloon', desc: 'The ball that hits it goes floaty and slow.', hazard: true, from: 13, weight: 6, hp: 0.6 },
  sponge: { name: 'Sponge', desc: 'Swallows the ball, holds it, and spits it out somewhere random.', hazard: true, from: 24, weight: 5, hp: 0.8 },
  shrinker: { name: 'Shrinker', desc: 'The ball that hits it deals half damage for the rest of the turn.', hazard: true, from: 24, weight: 5, hp: 0.6 },
  spawner: { name: 'Spawner', desc: 'Grows a new brick next to itself every turn.', hazard: true, from: 40, weight: 4, hp: 1 },
  sprinter: { name: 'Sprinter', desc: 'Moves down two rows per turn instead of one.', hazard: true, from: 40, weight: 4, hp: 0.5 },
};

export const isHazard = (k: BrickKind) => k !== 'normal' && k !== 'boss' && BRICKS[k].hazard;

export interface SpawnTuning {
  /** Multiplies hazard weights (cursed upgrades raise it). */
  hazardMult: number;
  /** Multiplies bomb weight (Forge). */
  bombMult: number;
}

/** Choose a kind for one brick of a new row. */
export function rollKind(rng: Rng, level: number, t: SpawnTuning): BrickKind {
  const special = Math.min(0.32, 0.06 + level * 0.004);
  if (rng() >= special) return 'normal';
  const pool = (Object.keys(BRICKS) as (keyof typeof BRICKS)[]).filter((k) => level >= BRICKS[k].from);
  if (!pool.length) return 'normal';
  const w = (k: keyof typeof BRICKS) =>
    BRICKS[k].weight * (BRICKS[k].hazard ? t.hazardMult : 1) * (k === 'bomb' ? t.bombMult : 1);
  const total = pool.reduce((s, k) => s + w(k), 0);
  let r = rng() * total;
  for (const k of pool) {
    r -= w(k);
    if (r < 0) return k;
  }
  return pool[pool.length - 1];
}
