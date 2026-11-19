import type { ClassId } from './classes';

/** Things that happened in the run so far (or the run that just ended). */
export interface RunFacts {
  classId: ClassId;
  depth: number;
  bossesBeaten: string[];
  won: boolean;
  bestCombo: number;
  maxBalls: number;
  upgrades: Record<string, number>;
}

/** Lifetime totals. */
export interface LifetimeStats {
  runs: number;
  wins: number;
  kills: number;
  damage: number;
  bosses: number;
  deepest: number;
  bestCombo: number;
  maxBalls: number;
  crits: number;
  pops: number;
  /** Seconds of play. */
  time: number;
  classWins: ClassId[];
}

export type Reward = { kind: 'class'; id: ClassId } | { kind: 'upgrade'; id: string } | { kind: 'skin'; id: string };

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  check: (life: LifetimeStats, run: RunFacts | null) => boolean;
  reward?: Reward;
}

const beat = (name: string) => (_: LifetimeStats, r: RunFacts | null) => !!r?.bossesBeaten.includes(name);

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'boss1', name: 'The Bigger They Are', desc: 'Beat a mini-boss.', check: (l) => l.bosses >= 1, reward: { kind: 'class', id: 'bomber' } },
  { id: 'lantern', name: 'Lights Out', desc: 'Beat the Lantern.', check: beat('Lantern'), reward: { kind: 'skin', id: 'hollow' } },
  { id: 'leviathan', name: 'Sea Legs', desc: 'Beat the Leviathan.', check: beat('Leviathan'), reward: { kind: 'upgrade', id: 'lava' } },
  { id: 'glacier', name: 'Thaw', desc: 'Beat the Glacier.', check: beat('Glacier'), reward: { kind: 'upgrade', id: 'glass' } },
  { id: 'anvil', name: 'Hammer Time', desc: 'Beat the Anvil.', check: beat('Anvil'), reward: { kind: 'skin', id: 'star' } },
  { id: 'win', name: 'Core Breaker', desc: 'Break The Core and win a run.', check: (l) => l.wins >= 1, reward: { kind: 'upgrade', id: 'singularity' } },
  { id: 'depth50', name: 'Deep Diver', desc: 'Reach depth 50.', check: (l) => l.deepest >= 50, reward: { kind: 'class', id: 'gambler' } },
  { id: 'depth150', name: 'Abyss', desc: 'Reach depth 150.', check: (l) => l.deepest >= 150, reward: { kind: 'skin', id: 'square' } },
  { id: 'combo10', name: 'Chain Reaction', desc: 'Break 10 bricks in one volley.', check: (l) => l.bestCombo >= 10, reward: { kind: 'upgrade', id: 'echo' } },
  { id: 'combo30', name: 'Avalanche', desc: 'Break 30 bricks in one volley.', check: (l) => l.bestCombo >= 30, reward: { kind: 'skin', id: 'comet' } },
  { id: 'balls100', name: 'Ball Pit', desc: 'Have 100 balls at once.', check: (l) => l.maxBalls >= 100, reward: { kind: 'upgrade', id: 'mitosis' } },
  { id: 'kills1000', name: 'Demolition', desc: 'Break 1,000 bricks in total.', check: (l) => l.kills >= 1000, reward: { kind: 'skin', id: 'spark' } },
  { id: 'damage1m', name: 'Seven Figures', desc: 'Deal 1,000,000 damage in total.', check: (l) => l.damage >= 1_000_000 },
  { id: 'pops50', name: 'Pop Culture', desc: 'Lose 50 balls to Poppers in total.', check: (l) => l.pops >= 50, reward: { kind: 'upgrade', id: 'proof' } },
  { id: 'runs10', name: 'Regular', desc: 'Finish 10 runs.', check: (l) => l.runs >= 10, reward: { kind: 'upgrade', id: 'wind' } },
  { id: 'glasswin', name: 'Handle With Care', desc: 'Win a run with Glass Cannon.', check: (_, r) => !!r?.won && !!r.upgrades.glass },
  { id: 'allclasses', name: 'Renaissance', desc: 'Win a run with every class.', check: (l) => l.classWins.length >= 5 },
  { id: 'crits1000', name: 'Critical Thinker', desc: 'Land 1,000 crits in total.', check: (l) => l.crits >= 1000, reward: { kind: 'skin', id: 'bolt' } },
  { id: 'wins3', name: 'Hat Trick', desc: 'Win 3 runs.', check: (l) => l.wins >= 3, reward: { kind: 'skin', id: 'heart' } },
  { id: 'time2h', name: 'Night Shift', desc: 'Play for 2 hours in total.', check: (l) => l.time >= 7200, reward: { kind: 'skin', id: 'moon' } },
  { id: 'depth220', name: 'Bedrock', desc: 'Reach depth 220.', check: (l) => l.deepest >= 220, reward: { kind: 'skin', id: 'gem' } },
];

/** Content that starts locked, and the achievement that unlocks it. */
export function unlockSource(kind: Reward['kind'], id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.reward?.kind === kind && a.reward.id === id);
}

export const LOCKED_CLASSES = ACHIEVEMENTS.filter((a) => a.reward?.kind === 'class').map((a) => a.reward!.id as ClassId);
export const LOCKED_UPGRADES = ACHIEVEMENTS.filter((a) => a.reward?.kind === 'upgrade').map((a) => a.reward!.id);

export interface SkinDef { id: string; name: string }
export const SKINS: SkinDef[] = [
  { id: 'ink', name: 'Ink' },
  { id: 'hollow', name: 'Hollow' },
  { id: 'star', name: 'Star' },
  { id: 'square', name: 'Block' },
  { id: 'comet', name: 'Comet' },
  { id: 'spark', name: 'Spark' },
  { id: 'bolt', name: 'Bolt' },
  { id: 'heart', name: 'Heart' },
  { id: 'moon', name: 'Moon' },
  { id: 'gem', name: 'Gem' },
];
