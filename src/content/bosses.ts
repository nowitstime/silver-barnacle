export type BossId = 'brood' | 'lantern' | 'leviathan' | 'glacier' | 'anvil';

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

export const bossFor = (biome: number) => BOSSES[biome % BOSSES.length];
