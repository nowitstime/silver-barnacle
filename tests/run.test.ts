import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import { CLASSES } from '../src/content/classes';
import { BRICKS, rollKind } from '../src/content/bricks';
import { UPGRADES, categoryOf, computeStats, rollOffer, baseStats } from '../src/content/upgrades';
import { BIOME_ROWS, biomeLength, gimmickFor } from '../src/sim/run';
import { CELL, FLOOR, ROWS, STEP, TOP } from '../src/sim/constants';
import { Sim, pickPoints } from '../src/sim/world';

/** Play turns aiming straight-ish, taking the first card at every pick. */
function play(sim: Sim, turns: number, onEvent?: (e: ReturnType<Sim['drainEvents']>[number]) => void) {
  for (let i = 0; i < turns && sim.phase !== 'over'; i++) {
    if (sim.phase === 'pick') sim.choose(0);
    sim.fire(0.6 + (i % 7) * 0.3);
    let guard = 0;
    while (!['aim', 'pick', 'over'].includes(sim.phase) && guard++ < 240 * 120) {
      sim.tick(STEP);
      if (onEvent) for (const e of sim.drainEvents()) onEvent(e);
    }
  }
}

describe('run structure', () => {
  it('biomes follow the 12/16/20/24/28 curve, then stay long', () => {
    expect(BIOME_ROWS).toEqual([10, 14, 17, 20, 23]);
    expect(biomeLength(0)).toBe(10);
    expect(biomeLength(7)).toBe(20);
    expect(gimmickFor(0)).toBe('growth');
    expect(gimmickFor(1)).toBe('dark');
    expect(gimmickFor(5)).toBe('none');
  });
});

describe('content', () => {
  it('has 35+ upgrades with unique ids and readable descriptions', () => {
    expect(UPGRADES.length).toBeGreaterThanOrEqual(35);
    const ids = new Set(UPGRADES.map((u) => u.id));
    expect(ids.size).toBe(UPGRADES.length);
    for (const u of UPGRADES) {
      expect(u.desc(0).length).toBeGreaterThan(5);
      expect(u.max).toBeGreaterThan(0);
    }
  });

  it('upgrades stack into stats', () => {
    const s = computeStats({ heavy: 2, sharp: 1, brutal: 2, first: 1, glass: 1 });
    const b = baseStats();
    expect(s.damage).toBe(b.damage + 2);
    expect(s.critChance).toBeCloseTo(b.critChance + 0.08);
    expect(s.critMult).toBe(b.critMult + 1);
    expect(s.firstBlood).toBe(10);
    expect(s.dmgMult).toBe(3);
  });

  it('offers are distinct, respect max stacks, biome picks skip commons, and no cursed cards without Wildcard', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 300; i++) {
      const offer = rollOffer(rng, { lava: 1 }, i % 5, 'biome');
      expect(new Set(offer).size).toBe(offer.length);
      expect(offer).not.toContain('lava');
      for (const id of offer) expect(['common', 'cursed']).not.toContain(UPGRADES.find((u) => u.id === id)!.rarity);
    }
  });

  it('Wildcard offers 4 cards with exactly one cursed', () => {
    const rng = mulberry32(2);
    for (let i = 0; i < 100; i++) {
      const offer = rollOffer(rng, {}, 1, 'mid', true);
      expect(offer).toHaveLength(4);
      expect(offer.filter((id) => UPGRADES.find((u) => u.id === id)!.rarity === 'cursed')).toHaveLength(1);
    }
  });

  it('Glass Cannon blocks shield upgrades', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 200; i++) expect(rollOffer(rng, { glass: 1 }, 0, 'mid')).not.toContain('skin');
  });

  it('special bricks only appear from their depth', () => {
    const rng = mulberry32(4);
    for (let i = 0; i < 2000; i++) {
      const k = rollKind(rng, 3, { hazardMult: 1, bombMult: 1 });
      expect(k).toBe('normal');
    }
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) seen.add(rollKind(rng, 60, { hazardMult: 1, bombMult: 1 }));
    for (const k of Object.keys(BRICKS)) expect(seen.has(k)).toBe(true);
  });

  it('every class starts with its ball count and perk', () => {
    for (const c of CLASSES) {
      const sim = new Sim(1, { classId: c.id });
      expect(sim.ballCount).toBe(c.startBalls);
      expect(sim.classId).toBe(c.id);
    }
    expect(new Sim(1, { classId: 'striker' }).stats.executioner).toBe(true);
    expect(new Sim(1, { classId: 'gambler' }).stats.wildcard).toBe(true);
  });
});

