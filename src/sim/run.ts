/** Rows in each of the five main biomes before its mini-boss. Early biomes are short, later ones longer. */
export const BIOME_ROWS = [12, 16, 20, 24, 28];
export const BIOME_COUNT = BIOME_ROWS.length;
/** Biome index of The Core: no rows, just the final boss. */
export const CORE = 5;
/** First endless biome (after the Core is broken). */
export const ENDLESS_START = CORE + 1;
const ENDLESS_ROWS = 24;

/** Which of the 5 biome themes (or 5 = the Core) a biome number uses. Endless cycles the five. */
export const themeOf = (b: number): number => (b < CORE ? b : b === CORE ? CORE : (b - ENDLESS_START) % BIOME_COUNT);

/** 0 during the main run, 1 for the first endless lap, 2 for the second… */
export const endlessLap = (b: number): number => (b < ENDLESS_START ? 0 : Math.floor((b - ENDLESS_START) / BIOME_COUNT) + 1);

export const biomeLength = (b: number): number => (b < CORE ? BIOME_ROWS[b] : b === CORE ? 0 : ENDLESS_ROWS);

/** Endless laps stack: tougher bricks and more hazards every lap. */
export const endlessHp = (b: number): number => 1.35 ** endlessLap(b);
export const endlessHazards = (b: number): number => 1.3 ** endlessLap(b);

/** Each biome changes how the game plays. */
export type Gimmick = 'none' | 'dark' | 'current' | 'ice' | 'heat';
export const GIMMICKS: Gimmick[] = ['none', 'dark', 'current', 'ice', 'heat'];
export const gimmickFor = (b: number): Gimmick => (b === CORE ? 'none' : GIMMICKS[themeOf(b)]);

export const GIMMICK_TEXT: Record<Gimmick, string> = {
  none: '',
  dark: 'Darkness: you only see bricks near your balls',
  current: 'Current: a drift pushes balls sideways, and flips each turn',
  ice: 'Ice: balls speed up on every wall bounce. Frozen bricks shrug off the first hit',
  heat: 'Heat: bricks you don’t hit regrow HP. Bombs are common',
};
