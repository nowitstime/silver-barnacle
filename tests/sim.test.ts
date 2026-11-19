import { describe, expect, it } from 'vitest';
import { mulberry32, stream } from '../src/core/rng';
import { circleRect, reflect } from '../src/sim/collision';
import { BALL_R, COLS, FLOOR, STEP, W, brickX, brickY, BRICK } from '../src/sim/constants';
import { generateRow } from '../src/sim/rows';
import { traceShot } from '../src/sim/trace';
import { Sim, clampAngle } from '../src/sim/world';
import { gridKey, type Brick } from '../src/sim/types';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('stays in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 10000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('named streams are independent', () => {
    expect(stream(1, 'rows')()).not.toBe(stream(1, 'loot')());
  });
});

describe('collision', () => {
  it('detects a circle touching the top of a box', () => {
    const c = circleRect(5, -3, 5, 0, 0, 10, 10);
    expect(c).not.toBeNull();
    expect(c!.ny).toBeCloseTo(-1);
  });
  it('ignores a circle that is apart', () => {
    expect(circleRect(5, -6, 5, 0, 0, 10, 10)).toBeNull();
  });
  it('handles corners with a diagonal normal', () => {
    const c = circleRect(-2, -2, 5, 0, 0, 10, 10)!;
    expect(c.nx).toBeCloseTo(-Math.SQRT1_2);
    expect(c.ny).toBeCloseTo(-Math.SQRT1_2);
  });
  it('pushes a tunnelled centre out the side it came from', () => {
    const c = circleRect(5, 1, 5, 0, 0, 10, 10, 0, 1)!;
    expect(c.ny).toBe(-1);
  });
  it('reflects only when moving into the surface', () => {
    expect(reflect(1, 1, 0, -1)).toEqual([1, -1]);
    expect(reflect(1, -1, 0, -1)).toEqual([1, -1]);
  });
});

describe('rows', () => {
  it('never fills every column and places one orb in a free cell', () => {
    const rng = mulberry32(3);
    for (let level = 1; level < 200; level++) {
      const row = generateRow(rng, level);
      expect(row.bricks.length).toBeGreaterThan(0);
      expect(row.bricks.length).toBeLessThan(COLS);
      const cols = new Set(row.bricks.map((b) => b.c));
      expect(cols.size).toBe(row.bricks.length);
      const orb = row.items.find((i) => i.kind === 'orb');
      expect(orb).toBeDefined();
      expect(cols.has(orb!.c)).toBe(false);
      for (const it of row.items) expect(cols.has(it.c)).toBe(false);
      for (const b of row.bricks) if (b.kind === 'normal') expect(b.hp).toBeGreaterThanOrEqual(level);
    }
  });
});

describe('trace', () => {
  it('a straight-up shot hits the ceiling first', () => {
    const t = traceShot(new Map(), W / 2, Math.PI / 2);
    expect(t.contacts).toHaveLength(1);
    expect(t.contacts[0][0]).toBeCloseTo(W / 2, 3);
  });
  it('stops at the first brick in the way', () => {
    const brick: Brick = { id: 1, c: 3, r: 5, w: 1, h: 1, hp: 1, maxHp: 1, kind: 'normal', burn: 0, frozen: false, hitThisTurn: false };
    const grid = new Map([[gridKey(3, 5), brick]]);
    const t = traceShot(grid, W / 2, Math.PI / 2);
    expect(t.contacts[0][1]).toBeCloseTo(brickY(5) + BRICK + BALL_R, 0);
  });
});

describe('sim', () => {
  function playTurn(sim: Sim, angle: number) {
    if (sim.phase === 'pick') sim.choose(0);
    expect(sim.fire(angle)).toBe(true);
    let guard = 0;
    while (sim.phase !== 'aim' && sim.phase !== 'over' && sim.phase !== 'pick' && guard++ < 240 * 60) sim.tick(STEP);
  }

  it('is deterministic for a seed', () => {
    const a = new Sim(99), b = new Sim(99);
    for (let i = 0; i < 15; i++) {
      const angle = 0.4 + (i % 5) * 0.5;
      if (a.phase === 'over') break;
      playTurn(a, angle);
      playTurn(b, angle);
    }
    expect(a.bricks.map((x) => [x.c, x.r, x.hp])).toEqual(b.bricks.map((x) => [x.c, x.r, x.hp]));
    expect(a.ballCount).toBe(b.ballCount);
  });

  it('only fires during the aim phase', () => {
    const sim = new Sim(1);
    expect(sim.fire(1)).toBe(true);
    expect(sim.fire(1)).toBe(false);
  });

  it('a turn ends with every ball home, a new row, and the next launch where the first ball landed', () => {
    const sim = new Sim(5);
    const startTurn = sim.turn;
    sim.fire(Math.PI / 3);
    let landX: number | null = null;
    while (sim.phase !== 'aim' && sim.phase !== 'over' && sim.phase !== 'pick') {
      sim.tick(STEP);
      for (const e of sim.drainEvents()) if (e.type === 'land' && e.first) landX = e.x;
    }
    expect(sim.turn).toBe(startTurn + 1);
    expect(landX).not.toBeNull();
    expect(Math.abs(sim.launchX - landX!)).toBeLessThan(3);
    expect(sim.bricks.some((b) => b.r === 0)).toBe(true);
  });

  it('recall brings everything home', () => {
    const sim = new Sim(2);
    sim.debugAddBalls(20);
    sim.fire(Math.PI / 2.2);
    for (let i = 0; i < 60; i++) sim.tick(STEP);
    sim.recall();
    sim.tick(STEP);
    expect(sim.balls.every((b) => b.state === 'returned' && b.y === FLOOR - BALL_R)).toBe(true);
    expect(sim.phase).toBe('settle');
  });

  it('ends the run when a brick reaches the bottom', () => {
    const sim = new Sim(8);
    let guard = 0;
    while (sim.phase !== 'over' && guard++ < 200) playTurn(sim, Math.PI / 2);
    expect(sim.phase).toBe('over');
    expect(sim.lowestRow).toBeGreaterThanOrEqual(10);
  });

  it('clamps launch angles away from horizontal', () => {
    expect(clampAngle(0)).toBeGreaterThan(0.1);
    expect(clampAngle(Math.PI)).toBeLessThan(Math.PI - 0.1);
  });

  it('bricks are hit and lose HP', () => {
    const sim = new Sim(11);
    const before = sim.bricks.reduce((s, b) => s + b.hp, 0);
    const target = sim.bricks[0];
    const angle = Math.atan2(FLOOR - (brickY(target.r) + BRICK / 2), brickX(target.c) + BRICK / 2 - sim.launchX);
    playTurn(sim, angle);
    const after = sim.bricks.filter((b) => b.r === 1).reduce((s, b) => s + b.hp, 0);
    expect(after).toBeLessThan(before);
  });
});