describe('sim run flow', () => {
  it('halfway through biome 1, three loot bricks appear; breaking one grants an upgrade of its genre', () => {
    const sim = new Sim(4);
    sim.debugAddBalls(60);
    for (let i = 0; i < 8; i++) sim.debugGrant('heavy');
    let appeared = false, claimed: { category: string; upgrade: string | null } | null = null;
    let guard = 0;
    while (!claimed && sim.phase !== 'over' && guard++ < 30) {
      if (sim.phase === 'pick') sim.choose(0);
      const loot = sim.bricks.find((b) => b.kind === 'loot');
      const angle = loot ? Math.atan2(FLOOR - (TOP + loot.r * CELL + CELL / 2), loot.c * CELL + CELL / 2 - sim.launchX) : Math.PI / 2;
      sim.fire(angle);
      while (!['aim', 'pick', 'over'].includes(sim.phase)) {
        sim.tick(STEP);
        for (const e of sim.drainEvents()) {
          if (e.type === 'lootAppear') appeared = true;
          if (e.type === 'loot') claimed = { category: e.category, upgrade: e.upgrade };
        }
      }
    }
    expect(appeared).toBe(true);
    expect(claimed).not.toBeNull();
    expect(sim.bricks.some((b) => b.kind === 'loot')).toBe(false); // the others shattered
    const c = claimed!;
    if (c.upgrade) {
      expect(sim.upgrades[c.upgrade]).toBeGreaterThanOrEqual(1);
      if (c.category !== 'wild') expect(categoryOf(c.upgrade)).toBe(c.category);
    }
    expect(sim.offer).toBeNull(); // no menu at the halfway point any more
  });

  it('a mini-boss appears at the end of biome 1, and beating it gives the biome pick', () => {
    const sim = new Sim(6);
    sim.debugAddBalls(60);
    for (let i = 0; i < 12; i++) sim.debugGrant('heavy');
    let bossSeen = false, bossDown = false, biomeEvent = false;
    let guard = 0;
    while (!biomeEvent && sim.phase !== 'over' && guard++ < 60) {
      play(sim, 1, (e) => {
        if (e.type === 'boss') bossSeen = true;
        if (e.type === 'bossDown') bossDown = true;
      });
      if (sim.phase === 'pick' && sim.offer?.kind === 'biome') {
        sim.choose(0);
        for (const e of sim.drainEvents()) if (e.type === 'biome') biomeEvent = true;
      }
    }
    expect(bossSeen).toBe(true);
    expect(bossDown).toBe(true);
    expect(biomeEvent).toBe(true);
    expect(sim.biome).toBe(1);
    expect(sim.gimmick).toBe('dark');
    expect(sim.totals.bosses).toBe(1);
  });

  it('a shield saves the run once', () => {
    const sim = new Sim(8);
    sim.debugGrant('skin');
    expect(sim.shields).toBe(1);
    let shieldUsed = false, guard = 0;
    while (sim.phase !== 'over' && guard++ < 300 && !shieldUsed) {
      if (sim.phase === 'pick') sim.choose(0);
      sim.fire(Math.PI / 2);
      while (!['aim', 'pick', 'over'].includes(sim.phase)) {
        sim.tick(STEP);
        for (const e of sim.drainEvents()) if (e.type === 'shield') shieldUsed = true;
      }
    }
    expect(shieldUsed).toBe(true);
    expect(sim.shields).toBe(0);
    expect(sim.lowestRow).toBeLessThan(ROWS - 1);
  });

  it('a popper destroys the ball that hits it', () => {
    const sim = new Sim(9);
    sim.bricks = [];
    sim.debugPlace('popper', 3, 4, 1);
    let popped = false;
    sim.fire(Math.PI / 2);
    while (sim.phase !== 'aim' && sim.phase !== 'over') {
      sim.tick(STEP);
      for (const e of sim.drainEvents()) if (e.type === 'hazard' && e.kind === 'popper') popped = true;
    }
    expect(popped).toBe(true);
    expect(sim.bricks.some((b) => b.kind === 'popper')).toBe(false);
  });

  it('steel never breaks and never ends the run', () => {
    const sim = new Sim(10);
    sim.debugPlace('steel', 3, 8, 5);
    for (let i = 0; i < 5; i++) sim.debugGrant('heavy');
    play(sim, 3);
    expect(sim.phase).not.toBe('over');
    expect(sim.bricks.some((b) => b.kind === 'steel')).toBe(false); // scrolled away
  });

  it('bombs damage their neighbours when they break', () => {
    const sim = new Sim(12);
    sim.bricks = [];
    sim.debugPlace('bomb', 3, 4, 1);
    sim.debugPlace('normal', 2, 4, 50);
    sim.debugPlace('normal', 4, 4, 50);
    let exploded = false;
    sim.fire(Math.PI / 2);
    while (sim.phase !== 'aim' && sim.phase !== 'over') {
      sim.tick(STEP);
      for (const e of sim.drainEvents()) if (e.type === 'explode') exploded = true;
    }
    expect(exploded).toBe(true);
    for (const b of sim.bricks.filter((x) => x.r === 5 && (x.c === 2 || x.c === 4))) expect(b.hp).toBeLessThan(50);
  });

  it('save and resume produces the exact same future', () => {
    const a = new Sim(77, { classId: 'juggler' });
    a.debugAddBalls(10);
    play(a, 9);
    const save = JSON.parse(JSON.stringify(a.toSave()));
    expect(Sim.isValidSave(save)).toBe(true);
    const b = new Sim(save.seed, {}, save);
    expect(b.classId).toBe('juggler');
    play(a, 8);
    play(b, 8);
    expect(b.turn).toBe(a.turn);
    expect(b.bricks.map((x) => [x.c, x.r, x.hp, x.kind])).toEqual(a.bricks.map((x) => [x.c, x.r, x.hp, x.kind]));
    expect(b.upgrades).toEqual(a.upgrades);
    expect(b.totals).toEqual(a.totals);
  });

  it('rejects saves from other versions', () => {
    expect(Sim.isValidSave({ v: 1, bricks: [], seed: 1 })).toBe(false);
    expect(Sim.isValidSave(null)).toBe(false);
  });
});

