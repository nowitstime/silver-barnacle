import { pickWeighted, type Rng } from '../core/rng';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** Everything upgrades can change. The sim reads these; upgrades only ever write them. */
export interface Stats {
  damage: number;
  critChance: number;
  critMult: number;
  /** Bounces the aim laser shows. */
  sight: number;
  /** Bricks a ball may smash through per turn (only bricks it kills). */
  pierce: number;
  /** Extra damage a ball gains per wall bounce, this turn. */
  ricochet: number;
  /** Bricks zapped when a ball crits. */
  chain: number;
  /** Burn stacks applied on hit; burning bricks take damage every turn. */
  burn: number;
  /** Fraction of damage dealt to neighbours when a brick is killed. */
  splash: number;
  /** Damage multiplier for the first ball of each volley. */
  firstBlood: number;
  /** Max split copies per volley, per ball you own. 0 = off. */
  mitosis: number;
  /** Hitting the ceiling turns a ball into a fireball for the rest of the turn. */
  lava: boolean;
}

export const baseStats = (): Stats => ({
  damage: 1,
  critChance: 0.05,
  critMult: 2,
  sight: 1,
  pierce: 0,
  ricochet: 0,
  chain: 0,
  burn: 0,
  splash: 0,
  firstBlood: 1,
  mitosis: 0,
  lava: false,
});

/** What an upgrade may do to the run the moment it's taken. */
export interface RunEffects {
  addBalls(n: number): void;
  addShields(n: number): void;
}

export interface UpgradeDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** Max times it can be taken. */
  max: number;
  /** Description for the next stack (stacks = how many you already own). */
  desc: (stacks: number) => string;
  apply?: (s: Stats, stacks: number) => void;
  onTake?: (run: RunEffects) => void;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const UPGRADES: UpgradeDef[] = [
  // ---- common ----
  {
    id: 'heavy', name: 'Heavier Balls', rarity: 'common', max: 99,
    desc: () => '+1 damage on every hit.',
    apply: (s, n) => { s.damage += n; },
  },
  {
    id: 'sharp', name: 'Sharp Eye', rarity: 'common', max: 6,
    desc: () => '+8% crit chance.',
    apply: (s, n) => { s.critChance += 0.08 * n; },
  },
  {
    id: 'brutal', name: 'Brutal', rarity: 'common', max: 99,
    desc: () => 'Crits deal +50% more damage.',
    apply: (s, n) => { s.critMult += 0.5 * n; },
  },
  {
    id: 'extra', name: 'Extra Balls', rarity: 'common', max: 99,
    desc: () => '+3 balls, right now.',
    onTake: (r) => r.addBalls(3),
  },
  {
    id: 'sight', name: 'Long Sight', rarity: 'common', max: 3,
    desc: (n) => `The aim laser shows ${n + 2} bounces.`,
    apply: (s, n) => { s.sight += n; },
  },
  {
    id: 'skin', name: 'Thick Skin', rarity: 'common', max: 99,
    desc: () => '+1 shield. When a brick reaches the bottom, a shield clears the bottom rows instead of ending the run.',
    onTake: (r) => r.addShields(1),
  },
  // ---- rare ----
  {
    id: 'pierce', name: 'Pierce', rarity: 'rare', max: 5,
    desc: (n) => `Each ball smashes straight through ${n + 1 === 1 ? 'the first brick' : `the first ${n + 1} bricks`} it kills each turn.`,
    apply: (s, n) => { s.pierce += n; },
  },
  {
    id: 'ricochet', name: 'Ricochet Rush', rarity: 'rare', max: 5,
    desc: () => 'Every wall bounce gives that ball +1 damage until the turn ends.',
    apply: (s, n) => { s.ricochet += n; },
  },
  {
    id: 'chain', name: 'Chain Lightning', rarity: 'rare', max: 4,
    desc: () => 'Crits zap 2 more nearby bricks.',
    apply: (s, n) => { s.chain += 2 * n; },
  },
  {
    id: 'kindling', name: 'Kindling', rarity: 'rare', max: 5,
    desc: () => 'Hits set bricks on fire. Burning bricks take damage at the end of every turn.',
    apply: (s, n) => { s.burn += n; },
  },
  {
    id: 'splash', name: 'Splash', rarity: 'rare', max: 4,
    desc: (n) => `When a brick breaks, its neighbours take ${pct(0.5 * (n + 1))} of your damage.`,
    apply: (s, n) => { s.splash += 0.5 * n; },
  },
  {
    id: 'first', name: 'First Blood', rarity: 'rare', max: 4,
    desc: (n) => `The first ball of every volley deals ${n === 0 ? 5 : 5 + 3 * n}× damage.`,
    apply: (s, n) => { s.firstBlood = 5 + 3 * (n - 1); },
  },
  // ---- epic ----
  {
    id: 'mitosis', name: 'Mitosis', rarity: 'epic', max: 3,
    desc: () => 'Crits split the ball in two. Copies vanish when they land.',
    apply: (s, n) => { s.mitosis += n; },
  },
  // ---- legendary ----
  {
    id: 'lava', name: 'The Ceiling Is Lava', rarity: 'legendary', max: 1,
    desc: () => 'A ball that touches the ceiling becomes a fireball: double damage, and it burns straight through everything it kills.',
    apply: (s) => { s.lava = true; },
  },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export function computeStats(owned: Record<string, number>): Stats {
  const s = baseStats();
  for (const [id, n] of Object.entries(owned)) {
    const u = UPGRADE_BY_ID.get(id);
    if (u?.apply && n > 0) u.apply(s, n);
  }
  return s;
}

/** Rarity odds improve with depth. Biome picks never offer commons. */
function rarityWeight(r: Rarity, biome: number, kind: 'mid' | 'biome'): number {
  const b = Math.min(biome, 4);
  const w: Record<Rarity, number> = {
    common: kind === 'biome' ? 0 : 62 - b * 6,
    rare: 30 + b * 2,
    epic: 7 + b * 3,
    legendary: 1 + b * 1.5,
  };
  return w[r];
}

/** Offer `count` different upgrades the player can still take. */
export function rollOffer(
  rng: Rng, owned: Record<string, number>, biome: number, kind: 'mid' | 'biome', count = 3,
): string[] {
  const offer: string[] = [];
  for (let i = 0; i < count; i++) {
    const avail = UPGRADES.filter((u) => (owned[u.id] ?? 0) < u.max && !offer.includes(u.id));
    if (!avail.length) break;
    const rarities = RARITIES.filter((r) => avail.some((u) => u.rarity === r) && rarityWeight(r, biome, kind) > 0);
    const pool = rarities.length ? rarities : RARITIES.filter((r) => avail.some((u) => u.rarity === r));
    const rarity = pickWeighted(rng, pool, (r) => Math.max(0.01, rarityWeight(r, biome, kind)));
    const choices = avail.filter((u) => u.rarity === rarity);
    offer.push(choices[Math.floor(rng() * choices.length)].id);
  }
  return offer;
}
