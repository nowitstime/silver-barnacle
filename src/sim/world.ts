import { stream, type Rng } from '../core/rng';
import { CORE_PHASES, bossFor } from '../content/bosses';
import { isHazard } from '../content/bricks';
import { CLASS_BY_ID, type ClassId } from '../content/classes';
import { LOOT_CATEGORIES, UPGRADE_BY_ID, computeStats, rerollSameTiers, rollLoot, rollOffer, type Stats } from '../content/upgrades';
import type { Contact } from './collision';
import {
  BALL_R, BALL_SPEED, COLS, DROP_TIME, FLOOR, LAUNCH_INTERVAL, MAX_LAUNCH_TIME, MIN_ANGLE, ROWS, SETTLE_TIME, W,
  CELL, TOP, cellCenterX, cellCenterY,
} from './constants';
import { bounce, brickRect, stepBody, type Accel } from './physics';
import { circleRect } from './collision';
import { brickHp, generateRow } from './rows';
import { CORE, ENDLESS_START, biomeLength, endlessHazards, endlessHp, gimmickFor, type Gimmick } from './run';
import {
  gridKey, type Ball, type Brick, type BrickGrid, type BrickKind, type DamageSource, type Item, type Phase, type SimEvent,
} from './types';

const ITEM_R = 8;
const SAVE_VERSION = 2;
/** Split copies never exceed this many per volley, whatever the upgrades say. */
const MAX_COPIES = 40;
const HEAVY_GRAVITY = 700;
const CURRENT_FORCE = 70;
/** Seconds a sponge holds balls before bursting. */
const SPONGE_HOLD = 2.0;
const BALLOON_STICK = 0.8;
/** Share of ball damage that gets through a Shielder's protection. */
const SHIELD_FACTOR = 0.25;
const FLOAT_LIFT = 650;
const ANCHOR_PULL = 520;
const ANCHOR_RANGE = 80;
const ICE_SPEEDUP = 1.04;
const ICE_MAX = 1.6;

export type PickKind = 'mid' | 'biome';

export interface Offer {
  kind: PickKind;
  ids: string[];
  /** Free rerolls left (big picks get one). */
  rerolls?: number;
}

export interface RunOptions {
  classId?: ClassId;
  /** Upgrades not unlocked yet; never offered this run. */
  locked?: string[];
}

export interface SaveData {
  v: number;
  seed: number;
  classId: ClassId;
  locked?: string[];
  turn: number;
  nextId: number;
  ballCount: number;
  launchX: number;
  shields: number;
  windUsed: boolean;
  won?: boolean;
  biome: number;
  biomeRow: number;
  /** Turn endless mode began (older saves: estimated). */
  endlessStart?: number;
  bossActive: boolean;
  bricks: Brick[];
  items: Item[];
  upgrades: Record<string, number>;
  offer: Offer | null;
  rng: { rows: number; loot: number; combat: number };
  stats: Totals;
}

export interface Totals {
  kills: number;
  damage: number;
  bestCombo: number;
  bosses: number;
}

/**
 * The whole game state and rules. No DOM, no rendering, no wall-clock time:
 * call `tick(STEP)` at a fixed rate and read the state.
 */
export class Sim {
  readonly seed: number;
  readonly classId: ClassId;
  readonly locked: string[];
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
  items: Item[] = [];
  balls: Ball[] = [];

  ballCount = 1;
  /** Balls picked up this turn; they join at the end of the turn. */
  pendingBalls = 0;
  launchX = W / 2;
  /** Where the first ball landed this turn (next launch point). */
  landX: number | null = null;
  aimAngle = Math.PI / 2;
  private fired = 0;
  private toFire = 0;
  private copiesThisVolley = 0;
  private killsThisVolley = 0;
  private hitsThisVolley = 0;
  private goldenIndex = -1;

  /** Current biome (keeps counting past the last one) and rows spawned in it. */
  biome = 0;
  biomeRow = 0;
  bossActive = false;
  private bossCleared = false;

  upgrades: Record<string, number> = {};
  stats: Stats;
  shields = 0;
  windUsed = false;
  offer: Offer | null = null;
  totals: Totals = { kills: 0, damage: 0, bestCombo: 0, bosses: 0 };

  events: SimEvent[] = [];

  constructor(seed: number, opts: RunOptions = {}, save?: SaveData) {
    this.seed = seed;
    this.classId = save?.classId ?? opts.classId ?? 'striker';
    this.locked = save?.locked ?? opts.locked ?? [];
    this.rowRng = stream(seed, 'rows');
    this.lootRng = stream(seed, 'loot');
    this.combatRng = stream(seed, 'combat');
    this.stats = this.computeStats();
    if (save) this.restore(save);
    else {
      this.ballCount = CLASS_BY_ID.get(this.classId)?.startBalls ?? 1;
      this.spawnRow();
    }
  }

  get level(): number {
    return this.turn + 1;
  }

  get gimmick(): Gimmick {
    return gimmickFor(this.biome);
  }

  /** 0..1 progress through the current biome (1 during the boss fight). */
  get biomeProgress(): number {
    return this.bossActive ? 1 : Math.min(1, this.biomeRow / biomeLength(this.biome));
  }

  get boss(): Brick | undefined {
    return this.bricks.find((b) => b.kind === 'boss');
  }

  /** The row index of the lowest brick that can end the run, or -1. */
  get lowestRow(): number {
    let m = -1;
    for (const b of this.bricks) if (b.kind !== 'steel' && b.kind !== 'loot') m = Math.max(m, b.r + b.h - 1);
    return m;
  }

  /** 0 at the start of a biome, 1 at its boss: biome rules get stronger as it rises. */
  get intensity(): number {
    return this.bossActive ? 1 : Math.min(1, this.biomeRow / Math.max(1, biomeLength(this.biome)));
  }

  /** Forge: rows of lava eating into the board from below (0–2). */
  lavaAt(turn: number): number {
    if (this.gimmick !== 'heat') return 0;
    return turn % 6 >= 4 ? (this.intensity > 0.6 ? 2 : 1) : 0;
  }

  get lava(): number {
    return this.lavaAt(this.turn);
  }

  /** Bricks reaching this row end the run (lava raises it). */
  get dangerRow(): number {
    return ROWS - this.lava;
  }

  /**
   * Danger preview: bricks that end the run if they're still standing when the board next moves
   * (counts sprinters' extra step, Time Dilation's skipped rows and Forge lava).
   */
  get threats(): Brick[] {
    const t = this.turn + 1;
    const skip = this.stats.slowDrop && t % 2 === 1 && !this.bossActive && !this.bossCleared;
    const line = ROWS - this.lavaAt(t);
    return this.bricks.filter((b) => {
      if (b.kind === 'steel' || b.kind === 'loot' || (b.boss?.id === 'core' && b.boss.phase < 3)) return false;
      const step = skip ? 0 : 1 + (b.kind === 'sprinter' ? 1 : 0);
      return b.r + b.h - 1 + step >= line;
    });
  }

  /** What ended the run: the kinds of brick that crossed the line. */
  deathCause: BrickKind[] = [];

  get unfired(): number {
    return Math.max(0, this.ballCount - this.fired);
  }

