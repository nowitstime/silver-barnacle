/** Rows (turns) in each biome. Early biomes are short, later ones longer. */
export const BIOME_ROWS = [12, 16, 20, 24, 28];
export const BIOME_COUNT = BIOME_ROWS.length;
/** Length of each biome once the main run is over (endless preview until the final boss lands in M7). */
const ENDLESS_ROWS = 28;

export interface BiomeSpan {
  /** 0-based biome number. Keeps counting past the last biome; use `% BIOME_COUNT` for visuals. */
  index: number;
  /** Turn at which this biome starts. */
  start: number;
  length: number;
}

export function biomeAt(turn: number): BiomeSpan {
  let start = 0;
  for (let i = 0; ; i++) {
    const length = i < BIOME_COUNT ? BIOME_ROWS[i] : ENDLESS_ROWS;
    if (turn < start + length) return { index: i, start, length };
    start += length;
  }
}

export type PickKind = 'mid' | 'biome';

/**
 * Called after `turn` turns have been completed. Returns which upgrade pick (if any) happens now:
 * a small one halfway through each biome, and a big one when a biome is cleared.
 */
export function pickAfter(turn: number): PickKind | null {
  if (turn <= 0) return null;
  const prev = biomeAt(turn - 1);
  if (turn === prev.start + prev.length) return 'biome';
  if (turn === prev.start + Math.floor(prev.length / 2)) return 'mid';
  return null;
}
