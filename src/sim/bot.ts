import { STEP, FLOOR, MIN_ANGLE, ROWS, W, brickX, brickY, span } from './constants';
import { Sim } from './world';

/** Play a single turn to completion (until the next aim, pick or game over). */
export function finishTurn(sim: Sim, maxSeconds = 120): void {
  let guard = 0;
  const max = maxSeconds / STEP;
  while (!['aim', 'pick', 'over'].includes(sim.phase) && guard++ < max) sim.tick(STEP);
  if (guard >= max) sim.recall();
}

/** Score the board after a turn: lower and tougher is worse. */
function boardScore(sim: Sim): number {
  let danger = 0;
  for (const b of sim.bricks) if (b.kind !== 'steel') danger += b.hp * (1 + (b.r + b.h) ** 2 * 0.15);
  const upgrades = Object.values(sim.upgrades).reduce((a, n) => a + n, 0);
  // Upgrades are worth a lot: this makes the bot go for loot bricks like a player would.
  return -danger + sim.ballCount * 20 + sim.pendingBalls * 20 + upgrades * 400 - (sim.phase === 'over' ? 1e9 : 0);
}

/**
 * Pick the best of `n` evenly spread angles by simulating each on a copy of the game.
 * Only valid in the aim phase.
 */
export function bestAngle(sim: Sim, n = 12): number {
  const save = sim.toSave();
  let best = Math.PI / 2, bestScore = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = MIN_ANGLE + ((Math.PI - 2 * MIN_ANGLE) * (i + 0.5)) / n;
    const copy = new Sim(save.seed, {}, structuredClone(save));
    copy.fire(a);
    finishTurn(copy, 30);
    const score = boardScore(copy);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

/** Cheap aim for the title-screen demo: at a random brick, with a little wobble. */
export function demoAngle(sim: Sim, rnd: () => number): number {
  const targets = sim.bricks.filter((b) => b.kind !== 'steel');
  if (!targets.length) return MIN_ANGLE + rnd() * (Math.PI - 2 * MIN_ANGLE);
  const t = targets[Math.floor(rnd() * targets.length)];
  const tx = brickX(t.c) + span(t.w) / 2, ty = brickY(t.r) + span(t.h) / 2;
  const a = Math.atan2(FLOOR - ty, tx - sim.launchX) + (rnd() - 0.5) * 0.3;
  return Math.max(MIN_ANGLE, Math.min(Math.PI - MIN_ANGLE, a));
}

// ---- Bot v2: aims like a person ----

const DEG = Math.PI / 180;
/** Shallowest angle a player can aim (matches the aim controls). */
const HUMAN_MIN = 10 * DEG;
/** Hazards worth taking out first. */
const PRIORITY = new Set(['shielder', 'healer', 'thief', 'fuse', 'spawner', 'sprinter', 'loot']);

export interface SmartOptions {
  /** Most candidate shots to simulate this turn (before refining). Default scales with ball count. */
  budget?: number;
  /** Prefer shots that still work if you're off by ±0.25° (a person can't aim to 0.01°). Default true. */
  robust?: boolean;
  /** Shallowest angle allowed (radians). Default 10°, like the aim controls. */
  minAngle?: number;
  /** Look a second turn ahead when a brick is close to the line. Default true. */
  lookahead?: boolean;
}

/** Score a finished turn v2: v1's board score plus threats, hazards and Big Ball growth. */
function boardScore2(sim: Sim): number {
  if (sim.phase === 'over') return -1e9;
  let score = boardScore(sim);
  // Bricks that will end the run on the next drop: deadly unless a shield saves you.
  const threats = sim.threats.length;
  if (threats) score -= (sim.shields > 0 || (sim.stats.secondWind && !sim.windUsed) ? 1500 : 20000) * threats;
  for (const b of sim.bricks) if (PRIORITY.has(b.kind) && b.kind !== 'loot') score -= 250;
  score += (sim.growth.big ?? 0) * 20;
  return score;
}

/** Where each candidate shot is aimed: brick corners, gaps, bank shots off the walls, priority targets. */
function candidateAngles(sim: Sim, budget: number, minAngle: number): number[] {
  const r = sim.ballRadius, lx = sim.launchX, ly = FLOOR - r;
  const clamp = (a: number) => Math.max(minAngle, Math.min(Math.PI - minAngle, a));
  const at = (x: number, y: number) => (y < ly - 2 ? clamp(Math.atan2(ly - y, x - lx)) : null);
  const targets: { x: number; y: number; p: number }[] = [];
  const free = (c: number, row: number) => c >= 0 && c < 7 && row >= 0 && !sim.grid.has(row * 64 + c);
  for (const b of sim.bricks) {
    if (b.kind === 'steel') continue;
    const x0 = brickX(b.c), y0 = brickY(b.r), w = span(b.w), h = span(b.h);
    const low = b.r + b.h; // lower bricks matter more
    const pri = (PRIORITY.has(b.kind) || b.boss ? 3 : 0) + (sim.threats.includes(b) ? 6 : 0) + low * 0.3;
    targets.push({ x: x0 + w / 2, y: y0 + h / 2, p: pri + 1 });
    // Corners: clip one to send the ball sideways down a corridor (an open cell beside the brick).
    const corridorL = free(b.c - 1, b.r), corridorR = free(b.c + b.w, b.r);
    targets.push({ x: x0 - r * 0.6, y: y0 + h, p: pri + (corridorL ? 1.5 : 0.5) });
    targets.push({ x: x0 + w + r * 0.6, y: y0 + h, p: pri + (corridorR ? 1.5 : 0.5) });
    // Gaps: straight up an open column next to the brick to get behind the wall.
    if (free(b.c - 1, b.r + b.h - 1)) targets.push({ x: x0 - 4 - r, y: y0, p: pri + 0.8 });
    if (free(b.c + b.w, b.r + b.h - 1)) targets.push({ x: x0 + w + 4 + r, y: y0, p: pri + 0.8 });
  }
  targets.sort((a, b) => b.p - a.p);
  const angles: number[] = [];
  const add = (a: number | null) => {
    if (a === null || angles.some((x) => Math.abs(x - a) < 0.12 * DEG)) return;
    angles.push(a);
  };
  // A coarse sweep so open boards and odd spots are never missed.
  for (let i = 0; i < 8; i++) add(minAngle + ((Math.PI - 2 * minAngle) * (i + 0.5)) / 8);
  for (const t of targets) {
    if (angles.length >= budget) break;
    add(at(t.x, t.y));
    // Bank shot: aim at the target's mirror image behind a side wall.
    if (t.p >= 3 && angles.length < budget) {
      add(at(2 * r - t.x, t.y));
      add(at(2 * (W - r) - t.x, t.y));
    }
  }
  return angles;
}

/**
 * Bot v2. Builds candidate shots from the board (corners, gaps, bank shots, priority targets),
 * plays each out on a copy, refines around the best few, and prefers shots that still work
 * a quarter-degree either side. Looks one more turn ahead when the board is dangerous.
 */
export function smartAngle(sim: Sim, o: SmartOptions = {}): number {
  const save = sim.toSave();
  const balls = Math.max(1, sim.ballCount);
  const budget = o.budget ?? Math.round(Math.max(10, Math.min(40, 48 / Math.sqrt(balls) + 8)));
  const minAngle = o.minAngle ?? HUMAN_MIN;
  const danger = sim.lowestRow >= ROWS - 3;
  const play = (a: number, ahead: boolean): number => {
    const copy = new Sim(save.seed, {}, structuredClone(save));
    copy.fire(a);
    finishTurn(copy, 30);
    if (!ahead || copy.phase !== 'aim') return boardScore2(copy);
    // One more turn with a quick sweep: does this shot leave a board we can survive?
    const next = smartAngle(copy, { budget: 8, robust: false, lookahead: false, minAngle });
    const save2 = copy.toSave();
    const c2 = new Sim(save2.seed, {}, structuredClone(save2));
    c2.fire(next);
    finishTurn(c2, 30);
    return 0.4 * boardScore2(copy) + 0.6 * boardScore2(c2);
  };
  const scored = candidateAngles(sim, budget, minAngle).map((a) => ({ a, s: play(a, false) }));
  scored.sort((x, y) => y.s - x.s);
  // Refine around the best three.
  for (const { a } of scored.slice(0, 3)) {
    for (const d of [-0.6, 0.6, -1.5, 1.5]) {
      const b = Math.max(minAngle, Math.min(Math.PI - minAngle, a + d * DEG));
      scored.push({ a: b, s: play(b, false) });
    }
  }
  scored.sort((x, y) => y.s - x.s);
  const top = scored.slice(0, o.robust === false ? 1 : 4);
  if (o.robust === false && !(o.lookahead !== false && danger)) return top[0].a;
  // Precision check (a person is off by a little) and, when dangerous, a turn of look-ahead.
  let best = top[0].a, bestScore = -Infinity;
  for (const { a, s } of top) {
    let v = s;
    if (o.robust !== false) {
      const lo = play(Math.max(minAngle, a - 0.25 * DEG), false), hi = play(Math.min(Math.PI - minAngle, a + 0.25 * DEG), false);
      v = 0.5 * s + 0.25 * lo + 0.25 * hi;
    }
    if (o.lookahead !== false && danger) v = 0.5 * v + 0.5 * play(a, true);
    if (v > bestScore) { bestScore = v; best = a; }
  }
  return best;
}