  /** Ball physics from upgrades: weight (Lead Core / Featherweight) and Magnetic's pull. */
  physicsPull(x: number, y: number): Accel {
    const s = this.stats;
    let ax = 0, ay = s.gravity;
    if (s.magnet) {
      let best: Brick | null = null, bd = 120 * 120;
      for (const b of this.bricks) {
        if (b.kind === 'steel') continue;
        const dx = cellCenterX(b.c) + (b.w - 1) * CELL / 2 - x, dy = cellCenterY(b.r) + (b.h - 1) * CELL / 2 - y;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = b; }
      }
      if (best) {
        const dx = cellCenterX(best.c) + (best.w - 1) * CELL / 2 - x, dy = cellCenterY(best.r) + (best.h - 1) * CELL / 2 - y;
        const d = Math.sqrt(bd) || 1;
        const f = s.magnet * (1 - d / 120);
        ax += (dx / d) * f;
        ay += (dy / d) * f;
      }
    }
    return { ax, ay };
  }

  /** What the aim laser should feel: the biome current plus your ball physics. */
  readonly traceAccel = (x: number, y: number): Accel => {
    const p = this.stats.gravity || this.stats.magnet ? this.physicsPull(x, y) : { ax: 0, ay: 0 };
    return { ax: this.current + p.ax, ay: p.ay };
  };

  private speedUp(ball: Ball, k: number): void {
    const sp = Math.hypot(ball.vx, ball.vy);
    const f = Math.min(k, (BALL_SPEED * 1.8) / sp);
    if (f > 1) { ball.vx *= f; ball.vy *= f; }
  }

  /** Sideways drift in The Deep, flipping each turn. */
  get current(): number {
    return this.gimmick === 'current' ? (this.turn % 2 === 0 ? 1 : -1) * CURRENT_FORCE : 0;
  }

  get accel(): Accel {
    return { ax: this.current, ay: 0 };
  }

  private computeStats(): Stats {
    return computeStats(this.upgrades, CLASS_BY_ID.get(this.classId)?.apply);
  }

  private runEffects() {
    return {
      addBalls: (n: number) => (this.ballCount += n),
      addShields: (n: number) => { if (!this.stats.glassCannon) this.shields += n; },
    };
  }

  // ---- player actions ----

  /** Fire a volley. Returns false if it's not the aim phase. */
  fire(angle: number): boolean {
    if (this.phase !== 'aim') return false;
    this.aimAngle = clampAngle(angle);
    this.phase = 'fire';
    this.phaseTime = 0;
    this.turnTime = 0;
    this.fired = 0;
    const echo = this.stats.echo && this.turn % 3 === 2;
    this.toFire = this.ballCount * (echo ? 2 : 1);
    this.copiesThisVolley = 0;
    this.killsThisVolley = 0;
    this.hitsThisVolley = 0;
    this.goldenIndex = this.stats.encore ? Math.floor(this.combatRng() * this.ballCount) : -1;
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
    this.applyUpgrade(id);
    this.offer = null;
    this.setPhase('aim');
    if (wasBiome) this.events.push({ type: 'biome', index: this.biome });
    return true;
  }

  private applyUpgrade(id: string): void {
    const def = UPGRADE_BY_ID.get(id);
    if (!def) return;
    this.upgrades[id] = (this.upgrades[id] ?? 0) + 1;
    this.stats = this.computeStats();
    if (this.stats.glassCannon) this.shields = 0;
    def.onTake?.(this.runEffects());
  }

  /** Swap the offered cards for new ones (big picks get one free reroll). */
  reroll(): boolean {
    if (this.phase !== 'pick' || !this.offer || !this.offer.rerolls) return false;
    // Same rarity per card: a legendary rerolls into another legendary.
    const ids = rerollSameTiers(this.lootRng, this.upgrades, this.offer.ids, this.locked);
    if (!ids.length) return false;
    this.offer = { ...this.offer, ids, rerolls: this.offer.rerolls - 1 };
    return true;
  }

  /** Bring every ball home immediately. */
  recall(): void {
    if (this.phase !== 'fire' && this.phase !== 'run') return;
    this.fired = this.toFire;
    for (const b of this.balls) {
      if (b.state === 'returned') continue;
      b.state = 'returned';
      b.y = FLOOR - BALL_R;
      if (this.landX === null && !b.copy) this.landX = clampX(b.x);
    }
    this.balls = this.balls.filter((b) => !b.copy);
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
        if (this.phaseTime >= SETTLE_TIME) this.endTurn();
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
    const interval = Math.min(LAUNCH_INTERVAL, MAX_LAUNCH_TIME / this.toFire);
    while (this.fired < this.toFire && this.phaseTime >= this.fired * interval) {
      const copy = this.fired >= this.ballCount;
      const ball = this.spawnBall(this.launchX, FLOOR - BALL_R, this.aimAngle, this.fired % this.ballCount, copy);
      ball.golden = !copy && ball.index === this.goldenIndex;
      this.fired++;
      this.events.push({ type: 'launch', x: this.launchX, y: FLOOR - BALL_R });
    }
    if (this.fired >= this.toFire) this.phase = 'run';
  }

  private spawnBall(x: number, y: number, angle: number, index: number, copy: boolean, from?: Ball): Ball {
    const speed = from ? Math.hypot(from.vx, from.vy) : BALL_SPEED;
    const ball: Ball = {
      id: this.nextId++, x, y,
      vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed,
      state: 'flying', index, copy, golden: false,
      bonus: from?.bonus ?? 0,
      pierceLeft: from?.pierceLeft ?? this.stats.pierce,
      ghostLeft: from?.ghostLeft ?? this.stats.ghost,
      fire: from?.fire ?? false,
      wallBounces: from?.wallBounces ?? 0,
      struck: from?.struck ?? false,
      heavy: false, slow: false, shrunk: from?.shrunk ?? false, popped: false, floaty: false,
      r: from?.r ?? BALL_R,
      heldBy: 0, heldTime: 0, portalCooldown: 0, lasers: [],
    };
    this.balls.push(ball);
    return ball;
  }

  /** Everything that happens between the last ball landing and the board moving down. */
  private endTurn(): void {
    const s = this.stats;
    // Burning bricks take damage.
    for (const b of [...this.bricks]) {
      // A brick burns for a share of the hit that lit it (set when it was ignited).
      // Kindling: a lit brick burns for a share of everything it took this turn. Untouched, its fire keeps going.
      if (b.lit && s.burn) {
        if (b.taken) b.burn = Math.max(1, Math.round(b.taken * 0.4 * s.burn * s.fireMult));
        b.taken = 0;
      }
      if (b.burn > 0) this.damage(b, b.burn, cellCenterX(b.c), cellCenterY(b.r), 'burn', null, false);
    }
    // Forge heat: untouched bricks regrow.
    if (this.gimmick === 'heat') {
      for (const b of this.bricks) {
        if (b.hitThisTurn || b.kind === 'steel' || b.kind === 'boss' || b.hp >= b.maxHp) continue;
        const amount = Math.max(1, Math.round(b.maxHp * 0.1));
        b.hp = Math.min(b.maxHp, b.hp + amount);
        this.events.push({ type: 'heal', brick: b, amount });
      }
    }
    this.bossTurn();
    // Healers restore their neighbours.
    for (const h of this.bricks.filter((x) => x.kind === 'healer')) {
      for (const [dc, dr] of NEIGHBOURS) {
        const n = this.grid.get(gridKey(h.c + dc, h.r + dr));
        if (!n || n === h || n.kind === 'steel' || n.kind === 'loot' || n.hp >= n.maxHp) continue;
        const amount = Math.max(1, Math.round(n.maxHp * (n.boss ? 0.03 : 0.1)));
        n.hp = Math.min(n.maxHp, n.hp + amount);
        this.events.push({ type: 'heal', brick: n, amount });
      }
    }
    // Thieves steal a ball when their countdown runs out.
    for (const t of this.bricks.filter((x) => x.kind === 'thief')) {
      t.timer = (t.timer ?? 2) - 1;
      if (t.timer <= 0) {
        t.timer = 2;
        if (this.ballCount > 1) {
          this.ballCount--;
          this.events.push({ type: 'steal', x: cellCenterX(t.c), y: cellCenterY(t.r) });
        }
      }
    }
    // Meadow growth: bricks left alone sprout blooms.
    if (this.gimmick === 'growth') {
      for (const b of this.bricks) {
        if (b.kind !== 'normal') continue;
        b.idle = b.hitThisTurn ? 0 : (b.idle ?? 0) + 1;
        if (!b.bloom && b.idle >= 2 && this.rowRng() < 0.2 + 0.4 * this.intensity) {
          b.bloom = true;
          this.events.push({ type: 'bloom', x: cellCenterX(b.c), y: cellCenterY(b.r) });
        }
      }
    }
    // Spawners grow.
    for (const b of this.bricks.filter((x) => x.kind === 'spawner')) {
      const cell = this.freeNeighbour(b.c, b.r);
      if (cell) this.addBrick(cell[0], cell[1], Math.max(1, Math.ceil(b.maxHp / 2)), 'normal');
    }
    for (const b of this.bricks) b.hitThisTurn = false;
    this.items = this.items.filter((i) => !i.used);

    if (this.landX !== null) this.launchX = this.landX;
    this.ballCount += this.pendingBalls;
    this.pendingBalls = 0;
    this.balls = [];
    this.turn++;

    // Boss defeated: the board pauses for a breather before the biome pick.
    if (this.bossActive && !this.boss) {
      this.bossActive = false;
      if (this.biome === CORE) this.coreBroken = true;
      else this.bossCleared = true;
    }
    const skipRow = this.stats.slowDrop && this.turn % 2 === 1 && !this.bossActive && !this.bossCleared;
    if (!skipRow) this.shiftDown(1);
    // Singularity: when a row drops, the toughest brick collapses.
    if (!skipRow && s.singularity) {
      const tough = this.bricks.filter((b) => b.hp > 0 && b.kind !== 'boss' && b.kind !== 'steel').sort((a, b) => b.hp - a.hp || a.id - b.id);
      for (const b of tough.slice(0, s.singularity)) this.damage(b, b.hp, cellCenterX(b.c), cellCenterY(b.r), 'void', null, false);
    }
    this.fusesTick();
    if (this.gimmick === 'current') this.tide();
    if (this.bossCleared || this.coreBroken || skipRow) {
      // no new row
    } else if (this.bossActive) {
      this.spawnBossOrb();
    } else if (this.biomeRow >= biomeLength(this.biome)) {
      this.spawnBoss();
    } else {
      this.spawnRow();
      this.biomeRow++;
      const [lootAt, pickAt] = pickPoints(this.biome);
      if (!this.offeredMid && this.biomeRow === lootAt) {
        this.offeredMid = true;
        this.spawnLoot();
      }
      if (!this.offeredSmall && this.biomeRow === pickAt) {
        this.offeredSmall = true;
        this.smallPickDue = true;
      }
    }
    this.rebuildGrid();
    this.setPhase('drop');
    this.events.push({ type: 'drop' });
    if (this.lava > this.lavaAt(this.turn - 1)) this.events.push({ type: 'lava', level: this.lava });
  }

  private shiftDown(n: number): void {
    for (const b of this.bricks) {
      // The Core holds its ground until its last phase.
      if (b.boss?.id === 'core' && b.boss.phase < 3) continue;
      b.r += n;
    }
    for (const i of this.items) i.r += n;
    this.rebuildGrid();
    // Sprinters take an extra step when there's room.
    for (const b of this.bricks.filter((x) => x.kind === 'sprinter').sort((a, z) => z.r - a.r)) {
      if (!this.grid.has(gridKey(b.c, b.r + 1))) {
        this.grid.delete(gridKey(b.c, b.r));
        b.r++;
        this.grid.set(gridKey(b.c, b.r), b);
      }
    }
    // Steel and items that fall off the bottom just disappear.
    this.bricks = this.bricks.filter((b) => !((b.kind === 'steel' || b.kind === 'loot') && b.r >= ROWS));
    this.items = this.items.filter((i) => i.r < ROWS);
  }

  private afterDrop(): void {
    if (this.coreBroken) {
      this.coreBroken = false;
      this.won = true;
      this.setPhase('won');
      return;
    }
    if (this.lowestRow >= this.dangerRow) {
      if (this.shields > 0 || (this.stats.secondWind && !this.windUsed)) {
        const wind = this.shields <= 0;
        if (wind) this.windUsed = true;
        else this.shields--;
        const clearFrom = this.dangerRow - (wind ? 3 : 2);
        for (const b of [...this.bricks]) {
          if (b.r + b.h - 1 < clearFrom) continue;
          if (b.kind === 'boss') b.r = Math.max(0, clearFrom - b.h);
          else this.removeBrick(b);
        }
        this.rebuildGrid();
        this.events.push({ type: 'shield', kind: wind ? 'wind' : 'shield' });
      } else {
        this.deathCause = [...new Set(this.bricks.filter((b) => b.kind !== 'steel' && b.kind !== 'loot' && b.r + b.h - 1 >= this.dangerRow).map((b) => b.kind))];
        this.setPhase('over');
        this.events.push({ type: 'over' });
        return;
      }
    }
    let kind: PickKind | null = null;
    if (this.bossCleared) {
      this.bossCleared = false;
      kind = 'biome';
      this.biome++;
      this.biomeRow = 0;
      if (this.stats.guardian) this.runEffects().addShields(this.stats.guardian);
    } else if (this.smallPickDue) {
      this.smallPickDue = false;
      kind = 'mid';
    }
    if (kind === 'biome') { this.offeredMid = false; this.offeredSmall = false; }
    if (kind) {
      this.offer = { kind, ids: rollOffer(this.lootRng, this.upgrades, kind === 'biome' ? this.biome - 1 : this.biome, kind, this.stats.wildcard, this.locked), rerolls: kind === 'biome' ? 1 : 0 };
      if (this.offer.ids.length) {
        this.setPhase('pick');
        this.events.push({ type: 'pick', kind });
        return;
      }
      this.offer = null;
      if (kind === 'biome') this.events.push({ type: 'biome', index: this.biome });
    }
    this.setPhase('aim');
  }
  private offeredMid = false;
  /** The small card pick two-thirds of the way through the biome. */
  private offeredSmall = false;
  private smallPickDue = false;
  private coreBroken = false;
  /** Turn endless began; endless HP scales with turns since then. */
  endlessStart = 0;

  /** Extra brick HP in endless (1 before it). */
  get endlessHpMult(): number {
    return this.biome < ENDLESS_START ? 1 : endlessHp(this.turn - this.endlessStart);
  }
  /** The Core has been broken this run (the run can continue into endless). */
  won = false;

  /** After winning: carry on into endless, starting with a big upgrade pick. */
  continueEndless(): boolean {
    if (this.phase !== 'won') return false;
    this.biome = ENDLESS_START;
    this.biomeRow = 0;
    this.endlessStart = this.turn;
    this.offeredMid = false;
    this.offer = { kind: 'biome', ids: rollOffer(this.lootRng, this.upgrades, 4, 'biome', this.stats.wildcard, this.locked), rerolls: 1 };
    if (this.offer.ids.length) {
      this.setPhase('pick');
      this.events.push({ type: 'pick', kind: 'biome' });
    } else {
      this.offer = null;
      this.setPhase('aim');
      this.events.push({ type: 'biome', index: this.biome });
    }
    return true;
  }

  // ---- bosses ----

  private spawnBoss(): void {
    const def = bossFor(this.biome);
    const core = def.id === 'core';
    const size = core ? 3 : 2;
    // Make room at the top for the boss.
    this.shiftDown(size - 1);
    const c = core ? 2 : 1 + Math.floor(this.rowRng() * (COLS - 3));
    for (const b of [...this.bricks]) if (b.r < size && b.c + b.w > c && b.c < c + size) this.removeBrick(b);
    const tier = core ? 45 : 12 + 3 * Math.min(this.biome, 4);
    const hp = Math.round(brickHp(this.level, Math.min(this.biome, CORE)) * tier * this.stats.hpMult * this.endlessHpMult);
    this.bricks.push({
      id: this.nextId++, c, r: 0, w: size, h: size, hp, maxHp: hp, kind: 'boss', burn: 0, frozen: false, hitThisTurn: false,
      boss: { id: def.id, side: 0, dir: this.rowRng() < 0.5 ? -1 : 1, turnDamage: 0, phase: 1 },
    });
    this.bossActive = true;
    this.events.push({ type: 'boss', name: def.name, tell: core ? CORE_PHASES[1] : def.tell });
  }

  private spawnBossOrb(): void {
    this.rebuildGrid();
    const free = [];
    for (let c = 0; c < COLS; c++) if (!this.grid.has(gridKey(c, 0)) && !this.items.some((i) => i.c === c && i.r === 0)) free.push(c);
    if (free.length) this.items.push({ id: this.nextId++, c: free[Math.floor(this.rowRng() * free.length)], r: 0, kind: 'orb' });
  }

  private bossTurn(): void {
    const b = this.boss;
    if (!b?.boss) return;
    const st = b.boss;
    this.rebuildGrid();
    switch (st.id) {
      case 'brood': {
        for (let i = 0; i < 2; i++) {
          const cell = this.freeAround(b);
          if (cell) this.addBrick(cell[0], cell[1], Math.max(1, Math.round(this.level * 0.8)), 'normal');
        }
        break;
      }
      case 'leviathan': {
        const nc = b.c + st.dir;
        const blocked = nc < 0 || nc + b.w > COLS || [0, 1].some((dr) => {
          const o = this.grid.get(gridKey(st.dir > 0 ? nc + 1 : nc, b.r + dr));
          return o && o !== b;
        });
        if (blocked) st.dir = -st.dir;
        else b.c = nc;
        break;
      }
      case 'glacier':
        st.side = (st.side + 1) % 4;
        break;
      case 'core':
        if (st.phase === 1) st.side = (st.side + 1) % 4;
        if (st.phase === 2) {
          for (let i = 0; i < 3; i++) {
            const cell = this.freeAround(b);
            if (cell) this.addBrick(cell[0], cell[1], Math.max(1, Math.round(brickHp(this.level, CORE) * 0.7 * this.stats.hpMult)), 'normal');
          }
        }
        break;
      case 'anvil':
        if (st.turnDamage > 0 && st.turnDamage < b.maxHp * 0.2 && b.hp < b.maxHp) {
          this.events.push({ type: 'heal', brick: b, amount: b.maxHp - b.hp });
          b.hp = b.maxHp;
        }
        break;
      default:
        break;
    }
    st.turnDamage = 0;
    this.rebuildGrid();
  }

  // ---- balls ----

  private stepBalls(h: number): void {
    const env = this.accel;
    // Sponges burst once their timer runs out, spraying every ball they swallowed.
    for (const sp of this.bricks.filter((b) => b.kind === 'sponge' && (b.timer ?? 0) > 0)) {
      sp.timer! -= h;
      if (sp.timer! <= 0) this.burstSponge(sp);
    }
    const anchors = this.bricks.filter((b) => b.kind === 'anchor');
    for (const ball of [...this.balls]) {
      if (ball.state === 'returned') continue;
      if (ball.state === 'held') {
        if (ball.heldBy === -1) {
          // Stuck to the ceiling after a balloon.
          ball.heldTime -= h;
          if (ball.heldTime <= 0) this.release(ball);
        } else if (!this.bricks.some((b) => b.id === ball.heldBy)) this.release(ball);
        continue;
      }
      if (ball.portalCooldown > 0) ball.portalCooldown -= h;
      let ax = env.ax, ay = env.ay;
      if (ball.heavy) ay += HEAVY_GRAVITY;
      if (ball.floaty) ay -= FLOAT_LIFT;
      if (anchors.length && !this.stats.hazardProof) {
        for (const a of anchors) {
          const dx = cellCenterX(a.c) - ball.x, dy = cellCenterY(a.r) - ball.y;
          const d = Math.hypot(dx, dy);
          if (d < ANCHOR_RANGE && d > 1) {
            const f = ANCHOR_PULL * (1 - d / ANCHOR_RANGE);
            ax += (dx / d) * f;
            ay += (dy / d) * f;
          }
        }
      }
      if (this.stats.gravity || this.stats.magnet) {
        const p = this.physicsPull(ball.x, ball.y);
        ax += p.ax;
        ay += p.ay;
      }
      const accel = ax || ay ? { ax, ay } : env;
      const res = stepBody(ball, h, this.grid, accel, this.stats.wrap, ball.ghostFrom);
      // Done ghosting through a brick once the ball no longer overlaps it.
      if (ball.ghostFrom !== undefined) {
        const g = this.bricks.find((b) => b.id === ball.ghostFrom);
        if (!g || !circleRect(ball.x, ball.y, ball.r, ...brickRect(g))) ball.ghostFrom = undefined;
      }
      if (res?.kind === 'floor') {
        ball.state = 'returned';
        const first = this.landX === null && !ball.copy;
        if (first) {
          // Frostline's black ice: the first ball slides along the floor before stopping.
          const slide = this.gimmick === 'ice' ? Math.sign(ball.vx) * (20 + 70 * this.intensity) : 0;
          this.landX = clampX(ball.x + slide);
        }
        this.events.push({ type: 'land', x: ball.x, first });
        continue;
      }
      if (res?.kind === 'wrap') ball.bonus += 1;
      if (res?.kind === 'wall') this.onWall(ball, res.x, res.y, res.ceiling);
      if (res?.kind === 'brick') this.ballHit(ball, res.brick, res.x, res.y, res.contact);
      if (ball.state === 'flying') this.touchItems(ball);
    }
    // Copies and popped balls that are done are gone.
    this.balls = this.balls.filter((b) => !((b.copy || b.popped) && b.state === 'returned'));
  }

  private onWall(ball: Ball, x: number, y: number, ceiling: boolean): void {
    const s = this.stats;
    ball.wallBounces++;
    // Only bank shots count: a ball must hit a brick before wall bounces build damage.
    if (s.ricochet && !ceiling && ball.struck) ball.bonus += s.ricochet;
    if (s.rubber) this.speedUp(ball, 1 + s.rubber);
    if (this.gimmick === 'ice') {
      const sp = Math.hypot(ball.vx, ball.vy);
      const k = Math.min(ICE_SPEEDUP, (BALL_SPEED * ICE_MAX) / sp);
      if (k > 1) { ball.vx *= k; ball.vy *= k; }
    }
    if (ceiling && ball.floaty) {
      ball.floaty = false;
      ball.state = 'held';
      ball.heldBy = -1;
      ball.heldTime = BALLOON_STICK;
      ball.vx = 0;
      ball.vy = 0;
    }
    if (ceiling && s.lava && !ball.fire) {
      ball.fire = true;
      this.events.push({ type: 'ignite', ballId: ball.id, x, y });
    }
    this.events.push({ type: 'wall', ballId: ball.id, x, y, ceiling });
    if (s.static && this.combatRng() < s.static && this.bricks.length) {
      const target = this.bricks[Math.floor(this.combatRng() * this.bricks.length)];
      const tx = cellCenterX(target.c), ty = cellCenterY(target.r);
      const amount = Math.max(1, Math.round((s.damage + ball.bonus) * s.dmgMult * 2));
      this.events.push({ type: 'zap', x1: x, y1: y, x2: tx, y2: ty });
      this.damage(target, amount, tx, ty, 'chain', null, false);
      if (s.conduct) this.zap(target, 1, tx, ty, Math.max(1, Math.round(amount * 0.8)), s.conduct - 1);
    }
  }

  private release(ball: Ball, sponge?: Brick): void {
    ball.state = 'flying';
    ball.heldBy = 0;
    if (sponge) {
      ball.x = cellCenterX(sponge.c);
      ball.y = cellCenterY(sponge.r) + CELL / 2 + ball.r + 1;
    }
    // Spit out downward-ish in a random direction.
    const a = -(MIN_ANGLE + this.combatRng() * (Math.PI - 2 * MIN_ANGLE));
    const sp = BALL_SPEED * (ball.slow ? 0.5 : 1);
    ball.vx = Math.cos(a) * sp;
    ball.vy = -Math.sin(a) * sp;
  }

  /** A sponge bursts: it's destroyed and every swallowed ball sprays out at once. */
  private burstSponge(sp: Brick): void {
    const held = this.balls.filter((b) => b.state === 'held' && b.heldBy === sp.id);
    const x = cellCenterX(sp.c), y = cellCenterY(sp.r);
    this.events.push({ type: 'burst', x, y, count: held.length });
    this.damage(sp, sp.hp, x, y, 'void', null, false);
    held.forEach((b, i) => {
      b.state = 'flying';
      b.heldBy = 0;
      b.x = x;
      b.y = y + CELL / 2 + b.r + 1;
      const a = -(MIN_ANGLE + ((i + 0.5) / held.length) * (Math.PI - 2 * MIN_ANGLE));
      b.vx = Math.cos(a) * BALL_SPEED;
      b.vy = -Math.sin(a) * BALL_SPEED;
    });
  }

  private touchItems(ball: Ball): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const ix = cellCenterX(it.c), iy = cellCenterY(it.r);
      if ((ball.x - ix) ** 2 + (ball.y - iy) ** 2 >= (ball.r + ITEM_R) ** 2) continue;
      if (it.kind === 'spikes') {
        if (this.stats.hazardProof || ball.copy) continue;
        ball.popped = true;
        ball.state = 'returned';
        this.events.push({ type: 'hazard', kind: 'popper', ballId: ball.id, x: ball.x, y: ball.y });
        return;
      }
      if (it.kind === 'orb') {
        if (ball.copy) continue;
        this.items.splice(i, 1);
        let extra = Math.floor(this.stats.luckyOrbs);
        if (this.combatRng() < this.stats.luckyOrbs % 1) extra++;
        this.pendingBalls += 1 + extra;
        this.events.push({ type: 'orb', x: ix, y: iy, extra: extra > 0 });
      } else if (it.kind === 'laserH' || it.kind === 'laserV') {
        if (ball.lasers.includes(it.id)) continue;
        ball.lasers.push(it.id);
        it.used = true;
        this.fireLaser(it, ix, iy);
      } else if (it.kind === 'portal' && ball.portalCooldown <= 0) {
        const other = this.items.find((o) => o.id === it.link);
        if (!other) continue;
        const ox = cellCenterX(other.c), oy = cellCenterY(other.r);
        this.events.push({ type: 'portal', x1: ix, y1: iy, x2: ox, y2: oy });
        ball.x = ox;
        ball.y = oy;
        ball.portalCooldown = 0.3;
        return;
      }
    }
  }

  private fireLaser(it: Item, x: number, y: number): void {
    const wide = this.stats.wideLaser;
    const kind = it.kind as 'laserH' | 'laserV';
    this.events.push({ type: 'laser', kind, x, y, width: 1 + wide * 2 });
    const hits = this.bricks.filter((b) =>
      kind === 'laserH'
        ? Math.abs(b.r - it.r) <= wide || (b.h > 1 && it.r >= b.r - wide && it.r <= b.r + b.h - 1 + wide)
        : Math.abs(b.c - it.c) <= wide || (b.w > 1 && it.c >= b.c - wide && it.c <= b.c + b.w - 1 + wide),
    );
    for (const b of hits) this.damage(b, this.stats.damage, cellCenterX(b.c), cellCenterY(b.r), 'laser', null, false);
  }

  // ---- damage ----

  private ballHit(ball: Ball, brick: Brick, x: number, y: number, contact: Contact): void {
    const s = this.stats;
    this.hitsThisVolley++;
    ball.struck = true;

    // Hazards act on the ball first.
    if (isHazard(brick.kind) && !s.hazardProof) {
      this.events.push({ type: 'hazard', kind: brick.kind, ballId: ball.id, x, y });
      switch (brick.kind) {
        case 'popper': {
          const pc = brick.c, pr = brick.r;
          this.damage(brick, brick.hp, x, y, 'ball', ball, false);
          ball.popped = true;
          ball.state = 'returned';
          // Leaves spikes for the rest of the turn.
          this.items.push({ id: this.nextId++, c: pc, r: pr, kind: 'spikes', used: true });
          return;
        }
        case 'anchor': ball.heavy = true; break;
        case 'balloon': ball.floaty = true; break;
        case 'shrinker':
          ball.shrunk = true;
          ball.r = BALL_R * 0.6;
          break;
        case 'sponge': {
          // Swallow the ball (and chip the sponge); it bursts SPONGE_HOLD seconds after the first.
          this.damage(brick, this.ballDamage(ball, brick, false), x, y, 'ball', ball, false);
          if (this.bricks.includes(brick)) {
            ball.state = 'held';
            ball.heldBy = brick.id;
            ball.x = cellCenterX(brick.c);
            ball.y = cellCenterY(brick.r);
            if (!brick.timer) brick.timer = SPONGE_HOLD;
          } else bounce(ball, contact);
          return;
        }
        default: break;
      }
    }

    const overcharged = s.overcharge > 0 && this.hitsThisVolley % s.overcharge === 0;
    const critChance = s.critChance + s.critMass * Math.floor(this.ballCount / 10);
    const crit = overcharged || this.combatRng() < critChance;
    let dmg = this.ballDamage(ball, brick, crit);
    // Acid: a share of the brick's remaining HP on top (bosses resist).
    if (s.acid && brick.kind !== 'steel') dmg += Math.round(brick.hp * s.acid * (brick.boss ? 0.25 : 1));
    // Kindling: the brick burns for a share of this hit; Tinderbox doubles fires lit by crits.
    if (s.burn && brick.kind !== 'steel') brick.lit = true;
    if (s.tinder && crit) brick.taken = (brick.taken ?? 0) + dmg; // crits count double toward the fire

    const hitsBefore = this.totals.kills;
    const killed = this.damage(brick, dmg, x, y, 'ball', ball, crit, contact);
    if (killed && s.momentum) ball.bonus += s.momentum * (this.totals.kills - hitsBefore);

    // Smash through kills (Pierce, fireballs) or ghost through anything, instead of bouncing.
    const through = killed && (ball.fire || ball.pierceLeft > 0);
    if (through) {
      if (!ball.fire) ball.pierceLeft--;
    } else if (ball.ghostLeft > 0) {
      ball.ghostLeft--;
      ball.ghostFrom = brick.id;
    } else {
      bounce(ball, contact);
      if (s.rubber) this.speedUp(ball, 1 + s.rubber);
    }

    if (crit) {
      if (s.chain) this.zap(brick, s.chain, x, y, Math.max(1, Math.round(dmg * 0.75)));
      if (s.mitosis && !ball.copy && this.copiesThisVolley < Math.min(MAX_COPIES, s.mitosis * this.ballCount)) {
        this.copiesThisVolley++;
        const a = Math.atan2(-ball.vy, ball.vx) + (this.combatRng() < 0.5 ? 0.45 : -0.45);
        this.spawnBall(ball.x, ball.y, clampTravel(a), ball.index + 1000, true, ball);
        this.events.push({ type: 'split', x: ball.x, y: ball.y });
      }
    }
    if (s.zapChance && this.combatRng() < s.zapChance) this.zap(brick, 1, x, y, Math.max(1, Math.round(dmg / 2)));
    if (s.payload && this.hitsThisVolley % 15 === 0) this.explode(brick.c, brick.r, dmg * 2, x, y);
  }

  private ballDamage(ball: Ball, brick: Brick, crit: boolean): number {
    const s = this.stats;
    let dmg = (s.damage + ball.bonus) * s.dmgMult;
    if (ball.index === 0 && !ball.copy && s.firstBlood > 1) dmg *= s.firstBlood;
    if (ball.fire) dmg *= 2;
    if (ball.golden) dmg *= 2;
    if (ball.shrunk) dmg *= 0.5;
    if (s.lastStand > 1 && brick.r + brick.h - 1 >= ROWS - 3) dmg *= s.lastStand;
    if (s.tinder && brick.burn > 0) dmg *= 1.25;
    if (crit) dmg *= s.critMult;
    return Math.max(1, Math.round(dmg));
  }

  /** Apply damage. Returns true if the brick died. */
  private damage(
    brick: Brick, amount: number, x: number, y: number, source: DamageSource, ball: Ball | null, crit: boolean,
    contact?: Contact,
  ): boolean {
    if (!this.bricks.includes(brick)) return false;
    const s = this.stats;
    // Defences.
    if (brick.kind === 'steel') {
      this.events.push({ type: 'immune', brick, x, y, reason: 'steel' });
      return false;
    }
    // Shielded bricks take a quarter of direct ball damage; indirect damage (explosions, lightning,
    // lasers, splash, fire) ignores shields. Never fully immune, so a walled-in Shielder can't deadlock a run.
    if (source === 'ball' && brick.kind !== 'shielder' && !brick.boss && this.shielded(brick)) {
      amount = Math.max(1, Math.round(amount * SHIELD_FACTOR));
      this.events.push({ type: 'immune', brick, x, y, reason: 'shielded' });
    }
    if (brick.frozen) {
      brick.frozen = false;
      brick.hitThisTurn = true;
      this.events.push({ type: 'immune', brick, x, y, reason: 'ice' });
      return false;
    }
    if (brick.kind === 'armored' && !crit && !s.armorPierce) amount = 1;
    if (brick.boss) {
      if (brick.boss.id === 'lantern' && !(ball && ball.wallBounces > 0)) {
        this.events.push({ type: 'immune', brick, x, y, reason: 'lantern' });
        return false;
      }
      if (brick.boss.id === 'glacier' && contact && sideOf(contact) === brick.boss.side) {
        this.events.push({ type: 'immune', brick, x, y, reason: 'shield' });
        return false;
      }
      if (brick.boss.id === 'core') {
        const st = brick.boss;
        if (st.phase === 1 && contact && (sideOf(contact) === st.side || sideOf(contact) === (st.side + 2) % 4)) {
          this.events.push({ type: 'immune', brick, x, y, reason: 'shield' });
          return false;
        }
        if (st.phase === 3) amount = Math.round(amount * 1.5);
      }
    }

    const dealt = Math.min(amount, brick.hp);
    brick.hp -= amount;
    if (brick.boss?.id === 'core' && brick.hp > 0) {
      const phase = brick.hp <= brick.maxHp / 3 ? 3 : brick.hp <= (brick.maxHp * 2) / 3 ? 2 : 1;
      if (phase !== brick.boss.phase) {
        brick.boss.phase = phase;
        this.events.push({ type: 'bossPhase', phase, text: CORE_PHASES[phase] });
      }
    }
    brick.hitThisTurn = true;
    if (brick.boss) brick.boss.turnDamage += dealt;
    if (source !== 'burn') brick.taken = (brick.taken ?? 0) + dealt;
    this.totals.damage += dealt;
    // Finishers.
    if (brick.hp > 0 && brick.kind !== 'boss') {
      const frac = brick.hp / brick.maxHp;
      if ((s.mercy && frac < s.mercy) || (s.executioner && crit && frac < 0.35)) brick.hp = 0;
    }
    const killed = brick.hp <= 0;
    if (killed) {
      this.removeBrick(brick);
      this.totals.kills++;
      this.killsThisVolley++;
      this.totals.bestCombo = Math.max(this.totals.bestCombo, this.killsThisVolley);
      if (brick.kind === 'boss') {
        this.totals.bosses++;
        if (brick.boss?.id === 'core') this.events.push({ type: 'win' });
        else this.events.push({ type: 'bossDown', name: bossFor(this.biome).name });
      }
    }
    this.events.push({ type: 'hit', ballId: ball?.id ?? -1, brick, x, y, damage: amount, killed, crit, source });
    if (!killed) return false;

    // On-death effects.
    const cx = cellCenterX(brick.c), cy = cellCenterY(brick.r);
    if (brick.kind === 'loot') {
      this.claimLoot(brick, cx, cy);
      return true;
    }
    if (brick.bloom) {
      this.pendingBalls++;
      this.events.push({ type: 'orb', x: cx, y: cy, extra: false });
    }
    if (brick.kind === 'bomb') this.explode(brick.c, brick.r, Math.max(this.level, s.damage * 3), cx, cy);
    else if (source === 'bomb' && s.chainReaction) this.explode(brick.c, brick.r, amount * 0.8, cx, cy);
    else if (s.detonate && source !== 'bomb' && source !== 'void' && this.combatRng() < s.detonate) this.explode(brick.c, brick.r, amount, cx, cy);
    if (brick.kind === 'splitter') {
      for (let i = 0; i < 2; i++) {
        const cell = this.freeNeighbour(brick.c, brick.r);
        if (cell) this.addBrick(cell[0], cell[1], Math.max(1, Math.ceil(brick.maxHp / 3)), 'normal');
      }
    }
    if (s.afterburn && brick.burn > 0) {
      for (const [dc, dr] of NEIGHBOURS) {
        const n = this.grid.get(gridKey(brick.c + dc, brick.r + dr));
        if (n && n.kind !== 'steel') { n.burn = Math.max(n.burn, brick.burn); n.lit = true; }
      }
    }
    // Bricks that collapse (Singularity, sponges) don't splash or explode for their whole HP.
    if (s.splash > 0 && source !== 'splash' && source !== 'burn' && source !== 'bomb' && source !== 'void') {
      const splash = Math.max(1, Math.round(amount * s.splash));
      for (const [dc, dr] of NEIGHBOURS) {
        const n = this.grid.get(gridKey(brick.c + dc, brick.r + dr));
        if (n) this.damage(n, splash, cellCenterX(n.c), cellCenterY(n.r), 'splash', null, false);
      }
    }
    if (s.bounty && this.combatRng() < s.bounty) {
      this.pendingBalls++;
      this.events.push({ type: 'bounty', x: cx, y: cy });
    }
    return true;
  }

  /** 3×3 blast centred on a cell. */
  private explode(c: number, r: number, amount: number, x: number, y: number): void {
    const dmg = Math.max(1, Math.round(amount * (1 + this.stats.fuse)));
    this.events.push({ type: 'explode', x, y, radius: CELL * 1.5 });
    const hit = new Set<Brick>();
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const n = this.grid.get(gridKey(c + dc, r + dr));
      if (n && !hit.has(n)) hit.add(n);
    }
    for (const n of hit) this.damage(n, dmg, cellCenterX(n.c), cellCenterY(n.r), 'bomb', null, false);
  }

  /** Chain Lightning: hit the nearest other bricks. */
  private zap(from: Brick, count: number, x: number, y: number, amount: number, jumps = this.stats.conduct): void {
    const fx = cellCenterX(from.c), fy = cellCenterY(from.r);
    const targets = this.bricks
      .filter((b) => b !== from && b.kind !== 'steel')
      .map((b) => ({ b, d: (cellCenterX(b.c) - fx) ** 2 + (cellCenterY(b.r) - fy) ** 2 }))
      .sort((a, b) => a.d - b.d || a.b.id - b.b.id)
      .slice(0, count);
    for (const { b } of targets) {
      const tx = cellCenterX(b.c), ty = cellCenterY(b.r);
      this.events.push({ type: 'zap', x1: x, y1: y, x2: tx, y2: ty });
      this.damage(b, amount, tx, ty, 'chain', null, false);
      // Conductor: each zap carries on to one more brick.
      if (jumps > 0) this.zap(b, 1, tx, ty, Math.max(1, Math.round(amount * 0.8)), jumps - 1);
    }
  }

  // ---- board helpers ----

  /** Is this brick next to a living Shielder? */
  shielded(b: Brick): boolean {
    return NEIGHBOURS.some(([dc, dr]) => this.grid.get(gridKey(b.c + dc, b.r + dr))?.kind === 'shielder');
  }

  /** Fuses count down each turn; at zero they lunge two rows (as far as there's room). */
  private fusesTick(): void {
    this.rebuildGrid();
    for (const f of this.bricks.filter((x) => x.kind === 'fuse').sort((a, z) => z.r - a.r)) {
      f.timer = (f.timer ?? 3) - 1;
      if (f.timer > 0) continue;
      f.timer = 3;
      let moved = 0;
      while (moved < 2 && !this.grid.has(gridKey(f.c, f.r + 1)) && f.r + 1 < ROWS + 1) {
        this.grid.delete(gridKey(f.c, f.r));
        f.r++;
        this.grid.set(gridKey(f.c, f.r), f);
        moved++;
      }
      if (moved) this.events.push({ type: 'lunge', brick: f });
    }
  }

  /** The Deep: the tide shifts every brick and pickup one column, more often deeper in the biome. */
  private tide(): void {
    const every = this.intensity < 0.34 ? 4 : this.intensity < 0.67 ? 3 : 2;
    if (this.turn % every !== 0) return;
    const dir = (Math.floor(this.turn / every) % 2) ? 1 : -1;
    this.rebuildGrid();
    const movers = this.bricks.filter((b) => !b.boss).sort((a, z) => (z.c - a.c) * dir);
    for (const b of movers) {
      const nc = b.c + dir;
      if (nc < 0 || nc >= COLS || this.grid.has(gridKey(nc, b.r))) continue;
      this.grid.delete(gridKey(b.c, b.r));
      b.c = nc;
      this.grid.set(gridKey(b.c, b.r), b);
    }
    for (const it of [...this.items].sort((a, z) => (z.c - a.c) * dir)) {
      const nc = it.c + dir;
      if (nc < 0 || nc >= COLS || this.grid.has(gridKey(nc, it.r)) || this.items.some((o) => o !== it && o.c === nc && o.r === it.r)) continue;
      it.c = nc;
    }
    this.events.push({ type: 'tide', dir });
  }

  /** Halfway through a biome: three loot bricks of different genres land in the top row. */
  private spawnLoot(): void {
    const cats = [...LOOT_CATEGORIES];
    for (let i = cats.length - 1; i > 0; i--) {
      const j = Math.floor(this.lootRng() * (i + 1));
      [cats[i], cats[j]] = [cats[j], cats[i]];
    }
    const cols = [1, 3, 5];
    const hp = Math.max(2, Math.round(brickHp(this.level, Math.min(this.biome, CORE)) * 1.2 * this.endlessHpMult));
    cols.forEach((c, i) => {
      const old = this.grid.get(gridKey(c, 0));
      if (old) this.removeBrick(old);
      this.items = this.items.filter((it) => !(it.c === c && it.r === 0));
      const b = this.addBrick(c, 0, hp, 'loot');
      b.loot = cats[i];
    });
    // Keep the orb if it was pushed out.
    if (!this.items.some((it) => it.kind === 'orb' && it.r === 0)) {
      const free = [0, 2, 4, 6].filter((c) => !this.grid.has(gridKey(c, 0)));
      if (free.length) this.items.push({ id: this.nextId++, c: free[0], r: 0, kind: 'orb' });
    }
    this.events.push({ type: 'lootAppear' });
  }

  /** First loot brick broken: grant an upgrade of its genre; the others shatter. */
  private claimLoot(brick: Brick, x: number, y: number): void {
    const id = rollLoot(this.lootRng, this.upgrades, this.biome, brick.loot ?? 'wild', this.locked);
    if (id) this.applyUpgrade(id);
    this.events.push({ type: 'loot', category: brick.loot ?? 'wild', upgrade: id, x, y });
    for (const other of this.bricks.filter((b) => b.kind === 'loot')) {
      this.events.push({ type: 'explode', x: cellCenterX(other.c), y: cellCenterY(other.r), radius: 14 });
      this.removeBrick(other);
    }
  }

  private addBrick(c: number, r: number, hp: number, kind: BrickKind): Brick {
    const b: Brick = { id: this.nextId++, c, r, w: 1, h: 1, hp, maxHp: hp, kind, burn: 0, frozen: false, hitThisTurn: false };
    if (kind === 'fuse') b.timer = 3;
    if (kind === 'thief') b.timer = 2;
    this.bricks.push(b);
    this.grid.set(gridKey(c, r), b);
    this.events.push({ type: 'spawn', c, r });
    return b;
  }

  private cellFree(c: number, r: number): boolean {
    return c >= 0 && c < COLS && r >= 0 && r < ROWS && !this.grid.has(gridKey(c, r)) &&
      !this.items.some((i) => i.c === c && i.r === r);
  }

  private freeNeighbour(c: number, r: number): [number, number] | null {
    const opts = NEIGHBOURS.map(([dc, dr]) => [c + dc, r + dr] as [number, number]).filter(([x, y]) => this.cellFree(x, y));
    return opts.length ? opts[Math.floor(this.combatRng() * opts.length)] : null;
  }

  private freeAround(b: Brick): [number, number] | null {
    const opts: [number, number][] = [];
    for (let r = b.r - 1; r <= b.r + b.h; r++) for (let c = b.c - 1; c <= b.c + b.w; c++) {
      if (r >= b.r && r < b.r + b.h && c >= b.c && c < b.c + b.w) continue;
      if (this.cellFree(c, r) && r < ROWS - 1) opts.push([c, r]);
    }
    return opts.length ? opts[Math.floor(this.combatRng() * opts.length)] : null;
  }

  private removeBrick(brick: Brick): void {
    const i = this.bricks.indexOf(brick);
    if (i >= 0) this.bricks.splice(i, 1);
    for (let dr = 0; dr < brick.h; dr++) for (let dc = 0; dc < brick.w; dc++) {
      const k = gridKey(brick.c + dc, brick.r + dr);
      if (this.grid.get(k) === brick) this.grid.delete(k);
    }
    // Release any ball this sponge was holding.
    if (brick.kind === 'sponge') for (const b of this.balls) if (b.heldBy === brick.id) this.release(b, brick);
  }

  private slideReturned(h: number): void {
    if (this.landX === null) return;
    const k = Math.min(1, h * 12);
    for (const b of this.balls) if (b.state === 'returned') b.x += (this.landX - b.x) * k;
  }

  private spawnRow(): void {
    const s = this.stats;
    const slowHp = s.slowDrop ? 1.8 : 1;
    const row = generateRow(this.rowRng, this.level, {
      biome: Math.min(this.biome, CORE), hpMult: s.hpMult * slowHp * this.endlessHpMult,
      hazardMult: s.hazardMult * endlessHazards(this.biome),
      bombMult: (this.gimmick === 'heat' ? 2.5 : 1) * (1 + s.fuse),
    });
    const frozenChance = this.gimmick === 'ice' ? 0.15 + 0.35 * this.intensity : 0;
    for (const b of row.bricks) {
      const brick = this.addBrick(b.c, 0, b.hp, b.kind);
      if (frozenChance && b.kind !== 'steel' && b.kind !== 'popper' && this.rowRng() < frozenChance) brick.frozen = true;
    }
    this.events = this.events.filter((e) => e.type !== 'spawn' || e.r !== 0);
    let portal: Item | null = null;
    for (const it of row.items) {
      const item: Item = { id: this.nextId++, c: it.c, r: 0, kind: it.kind };
      if (it.kind === 'portal') {
        if (portal) { item.link = portal.id; portal.link = item.id; portal = null; }
        else portal = item;
      }
      this.items.push(item);
    }
    this.rebuildGrid();
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const b of this.bricks) {
      for (let dr = 0; dr < b.h; dr++) for (let dc = 0; dc < b.w; dc++) this.grid.set(gridKey(b.c + dc, b.r + dr), b);
    }
  }

  // ---- save / load ----

  /** Snapshot for autosave. Only valid between turns (aim or pick phase). */
  toSave(): SaveData {
    return {
      v: SAVE_VERSION,
      seed: this.seed,
      classId: this.classId,
      locked: [...this.locked],
      turn: this.turn,
      nextId: this.nextId,
      ballCount: this.ballCount,
      launchX: this.launchX,
      shields: this.shields,
      windUsed: this.windUsed,
      won: this.won,
      biome: this.biome,
      biomeRow: this.biomeRow,
      endlessStart: this.endlessStart,
      bossActive: this.bossActive,
      bricks: this.bricks.map((b) => ({ ...b, boss: b.boss ? { ...b.boss } : undefined })),
      items: this.items.map((i) => ({ ...i })),
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
    this.windUsed = d.windUsed;
    this.won = !!d.won;
    this.biome = d.biome;
    this.biomeRow = d.biomeRow;
    this.endlessStart = d.endlessStart ?? Math.max(0, d.turn - Math.max(0, d.biome - CORE) * 24 - d.biomeRow);
    this.bossActive = d.bossActive;
    const [lootAt, pickAt] = pickPoints(d.biome);
    this.offeredMid = d.biomeRow >= lootAt;
    this.offeredSmall = d.biomeRow >= pickAt;
    this.bricks = d.bricks.map((b) => ({ ...b, boss: b.boss ? { ...b.boss } : undefined }));
    this.items = d.items.map((i) => ({ ...i }));
    this.upgrades = { ...d.upgrades };
    this.stats = this.computeStats();
    this.offer = d.offer;
    this.rowRng.state = d.rng.rows;
    this.lootRng.state = d.rng.loot;
    this.combatRng.state = d.rng.combat;
    this.totals = { ...d.stats };
    this.phase = this.offer ? 'pick' : this.won && this.biome === CORE ? 'won' : 'aim';
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
    this.stats = this.computeStats();
    def.onTake?.(this.runEffects());
  }

  /** Jump to just before the next pick (the halfway point, or the boss). */
  debugSkipToPick(): void {
    if (this.phase !== 'aim') return;
    const [lootAt, pickAt] = pickPoints(this.biome);
    const target = [lootAt - 1, pickAt - 1, biomeLength(this.biome)].find((t) => t > this.biomeRow - 1 && t >= this.biomeRow) ?? biomeLength(this.biome);
    if (target > this.biomeRow) {
      this.turn += target - this.biomeRow;
      this.biomeRow = target;
    }
  }


  /** Jump to the end of a biome so its boss arrives next turn (for testing). */
  debugJumpToBoss(biome = this.biome): void {
    if (this.phase !== 'aim' || this.bossActive) return;
    this.biome = biome;
    this.biomeRow = biomeLength(biome);
    this.offeredMid = true;
    this.offeredSmall = true;
  }

  /** Put a brick of any kind in the top row (for testing). */
  debugPlace(kind: BrickKind, c: number, r = 0, hp = 5): void {
    this.rebuildGrid();
    const old = this.grid.get(gridKey(c, r));
    if (old) this.removeBrick(old);
    this.addBrick(c, r, hp, kind);
  }
}

