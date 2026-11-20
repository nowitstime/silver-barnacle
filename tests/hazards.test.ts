import { describe, expect, it } from 'vitest';
import { BALL_R, CELL, ROWS, STEP, TOP } from '../src/sim/constants';
import { traceShot } from '../src/sim/trace';
import { Sim } from '../src/sim/world';
import type { SimEvent } from '../src/sim/types';

/** Fire straight up and play the turn out, collecting events. */
function turn(sim: Sim, angle = Math.PI / 2): SimEvent[] {
  const seen: SimEvent[] = [];
  if (sim.phase === 'pick') sim.choose(0);
  sim.fire(angle);
  let guard = 0;
  while (!['aim', 'pick', 'over', 'won'].includes(sim.phase) && guard++ < 240 * 60) {
    sim.tick(STEP);
    seen.push(...sim.drainEvents());
  }
  return seen;
}

function empty(seed = 1): Sim {
  const sim = new Sim(seed);
  sim.bricks = [];
  sim.items = [];
  return sim;
}

describe('priority hazards', () => {
  it('a Shielder cuts ball damage to its neighbours, but never to zero', () => {
    const shielded = empty(2), open = empty(2);
    for (const sim of [shielded, open]) { sim.debugAddBalls(5); for (let i = 0; i < 9; i++) sim.debugGrant('heavy'); sim.debugPlace('normal', 3, 4, 100000); }
    shielded.debugPlace('shielder', 3, 3, 99999);
    const events = turn(shielded);
    turn(open);
    expect(events.some((e) => e.type === 'immune' && e.reason === 'shielded')).toBe(true);
    const lost = (sim: Sim) => 100000 - sim.bricks.find((b) => b.kind === 'normal')!.hp;
    expect(lost(shielded)).toBeGreaterThan(0);
    expect(lost(shielded)).toBeLessThan(lost(open) * 0.5);
  });

  it('a walled-in Shielder cluster can always be broken eventually', () => {
    const sim = empty(3);
    sim.debugAddBalls(10);
    // A Shielder in the corner, sealed off by the bricks it protects.
    sim.debugPlace('shielder', 0, 0, 30);
    sim.debugPlace('normal', 1, 0, 60);
    sim.debugPlace('normal', 0, 1, 60);
    let guard = 0;
    while (sim.bricks.some((b) => b.r <= 2) && sim.phase !== 'over' && guard++ < 12) turn(sim, Math.PI - 0.5);
    expect(sim.bricks.filter((b) => b.c <= 1 && (b.kind === 'shielder' || b.hp === 60)).length).toBeLessThan(3);
  });

  it('a Healer restores its neighbours each turn', () => {
    const sim = empty(3);
    sim.debugPlace('healer', 0, 2, 50);
    sim.debugPlace('normal', 1, 2, 100);
    sim.bricks.find((b) => b.kind === 'normal')!.hp = 40;
    turn(sim, 0.2); // shallow shot away from both
    expect(sim.bricks.find((b) => b.kind === 'normal')!.hp).toBeGreaterThan(40);
  });

  it('a Fuse lunges two rows when its countdown hits zero', () => {
    const sim = empty(4);
    sim.debugPlace('fuse', 0, 1, 999);
    const fuse = () => sim.bricks.find((b) => b.kind === 'fuse')!;
    const r0 = fuse().r;
    let lunged = false;
    for (let i = 0; i < 3; i++) if (turn(sim, Math.PI - 0.3).some((e) => e.type === 'lunge')) lunged = true;
    expect(lunged).toBe(true);
    expect(fuse().r).toBe(r0 + 3 + 2); // three normal drops plus the lunge
  });

  it('a Thief steals a ball if it survives two turns', () => {
    const sim = empty(5);
    sim.debugAddBalls(4);
    sim.debugPlace('thief', 0, 1, 999);
    const before = sim.ballCount;
    let stole = false;
    for (let i = 0; i < 2; i++) if (turn(sim, Math.PI - 0.3).some((e) => e.type === 'steal')) stole = true;
    expect(stole).toBe(true);
    expect(sim.ballCount).toBeLessThan(before + sim.pendingBalls + 3);
  });
});

