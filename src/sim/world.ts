import { stream, type Rng } from '../core/rng';
import {
  BALL_R, BALL_SPEED, DROP_TIME, FLOOR, LAUNCH_INTERVAL, MIN_ANGLE, ROWS, SETTLE_TIME, W,
  cellCenterX, cellCenterY,
} from './constants';
import { stepBody } from './physics';
import { generateRow } from './rows';
import { gridKey, type Ball, type Brick, type BrickGrid, type Orb, type Phase, type SimEvent } from './types';

const ORB_R = 8;

/**
 * The whole game state and rules. No DOM, no rendering, no wall-clock time:
 * call `tick(STEP)` at a fixed rate and read the state.
 */
export class Sim {
  readonly seed: number;
  private rowRng: Rng;
  private nextId = 1;

  phase: Phase = 'aim';
  /** Seconds spent in the current phase. */
  phaseTime = 0;
  /** Seconds since the current volley was fired. */
  turnTime = 0;
  /** Turns completed. The row level is turn + 1. */
  turn = 0;

  bricks: Brick[] = [];
  grid: BrickGrid = new Map();
  orbs: Orb[] = [];
  balls: Ball[] = [];

  ballCount = 1;
  /** Balls picked up this turn; they join at the end of the turn. */
  pendingBalls = 0;
  launchX = W / 2;
  /** Where the first ball landed this turn (next launch point). */
  landX: number | null = null;
  aimAngle = Math.PI / 2;
  private fired = 0;

  events: SimEvent[] = [];

  constructor(seed: number) {
    this.seed = seed;
    this.rowRng = stream(seed, 'rows');
    this.spawnRow();
  }

  get level(): number {
    return this.turn + 1;
  }

  /** The row index of the lowest brick, or -1 when the board is empty. */
  get lowestRow(): number {
    let m = -1;
    for (const b of this.bricks) m = Math.max(m, b.r);
    return m;
  }

  get ballsInFlight(): number {
    return this.balls.filter((b) => b.state === 'flying').length + (this.ballCount - this.fired);
  }

  /** Fire a volley. Returns false if it's not the aim phase. */
  fire(angle: number): boolean {
    if (this.phase !== 'aim') return false;
    this.aimAngle = clampAngle(angle);
    this.phase = 'fire';
    this.phaseTime = 0;
    this.turnTime = 0;
    this.fired = 0;
    this.balls = [];
    this.landX = null;
    return true;
  }

  /** Bring every ball home immediately. */
  recall(): void {
    if (this.phase !== 'fire' && this.phase !== 'run') return;
    this.fired = this.ballCount;
    for (const b of this.balls) {
      if (b.state !== 'flying') continue;
      b.state = 'returned';
      b.y = FLOOR - BALL_R;
      if (this.landX === null) this.landX = clampX(b.x);
    }
    if (this.landX === null) this.landX = this.launchX;
    this.phase = 'run';
    this.events.push({ type: 'recall' });
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  tick(h: number): void {
    this.phaseTime += h;
    switch (this.phase) {
      case 'aim':
        break;
      case 'fire':
      case 'run':
        this.turnTime += h;
        if (this.phase === 'fire') this.launchDue();
        this.stepBalls(h);
        this.slideReturned(h);
        if (this.phase === 'run' && this.balls.every((b) => b.state === 'returned')) {
          this.setPhase('settle');
        }
        break;
      case 'settle':
        this.slideReturned(h);
        if (this.phaseTime >= SETTLE_TIME) this.descend();
        break;
      case 'drop':
        if (this.phaseTime >= DROP_TIME) {
          if (this.bricks.some((b) => b.r >= ROWS)) {
            this.setPhase('over');
            this.events.push({ type: 'over' });
          } else {
            this.setPhase('aim');
          }
        }
        break;
      case 'over':
        break;
    }
  }

  // ---- internals ----

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseTime = 0;
  }

  private launchDue(): void {
    while (this.fired < this.ballCount && this.phaseTime >= this.fired * LAUNCH_INTERVAL) {
      const a = this.aimAngle;
      const y = FLOOR - BALL_R;
      this.balls.push({
        id: this.nextId++, x: this.launchX, y,
        vx: Math.cos(a) * BALL_SPEED, vy: -Math.sin(a) * BALL_SPEED, state: 'flying',
      });
      this.fired++;
      this.events.push({ type: 'launch', x: this.launchX, y });
    }
    if (this.fired >= this.ballCount) this.phase = 'run';
  }

  private stepBalls(h: number): void {
    for (const ball of this.balls) {
      if (ball.state !== 'flying') continue;
      const res = stepBody(ball, h, this.grid);
      if (res?.kind === 'floor') {
        ball.state = 'returned';
        const first = this.landX === null;
        if (first) this.landX = clampX(ball.x);
        this.events.push({ type: 'land', x: ball.x, first });
        continue;
      }
      if (res?.kind === 'wall') this.events.push({ type: 'wall', x: res.x, y: res.y });
      if (res?.kind === 'brick') this.damage(res.brick, 1, res.x, res.y);
      this.collectOrbs(ball);
    }
  }

  private damage(brick: Brick, amount: number, x: number, y: number): void {
    brick.hp -= amount;
    const killed = brick.hp <= 0;
    if (killed) this.removeBrick(brick);
    this.events.push({ type: 'hit', brick, x, y, damage: amount, killed });
  }

  private removeBrick(brick: Brick): void {
    const i = this.bricks.indexOf(brick);
    if (i >= 0) this.bricks.splice(i, 1);
    this.grid.delete(gridKey(brick.c, brick.r));
  }

  private collectOrbs(ball: Ball): void {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      const ox = cellCenterX(o.c), oy = cellCenterY(o.r);
      if ((ball.x - ox) ** 2 + (ball.y - oy) ** 2 < (BALL_R + ORB_R) ** 2) {
        this.orbs.splice(i, 1);
        this.pendingBalls++;
        this.events.push({ type: 'orb', x: ox, y: oy });
      }
    }
  }

  private slideReturned(h: number): void {
    if (this.landX === null) return;
    const k = Math.min(1, h * 12);
    for (const b of this.balls) if (b.state === 'returned') b.x += (this.landX - b.x) * k;
  }

  private descend(): void {
    if (this.landX !== null) this.launchX = this.landX;
    this.ballCount += this.pendingBalls;
    this.pendingBalls = 0;
    this.balls = [];
    this.turn++;
    for (const b of this.bricks) b.r++;
    for (const o of this.orbs) o.r++;
    this.orbs = this.orbs.filter((o) => o.r < ROWS);
    this.spawnRow();
    this.setPhase('drop');
    this.events.push({ type: 'drop' });
  }

  private spawnRow(): void {
    const row = generateRow(this.rowRng, this.level);
    for (const b of row.bricks) {
      this.bricks.push({ id: this.nextId++, c: b.c, r: 0, hp: b.hp, maxHp: b.hp, kind: 'normal' });
    }
    if (row.orb !== null) this.orbs.push({ id: this.nextId++, c: row.orb, r: 0 });
    this.rebuildGrid();
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const b of this.bricks) this.grid.set(gridKey(b.c, b.r), b);
  }

  // ---- debug helpers ----
  debugAddBalls(n: number): void {
    this.ballCount += n;
  }
}

export function clampAngle(a: number): number {
  return Math.max(MIN_ANGLE, Math.min(Math.PI - MIN_ANGLE, a));
}

function clampX(x: number): number {
  return Math.max(BALL_R + 2, Math.min(W - BALL_R - 2, x));
}
