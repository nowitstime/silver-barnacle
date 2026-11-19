/** Rows in each biome before its mini-boss. Early biomes are short, later ones longer. */
export const BIOME_ROWS = [12, 16, 20, 24, 28];
export const BIOME_COUNT = BIOME_ROWS.length;
/** Biome length once the main run is over (endless preview until the final boss lands in M7). */
const ENDLESS_ROWS = 28;

export const biomeLength = (i: number) => (i < BIOME_COUNT ? BIOME_ROWS[i] : ENDLESS_ROWS);

/** Each biome changes how the game plays. */
export type Gimmick = 'none' | 'dark' | 'current' | 'ice' | 'heat';
export const GIMMICKS: Gimmick[] = ['none', 'dark', 'current', 'ice', 'heat'];
export const gimmickFor = (biome: number): Gimmick => GIMMICKS[biome % GIMMICKS.length];

export const GIMMICK_TEXT: Record<Gimmick, string> = {
  none: '',
  dark: 'Darkness: you only see bricks near your balls',
  current: 'Current: a drift pushes balls sideways, and flips each turn',
  ice: 'Ice: balls speed up on every wall bounce. Frozen bricks shrug off the first hit',
  heat: 'Heat: bricks you don’t hit regrow HP. Bombs are common',
};
