import { describe, expect, it } from 'vitest';
import { CELL, ROWS, STEP } from '../src/sim/constants';
import { Sim } from '../src/sim/world';
import type { SimEvent } from '../src/sim/types';

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

describe('volley trigger cards', () => {
  it('Sniper grows when a volley breaks exactly one brick', () => {
    const sim = empty();
    sim.debugGrant('sniper');
    sim.debugPlace('normal', 3, 2, 1);
    const ev = turn(sim);
    expect(sim.growth.sniper).toBe(1);
    expect(ev.some((e) => e.type === 'trigger' && e.id === 'sniper')).toBe(true);
    expect(sim.triggerMult()).toBeCloseTo(1.08);
  });

  it('Wind-Up charges on an empty volley and is spent by a breaking one', () => {
    const sim = empty();
    sim.debugGrant('windup');
    turn(sim, 0.4); // nothing to hit
    expect(sim.growth.charge).toBe(1);
    expect(sim.triggerMult()).toBeCloseTo(2);
    sim.bricks = [];
    sim.debugPlace('normal', Math.floor(sim.launchX / CELL), 2, 1); // straight above the launcher
    turn(sim);
    expect(sim.growth.charge).toBe(0);
  });

  it('Clean Sweep pays out when the board is cleared', () => {
    const sim = empty();
    sim.debugGrant('sweep');
    sim.debugPlace('normal', 3, 2, 1);
    const balls = sim.ballCount;
    turn(sim);
    expect(sim.growth.sweep).toBe(1);
    expect(sim.ballCount).toBe(balls + 3);
  });

  it('Berserker and Composure read the board when you fire', () => {
    const sim = empty();
    sim.debugGrant('berserker');
    sim.debugPlace('normal', 3, 1, 50);
    expect(sim.triggerMult()).toBeCloseTo(0.75);
    sim.debugPlace('normal', 4, ROWS - 2, 50);
    expect(sim.triggerMult()).toBeCloseTo(2);
  });

  it('trigger state survives a save', () => {
    const sim = empty();
    sim.debugGrant('sniper');
    sim.growth.sniper = 5;
    const copy = new Sim(sim.seed, {}, structuredClone(sim.toSave()));
    expect(copy.growth.sniper).toBe(5);
  });
});
