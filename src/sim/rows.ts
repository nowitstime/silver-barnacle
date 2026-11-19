import { COLS } from './constants';
import { randInt, shuffle, type Rng } from '../core/rng';

export interface RowSpec {
  bricks: { c: number; hp: number }[];
  orb: number | null;
}

/** Hand-made row shapes, mixed in with random rows so layouts stay interesting. */
const PATTERNS: { name: string; minLevel: number; cols: (rng: Rng) => number[] }[] = [
  // A full wall with one gap.
  { name: 'wall', minLevel: 8, cols: (rng) => { const gap = randInt(rng, 0, COLS - 1); return range().filter((c) => c !== gap); } },
  // Every other column.
  { name: 'pillars', minLevel: 4, cols: (rng) => range().filter((c) => c % 2 === (rng() < 0.5 ? 0 : 1)) },
  // Both edges, open middle.
  { name: 'edges', minLevel: 4, cols: () => [0, 1, COLS - 2, COLS - 1] },
  // A solid block in the middle.
  { name: 'center', minLevel: 6, cols: () => [2, 3, 4] },
];

const range = () => Array.from({ length: COLS }, (_, i) => i);

/**
 * Generate the row that enters at the top. `level` starts at 1 and goes up by one every turn.
 * HP roughly tracks the level (and grows a little per biome); so does the ball count if you collect every orb.
 */
export function generateRow(rng: Rng, level: number, biome = 0): RowSpec {
  const hpScale = 1 + 0.12 * biome;
  const hpFor = (tough: boolean) => Math.max(1, Math.round(level * hpScale * (tough ? 2 : 1)));

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
  const bricks = brickCols.map((c) => ({ c, hp: hpFor(level >= 5 && rng() < 0.2) }));
  return { bricks, orb: free.length ? free[0] : null };
}
