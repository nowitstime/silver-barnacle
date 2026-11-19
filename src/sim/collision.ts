export interface Contact {
  /** Surface normal pointing from the rectangle towards the circle. */
  nx: number;
  ny: number;
  /** Closest point on the rectangle. */
  px: number;
  py: number;
}

/** Circle vs axis-aligned rectangle. Returns the contact or null when they don't overlap. */
export function circleRect(
  cx: number, cy: number, r: number,
  rx: number, ry: number, rw: number, rh: number,
  vx = 0, vy = -1,
): Contact | null {
  const px = Math.max(rx, Math.min(cx, rx + rw));
  const py = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - px;
  const dy = cy - py;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, px, py };
  }
  // Centre is inside the rectangle (tunnelled). Push out through the side we came from.
  const left = cx - rx, right = rx + rw - cx, top = cy - ry, bottom = ry + rh - cy;
  const m = Math.min(
    vx > 0 ? left : Infinity,
    vx < 0 ? right : Infinity,
    vy > 0 ? top : Infinity,
    vy < 0 ? bottom : Infinity,
  );
  if (m === left) return { nx: -1, ny: 0, px: rx, py: cy };
  if (m === right) return { nx: 1, ny: 0, px: rx + rw, py: cy };
  if (m === top) return { nx: 0, ny: -1, px: cx, py: ry };
  return { nx: 0, ny: 1, px: cx, py: ry + rh };
}

/** Reflect a velocity off a surface normal, only if moving into it. */
export function reflect(vx: number, vy: number, nx: number, ny: number): [number, number] {
  const vn = vx * nx + vy * ny;
  if (vn >= 0) return [vx, vy];
  return [vx - 2 * vn * nx, vy - 2 * vn * ny];
}
