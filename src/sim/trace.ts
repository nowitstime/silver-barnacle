import { BALL_R, BALL_SPEED, FLOOR, STEP } from './constants';
import { bounce, stepBody } from './physics';
import type { BrickGrid } from './types';

export interface Trace {
  /** Sampled points along the path, starting at the launcher. */
  points: [number, number][];
  /** Where each contact happened. */
  contacts: [number, number][];
}

/**
 * Predict a shot's path without touching the world, up to `maxContacts` bounces.
 * Uses the exact same physics as real balls, so the laser never lies.
 */
export function traceShot(
  grid: BrickGrid, x: number, angle: number, maxContacts = 1, sampleEvery = 5, maxSteps = 4000,
): Trace {
  const b = { x, y: FLOOR - BALL_R, vx: Math.cos(angle) * BALL_SPEED, vy: -Math.sin(angle) * BALL_SPEED };
  const points: [number, number][] = [[b.x, b.y]];
  const contacts: [number, number][] = [];
  for (let i = 1; i < maxSteps; i++) {
    const res = stepBody(b, STEP, grid);
    if (i % sampleEvery === 0) points.push([b.x, b.y]);
    if (res?.kind === 'floor') break;
    if (res?.kind === 'brick') bounce(b, res.contact);
    if (res) {
      contacts.push([b.x, b.y]);
      points.push([b.x, b.y]);
      if (contacts.length >= maxContacts) break;
    }
  }
  return { points, contacts };
}
