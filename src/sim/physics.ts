import { circleRect, reflect, type Contact } from './collision';
import { BALL_R, BALL_SPEED, BRICK, COLS, FLOOR, MIN_VY_FRACTION, TOP, W, CELL, brickX, brickY } from './constants';
import { gridKey, type Brick, type BrickGrid } from './types';

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export type StepResult =
  | { kind: 'wall'; x: number; y: number; ceiling: boolean }
  | { kind: 'brick'; brick: Brick; x: number; y: number; contact: Contact }
  | { kind: 'floor' }
  | null;

/** Keep the ball from travelling almost horizontally forever. */
export function unloop(b: Body): void {
  const min = BALL_SPEED * MIN_VY_FRACTION;
  if (Math.abs(b.vy) < min) {
    b.vy = (b.vy < 0 ? -1 : 1) * min;
    const s = Math.hypot(b.vx, b.vy);
    b.vx *= BALL_SPEED / s;
    b.vy *= BALL_SPEED / s;
  }
}

/** Bounce a body off a brick contact. Separate from `stepBody` so a ball can choose to smash through instead. */
export function bounce(b: Body, c: Contact): void {
  [b.vx, b.vy] = reflect(b.vx, b.vy, c.nx, c.ny);
  b.x = c.px + c.nx * (BALL_R + 0.01);
  b.y = c.py + c.ny * (BALL_R + 0.01);
  unloop(b);
}

/**
 * Advance one body by h seconds. Walls bounce automatically. A brick contact is reported
 * but NOT resolved: the caller decides whether to `bounce` or pass through.
 * `skip` lets a ball ignore a brick it's already passing through.
 */
export function stepBody(b: Body, h: number, grid: BrickGrid, skip?: (brick: Brick) => boolean): StepResult {
  b.x += b.vx * h;
  b.y += b.vy * h;

  let wall = false, ceiling = false;
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
      if (!brick || skip?.(brick)) continue;
      const hit = circleRect(b.x, b.y, BALL_R, brickX(c), brickY(r), BRICK, BRICK, b.vx, b.vy);
      if (!hit) continue;
      return { kind: 'brick', brick, x: hit.px, y: hit.py, contact: hit };
    }
  }
  return null;
}
