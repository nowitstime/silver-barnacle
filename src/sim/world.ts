import { stream, type Rng } from '../core/rng';
import { UPGRADE_BY_ID, computeStats, rollOffer, type Stats } from '../content/upgrades';
import {
  BALL_R, BALL_SPEED, DROP_TIME, FLOOR, LAUNCH_INTERVAL, MIN_ANGLE, ROWS, SETTLE_TIME, W,
  cellCenterX, cellCenterY,
} from './constants';
import { bounce, stepBody } from './physics';
import { generateRow } from './rows';
import { biomeAt, pickAfter, type PickKind } from './run';
import {
  gridKey, type Ball, type Brick, type BrickGrid, type DamageSource, type Orb, type Phase, type SimEvent,
} from './types';

const ORB_R = 8;
const SAVE_VERSION = 1;
/** Split copies never exceed this many per volley, whatever the upgrades say. */
const MAX_COPIES = 40;

export interface Offer {
  kind: PickKind;
  ids: string[];
}

export interface SaveData {
  v: number;
  seed: number;
  turn: number;
  nextId: number;
  ballCount: number;
  launchX: number;
  shields: number;
  bricks: Brick[];
  orbs: Orb[];
  upgrades: Record<string, number>;
  offer: Offer | null;
  rng: { rows: number; loot: number; combat: number };
  stats: { kills: number; damage: number; bestCombo: number };
}

/**
 * The whole game state and rules. No DOM, no rendering, no wall-clock time:
 * call `tick(STEP)` at a fixed rate and read the state.
 */
export class Sim {
  readonly seed: number;
  private rowRng: Rng;
  private lootRng: Rng;
  private combatRng: Rng;
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
  private copiesThisVolley = 0;
  private killsThisVolley = 0;

  upgrades: Record<string, number> = {};
  stats: Stats = computeStats({});
  shields = 0;
  offer: Offer | null = null;
  /** Lifetime numbers for the run summary. */
  totals = { kills: 0, damage: 0, bestCombo: 0 };

  events: SimEvent[] = [];

  constructor(seed: number, save?: SaveData) {
    this.seed = seed;
    this.rowRng = stream(seed, 'rows');
    this.lootRng = stream(seed, 'loot');
    this.combatRng = stream(seed, 'combat');
    if (save) this.restore(save);
    else this.spawnRow();
  }

  get level(): number {
    return this.turn + 1;
  }

  /** The biome the current turn belongs to. */
  get biome(): number {
    return biomeAt(this.turn).index;
  }

  /** 0..1 progress through the current biome. */
  get biomeProgress(): number {
    const b = biomeAt(this.turn);
    return (this.turn - b.start) / b.length;
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

  get unfired(): number {
    return this.ballCount - this.fired;
  }

  /** Fire a volley. Returns false if it's not the aim phase. */
  fire(angle: number): boolean {
    if (this.phase !== 'aim') return false;
    this.aimAngle = clampAngle(angle);
    this.phase = 'fire';
    this.phaseTime = 0;
    this.turnTime = 0;
    this.fired = 0;
    this.copiesThisVolley = 0;
    this.killsThisVolley = 0;
    this.balls = [];
    this.landX = null;
    return true;
  }

  /** Take one of the offered upgrades. */
  choose(index: number): boolean {
    if (this.phase !== 'pick' || !this.offer) return false;
    const id = this.offer.ids[index];
    const def = id ? UPGRADE_BY_ID.get(id) : undefined;
    if (!def) return false;
    const wasBiome = this.offer.kind === 'biome';
    this.upgrades[id] = (this.upgrades[id] ?? 0) + 1;
    this.stats = computeStats(this.upgrades);
    def.onTake?.({
      addBalls: (n) => (this.ballCount += n),
      addShields: (n) => (this.shields += n),
    });
    this.offer = null;
    this.setPhase('aim');
    if (wasBiome) this.events.push({ type: 'biome', index: this.biome });
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
      if (this.landX === null && !b.copy) this.landX = clampX(b.x);
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
      case 'pick':
      case 'over':
        break;
      case 'fire':
      case 'run':
        this.turnTime += h;
        if (this.phase === 'fire') this.launchDue();
        this.stepBalls(h);
        this.slideReturned(h);
        if (this.phase === 'run' && this.balls.every((b) => b.state === 'returned')) this.setPhase('settle');
        break;
      case 'settle':
        this.slideReturned(h);
        if (this.phaseTime >= SETTLE_TIME) this.descend();
        break;
      case 'drop':
        if (this.phaseTime >= DROP_TIME) this.afterDrop();
        break;
    }
  }