describe('ricochet rush', () => {
  it('wall bounces only build damage after the ball has hit a brick', () => {
    const sim = new Sim(31);
    sim.bricks = [];
    sim.debugGrant('ricochet');
    sim.fire(0.2);
    let maxBonus = 0;
    for (let i = 0; i < 240 * 3 && sim.phase !== 'aim'; i++) {
      sim.tick(STEP);
      for (const b of sim.balls) maxBonus = Math.max(maxBonus, b.bonus);
    }
    expect(maxBonus).toBe(0);
  });
});

describe('three upgrade moments per biome', () => {
  it('loot at a third, a small card pick at two-thirds (commons allowed), the big pick after the boss', () => {
    const [lootAt, pickAt] = pickPoints(0);
    expect(lootAt).toBe(3);
    expect(pickAt).toBe(7);
    const sim = new Sim(40);
    sim.debugAddBalls(60);
    for (let i = 0; i < 8; i++) sim.debugGrant('heavy');
    let loot = false, small: string[] | null = null;
    let guard = 0;
    while (!small && sim.phase !== 'over' && guard++ < 20) {
      sim.fire(Math.PI / 2 - 0.4 + (guard % 4) * 0.25);
      while (!['aim', 'pick', 'over'].includes(sim.phase)) {
        sim.tick(STEP);
        for (const e of sim.drainEvents()) if (e.type === 'lootAppear') loot = true;
      }
      if (sim.phase === 'pick') small = sim.offer!.ids;
    }
    expect(loot).toBe(true);
    expect(sim.offer!.kind).toBe('mid');
    expect(sim.biomeRow).toBe(pickAt);
    expect(sim.offer!.rerolls).toBe(0);
    expect(small!.length).toBe(3);
  });
});
