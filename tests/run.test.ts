import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import { UPGRADES, computeStats, rollOffer, baseStats } from '../src/content/upgrades';
import { BIOME_ROWS, biomeAt, pickAfter } from '../src/sim/run';
import { ROWS, STEP } from '../src/sim/constants';
import { Sim } from '../src/sim/world';

function finishTurn(sim: Sim) {
  let guard = 0;
  while (!['aim', 'pick', 'over'].includes(sim.phase) && guard++ < 240 * 120) sim.tick(STEP);
}

describe('run structure', () => {
  it('biomes follow the 12/16/20/24/28 curve', () => {
    expect(biomeAt(0)).toEqual({ index: 0, start: 0, length: 12 });
    expect(biomeAt(11).index).toBe(0);
    expect(biomeAt(12)).toEqual({ index: 1, start: 12, length: 16 });
    const total = BIOME_ROWS.reduce((a, b) => a + b, 0);
    expect(biomeAt(total - 1).index).toBe(4);
    expect(biomeAt(total).index).toBe(5);
  });

  it('offers a small pick halfway and a big pick at the end of each biome', () => {
    expect(pickAfter(6)).toBe('mid');
    expect(pickAfter(12)).toBe('biome');
    expect(pickAfter(12 + 8)).toBe('mid');
    expect(pickAfter(28)).toBe('biome');
    expect(pickAfter(5)).toBeNull();
    let picks = 0;
    for (let t = 1; t <= 100; t++) if (pickAfter(t)) picks++;
    expect(picks).toBe(10);
  });
});

describe('upgrades', () => {
  it('have unique ids and readable descriptions', () => {
    const ids = new Set(UPGRADES.map((u) => u.id));
    expect(ids.size).toBe(UPGRADES.length);
    for (const u of UPGRADES) {
      expect(u.desc(0).length).toBeGreaterThan(5);
      expect(u.max).toBeGreaterThan(0);
    }
  });

  it('stack into stats', () => {
    const s = computeStats({ heavy: 2, sharp: 1, brutal: 2, first: 1 });
    const b = baseStats();
    expect(s.damage).toBe(b.damage + 2);
    expect(s.critChance).toBeCloseTo(b.critChance + 0.08);
    expect(s.critMult).toBe(b.critMult + 1);
    expect(s.firstBlood).toBe(5);
  });

  it('offers are distinct, respect max stacks, and biome picks skip commons', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const offer = rollOffer(rng, { lava: 1 }, i % 5, 'biome');
      expect(new Set(offer).size).toBe(offer.length);
      expect(offer).not.toContain('lava');
      for (const id of offer) expect(UPGRADES.find((u) => u.id === id)!.rarity).not.toBe('common');
    }
  });
});

describe('sim run flow', () => {
  it('stops for a pick halfway through biome 1 and applies the choice', () => {
    const sim = new Sim(4);
    sim.debugAddBalls(40);
    let guard = 0;
    while (sim.phase !== 'pick' && sim.phase !== 'over' && guard++ < 20) {
      sim.fire(Math.PI / 2 - 0.3 + (guard % 3) * 0.3);
      finishTurn(sim);
    }
    expect(sim.phase).toBe('pick');
    expect(sim.turn).toBe(6);
    expect(sim.offer!.ids.length).toBe(3);
    const id = sim.offer!.ids[0];
    expect(sim.choose(0)).toBe(true);
    expect(sim.upgrades[id]).toBe(1);
    expect(sim.phase).toBe('aim');
  });

  it('a shield saves the run once', () => {
    const sim = new Sim(8);
    sim.debugGrant('skin');
    expect(sim.shields).toBe(1);
    let shieldUsed = false, guard = 0;
    while (sim.phase !== 'over' && guard++ < 300) {
      if (sim.phase === 'pick') sim.choose(0);
      sim.fire(Math.PI / 2);
      while (!['aim', 'pick', 'over'].includes(sim.phase)) {
        sim.tick(STEP);
        for (const e of sim.drainEvents()) if (e.type === 'shield') shieldUsed = true;
      }
      if (shieldUsed) break;
    }
    expect(shieldUsed).toBe(true);
    expect(sim.shields).toBe(0);
    expect(sim.lowestRow).toBeLessThan(ROWS - 2);
  });

  it('pierce lets a ball smash through bricks it kills', () => {
    const sim = new Sim(3);
    sim.debugGrant('pierce');
    sim.debugGrant('heavy');
    sim.debugGrant('heavy');
    sim.debugGrant('heavy');
    expect(sim.stats.pierce).toBe(1);
    sim.fire(Math.PI / 2);
    finishTurn(sim);
    expect(sim.totals.damage).toBeGreaterThan(0);
  });

  it('save and resume produces the exact same future', () => {
    const play = (sim: Sim, turns: number) => {
      for (let i = 0; i < turns && sim.phase !== 'over'; i++) {
        if (sim.phase === 'pick') sim.choose(i % 3);
        sim.fire(0.5 + (i % 7) * 0.3);
        finishTurn(sim);
      }
    };
    const a = new Sim(77);
    a.debugAddBalls(10);
    play(a, 9);
    const save = JSON.parse(JSON.stringify(a.toSave()));
    expect(Sim.isValidSave(save)).toBe(true);
    const b = new Sim(save.seed, save);
    play(a, 8);
    play(b, 8);
    expect(b.turn).toBe(a.turn);
    expect(b.bricks.map((x) => [x.c, x.r, x.hp])).toEqual(a.bricks.map((x) => [x.c, x.r, x.hp]));
    expect(b.upgrades).toEqual(a.upgrades);
    expect(b.totals).toEqual(a.totals);
  });

  it('rejects saves from other versions', () => {
    expect(Sim.isValidSave({ v: 0 })).toBe(false);
    expect(Sim.isValidSave(null)).toBe(false);
  });
});