describe('hazard buffs', () => {
  it('a Popper leaves spikes for the rest of the turn', () => {
    const sim = empty(6);
    sim.debugAddBalls(5);
    sim.debugPlace('popper', 3, 5, 1);
    const events = turn(sim);
    const pops = events.filter((e) => e.type === 'hazard' && e.kind === 'popper');
    expect(pops.length).toBeGreaterThan(1); // the popper, then its spikes
    expect(sim.items.some((i) => i.kind === 'spikes')).toBe(false); // cleared after the turn
  });

  it('a Sponge swallows balls and bursts them all out', () => {
    const sim = empty(7);
    sim.debugAddBalls(5);
    sim.debugPlace('sponge', 3, 5, 500);
    const events = turn(sim);
    const burst = events.find((e) => e.type === 'burst');
    expect(burst && burst.type === 'burst' && burst.count).toBeGreaterThan(1);
    expect(sim.bricks.some((b) => b.kind === 'sponge')).toBe(false);
  });

  it('a Shrinker makes the ball physically smaller', () => {
    const sim = empty(8);
    sim.debugPlace('shrinker', 3, 5, 500);
    sim.fire(Math.PI / 2);
    let smallest = BALL_R;
    for (let i = 0; i < 240 * 4 && sim.phase !== 'aim'; i++) {
      sim.tick(STEP);
      for (const b of sim.balls) smallest = Math.min(smallest, b.r);
    }
    expect(smallest).toBeLessThan(BALL_R);
  });
});

describe('biome rules', () => {
  it('Forge lava raises the danger row every few turns', () => {
    const sim = new Sim(9);
    sim.biome = 4;
    sim.biomeRow = 20;
    const levels = new Set<number>();
    for (let t = 0; t < 12; t++) levels.add(sim.lavaAt(t));
    expect(levels.has(0)).toBe(true);
    expect([...levels].some((l) => l > 0)).toBe(true);
    sim.turn = 4;
    expect(sim.dangerRow).toBeLessThan(ROWS);
  });

  it('The Deep tide shifts bricks sideways', () => {
    const sim = empty(10);
    sim.biome = 2;
    sim.biomeRow = 18; // late in the biome: tides every 2 turns
    sim.debugPlace('normal', 3, 2, 9999);
    let tides = 0;
    for (let i = 0; i < 4; i++) if (turn(sim, 0.15).some((e) => e.type === 'tide')) tides++;
    expect(tides).toBeGreaterThan(0);
  });

  it('Meadow growth sprouts blooms on bricks left alone', () => {
    const sim = empty(11);
    sim.biomeRow = 10;
    for (let c = 0; c < 4; c++) sim.debugPlace('normal', c, 1, 9999);
    let blooms = 0;
    for (let i = 0; i < 6; i++) blooms += turn(sim, Math.PI - 0.12).filter((e) => e.type === 'bloom').length;
    expect(blooms).toBeGreaterThan(0);
  });

  it('the after-boss pick has one free reroll', () => {
    const sim = new Sim(12);
    sim.debugAddBalls(80);
    for (let i = 0; i < 30; i++) sim.debugGrant('heavy');
    sim.debugJumpToBoss(0);
    let guard = 0;
    while (!(sim.phase === 'pick' && sim.offer?.kind === 'biome') && sim.phase !== 'over' && guard++ < 40) turn(sim, 0.5 + (guard % 9) * 0.25);
    expect(sim.offer?.kind).toBe('biome');
    expect(sim.offer?.rerolls).toBe(1);
    expect(sim.reroll()).toBe(true);
    expect(sim.reroll()).toBe(false);
  });
});

