import { describe, expect, it } from 'vitest';
import { ROWS, STEP, W, cellCenterX, cellCenterY } from '../src/sim/constants';
import { inspectAt } from '../src/content/inspect';
import { traceShot } from '../src/sim/trace';
import { Sim } from '../src/sim/world';

function empty(seed = 1): Sim {
  const sim = new Sim(seed);
  sim.bricks = [];
  sim.items = [];
  return sim;
}

describe('danger preview', () => {
  it('flags bricks that will cross the line on the next drop, and only those', () => {
    const sim = empty();
    sim.debugPlace('normal', 1, ROWS - 1, 1e9);
    sim.debugPlace('normal', 3, ROWS - 2, 1e9);
    sim.debugPlace('sprinter', 5, ROWS - 2, 1e9);
    sim.debugPlace('steel', 6, ROWS - 1);
    const at = sim.threats.map((b) => [b.c, b.kind]);
    expect(at).toContainEqual([1, 'normal']);
    expect(at).toContainEqual([5, 'sprinter']); // moves two rows
    expect(at.map(([c]) => c)).not.toContain(3);
    expect(at.map(([c]) => c)).not.toContain(6); // steel never ends a run
  });

  it('records what ended the run', () => {
    const sim = empty();
    sim.debugPlace('sprinter', 2, ROWS - 2, 1e9);
    sim.fire(0.3);
    let guard = 0;
    while (sim.phase !== 'over' && guard++ < 240 * 60) sim.tick(STEP);
    expect(sim.phase).toBe('over');
    expect(sim.deathCause).toContain('sprinter');
  });
});

describe('hold to inspect', () => {
  it('describes bricks with their HP and warns about threats', () => {
    const sim = empty();
    sim.debugPlace('shielder', 2, ROWS - 1, 40);
    const card = inspectAt(sim, cellCenterX(2), cellCenterY(ROWS - 1))!;
    expect(card.title).toBe('Shielder');
    expect(card.lines.join(' ')).toContain('HP 40 / 40');
    expect(card.warn).toBeTruthy();
    expect(inspectAt(sim, cellCenterX(0), cellCenterY(0))).toBeNull();
  });
});

describe('aim laser near the walls', () => {
  it('still shows a path when the launcher hugs a side wall and you aim at it', () => {
    for (const cls of ['juggler', 'bigball'] as const) {
      const sim = new Sim(3, { classId: cls });
      const r = sim.ballRadius;
      for (const [lx, deg] of [[r, 120], [r + 2, 160], [W - r, 60], [W - r - 2, 15]] as const) {
        const t = traceShot(sim.grid, lx, (deg * Math.PI) / 180, 1, sim.traceAccel, false, 5, 4000, r);
        expect(t.points.length).toBeGreaterThan(3);
      }
    }
  });
});
