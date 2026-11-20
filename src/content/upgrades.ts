import { pickWeighted, type Rng } from '../core/rng';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'cursed';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** Everything upgrades and classes can change. The sim reads these; upgrades only ever write them. */
export interface Stats {
  damage: number;
  /** Multiplies all ball damage. */
  dmgMult: number;
  critChance: number;
  critMult: number;
  /** Bounces the aim laser shows (0 = a short stub). */
  sight: number;
  /** Bricks a ball may smash through per turn (only bricks it kills). */
  pierce: number;
  /** Extra damage a ball gains per wall bounce, this turn. */
  ricochet: number;
  /** Bricks zapped when a ball crits. */
  chain: number;
  /** Kindling stacks: a hit sets the brick burning for a share of that hit, every turn. */
  burn: number;
  /** Fraction of damage dealt to neighbours when a brick is killed. */
  splash: number;
  /** Damage multiplier for the first ball of each volley. */
  firstBlood: number;
  /** Max split copies per volley, per ball you own. 0 = off. */
  mitosis: number;
  /** Hitting the ceiling turns a ball into a fireball for the rest of the turn. */
  lava: boolean;
  /** Chance per stack that an orb gives an extra ball. */
  luckyOrbs: number;
  /** Bomb damage bonus (fraction). */
  fuse: number;
  /** Armored bricks take full damage. */
  armorPierce: boolean;
  /** Hazards don't affect your balls (Poppers still break). */
  hazardProof: boolean;
  /** Every Nth hit in a volley is a guaranteed crit. 0 = off. */
  overcharge: number;
  /** Hits kill bricks left below this fraction of max HP. */
  mercy: number;
  /** Burning bricks set their neighbours on fire when they die. */
  afterburn: boolean;
  /** Chance a wall bounce zaps a random brick. */
  static: number;
  /** Chance a kill drops an extra ball. */
  bounty: number;
  /** Damage a ball gains per kill this turn. */
  momentum: number;
  /** Line lasers blast this many extra lines on each side. */
  wideLaser: number;
  /** Every 5th volley fires twice. */
  echo: boolean;
  /** Chance a killed brick explodes. */
  detonate: number;
  /** Rows arrive only every other turn, with more HP. */
  slowDrop: boolean;
  /** Shields gained when a biome is cleared. */
  guardian: number;
  /** Crit chance per 10 balls owned. */
  critMass: number;
  /** Damage multiplier against bricks in the bottom 3 rows. */
  lastStand: number;
  /** ×3 damage, no shields ever. */
  glassCannon: boolean;
  /** Once per run, clear the bottom 3 rows instead of losing. */
  secondWind: boolean;
  /** Weakest bricks destroyed at the end of every turn. */
  singularity: number;
  /** Multiplies hazard spawn weight. */
  hazardMult: number;
  /** Multiplies new brick HP. */
  hpMult: number;
  /** Share of a brick's remaining HP every ball hit also deals (Acid). */
  acid: number;
  /** Crits light double fires; burning bricks take +25% from balls (Tinderbox). */
  tinder: boolean;
  /** Bricks killed by explosions also explode (Chain Reaction). */
  chainReaction: boolean;
  /** Extra jumps for every lightning zap (Conductor). */
  conduct: number;
  /** Multiplies how hot fires burn (Bellows). */
  fireMult: number;
  /** Chance any hit zaps a nearby brick (Copper Wire). */
  zapChance: number;
  // ---- ball physics ----
  /** Downward pull on your balls (Lead Core +, Featherweight −). */
  gravity: number;
  /** Speed gained per bounce (Rubber). */
  rubber: number;
  /** Pull toward the nearest brick (Magnetic). */
  magnet: number;
  /** Bricks a ball passes through per turn (Ghost). */
  ghost: number;
  /** Side walls are portals; each wrap adds damage (Wraparound). */
  wrap: boolean;
  // ---- class perks ----
  executioner: boolean;
  encore: boolean;
  payload: boolean;
  wildcard: boolean;
}

