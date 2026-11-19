export type BrickKind = 'normal';

export interface Brick {
  id: number;
  c: number;
  r: number;
  hp: number;
  maxHp: number;
  kind: BrickKind;
  /** Burn stacks (Kindling). Damage taken at the end of each turn. */
  burn: number;
}

export interface Orb {
  id: number;
  c: number;
  r: number;
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: 'flying' | 'returned';
  /** Order in the volley (0 = first ball). */
  index: number;
  /** Extra damage gained this turn (Ricochet Rush). */
  bonus: number;
  /** Bricks it may still smash through this turn (Pierce). */
  pierceLeft: number;
  /** Fireball (The Ceiling Is Lava). */
  fire: boolean;
  /** Temporary split copy (Mitosis). Removed when it lands. */
  copy: boolean;
}

export type BrickGrid = Map<number, Brick>;
export const gridKey = (c: number, r: number) => r * 64 + c;

export type Phase = 'aim' | 'fire' | 'run' | 'settle' | 'drop' | 'pick' | 'over';

export type DamageSource = 'ball' | 'chain' | 'splash' | 'burn';

export type SimEvent =
  | { type: 'launch'; x: number; y: number }
  | { type: 'wall'; ballId: number; x: number; y: number; ceiling: boolean }
  | {
      type: 'hit'; ballId: number; brick: Brick; x: number; y: number;
      damage: number; killed: boolean; crit: boolean; source: DamageSource;
    }
  | { type: 'zap'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'split'; x: number; y: number }
  | { type: 'ignite'; ballId: number; x: number; y: number }
  | { type: 'orb'; x: number; y: number }
  | { type: 'land'; x: number; first: boolean }
  | { type: 'recall' }
  | { type: 'drop' }
  | { type: 'shield' }
  | { type: 'pick'; kind: 'mid' | 'biome' }
  | { type: 'biome'; index: number }
  | { type: 'over' };
