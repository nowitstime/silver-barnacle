import { describe, expect, it } from 'vitest';
import { STEP, ROWS } from '../src/sim/constants';
import { CORE, ENDLESS_START, biomeLength, endlessHp, endlessLap, themeOf } from '../src/sim/run';
import { biomeName } from '../src/render/palette';
import { Sim } from '../src/sim/world';
import type { SimEvent } from '../src/sim/types';

function turn(sim: Sim, angle: number, seen: SimEvent[]) {
  if (sim.phase === 'pick') sim.choose(0);
  if (!sim.fire(angle)) return;
  let guard = 0;
  while (!['aim', 'pick', 'over', 'won'].includes(sim.phase) && guard++ < 240 * 120) {
    sim.tick(STEP);
    seen.push(...sim.drainEvents());
  }
}

describe('run shape', () => {
  it('maps biome numbers to themes, laps and names', () => {
    expect(themeOf(4)).toBe(4);
    expect(themeOf(CORE)).toBe(CORE);
    expect(themeOf(ENDLESS_START)).toBe(0);
    expect(themeOf(ENDLESS_START + 6)).toBe(1);
    expect(endlessLap(4)).toBe(0);
    expect(endlessLap(ENDLESS_START)).toBe(1);
    expect(endlessLap(ENDLESS_START + 5)).toBe(2);
    expect(biomeLength(CORE)).toBe(0);
    expect(endlessHp(48)).toBeCloseTo(1.45 ** 2);
    expect(endlessHp(0)).toBe(1);
    expect(biomeName(CORE)).toBe('The Core');
    expect(biomeName(ENDLESS_START + 1)).toBe('Caverns II');
  });
});

describe('The Core', () => {
  it('spawns a 3×3 final boss that goes through 3 phases, then the run is won and can go endless', () => {
    const sim = new Sim(21);
    sim.debugAddBalls(80);
    for (let i = 0; i < 40; i++) sim.debugGrant('heavy');
    sim.debugGrant('skin'); sim.debugGrant('skin'); sim.debugGrant('skin');
    sim.debugJumpToBoss(CORE);
    const seen: SimEvent[] = [];
    let guard = 0;
    while (sim.phase !== 'won' && sim.phase !== 'over' && guard++ < 80) turn(sim, 0.5 + (guard % 9) * 0.25, seen);
    const boss = seen.find((e) => e.type === 'boss');
    expect(boss && boss.type === 'boss' && boss.name).toBe('The Core');
    const phases = seen.filter((e) => e.type === 'bossPhase').map((e) => (e.type === 'bossPhase' ? e.phase : 0));
    expect(phases).toContain(2);
    expect(phases).toContain(3);
    expect(seen.some((e) => e.type === 'win')).toBe(true);
    expect(sim.phase).toBe('won');
    expect(sim.won).toBe(true);

    // Saving at the win screen restores to it.
    const save = JSON.parse(JSON.stringify(sim.toSave()));
    expect(new Sim(save.seed, {}, save).phase).toBe('won');

    expect(sim.continueEndless()).toBe(true);
    expect(sim.biome).toBe(ENDLESS_START);
    expect(['pick', 'aim']).toContain(sim.phase);
    if (sim.phase === 'pick') sim.choose(0);
    expect(sim.phase).toBe('aim');
    turn(sim, 1.2, seen);
    expect(sim.phase).not.toBe('won');
    expect(sim.lowestRow).toBeLessThan(ROWS);
  });
});
