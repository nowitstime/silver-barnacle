import { describe, expect, it } from 'vitest';
import { BALL_R, ROWS, STEP } from '../src/sim/constants';
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
  it('a Shielder makes its neighbours immune until it breaks', () => {
    const sim = empty(2);
    sim.debugPlace('shielder', 0, 4, 999);
    sim.debugPlace('normal', 3, 4, 50);
    sim.debugPlace('shielder', 3, 3, 999);
    const events = turn(sim);
    const shieldedHits = events.filter((e) => e.type === 'immune' && e.reason === 'shield');
    expect(shieldedHits.length).toBeGreaterThan(0);
    expect(sim.bricks.find((b) => b.kind === 'normal')!.hp).toBe(50);
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
