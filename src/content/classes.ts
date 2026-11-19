import type { Stats } from './upgrades';

export type ClassId = 'striker' | 'juggler' | 'ricochet' | 'bomber' | 'gambler';

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
    perk: 'Executioner', perkDesc: 'Crits instantly finish bricks left under 25% HP.',
    apply: (s) => { s.damage += 1; s.critChance += 0.1; s.executioner = true; },
  },
  {
    id: 'juggler', name: 'Juggler', tagline: 'Lots of light balls.', startBalls: 3,
    perk: 'Encore', perkDesc: 'One random ball in every volley is golden and deals double damage.',
    apply: (s) => { s.encore = true; },
  },
  {
    id: 'ricochet', name: 'Ricochet', tagline: 'Every bounce counts.', startBalls: 2,
    perk: 'Billiards', perkDesc: 'Wall bounces give +1 damage for the turn, and the laser shows one more bounce.',
    apply: (s) => { s.ricochet += 1; s.sight += 1; },
  },
  {
    id: 'bomber', name: 'Bomber', tagline: 'Weak hits, loud results.', startBalls: 2,
    perk: 'Payload', perkDesc: 'Every 10th hit in a volley sets off an explosion.',
    apply: (s) => { s.payload = true; },
  },
  {
    id: 'gambler', name: 'Gambler', tagline: 'More choices, more risk.', startBalls: 2,
    perk: 'Wildcard', perkDesc: 'Upgrade picks offer 4 cards, but one of them is always cursed.',
    apply: (s) => { s.wildcard = true; },
  },
];

export const CLASS_BY_ID = new Map(CLASSES.map((c) => [c.id, c]));
