export type BrickKind = 'normal';

export interface Brick {
  id: number;
  c: number;
  r: number;
  hp: number;
  maxHp: number;
  kind: BrickKind;
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
}

export type BrickGrid = Map<number, Brick>;
export const gridKey = (c: number, r: number) => r * 64 + c;

export type Phase = 'aim' | 'fire' | 'run' | 'settle' | 'drop' | 'over';

export type SimEvent =
  | { type: 'launch'; x: number; y: number }
  | { type: 'wall'; ballId: number; x: number; y: number }
  | { type: 'hit'; ballId: number; brick: Brick; x: number; y: number; damage: number; killed: boolean }
  | { type: 'orb'; x: number; y: number }
  | { type: 'land'; x: number; first: boolean }
  | { type: 'recall' }
  | { type: 'drop' }
  | { type: 'over' };