  // ---- turn flow ----

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseTime = 0;
  }

  private launchDue(): void {
    while (this.fired < this.ballCount && this.phaseTime >= this.fired * LAUNCH_INTERVAL) {
      this.spawnBall(this.launchX, FLOOR - BALL_R, this.aimAngle, this.fired, false);
      this.fired++;
      this.events.push({ type: 'launch', x: this.launchX, y: FLOOR - BALL_R });
    }
    if (this.fired >= this.ballCount) this.phase = 'run';
  }

  private spawnBall(x: number, y: number, angle: number, index: number, copy: boolean, from?: Ball): Ball {
    const ball: Ball = {
      id: this.nextId++, x, y,
      vx: Math.cos(angle) * BALL_SPEED, vy: -Math.sin(angle) * BALL_SPEED,
      state: 'flying', index, copy,
      bonus: from?.bonus ?? 0,
      pierceLeft: from?.pierceLeft ?? this.stats.pierce,
      fire: from?.fire ?? false,
    };
    this.balls.push(ball);
    return ball;
  }

  private descend(): void {
    // Burning bricks take damage before the board moves.
    for (const b of [...this.bricks]) {
      if (b.burn > 0) this.damage(b, b.burn * this.stats.damage, cellCenterX(b.c), cellCenterY(b.r), 'burn', null, false);
    }
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

  private afterDrop(): void {
    if (this.bricks.some((b) => b.r >= ROWS)) {
      if (this.shields > 0) {
        this.shields--;
        for (const b of [...this.bricks]) if (b.r >= ROWS - 2) this.removeBrick(b);
        this.events.push({ type: 'shield' });
      } else {
        this.setPhase('over');
        this.events.push({ type: 'over' });
        return;
      }
    }
    const kind = pickAfter(this.turn);
    if (kind) {
      this.offer = { kind, ids: rollOffer(this.lootRng, this.upgrades, biomeAt(this.turn - 1).index, kind) };
      if (this.offer.ids.length) {
        this.setPhase('pick');
        this.events.push({ type: 'pick', kind });
        return;
      }
      this.offer = null;
    }
    this.setPhase('aim');
  }

  // ---- balls and damage ----

  private stepBalls(h: number): void {
    // Iterate over a snapshot: Mitosis can add balls mid-step.
    for (const ball of [...this.balls]) {
      if (ball.state !== 'flying') continue;
      const res = stepBody(ball, h, this.grid);
      if (res?.kind === 'floor') {
        ball.state = 'returned';
        const first = this.landX === null && !ball.copy;
        if (first) this.landX = clampX(ball.x);
        this.events.push({ type: 'land', x: ball.x, first });
        continue;
      }
      if (res?.kind === 'wall') {
        if (this.stats.ricochet && !res.ceiling) ball.bonus += this.stats.ricochet;
        if (res.ceiling && this.stats.lava && !ball.fire) {
          ball.fire = true;
          this.events.push({ type: 'ignite', ballId: ball.id, x: res.x, y: res.y });
        }
        this.events.push({ type: 'wall', ballId: ball.id, x: res.x, y: res.y, ceiling: res.ceiling });
      }
      if (res?.kind === 'brick') this.ballHit(ball, res.brick, res.x, res.y, res.contact);
      this.collectOrbs(ball);
    }
    // Copies that landed are gone.
    this.balls = this.balls.filter((b) => !(b.copy && b.state === 'returned'));
  }

  private ballHit(ball: Ball, brick: Brick, x: number, y: number, contact: Parameters<typeof bounce>[1]): void {
    const s = this.stats;
    let dmg = s.damage + ball.bonus;
    if (ball.index === 0 && !ball.copy && s.firstBlood > 1) dmg *= s.firstBlood;
    if (ball.fire) dmg *= 2;
    const crit = this.combatRng() < s.critChance;
    if (crit) dmg *= s.critMult;
    dmg = Math.max(1, Math.round(dmg));
    if (s.burn) brick.burn = Math.max(brick.burn, s.burn);

    const killed = this.damage(brick, dmg, x, y, 'ball', ball, crit);

    // Smash through kills (Pierce, fireballs) instead of bouncing.
    const through = killed && (ball.fire || ball.pierceLeft > 0);
    if (through) {
      if (!ball.fire) ball.pierceLeft--;
    } else bounce(ball, contact);

    if (crit) {
      if (s.chain) this.zap(brick, s.chain, x, y);
      if (s.mitosis && !ball.copy && this.copiesThisVolley < Math.min(MAX_COPIES, s.mitosis * this.ballCount)) {
        this.copiesThisVolley++;
        const a = Math.atan2(-ball.vy, ball.vx) + (this.combatRng() < 0.5 ? 0.45 : -0.45);
        this.spawnBall(ball.x, ball.y, clampTravel(a), ball.index + 1000, true, ball);
        this.events.push({ type: 'split', x: ball.x, y: ball.y });
      }
    }
  }

  /** Apply damage. Returns true if the brick died. */
  private damage(
    brick: Brick, amount: number, x: number, y: number, source: DamageSource, ball: Ball | null, crit: boolean,
  ): boolean {
    if (!this.grid.has(gridKey(brick.c, brick.r)) || this.grid.get(gridKey(brick.c, brick.r)) !== brick) return false;
    const dealt = Math.min(amount, brick.hp);
    brick.hp -= amount;
    this.totals.damage += dealt;
    const killed = brick.hp <= 0;
    if (killed) {
      this.removeBrick(brick);
      this.totals.kills++;
      this.killsThisVolley++;
      this.totals.bestCombo = Math.max(this.totals.bestCombo, this.killsThisVolley);
    }
    this.events.push({ type: 'hit', ballId: ball?.id ?? -1, brick, x, y, damage: amount, killed, crit, source });
    if (killed && this.stats.splash > 0 && source !== 'splash' && source !== 'burn') {
      const splash = Math.max(1, Math.round(this.stats.damage * this.stats.splash * (crit ? this.stats.critMult : 1)));
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.grid.get(gridKey(brick.c + dc, brick.r + dr));
        if (n) this.damage(n, splash, cellCenterX(n.c), cellCenterY(n.r), 'splash', null, false);
      }
    }
    return killed;
  }

  /** Chain Lightning: hit the nearest other bricks. */
  private zap(from: Brick, count: number, x: number, y: number): void {
    const fx = cellCenterX(from.c), fy = cellCenterY(from.r);
    const targets = this.bricks
      .filter((b) => b !== from)
      .map((b) => ({ b, d: (cellCenterX(b.c) - fx) ** 2 + (cellCenterY(b.r) - fy) ** 2 }))
      .sort((a, b) => a.d - b.d || a.b.id - b.b.id)
      .slice(0, count);
    for (const { b } of targets) {
      const tx = cellCenterX(b.c), ty = cellCenterY(b.r);
      this.events.push({ type: 'zap', x1: x, y1: y, x2: tx, y2: ty });
      this.damage(b, this.stats.damage, tx, ty, 'chain', null, false);
    }
  }

  private removeBrick(brick: Brick): void {
    const i = this.bricks.indexOf(brick);
    if (i >= 0) this.bricks.splice(i, 1);
    if (this.grid.get(gridKey(brick.c, brick.r)) === brick) this.grid.delete(gridKey(brick.c, brick.r));
  }

  private collectOrbs(ball: Ball): void {
    if (ball.copy) return;
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

  private spawnRow(): void {
    const row = generateRow(this.rowRng, this.level, this.biome);
    for (const b of row.bricks) {
      this.bricks.push({ id: this.nextId++, c: b.c, r: 0, hp: b.hp, maxHp: b.hp, kind: 'normal', burn: 0 });
    }
    if (row.orb !== null) this.orbs.push({ id: this.nextId++, c: row.orb, r: 0 });
    this.rebuildGrid();
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const b of this.bricks) this.grid.set(gridKey(b.c, b.r), b);
  }

  // ---- save / load ----

  /** Snapshot for autosave. Only valid between turns (aim or pick phase). */
  toSave(): SaveData {
    return {
      v: SAVE_VERSION,
      seed: this.seed,
      turn: this.turn,
      nextId: this.nextId,
      ballCount: this.ballCount,
      launchX: this.launchX,
      shields: this.shields,
      bricks: this.bricks.map((b) => ({ ...b })),
      orbs: this.orbs.map((o) => ({ ...o })),
      upgrades: { ...this.upgrades },
      offer: this.offer ? { kind: this.offer.kind, ids: [...this.offer.ids] } : null,
      rng: { rows: this.rowRng.state, loot: this.lootRng.state, combat: this.combatRng.state },
      stats: { ...this.totals },
    };
  }

  static isValidSave(d: unknown): d is SaveData {
    const s = d as SaveData;
    return !!s && s.v === SAVE_VERSION && Array.isArray(s.bricks) && typeof s.seed === 'number';
  }

  private restore(d: SaveData): void {
    this.turn = d.turn;
    this.nextId = d.nextId;
    this.ballCount = d.ballCount;
    this.launchX = d.launchX;
    this.shields = d.shields;
    this.bricks = d.bricks.map((b) => ({ ...b }));
    this.orbs = d.orbs.map((o) => ({ ...o }));
    this.upgrades = { ...d.upgrades };
    this.stats = computeStats(this.upgrades);
    this.offer = d.offer;
    this.rowRng.state = d.rng.rows;
    this.lootRng.state = d.rng.loot;
    this.combatRng.state = d.rng.combat;
    this.totals = { ...d.stats };
    this.phase = this.offer ? 'pick' : 'aim';
    this.rebuildGrid();
  }

  // ---- debug helpers ----
  debugAddBalls(n: number): void {
    this.ballCount += n;
  }

  debugGrant(id: string): void {
    const def = UPGRADE_BY_ID.get(id);
    if (!def) return;
    this.upgrades[id] = (this.upgrades[id] ?? 0) + 1;
    this.stats = computeStats(this.upgrades);
    def.onTake?.({ addBalls: (n) => (this.ballCount += n), addShields: (n) => (this.shields += n) });
  }

  /** Jump to the last turn before the next pick. */
  debugSkipToPick(): void {
    if (this.phase !== 'aim') return;
    let t = this.turn + 1;
    while (!pickAfter(t)) t++;
    this.turn = t - 1;
  }
}

export function clampAngle(a: number): number {
  return Math.max(MIN_ANGLE, Math.min(Math.PI - MIN_ANGLE, a));
}

/** Keep travel directions from being too flat (any direction, up or down). */
function clampTravel(a: number): number {
  const min = MIN_ANGLE;
  let x = Math.atan2(Math.sin(a), Math.cos(a));
  const absS = Math.abs(Math.sin(x));
  if (absS < Math.sin(min)) x = (x >= 0 ? 1 : -1) * (Math.abs(x) < Math.PI / 2 ? min : Math.PI - min);
  return x;
}

function clampX(x: number): number {
  return Math.max(BALL_R + 2, Math.min(W - BALL_R - 2, x));
}

