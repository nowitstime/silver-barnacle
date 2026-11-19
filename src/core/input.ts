import { MIN_ANGLE } from '../sim/constants';
import type { View } from '../render/view';

/** Minimum pull distance (world units) before a drag counts as aiming. */
const DEAD_ZONE = 10;

export interface AimHandlers {
  canAim: () => boolean;
  onAim: (angle: number | null) => void;
  onFire: (angle: number) => void;
}

/**
 * Slingshot aiming: press anywhere, pull back, release to fire.
 * Pulling down aims up, so your thumb never covers the bricks.
 */
export class AimInput {
  private start: [number, number] | null = null;
  private angle: number | null = null;
  private pointerId: number | null = null;

  constructor(private view: View, private el: HTMLElement, private h: AimHandlers) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
  }

  private down = (e: PointerEvent) => {
    if (!this.h.canAim() || this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.el.setPointerCapture(e.pointerId);
    this.start = this.view.toWorld(e.clientX, e.clientY);
    this.angle = null;
    this.h.onAim(null);
  };

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId || !this.start) return;
    const [x, y] = this.view.toWorld(e.clientX, e.clientY);
    // The shot goes opposite the pull.
    const dx = this.start[0] - x;
    const up = y - this.start[1]; // positive when pulled down, i.e. shot points up
    if (Math.hypot(dx, up) < DEAD_ZONE || up < -DEAD_ZONE * 0.5) {
      this.angle = null;
    } else {
      let a = Math.atan2(Math.max(0, up), dx);
      a = Math.max(MIN_ANGLE, Math.min(Math.PI - MIN_ANGLE, a));
      this.angle = a;
    }
    this.h.onAim(this.angle);
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    const angle = this.angle;
    this.reset();
    if (angle !== null && this.h.canAim()) this.h.onFire(angle);
  };

  private cancel = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.reset();
  };

  private reset(): void {
    this.pointerId = null;
    this.start = null;
    this.angle = null;
    this.h.onAim(null);
  }
}
