import { describe, expect, it } from 'vitest';
import { BALL_R, STEP } from '../src/sim/constants';
import { BIG_BALL_SCALE } from '../src/content/classes';
import { Sim } from '../src/sim/world';

describe('Big Ball class', () => {
  it('board orbs become damage; ball cards still add balls', () => {
    const sim = new Sim(5, { classId: 'bigball' });
    expect(sim.ballCount).toBe(1);
    expect(sim.ballRadius).toBeCloseTo(BALL_R * BIG_BALL_SCALE);
    sim.debugGrant('extra'); // +5 balls card: real balls
    expect(sim.ballCount).toBe(6);
    expect(sim.growth.big ?? 0).toBe(0);
    // Orbs picked up on the board count too.
    sim.bricks = [];
    sim.items = [{ id: 999, c: Math.floor(sim.launchX / 36), r: 6, kind: 'orb' }];
    sim.fire(Math.PI / 2);
    let guard = 0;
    while (!['aim', 'pick', 'over'].includes(sim.phase) && guard++ < 240 * 60) sim.tick(STEP);
    expect(sim.ballCount).toBe(6);
    expect(sim.growth.big).toBe(1);
  });
});
