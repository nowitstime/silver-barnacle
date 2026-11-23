import { BALL_R, BALL_SPEED, FLOOR, STEP } from './constants';
import { bounce, stepBody, NO_ACCEL, type Accel, type AccelFn } from './physics';
import type { BrickGrid } from './types';

export interface Trace {
  /** Sampled points along the path, starting at the launcher. */
  points: [number, number][];
  /** Where each contact happened. */
  contacts: [number, number][];
}

/**
 * Predict a shot's path without touching the world, up to `maxContacts` bounces.
 * Uses the exact same physics as real balls (including currents), so the laser never lies.
 * `maxContacts` of 0 or less draws only a short stub.
 */
export function traceShot(
  grid: BrickGrid, x: number, angle: number, maxContacts = 1, accel: Accel | AccelFn = NO_ACCEL,
  wrap = false, sampleEvery = 5, maxSteps = 4000, r = BALL_R,
): Trace {
  const b = { x, y: FLOOR - r, r, vx: Math.cos(angle) * BALL_SPEED, vy: -Math.sin(angle) * BALL_SPEED };
  const points: [number, number][] = [[b.x, b.y]];
  const contacts: [number, number][] = [];
  const steps = maxContacts <= 0 ? 40 : maxSteps;
  for (let i = 1; i < steps; i++) {
    const a = typeof accel === 'function' ? accel(b.x, b.y) : accel;
    const res = stepBody(b, STEP, grid, a, wrap);
    if (res?.kind === 'wrap') continue;
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