const NEIGHBOURS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Which side of a brick a contact is on: 0 top, 1 right, 2 bottom, 3 left. */
function sideOf(c: Contact): number {
  if (Math.abs(c.ny) >= Math.abs(c.nx)) return c.ny < 0 ? 0 : 2;
  return c.nx > 0 ? 1 : 3;
}

/** Rows into a biome when the loot bricks land (1/3) and the small card pick comes (2/3). */
export function pickPoints(biome: number): [number, number] {
  const len = biomeLength(biome);
  return [Math.max(1, Math.round(len / 3)), Math.max(2, Math.round((len * 2) / 3))];
}

export function clampAngle(a: number): number {
  return Math.max(MIN_ANGLE, Math.min(Math.PI - MIN_ANGLE, a));
}

/** Keep travel directions from being too flat (any direction, up or down). */
function clampTravel(a: number): number {
  const min = MIN_ANGLE;
  const x = Math.atan2(Math.sin(a), Math.cos(a));
  if (Math.abs(Math.sin(x)) < Math.sin(min)) return (x >= 0 ? 1 : -1) * (Math.abs(x) < Math.PI / 2 ? min : Math.PI - min);
  return x;
}

function clampX(x: number): number {
  return Math.max(BALL_R + 2, Math.min(W - BALL_R - 2, x));
}

/** Exposed for the renderer. */
export const FIELD = { TOP, ROWS };
