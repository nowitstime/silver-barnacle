import type { Stats } from './upgrades';

export type ClassId = 'striker' | 'juggler' | 'ricochet' | 'bomber' | 'gambler' | 'bigball';

export interface ClassDef {
  id: ClassId;
  name: string;
  tagline: string;
  startBalls: number;
  perk: string;
  perkDesc: string;
  /** Starting stat changes and the signature perk. */
  apply: (s: Stats) => void;
}

export const CLASSES: ClassDef[] = [
  {
    id: 'striker', name: 'Striker', tagline: 'One heavy ball. Big crits.', startBalls: 1,
    perk: 'Executioner', perkDesc: '+40% damage and +10% crit chance. Crits instantly finish bricks left under 35% HP.',
    apply: (s) => { s.dmgMult += 0.4; s.critChance += 0.1; s.executioner = true; },
  },
  {
    id: 'juggler', name: 'Juggler', tagline: 'Lots of light balls.', startBalls: 4,
    perk: 'Encore', perkDesc: 'One random ball in every volley is golden and deals double damage. Orbs have a 40% chance to give two balls.',
    apply: (s) => { s.encore = true; s.luckyOrbs += 0.4; },
  },
  {
    id: 'ricochet', name: 'Ricochet', tagline: 'Every bounce counts.', startBalls: 2,
    perk: 'Billiards', perkDesc: 'After a ball hits a brick, each wall bounce gives it +1 damage for the turn. The laser shows one more bounce.',
    apply: (s) => { s.ricochet += 1; s.sight += 1; },
  },
  {
    id: 'bomber', name: 'Bomber', tagline: 'Weak hits, loud results.', startBalls: 2,
    perk: 'Payload', perkDesc: 'Every 15th hit in a volley sets off an explosion that grows with depth.',
    apply: (s) => { s.payload = true; },
  },
  {
    id: 'gambler', name: 'Gambler', tagline: 'More choices, more risk.', startBalls: 3,
    perk: 'Wildcard', perkDesc: 'Upgrade picks offer 4 cards, but one of them is always cursed.',
    apply: (s) => { s.wildcard = true; },
  },
  {
    id: 'bigball', name: 'Big Ball', tagline: 'One ball. It only gets heavier.', startBalls: 1,
    perk: 'Heavyweight', perkDesc: 'You only ever have one big ball. Every extra ball you would get (orbs, cards, bounties) adds +1 damage to it instead.',
    apply: (s) => { s.bigBall = true; },
  },
];

/** Big Ball's radius compared to a normal ball. */
export const BIG_BALL_SCALE = 1.6;

export const CLASS_BY_ID = new Map(CLASSES.map((c) => [c.id, c]));