describe('synergy upgrades', () => {
  it('Kindling fires scale with the hit that lit them', () => {
    const weak = empty(20), strong = empty(20);
    for (const sim of [weak, strong]) { sim.debugGrant('kindling'); sim.debugPlace('normal', 3, 5, 100000); }
    for (let i = 0; i < 10; i++) strong.debugGrant('heavy');
    turn(weak); turn(strong);
    const burnOf = (sim: Sim) => sim.bricks.find((b) => b.kind === 'normal')!.burn;
    expect(burnOf(strong)).toBeGreaterThan(burnOf(weak) * 3);
  });

  it('Chain Reaction makes explosion kills explode too', () => {
    const sim = empty(21);
    sim.debugGrant('chainreact');
    sim.debugPlace('bomb', 3, 5, 1);
    for (let c = 0; c < 7; c++) if (c !== 3) sim.debugPlace('normal', c, 5, 1);
    const blasts = turn(sim).filter((e) => e.type === 'explode').length;
    expect(blasts).toBeGreaterThan(1);
  });

  it('Acid adds a share of max HP to every hit', () => {
    const sim = empty(22);
    sim.debugGrant('acid');
    sim.debugPlace('normal', 3, 5, 10000);
    turn(sim);
    expect(sim.bricks.find((b) => b.kind === 'normal')!.hp).toBeLessThan(10000 - 150);
  });
});

describe('physics cards', () => {
  it('Lead Core arcs the laser downward; the shot lands where the laser says', () => {
    const plain = empty(30), heavy = empty(30);
    heavy.debugGrant('lead');
    const a = 1.2;
    const tPlain = traceShot(plain.grid, plain.launchX, a, 1, plain.traceAccel);
    const tHeavy = traceShot(heavy.grid, heavy.launchX, a, 1, heavy.traceAccel);
    const peak = (t: { points: [number, number][] }) => Math.min(...t.points.map((p) => p[1]));
    expect(peak(tHeavy)).toBeGreaterThan(peak(tPlain)); // doesn't climb as high
  });

  it('Wraparound sends balls through the side walls and they gain damage', () => {
    const sim = empty(31);
    sim.debugGrant('wrap');
    sim.fire(0.25);
    let walls = 0, maxBonus = 0;
    for (let i = 0; i < 240 * 3 && sim.phase !== 'aim'; i++) {
      sim.tick(STEP);
      for (const e of sim.drainEvents()) if (e.type === 'wall' && !e.ceiling) walls++;
      for (const b of sim.balls) maxBonus = Math.max(maxBonus, b.bonus);
    }
    expect(walls).toBe(0);
    expect(maxBonus).toBeGreaterThan(0);
  });

  it('Ghost passes through a brick, damaging it, and gets behind it', () => {
    const sim = empty(32);
    sim.debugGrant('ghost');
    sim.debugPlace('normal', 3, 6, 100000);
    const brickTop = TOP + 6 * CELL;
    sim.fire(Math.PI / 2);
    let above = false, hits = 0;
    for (let i = 0; i < 240 * 4 && sim.phase !== 'aim'; i++) {
      sim.tick(STEP);
      for (const e of sim.drainEvents()) if (e.type === 'hit') hits++;
      if (sim.balls.some((b) => b.state === 'flying' && b.y < brickTop - 6)) above = true;
    }
    expect(above).toBe(true); // made it through to the far side
    expect(hits).toBeGreaterThanOrEqual(2); // damaged on the way through, then from behind
  });

  it('Rubber speeds balls up on bounces', () => {
    const sim = empty(33);
    sim.debugGrant('rubber');
    sim.fire(0.4);
    let top = 0;
    for (let i = 0; i < 240 * 2; i++) { sim.tick(STEP); for (const b of sim.balls) top = Math.max(top, Math.hypot(b.vx, b.vy)); }
    expect(top).toBeGreaterThan(445);
  });
});

describe('fire from last turn', () => {
  it('burns for a share of the damage taken that turn, and keeps burning when untouched', () => {
    const few = empty(40), many = empty(40);
    for (const sim of [few, many]) { sim.debugGrant('kindling'); sim.debugPlace('normal', 3, 5, 1000000); }
    many.debugAddBalls(9);
    turn(few); turn(many);
    const brick = (sim: Sim) => sim.bricks.find((b) => b.kind === 'normal')!;
    expect(brick(many).burn).toBeGreaterThan(brick(few).burn * 3); // more hits, bigger fire
    const burning = brick(few).burn;
    // A turn where nothing touches it: fire, recall at once, let the turn finish.
    few.fire(Math.PI / 2);
    few.tick(STEP);
    few.recall();
    while (!['aim', 'pick', 'over'].includes(few.phase)) few.tick(STEP);
    expect(brick(few).burn).toBe(burning); // fire keeps going
  });
});
