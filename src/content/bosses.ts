import { CORE, themeOf } from '../sim/run';

export type BossId = 'brood' | 'lantern' | 'leviathan' | 'glacier' | 'anvil' | 'core';

export interface BossDef {
  id: BossId;
  name: string;
  /** One line shown when it appears. */
  tell: string;
}

/** One mini-boss guards the end of each biome, in biome order. */
export const BOSSES: BossDef[] = [
  { id: 'brood', name: 'Brood Mother', tell: 'Lays new bricks around itself every turn' },
  { id: 'lantern', name: 'Lantern', tell: 'Only balls that bounced off a wall can hurt it' },
  { id: 'leviathan', name: 'Leviathan', tell: 'Drifts sideways every turn' },
  { id: 'glacier', name: 'Glacier', tell: 'A shield guards one side, and it turns each turn' },
  { id: 'anvil', name: 'Anvil', tell: 'Heals fully unless you deal a fifth of its HP in one turn' },
];

/** The final boss, alone in The Core. Three phases, switching at 2/3 and 1/3 HP. */
export const CORE_BOSS: BossDef = { id: 'core', name: 'The Core', tell: 'Break the shell, survive the swarm, then finish it before it reaches you' };

export const CORE_PHASES = [
  '',
  'Shell: two sides are shielded, and they turn every turn',
  'Swarm: it spits out new bricks every turn',
  'Meltdown: it takes extra damage, but it\u2019s coming down',
];

export const bossFor = (biome: number): BossDef => (biome === CORE ? CORE_BOSS : BOSSES[themeOf(biome) % BOSSES.length]);
