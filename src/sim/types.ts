import type { BossId } from '../content/bosses';
import type { BrickKind, ItemKind } from '../content/bricks';

export type { BrickKind, ItemKind };

export interface BossState {
  id: BossId;
  /** Glacier: which side is shielded (0 top, 1 right, 2 bottom, 3 left). */
  side: number;
  /** Leviathan: drift direction. */
  dir: number;
  /** Damage taken this turn (Anvil). */
  turnDamage: number;
  /** The Core: current phase, 1–3. */
  phase: number;
}

export interface Brick {
  id: number;
  /** Top-left cell. */
  c: number;
  r: number;
  /** Size in cells (bosses are 2×2). */
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  kind: BrickKind;
  /** Burn stacks (Kindling). Damage taken at the end of each turn. */
  burn: number;
  /** Frostline: the first hit only cracks the ice. */
  frozen: boolean;
  /** Took any damage this turn (Forge heat). */
  hitThisTurn: boolean;
  boss?: BossState;
}

export interface Item {
  id: number;
  c: number;
  r: number;
  kind: ItemKind;
  /** Portal: id of the paired portal. */
  link?: number;
  /** Laser: fired this turn (removed at the end of the turn). */
  used?: boolean;
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: 'flying' | 'held' | 'returned';
  /** Order in the volley (0 = first ball). */
  index: number;
  /** Extra damage gained this turn (Ricochet Rush, Momentum). */
  bonus: number;
  /** Bricks it may still smash through this turn (Pierce). */
  pierceLeft: number;
  /** Fireball (The Ceiling Is Lava). */
  fire: boolean;
  /** Temporary split/echo copy. Removed when it lands. */
  copy: boolean;
  /** Golden ball (Juggler's Encore). */
  golden: boolean;
  wallBounces: number;
  /** Hazard effects for the rest of the turn. */
  heavy: boolean;
  slow: boolean;
  shrunk: boolean;
  popped: boolean;
  /** Sponge holding this ball, and seconds left. */
  heldBy: number;
  heldTime: number;
  /** Seconds before this ball can use a portal again. */
  portalCooldown: number;
  /** Lasers this ball already triggered this turn. */
  lasers: number[];
}

export type BrickGrid = Map<number, Brick>;
export const gridKey = (c: number, r: number) => r * 64 + c;

export type Phase = 'aim' | 'fire' | 'run' | 'settle' | 'drop' | 'pick' | 'won' | 'over';

export type DamageSource = 'ball' | 'chain' | 'splash' | 'burn' | 'bomb' | 'laser' | 'void';

export type SimEvent =
  | { type: 'launch'; x: number; y: number }
  | { type: 'wall'; ballId: number; x: number; y: number; ceiling: boolean }
  | {
      type: 'hit'; ballId: number; brick: Brick; x: number; y: number;
      damage: number; killed: boolean; crit: boolean; source: DamageSource;
    }
  | { type: 'immune'; brick: Brick; x: number; y: number; reason: string }
  | { type: 'zap'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'split'; x: number; y: number }
  | { type: 'ignite'; ballId: number; x: number; y: number }
  | { type: 'explode'; x: number; y: number; radius: number }
  | { type: 'laser'; kind: 'laserH' | 'laserV'; x: number; y: number; width: number }
  | { type: 'portal'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'hazard'; kind: BrickKind; ballId: number; x: number; y: number }
  | { type: 'spawn'; c: number; r: number }
  | { type: 'heal'; brick: Brick; amount: number }
  | { type: 'orb'; x: number; y: number; extra: boolean }
  | { type: 'bounty'; x: number; y: number }
  | { type: 'land'; x: number; first: boolean }
  | { type: 'recall' }
  | { type: 'drop' }
  | { type: 'shield'; kind: 'shield' | 'wind' }
  | { type: 'boss'; name: string; tell: string }
  | { type: 'bossDown'; name: string }
  | { type: 'bossPhase'; phase: number; text: string }
  | { type: 'win' }
  | { type: 'pick'; kind: 'mid' | 'biome' }
  | { type: 'biome'; index: number }
  | { type: 'over' };
