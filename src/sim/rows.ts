import { COLS } from './constants';
import { randInt, shuffle, type Rng } from '../core/rng';
import { BRICKS, rollKind, type BrickKind, type ItemKind, type SpawnTuning } from '../content/bricks';

export interface RowSpec {
  bricks: { c: number; hp: number; kind: BrickKind }[];
  items: { c: number; kind: ItemKind }[];
}

/** Hand-made row shapes, mixed in with random rows so layouts stay interesting. */
const PATTERNS: { minLevel: number; cols: (rng: Rng) => number[] }[] = [
  { minLevel: 8, cols: (rng) => { const gap = randInt(rng, 0, COLS - 1); return range().filter((c) => c !== gap); } },
  { minLevel: 4, cols: (rng) => { const odd = rng() < 0.5 ? 1 : 0; return range().filter((c) => c % 2 === odd); } },
  { minLevel: 4, cols: () => [0, 1, COLS - 2, COLS - 1] },
  { minLevel: 6, cols: () => [2, 3, 4] },
];

const range = () => Array.from({ length: COLS }, (_, i) => i);

export interface RowOptions extends SpawnTuning {
  biome: number;
  hpMult: number;
}

/**
 * Generate the row that enters at the top. `level` starts at 1 and goes up by one every turn.
 * Every row has one +ball orb if there's room; lasers and portals show up deeper down.
 */
/**
 * HP of a normal brick at a given depth. Grows a bit faster than linearly, and jumps with each biome,
 * so it keeps pace with your ball count and upgrades.
 */
export function brickHp(level: number, biome: number): number {
  return level * (1 + level / HP_CURVE) * (1 + BIOME_HP * biome);
}
export const HP_CURVE = 50;
export const BIOME_HP = 0.2;

/** Chance a new row carries a +ball orb. */
export const orbChance = (level: number) => (level <= 20 ? 1 : Math.max(0.45, 1 - (level - 20) / 140));

export function generateRow(rng: Rng, level: number, o: RowOptions = { biome: 0, hpMult: 1, hazardMult: 1, bombMult: 1 }): RowSpec {
  const baseHp = (tough: boolean) => brickHp(level, o.biome) * o.hpMult * (tough ? 2 : 1);

  let brickCols: number[];
  let free: number[];
  const patterns = PATTERNS.filter((p) => level >= p.minLevel);
  if (patterns.length && rng() < 0.18) {
    const p = patterns[Math.floor(rng() * patterns.length)];
    brickCols = p.cols(rng);
    free = shuffle(rng, range().filter((c) => !brickCols.includes(c)));
  } else {
    const maxBricks = Math.min(COLS - 1, 3 + Math.floor(level / 8));
    const minBricks = Math.min(maxBricks, 1 + Math.floor(level / 12));
    const n = randInt(rng, minBricks, maxBricks);
    const cols = shuffle(rng, range());
    brickCols = cols.slice(0, n);
    free = cols.slice(n);
  }
  const bricks = brickCols.map((c) => {
    const kind = rollKind(rng, level, o);
    const tough = kind === 'normal' && level >= 5 && rng() < 0.2;
    const mult = kind === 'normal' ? 1 : kind === 'popper' ? 0 : BRICKS[kind as keyof typeof BRICKS].hp;
    const hp = kind === 'popper' ? 1 : Math.max(1, Math.round(baseHp(tough) * mult));
    return { c, hp, kind };
  });
  const items: RowSpec['items'] = [];
  // An orb in every row early on; deeper down they thin out so ball counts can't run away.
  if (free.length && rng() < orbChance(level)) items.push({ c: free.shift()!, kind: 'orb' });
  if (free.length && level >= 6 && rng() < 0.07) items.push({ c: free.shift()!, kind: rng() < 0.5 ? 'laserH' : 'laserV' });
  if (free.length >= 2 && level >= 16 && rng() < 0.05) {
    items.push({ c: free.shift()!, kind: 'portal' }, { c: free.shift()!, kind: 'portal' });
  }
  return { bricks, items };
}
