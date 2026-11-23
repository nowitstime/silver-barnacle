import { STEP, FLOOR, MIN_ANGLE, ROWS, W, CELL, brickX, brickY, span } from './constants';
import { bounce, stepBody } from './physics';
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

// ---- Bot v3: plays like a strategist ----
// 1. Triage: what must be dealt with first (threats, priority hazards, armored bricks, the boss)?
// 2. Mode: safe when the line is close, greedy when there's room.
// 3. Pockets: enclosed voids worth breaking into, and the cheapest wall brick to open one.
// 4. Corners: fine-tuned angles that deflect the ball sideways down a corridor.
// 5. Top lane: shots that get behind the top row and rain down.
// 6. A dense, cheap laser sweep tags every angle with those features; only a shortlist is simulated.

interface Features { a: number; must: boolean; hits: number; corridor: number; top: number; wall: boolean }

/** Empty cells balls can't reach yet (enclosed by bricks), and the bricks walling them in. */
function pockets(sim: Sim): { cells: number; walls: Set<number> } {
  const cols = 7, empty = (c: number, r: number) => !sim.grid.has(r * 64 + c);
  const open = new Set<number>();
  const stack: [number, number][] = [];
  for (let c = 0; c < cols; c++) if (empty(c, ROWS - 1)) stack.push([c, ROWS - 1]);
  while (stack.length) {
    const [c, r] = stack.pop()!;
    const k = r * 64 + c;
    if (c < 0 || c >= cols || r < 0 || r >= ROWS || open.has(k) || !empty(c, r)) continue;
    open.add(k);
    stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  let cells = 0;
  const walls = new Set<number>();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < cols; c++) {
    if (!empty(c, r) || open.has(r * 64 + c)) continue;
    cells++;
    // Bricks next to this pocket cell that also touch the open area: break one to get in.
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const b = sim.grid.get((r + dr) * 64 + c + dc);
      if (!b || b.kind === 'steel') continue;
      const touchesOpen = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ec, er]) => open.has((b.r + er) * 64 + b.c + ec));
      if (touchesOpen) walls.add(b.id);
    }
  }
  return { cells, walls };
}

/** Bricks to deal with before anything else. */
function mustHandle(sim: Sim): Set<number> {
  const ids = new Set<number>(sim.threats.map((b) => b.id));
  for (const b of sim.bricks) {
    if (b.kind === 'boss' || (PRIORITY.has(b.kind) && b.kind !== 'loot')) ids.add(b.id);
    if (b.kind === 'armored' && b.r + b.h >= ROWS - 4) ids.add(b.id); // armored bricks creeping down
  }
  return ids;
}

/** Cheap laser trace of one angle, tagged with the strategy features. */
function laserFeatures(sim: Sim, a: number, must: Set<number>, walls: Set<number>, topY: number): Features {
  const r = sim.ballRadius;
  const b = { x: sim.launchX, y: FLOOR - r, r, vx: Math.cos(a) * 440, vy: -Math.sin(a) * 440 };
  const f: Features = { a, must: false, hits: 0, corridor: 0, top: 0, wall: false };
  let contacts = 0, horizFrom = -1, struck = false;
  const h = STEP * 2;
  for (let i = 1; i < 1800 && contacts < 7; i++) {
    const res = stepBody(b, h, sim.grid, sim.traceAccel(b.x, b.y), sim.stats.wrap);
    if (struck && b.y < topY) f.top++;
    if (!res || res.kind === 'wrap') continue;
    if (res.kind === 'floor') break;
    // A sideways run after a corner hit: how far it travels before the next contact.
    if (horizFrom >= 0) { f.corridor += Math.min(6, ((i - horizFrom) * h * 440) / CELL); horizFrom = -1; }
    if (res.kind === 'brick') {
      struck = true;
      f.hits++;
      if (contacts < 3 && must.has(res.brick.id)) f.must = true;
      if (contacts < 2 && walls.has(res.brick.id)) f.wall = true;
      bounce(b, res.contact);
      if (Math.abs(b.vy) < 0.35 * Math.hypot(b.vx, b.vy)) horizFrom = i;
    }
    contacts++;
  }
  return f;
}

const featureScore = (f: Features) => (f.must ? 8 : 0) + f.corridor * 1.5 + Math.min(f.top, 240) / 40 + (f.wall ? 3 : 0) + f.hits * 0.4;

