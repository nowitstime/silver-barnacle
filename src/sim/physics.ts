import { circleRect, reflect, type Contact } from './collision';
import { BALL_R, BALL_R as BALL_RADIUS, BALL_SPEED, COLS, FLOOR, MIN_VY_FRACTION, TOP, W, CELL, brickX, brickY, span } from './constants';
import { gridKey, type Brick, type BrickGrid } from './types';

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Collision radius; defaults to BALL_R. */
  r?: number;
}

/** Constant accelerations acting on a body (currents, heavy balls). */
export interface Accel {
  ax: number;
  ay: number;
}

export const NO_ACCEL: Accel = { ax: 0, ay: 0 };

/** Acceleration that depends on where the ball is (magnets, anchors). */
export type AccelFn = (x: number, y: number) => Accel;

export type StepResult =
  | { kind: 'wall'; x: number; y: number; ceiling: boolean }
  | { kind: 'wrap'; x: number; y: number }
  | { kind: 'brick'; brick: Brick; x: number; y: number; contact: Contact }
  | { kind: 'floor' }
  | null;

/** Keep the ball from travelling almost horizontally forever. Preserves its current speed. */
export function unloop(b: Body): void {
  const speed = Math.hypot(b.vx, b.vy) || BALL_SPEED;
  const min = speed * MIN_VY_FRACTION;
  if (Math.abs(b.vy) < min) {
    b.vy = (b.vy < 0 ? -1 : 1) * min;
    const s = Math.hypot(b.vx, b.vy);
    b.vx *= speed / s;
    b.vy *= speed / s;
  }
}

/** Bounce a body off a brick contact. Separate from `stepBody` so a ball can choose to smash through instead. */
export function bounce(b: Body, c: Contact): void {
  const R = b.r ?? BALL_R;
  [b.vx, b.vy] = reflect(b.vx, b.vy, c.nx, c.ny);
  b.x = c.px + c.nx * (R + 0.01);
  b.y = c.py + c.ny * (R + 0.01);
  unloop(b);
}

export const brickRect = (b: Brick): [number, number, number, number] => [brickX(b.c), brickY(b.r), span(b.w), span(b.h)];

/**
 * Advance one body by h seconds. Walls bounce automatically. A brick contact is reported
 * but NOT resolved: the caller decides whether to `bounce` or pass through.
 */
export function stepBody(b: Body, h: number, grid: BrickGrid, accel: Accel = NO_ACCEL, wrap = false, skipId?: number): StepResult {
  if (accel.ax || accel.ay) {
    b.vx += accel.ax * h;
    b.vy += accel.ay * h;
  }
  b.x += b.vx * h;
  b.y += b.vy * h;
  const BALL_R = b.r ?? BALL_RADIUS;

  let wall = false, ceiling = false;
  if (wrap && (b.x < BALL_R || b.x > W - BALL_R)) {
    // Wraparound: the side walls are portals.
    b.x = b.x < BALL_R ? W - BALL_R : BALL_R;
    return { kind: 'wrap', x: b.x, y: b.y };
  }
  if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); wall = true; }
  else if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); wall = true; }
  if (b.y < TOP + BALL_R) { b.y = TOP + BALL_R; b.vy = Math.abs(b.vy); wall = true; ceiling = true; }
  if (wall) {
    unloop(b);
    return { kind: 'wall', x: b.x, y: b.y, ceiling };
  }

  if (b.y > FLOOR - BALL_R && b.vy > 0) {
    b.y = FLOOR - BALL_R;
    return { kind: 'floor' };
  }

  const c0 = Math.floor((b.x - BALL_R) / CELL);
  const c1 = Math.floor((b.x + BALL_R) / CELL);
  const r0 = Math.floor((b.y - BALL_R - TOP) / CELL);
  const r1 = Math.floor((b.y + BALL_R - TOP) / CELL);
  for (let r = r0; r <= r1; r++) {
    if (r < 0) continue;
    for (let c = c0; c <= c1; c++) {
      if (c < 0 || c >= COLS) continue;
      const brick = grid.get(gridKey(c, r));
      if (!brick || brick.id === skipId) continue;
      const [rx, ry, rw, rh] = brickRect(brick);
      const hit = circleRect(b.x, b.y, BALL_R, rx, ry, rw, rh, b.vx, b.vy);
      if (!hit) continue;
      return { kind: 'brick', brick, x: hit.px, y: hit.py, contact: hit };
    }
  }
  return null;
}
