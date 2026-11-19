import { endlessLap, themeOf } from '../sim/run';

/** Risograph ink sets. Each biome is a paper stock plus two inks that multiply where they overlap. */
export interface Inks {
  name: string;
  paper: string;
  /** Primary ink: bricks, HUD text. */
  i1: string;
  /** Secondary ink: balls, highlights, crits. */
  i2: string;
}

export const BIOME_INKS: Inks[] = [
  { name: 'Meadow', paper: '#f4efe4', i1: '#00a95c', i2: '#ff48b0' },
  { name: 'Caverns', paper: '#efeae2', i1: '#765ba7', i2: '#ffb511' },
  { name: 'The Deep', paper: '#eef0ea', i1: '#0078bf', i2: '#ff6c2f' },
  { name: 'Frostline', paper: '#f3f3ef', i1: '#00838a', i2: '#ff665e' },
  { name: 'Forge', paper: '#f3ebe1', i1: '#ff665e', i2: '#3255a4' },
  { name: 'The Core', paper: '#efe9df', i1: '#2a2622', i2: '#ff4c65' },
];

const ROMAN = ['', '', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

/** Ink set for any biome number (endless laps reuse the five main biomes). */
export const inksFor = (biome: number): Inks => BIOME_INKS[themeOf(biome)];

/** Display name, e.g. "Caverns", or "Caverns II" on the first endless lap. */
export function biomeName(biome: number): string {
  const lap = endlessLap(biome);
  return inksFor(biome).name + (lap ? ROMAN[Math.min(lap + 1, ROMAN.length - 1)] : '');
}