/** v3 board score: v2 plus pockets opened, and safe/greedy weighting. */
function boardScore3(sim: Sim, before: { pocket: number }, safe: boolean): number {
  let s = boardScore2(sim);
  if (sim.phase === 'over') return s;
  s += (before.pocket - pockets(sim).cells) * 40; // opened a void to bounce around in
  if (safe) {
    // Close to the line: weight low bricks even more heavily.
    for (const b of sim.bricks) if (b.kind !== 'steel') s -= b.hp * Math.max(0, b.r + b.h - (ROWS - 4)) * 0.6;
  }
  return s;
}

/**
 * Bot v3. Triage, then a dense laser sweep (every 0.2°) tags each angle with strategy features;
 * a varied shortlist (plus fine-tuned corner shots) is played out in full like v2.
 */
export function strategistAngle(sim: Sim, o: SmartOptions = {}): number {
  const save = sim.toSave();
  const balls = Math.max(1, sim.ballCount);
  const budget = o.budget ?? Math.round(Math.max(10, Math.min(40, 48 / Math.sqrt(balls) + 8)));
  const minAngle = o.minAngle ?? HUMAN_MIN;
  const room = sim.dangerRow - 1 - sim.lowestRow;
  const safe = room <= 2 && sim.shields === 0;
  const danger = sim.lowestRow >= ROWS - 3;
  const must = mustHandle(sim);
  const pk = pockets(sim);
  const topRow = Math.min(...sim.bricks.filter((b) => b.kind !== 'loot').map((b) => b.r), ROWS);
  const topY = brickY(topRow) - 2;

  // Dense laser sweep with features.
  const sweep: Features[] = [];
  for (let a = minAngle; a <= Math.PI - minAngle; a += 0.2 * DEG) sweep.push(laserFeatures(sim, a, must, pk.walls, topY));
  // Triage: if anything must be dealt with and some shot reaches it, consider those first.
  const mustShots = sweep.filter((f) => f.must);
  const pool = mustShots.length ? [...mustShots.sort((x, y) => featureScore(y) - featureScore(x)).slice(0, Math.ceil(budget * 0.6)), ...sweep] : sweep;
  const ranked = mustShots.length ? pool : [...pool].sort((x, y) => featureScore(y) - featureScore(x));
  const angles: number[] = [];
  const add = (a: number) => { if (!angles.some((x) => Math.abs(x - a) < 0.4 * DEG)) angles.push(a); };
  for (let i = 0; i < 6; i++) add(minAngle + ((Math.PI - 2 * minAngle) * (i + 0.5)) / 6);
  for (const f of ranked) { if (angles.length >= budget) break; add(f.a); }
  // Fine-tune the best corridor shots in 0.05° steps for the most sideways deflection.
  for (const f of [...sweep].sort((x, y) => y.corridor - x.corridor).slice(0, 3)) {
    if (f.corridor <= 0) break;
    let best = f;
    for (let d = -0.6; d <= 0.6; d += 0.05) {
      const g = laserFeatures(sim, Math.max(minAngle, Math.min(Math.PI - minAngle, f.a + d * DEG)), must, pk.walls, topY);
      if (g.corridor > best.corridor) best = g;
    }
    angles.push(best.a);
  }

  const play = (a: number, ahead: boolean): number => {
    const copy = new Sim(save.seed, {}, structuredClone(save));
    copy.fire(a);
    finishTurn(copy, 30);
    const s1 = boardScore3(copy, { pocket: pk.cells }, safe);
    if (!ahead || copy.phase !== 'aim') return s1;
    const next = smartAngle(copy, { budget: 8, robust: false, lookahead: false, minAngle });
    const save2 = copy.toSave();
    const c2 = new Sim(save2.seed, {}, structuredClone(save2));
    c2.fire(next);
    finishTurn(c2, 30);
    return 0.4 * s1 + 0.6 * boardScore3(c2, { pocket: pk.cells }, safe);
  };
  const scored = angles.map((a) => ({ a, s: play(a, false) }));
  scored.sort((x, y) => y.s - x.s);
  for (const { a } of scored.slice(0, 3)) {
    for (const d of [-0.3, 0.3, -1, 1]) {
      const b = Math.max(minAngle, Math.min(Math.PI - minAngle, a + d * DEG));
      scored.push({ a: b, s: play(b, false) });
    }
  }
  scored.sort((x, y) => y.s - x.s);
  const top = scored.slice(0, o.robust === false ? 1 : 4);
  if (o.robust === false && !(o.lookahead !== false && danger)) return top[0].a;
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