export const baseStats = (): Stats => ({
  damage: 1, dmgMult: 1, critChance: 0.05, critMult: 2, sight: 1,
  pierce: 0, ricochet: 0, chain: 0, burn: 0, splash: 0, firstBlood: 1, mitosis: 0, lava: false,
  luckyOrbs: 0, fuse: 0, armorPierce: false, hazardProof: false, overcharge: 0, mercy: 0,
  afterburn: false, static: 0, bounty: 0, momentum: 0, wideLaser: 0, echo: false, detonate: 0,
  slowDrop: false, guardian: 0, critMass: 0, lastStand: 1, glassCannon: false, secondWind: false,
  singularity: 0, hazardMult: 1, hpMult: 1, acid: 0, tinder: false, chainReaction: false, conduct: 0, fireMult: 1, zapChance: 0, gravity: 0, rubber: 0, magnet: 0, ghost: 0, wrap: false,
  executioner: false, encore: false, payload: false, wildcard: false,
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
const U = (u: UpgradeDef) => u;

export const UPGRADES: UpgradeDef[] = [
  // ---- common ----
  U({ id: 'heavy', name: 'Heavier Balls', rarity: 'common', max: 99, desc: () => '+1 damage on every hit.', apply: (s, n) => { s.damage += n; } }),
  U({ id: 'sharp', name: 'Sharp Eye', rarity: 'common', max: 6, desc: () => '+8% crit chance.', apply: (s, n) => { s.critChance += 0.08 * n; } }),
  U({ id: 'brutal', name: 'Brutal', rarity: 'common', max: 99, desc: () => 'Crits deal +50% more damage.', apply: (s, n) => { s.critMult += 0.5 * n; } }),
  U({ id: 'extra', name: 'Extra Balls', rarity: 'common', max: 99, desc: () => '+5 balls, right now.', onTake: (r) => r.addBalls(5) }),
  U({ id: 'sight', name: 'Long Sight', rarity: 'common', max: 3, desc: (n) => `The aim laser shows ${n + 2} bounces.`, apply: (s, n) => { s.sight += n; } }),
  U({ id: 'skin', name: 'Thick Skin', rarity: 'common', max: 99, desc: () => '+1 shield. When a brick reaches the bottom, a shield clears the bottom rows instead of ending the run.', onTake: (r) => r.addShields(1) }),
  U({ id: 'core', name: 'Dense Core', rarity: 'common', max: 99, desc: () => '+30% damage on everything your balls hit.', apply: (s, n) => { s.dmgMult += 0.3 * n; } }),
  U({ id: 'lucky', name: 'Lucky Orbs', rarity: 'common', max: 6, desc: () => '+30% chance that a +ball orb gives two balls.', apply: (s, n) => { s.luckyOrbs += 0.3 * n; } }),
  U({ id: 'fuse', name: 'Short Fuse', rarity: 'common', max: 5, desc: () => 'Bombs and explosions deal +75% damage, and bombs show up more often.', apply: (s, n) => { s.fuse += 0.75 * n; } }),
  U({ id: 'steeltoe', name: 'Can Opener', rarity: 'common', max: 1, desc: () => 'Armored bricks take full damage.', apply: (s) => { s.armorPierce = true; } }),
  U({ id: 'whetstone', name: 'Whetstone', rarity: 'common', max: 5, desc: () => '+4% crit chance and +25% crit damage.', apply: (s, n) => { s.critChance += 0.04 * n; s.critMult += 0.25 * n; } }),
  U({ id: 'bellows', name: 'Bellows', rarity: 'common', max: 4, desc: () => 'Fires burn 30% hotter. (Needs something that lights fires.)', apply: (s, n) => { s.fireMult += 0.3 * n; } }),
  U({ id: 'powder', name: 'Black Powder', rarity: 'common', max: 4, desc: () => 'Bricks you break have a 6% chance to explode for the damage of the hit.', apply: (s, n) => { s.detonate += 0.06 * n; } }),
  U({ id: 'copper', name: 'Copper Wire', rarity: 'common', max: 4, desc: () => 'Any hit has an 8% chance to zap a nearby brick for half its damage.', apply: (s, n) => { s.zapChance += 0.08 * n; } }),
  // ---- rare ----
  U({ id: 'pierce', name: 'Pierce', rarity: 'rare', max: 4, desc: (n) => `Each ball smashes straight through ${n === 0 ? 'the first brick' : `the first ${n + 1} bricks`} it kills each turn.`, apply: (s, n) => { s.pierce += n; } }),
  U({ id: 'ricochet', name: 'Ricochet Rush', rarity: 'rare', max: 3, desc: () => 'Once a ball has hit a brick, every wall bounce gives it +1 damage until the turn ends.', apply: (s, n) => { s.ricochet += n; } }),
  U({ id: 'chain', name: 'Chain Lightning', rarity: 'rare', max: 4, desc: () => 'Crits zap 3 more nearby bricks for 75% of the crit\u2019s damage.', apply: (s, n) => { s.chain += 3 * n; } }),
  U({ id: 'kindling', name: 'Kindling', rarity: 'rare', max: 5, desc: (n) => `Hits set bricks alight. At the end of each turn a burning brick takes another ${40 * (n + 1)}% of all the damage it took that turn. More hits, bigger fires; untouched fires keep burning.`, apply: (s, n) => { s.burn += n; } }),
  U({ id: 'splash', name: 'Splash', rarity: 'rare', max: 4, desc: (n) => `When a brick breaks, its neighbours take ${pct(0.75 * (n + 1))} of the killing hit.`, apply: (s, n) => { s.splash += 0.75 * n; } }),
  U({ id: 'first', name: 'First Blood', rarity: 'rare', max: 4, desc: (n) => `The first ball of every volley deals ${10 + 5 * n}× damage.`, apply: (s, n) => { s.firstBlood = 10 + 5 * (n - 1); } }),
  U({ id: 'proof', name: 'Hazard Suit', rarity: 'rare', max: 1, desc: () => 'Hazard bricks no longer affect your balls. Poppers still pop, but your ball survives.', apply: (s) => { s.hazardProof = true; } }),
  U({ id: 'overcharge', name: 'Overcharge', rarity: 'rare', max: 3, desc: (n) => `Every ${[5, 3, 2][Math.min(n, 2)]}${n >= 2 ? 'nd' : n === 1 ? 'rd' : 'th'} hit in a volley is a guaranteed crit.`, apply: (s, n) => { s.overcharge = [5, 3, 2][Math.min(n - 1, 2)]; } }),
  U({ id: 'mercy', name: 'Mercy Kill', rarity: 'rare', max: 3, desc: (n) => `Hits finish off bricks left under ${8 * (n + 1)}% HP.`, apply: (s, n) => { s.mercy = 0.08 * n; } }),
  U({ id: 'afterburn', name: 'Wildfire', rarity: 'rare', max: 1, desc: () => 'Burning bricks set their neighbours on fire when they break.', apply: (s) => { s.afterburn = true; } }),
  U({ id: 'static', name: 'Static', rarity: 'rare', max: 4, desc: () => 'Wall bounces have a 12% chance to zap a random brick for double the ball\u2019s current damage (bank-shot bonus included).', apply: (s, n) => { s.static += 0.12 * n; } }),
  U({ id: 'bounty', name: 'Bounty', rarity: 'rare', max: 4, desc: () => 'Each brick you break has a 4% chance to give you an extra ball.', apply: (s, n) => { s.bounty += 0.04 * n; } }),
  U({ id: 'momentum', name: 'Momentum', rarity: 'rare', max: 4, desc: () => 'Every brick a ball breaks gives it +2 damage until the turn ends.', apply: (s, n) => { s.momentum += 2 * n; } }),
  U({ id: 'wide', name: 'Wide Beam', rarity: 'rare', max: 2, desc: () => 'Line lasers blast one more line on each side.', apply: (s, n) => { s.wideLaser += n; } }),
  // ---- ball physics ----
  U({ id: 'rubber', name: 'Rubber', rarity: 'common', max: 3, desc: () => 'Balls speed up 5% on every bounce (up to 1.8×): more hits per turn.', apply: (s, n) => { s.rubber += 0.05 * n; } }),
  U({ id: 'lead', name: 'Lead Core', rarity: 'rare', max: 1, desc: () => 'Balls are heavy: they fall in an arc and hit 60% harder. The laser shows the arc.', apply: (s) => { s.gravity += 420; s.dmgMult += 0.6; } }),
  U({ id: 'feather', name: 'Featherweight', rarity: 'rare', max: 1, desc: () => 'Balls float upward a little, hugging the ceiling and staying in the air longer.', apply: (s) => { s.gravity -= 150; } }),
  U({ id: 'magnet', name: 'Magnetic', rarity: 'rare', max: 2, desc: () => 'Balls curve toward the nearest brick. The laser shows the curve.', apply: (s, n) => { s.magnet += 320 * n; } }),
  U({ id: 'ghost', name: 'Ghost', rarity: 'rare', max: 2, desc: (n) => `Each turn, every ball passes straight through the first ${n + 1 > 1 ? `${n + 1} bricks` : 'brick'} it touches, still damaging ${n + 1 > 1 ? 'them' : 'it'}.`, apply: (s, n) => { s.ghost += n; } }),
  U({ id: 'wrap', name: 'Wraparound', rarity: 'epic', max: 1, desc: () => 'The side walls become portals. Every time a ball wraps around, it deals +1 damage for the rest of the turn. (No more wall bounces.)', apply: (s) => { s.wrap = true; } }),
  // ---- epic ----
  U({ id: 'mitosis', name: 'Mitosis', rarity: 'epic', max: 3, desc: () => 'Crits split the ball in two. Copies vanish when they land.', apply: (s, n) => { s.mitosis += n; } }),
  U({ id: 'echo', name: 'Echo', rarity: 'epic', max: 1, desc: () => 'Every 3rd volley fires twice.', apply: (s) => { s.echo = true; } }),
  U({ id: 'detonate', name: 'Volatile', rarity: 'epic', max: 3, desc: () => 'Every brick you break has a 15% chance to explode for the damage of the hit that broke it.', apply: (s, n) => { s.detonate += 0.15 * n; } }),
  U({ id: 'dilation', name: 'Time Dilation', rarity: 'epic', max: 1, desc: () => 'New rows arrive only every other turn, but they have 80% more HP.', apply: (s) => { s.slowDrop = true; } }),
  U({ id: 'guardian', name: 'Guardian', rarity: 'epic', max: 3, desc: () => 'Gain a shield every time you clear a biome. +1 shield now.', apply: (s, n) => { s.guardian += n; }, onTake: (r) => r.addShields(1) }),
  U({ id: 'critmass', name: 'Critical Mass', rarity: 'epic', max: 3, desc: () => '+3% crit chance for every 10 balls you own.', apply: (s, n) => { s.critMass += 0.03 * n; } }),
  U({ id: 'laststand', name: 'Last Stand', rarity: 'epic', max: 2, desc: () => 'Double damage to bricks in the bottom 3 rows.', apply: (s, n) => { s.lastStand = 1 + n; } }),
  // ---- legendary ----
  U({ id: 'lava', name: 'The Ceiling Is Lava', rarity: 'legendary', max: 1, desc: () => 'A ball that touches the ceiling becomes a fireball: double damage, and it burns straight through everything it kills.', apply: (s) => { s.lava = true; } }),
  U({ id: 'glass', name: 'Glass Cannon', rarity: 'legendary', max: 1, desc: () => 'Triple damage. You lose all shields and can never gain more.', apply: (s) => { s.glassCannon = true; } }),
  U({ id: 'wind', name: 'Second Wind', rarity: 'legendary', max: 1, desc: () => 'Once per run, when you would lose, the bottom 3 rows are wiped instead.', apply: (s) => { s.secondWind = true; } }),
  U({ id: 'singularity', name: 'Singularity', rarity: 'legendary', max: 1, desc: () => 'Every time a new row drops, the toughest brick on the board collapses into nothing (not bosses or steel).', apply: (s) => { s.singularity = 1; } }),
  U({ id: 'acid', name: 'Acid', rarity: 'rare', max: 3, desc: (n) => `Every ball hit also eats ${(1.5 * (n + 1)).toFixed(1)}% of the brick\u2019s remaining HP. Best on fresh, tough bricks.`, apply: (s, n) => { s.acid += 0.015 * n; } }),
  U({ id: 'tinder', name: 'Tinderbox', rarity: 'rare', max: 1, desc: () => 'Crit damage counts double toward fires, and burning bricks take +25% damage from your balls.', apply: (s) => { s.tinder = true; } }),
  U({ id: 'chainreact', name: 'Chain Reaction', rarity: 'epic', max: 1, desc: () => 'Bricks killed by an explosion explode too.', apply: (s) => { s.chainReaction = true; } }),
  U({ id: 'conductor', name: 'Conductor', rarity: 'rare', max: 2, desc: () => 'Every lightning zap (Chain Lightning, Static) jumps to one more brick.', apply: (s, n) => { s.conduct += n; } }),
  // ---- cursed (Gambler only) ----
  U({ id: 'pact', name: 'Blood Pact', rarity: 'cursed', max: 3, desc: () => '+3 damage. Hazard bricks appear twice as often.', apply: (s, n) => { s.damage += 3 * n; s.hazardMult *= 2 ** n; } }),
  U({ id: 'overgrowth', name: 'Overgrowth', rarity: 'cursed', max: 3, desc: () => '+6 balls now. New bricks have 25% more HP.', apply: (s, n) => { s.hpMult *= 1.25 ** n; }, onTake: (r) => r.addBalls(6) }),
  U({ id: 'tunnel', name: 'Tunnel Vision', rarity: 'cursed', max: 1, desc: () => '+25% crit chance. The aim laser shrinks to a short stub.', apply: (s) => { s.critChance += 0.25; s.sight = -99; } }),
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export function computeStats(owned: Record<string, number>, classApply?: (s: Stats) => void): Stats {
  const s = baseStats();
  classApply?.(s);
  for (const [id, n] of Object.entries(owned)) {
    const u = UPGRADE_BY_ID.get(id);
    if (u?.apply && n > 0) u.apply(s, n);
  }
  if (s.glassCannon) s.dmgMult *= 3;
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
    cursed: 0,
  };
  return w[r];
}

/** Loot-brick genres: you see the genre on the brick, not the exact upgrade. */
export type LootCategory = 'power' | 'arsenal' | 'elemental' | 'guard' | 'wild';
export const LOOT_CATEGORIES: LootCategory[] = ['power', 'arsenal', 'elemental', 'guard', 'wild'];
export const LOOT_INFO: Record<LootCategory, { name: string; hint: string }> = {
  power: { name: 'Power', hint: 'Damage and crits' },
  arsenal: { name: 'Arsenal', hint: 'More balls and how they travel' },
  elemental: { name: 'Elemental', hint: 'Fire, lightning and explosions' },
  guard: { name: 'Guard', hint: 'Shields, safety and sight' },
  wild: { name: 'Wild', hint: 'Anything, usually rare' },
};

const CATEGORY: Record<string, Exclude<LootCategory, 'wild'>> = {
  heavy: 'power', sharp: 'power', brutal: 'power', core: 'power', first: 'power', overcharge: 'power',
  mercy: 'power', critmass: 'power', laststand: 'power', glass: 'power', steeltoe: 'power',
  extra: 'arsenal', lucky: 'arsenal', mitosis: 'arsenal', echo: 'arsenal', bounty: 'arsenal',
  pierce: 'arsenal', ricochet: 'arsenal', momentum: 'arsenal',
  chain: 'elemental', kindling: 'elemental', splash: 'elemental', afterburn: 'elemental', static: 'elemental',
  detonate: 'elemental', fuse: 'elemental', lava: 'elemental', wide: 'elemental', singularity: 'elemental',
  skin: 'guard', proof: 'guard', guardian: 'guard', wind: 'guard', dilation: 'guard', sight: 'guard',
  acid: 'power', tinder: 'elemental', chainreact: 'elemental', conductor: 'elemental',
  whetstone: 'power', bellows: 'elemental', powder: 'elemental', copper: 'elemental',
  rubber: 'arsenal', lead: 'arsenal', feather: 'arsenal', magnet: 'arsenal', ghost: 'arsenal', wrap: 'arsenal',
};

export const categoryOf = (id: string): Exclude<LootCategory, 'wild'> | undefined => CATEGORY[id];

const canTake = (u: UpgradeDef, owned: Record<string, number>) =>
  (owned[u.id] ?? 0) < u.max && !(u.id === 'skin' && owned.glass) && !(u.id === 'guardian' && owned.glass);

/** Offer different upgrades the player can still take. Wildcard adds a fourth, cursed card. */
export function rollOffer(
  rng: Rng, owned: Record<string, number>, biome: number, kind: 'mid' | 'biome', wildcard = false, locked: string[] = [],
): string[] {
  const offer: string[] = [];
  for (let i = 0; i < 3; i++) {
    const avail = UPGRADES.filter((u) => u.rarity !== 'cursed' && canTake(u, owned) && !offer.includes(u.id) && !locked.includes(u.id));
    if (!avail.length) break;
    const rarities = RARITIES.filter((r) => avail.some((u) => u.rarity === r) && rarityWeight(r, biome, kind) > 0);
    const pool = rarities.length ? rarities : RARITIES.filter((r) => avail.some((u) => u.rarity === r));
    const rarity = pickWeighted(rng, pool, (r) => Math.max(0.01, rarityWeight(r, biome, kind)));
    const choices = avail.filter((u) => u.rarity === rarity);
    offer.push(choices[Math.floor(rng() * choices.length)].id);
  }
  if (wildcard) {
    const cursed = UPGRADES.filter((u) => u.rarity === 'cursed' && canTake(u, owned));
    if (cursed.length) offer.splice(Math.floor(rng() * (offer.length + 1)), 0, cursed[Math.floor(rng() * cursed.length)].id);
  }
  return offer;
}

/** Roll the upgrade hidden in a loot brick of the given genre. Wild skews rare. */
export function rollLoot(rng: Rng, owned: Record<string, number>, biome: number, cat: LootCategory, locked: string[] = []): string | null {
  const avail = UPGRADES.filter((u) => u.rarity !== 'cursed' && canTake(u, owned) && !locked.includes(u.id) &&
    (cat === 'wild' || CATEGORY[u.id] === cat));
  if (!avail.length) return null;
  const kind = cat === 'wild' ? 'biome' : 'mid';
  const rarities = RARITIES.filter((r) => avail.some((u) => u.rarity === r) && rarityWeight(r, biome, kind) > 0);
  const pool = rarities.length ? rarities : RARITIES.filter((r) => avail.some((u) => u.rarity === r));
  const rarity = pickWeighted(rng, pool, (r) => Math.max(0.01, rarityWeight(r, biome, kind)));
  const choices = avail.filter((u) => u.rarity === rarity);
  return choices[Math.floor(rng() * choices.length)].id;
}

/**
 * Reroll an offer card by card, keeping each card's rarity (a legendary rerolls into another
 * legendary). Never repeats a card that was just on offer. If a rarity has nothing left,
 * that slot falls back to the next rarity down, then up.
 */
export function rerollSameTiers(rng: Rng, owned: Record<string, number>, current: string[], locked: string[] = []): string[] {
  const order: Rarity[] = ['cursed', 'legendary', 'epic', 'rare', 'common'];
  const next: string[] = [];
  for (const id of current) {
    const rarity = UPGRADE_BY_ID.get(id)?.rarity ?? 'rare';
    const usable = (u: UpgradeDef) => canTake(u, owned) && !locked.includes(u.id) && !current.includes(u.id) && !next.includes(u.id);
    // Same rarity first; then lower tiers; then higher ones (cursed only ever swaps for cursed).
    const i = order.indexOf(rarity);
    const tiers = rarity === 'cursed' ? ['cursed' as Rarity] : [...order.slice(i), ...order.slice(1, i).reverse()];
    let pick: UpgradeDef | undefined;
    for (const r of tiers) {
      const pool = UPGRADES.filter((u) => u.rarity === r && usable(u));
      if (pool.length) { pick = pool[Math.floor(rng() * pool.length)]; break; }
    }
    next.push(pick ? pick.id : id);
  }
  return next;
}

// ---- previews: the real numbers shown on cards ----

type Fmt = (v: number | boolean) => string;
const num: Fmt = (v) => String(Math.round(Number(v) * 100) / 100);
const per: Fmt = (v) => `${Math.round(Number(v) * 100)}%`;
const times: Fmt = (v) => `×${Math.round(Number(v) * 100) / 100}`;
const onoff: Fmt = (v) => (v ? 'on' : 'off');

/** How each stat is named and printed on a card. */
const STAT_LABELS: Partial<Record<keyof Stats, [string, Fmt]>> = {
  damage: ['Damage', num], dmgMult: ['Damage multiplier', times], critChance: ['Crit chance', per],
  critMult: ['Crit damage', times], sight: ['Laser bounces', (v) => (Number(v) < 0 ? 'stub' : num(v))],
  pierce: ['Pierce per turn', num], ricochet: ['Damage per bank bounce', num], chain: ['Bricks zapped per crit', num],
  burn: ['Burn per turn', num], splash: ['Splash', per], firstBlood: ['First ball damage', times], mitosis: ['Splits per ball', num],
  lava: ['Fireballs', onoff], luckyOrbs: ['Double-orb chance', per], fuse: ['Explosion damage', (v) => `+${per(v)}`],
  armorPierce: ['Full damage to armor', onoff], hazardProof: ['Hazard-proof', onoff],
  overcharge: ['Guaranteed crit', (v) => (Number(v) ? `every ${v}${({ 2: 'nd', 3: 'rd' } as Record<number, string>)[Number(v)] ?? 'th'} hit` : 'off')], mercy: ['Finish bricks under', per],
  afterburn: ['Fire spreads', onoff], static: ['Static zap chance', per], bounty: ['Bounty chance', per],
  momentum: ['Damage per kill', num], wideLaser: ['Extra laser lines', num], echo: ['Echo volleys', onoff],
  detonate: ['Explode chance', per], slowDrop: ['Rows every other turn', onoff], guardian: ['Shields per biome', num],
  critMass: ['Crit per 10 balls', per], lastStand: ['Bottom-row damage', times], glassCannon: ['Glass Cannon', onoff],
  secondWind: ['Second Wind', onoff], singularity: ['Bricks collapsed per turn', num],
  hazardMult: ['Hazard frequency', times], hpMult: ['New brick HP', times],
  gravity: ['Ball weight', (v) => (Number(v) > 0 ? 'heavy' : Number(v) < 0 ? 'floaty' : 'normal')], rubber: ['Speed per bounce', (v) => `+${per(v)}`],
  magnet: ['Magnet pull', num], ghost: ['Pass-throughs per turn', num], wrap: ['Wraparound walls', onoff],
  fireMult: ['Fire heat', times], zapChance: ['Zap chance per hit', per], acid: ['Acid per hit', per], tinder: ['Tinderbox', onoff], chainReaction: ['Chain Reaction', onoff], conduct: ['Extra zap jumps', num],
};

/** Stats shown as their own line even when unchanged. */
const HEADLINE: (keyof Stats)[] = ['critChance', 'critMult'];
/** On/off stats that just repeat a card's name (already in the build list). */
const NAMED_FLAGS = new Set<keyof Stats>(['glassCannon', 'secondWind', 'tinder', 'chainReaction', 'lava', 'echo', 'afterburn', 'armorPierce', 'hazardProof', 'slowDrop', 'wrap']);

/**
 * The run's current numbers for the pause screen: damage and crit first, then everything
 * your build has changed from the starting values. Crit chance includes Critical Mass.
 */
export function statSheet(s: Stats, balls: number): [string, string][] {
  const base = baseStats();
  const out: [string, string][] = [['Damage per hit', num(s.damage * s.dmgMult)]];
  for (const key of HEADLINE) {
    const v = key === 'critChance' ? s.critChance + s.critMass * Math.floor(balls / 10) : s[key];
    out.push([STAT_LABELS[key]![0], STAT_LABELS[key]![1](v)]);
  }
  for (const key of Object.keys(STAT_LABELS) as (keyof Stats)[]) {
    if (key === 'damage' || key === 'dmgMult' || HEADLINE.includes(key) || NAMED_FLAGS.has(key) || s[key] === base[key]) continue;
    const [label, fmt] = STAT_LABELS[key]!;
    out.push([label, fmt(s[key])]);
  }
  return out;
}

export interface RunSnapshot {
  balls: number;
  shields: number;
}

/**
 * What taking this upgrade would change, in real numbers: e.g. "Crit chance 15% → 23%".
 * `classApply` is the current class's perk, so the numbers match your run.
 */
export function previewUpgrade(id: string, owned: Record<string, number>, classApply: ((s: Stats) => void) | undefined, run: RunSnapshot): string[] {
  const def = UPGRADE_BY_ID.get(id);
  if (!def) return [];
  const before = computeStats(owned, classApply);
  const after = computeStats({ ...owned, [id]: (owned[id] ?? 0) + 1 }, classApply);
  const lines: string[] = [];
  for (const key of Object.keys(STAT_LABELS) as (keyof Stats)[]) {
    if (before[key] === after[key]) continue;
    const [label, fmt] = STAT_LABELS[key]!;
    lines.push(`${label} ${fmt(before[key])} → ${fmt(after[key])}`);
  }
  // Instant effects (balls, shields).
  let balls = 0, shields = 0;
  def.onTake?.({ addBalls: (n) => (balls += n), addShields: (n) => (shields += n) });
  if (after.glassCannon) shields = -run.shields;
  if (balls) lines.push(`Balls ${run.balls} → ${run.balls + balls}`);
  if (shields) lines.push(`Shields ${run.shields} → ${Math.max(0, run.shields + shields)}`);
  return lines;
}

// ---- themes: what synergises with what ----

export type Theme = 'crit' | 'fire' | 'explosion' | 'lightning' | 'bank' | 'multi' | 'damage' | 'defense' | 'general' | 'physics';

/** Each upgrade's themes. Generalists are good anywhere; the rest pay off together. */
export const THEMES: Record<string, Theme[]> = {
  heavy: ['damage'], core: ['general', 'damage'], brutal: ['crit', 'damage'], sharp: ['crit'], first: ['damage', 'crit'],
  laststand: ['damage'], glass: ['damage'], steeltoe: ['general'], mercy: ['general'], acid: ['general'],
  extra: ['general', 'multi'], lucky: ['general', 'multi'], bounty: ['multi'], echo: ['multi'], mitosis: ['multi', 'crit'],
  critmass: ['crit', 'multi'], overcharge: ['crit'],
  kindling: ['fire'], afterburn: ['fire'], tinder: ['fire', 'crit'], lava: ['fire', 'bank'],
  fuse: ['explosion'], detonate: ['explosion'], chainreact: ['explosion'], splash: ['explosion', 'damage'],
  chain: ['lightning', 'crit'], static: ['lightning', 'bank'], conductor: ['lightning', 'bank'],
  ricochet: ['bank', 'damage'], momentum: ['bank', 'damage'], pierce: ['bank'],
  skin: ['defense', 'general'], guardian: ['defense'], wind: ['defense'], proof: ['defense'], dilation: ['defense'],
  sight: ['general'], wide: ['general'], singularity: ['general'],
  whetstone: ['crit'], bellows: ['fire'], powder: ['explosion'], copper: ['lightning'],
  rubber: ['physics', 'bank'], lead: ['physics', 'damage'], feather: ['physics', 'fire'], magnet: ['physics', 'crit'],
  ghost: ['physics', 'fire'], wrap: ['physics'],
  pact: ['damage'], overgrowth: ['multi'], tunnel: ['crit'],
};

/** How well a card fits what you already own: shared themes count, generalists always count a little. */
export function synergyScore(id: string, owned: Record<string, number>): number {
  const mine = Object.entries(owned).filter(([, n]) => n > 0).flatMap(([k, n]) => (THEMES[k] ?? []).map((t) => [t, n] as const));
  let score = 0;
  for (const t of THEMES[id] ?? []) {
    if (t === 'general') { score += 0.6; continue; }
    // Defense keeps you alive but doesn't combine into a damage engine.
    const weight = t === 'defense' ? 0.25 : 1;
    for (const [mt, n] of mine) if (mt === t) score += n * weight;
  }
  return score;
}
