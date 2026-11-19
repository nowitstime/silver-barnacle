import { COLS } from './constants';
import { randInt, shuffle, type Rng } from '../core/rng';

export interface RowSpec {
  bricks: { c: number; hp: number }[];
  orb: number | null;
}

/**
 * Generate the row that enters at the top. `level` starts at 1 and goes up by one every turn.
 * HP roughly tracks the level, and so does the ball count if you collect every orb.
 */
export function generateRow(rng: Rng, level: number): RowSpec {
  const maxBricks = Math.min(COLS - 1, 3 + Math.floor(level / 8));
  const minBricks = Math.min(maxBricks, 1 + Math.floor(level / 12));
  const n = randInt(rng, minBricks, maxBricks);
  const cols = shuffle(rng, Array.from({ length: COLS }, (_, i) => i));
  const bricks = cols.slice(0, n).map((c) => {
    const tough = level >= 5 && rng() < 0.2;
    return { c, hp: tough ? level * 2 : level };
  });
  const orb = n < COLS ? cols[n] : null;
  return { bricks, orb };
}
