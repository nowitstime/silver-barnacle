import { MIN_ANGLE } from '../sim/constants';
import type { View } from '../render/view';

export interface AimHandlers {
  canAim: () => boolean;
  /** World position the shot leaves from. */
  launcher: () => [number, number];
  /** Current aim, so keyboard nudges can start from it. */
  angle: () => number;
  onAim: (angle: number) => void;
  onFire: () => void;
}

const clamp = (a: number) => Math.max(MIN_ANGLE, Math.min(Math.PI - MIN_ANGLE, a));
const NUDGE = (1 * Math.PI) / 180;

/**
 * Point-to-aim: touch or drag anywhere and the shot points from the launcher towards your finger.
 * Touches below the launcher are mirrored upward, so the whole screen is usable.
 * Lifting the finger keeps the aim; a separate Fire control confirms the shot.
 */
export class AimInput {
  private pointerId: number | null = null;

  constructor(private view: View, private el: HTMLElement, private h: AimHandlers) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.end);
    el.addEventListener('pointercancel', this.end);
    window.addEventListener('keydown', this.key);
  }

  /** Angle from the launcher to a CSS-pixel point. */
  angleTo(cssX: number, cssY: number): number {
    const [x, y] = this.view.toWorld(cssX, cssY);
    const [lx, ly] = this.h.launcher();
    const dx = x - lx;
    const up = Math.abs(ly - y); // mirror points below the launcher
    if (Math.hypot(dx, up) < 1) return this.h.angle();
    return clamp(Math.atan2(up, dx));
  }

  private down = (e: PointerEvent) => {
    if (!this.h.canAim() || this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.el.setPointerCapture(e.pointerId);
    this.h.onAim(this.angleTo(e.clientX, e.clientY));
  };

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId || !this.h.canAim()) return;
    this.h.onAim(this.angleTo(e.clientX, e.clientY));
  };

  private end = (e: PointerEvent) => {
    if (e.pointerId === this.pointerId) this.pointerId = null;
  };

  private key = (e: KeyboardEvent) => {
    if (!this.h.canAim()) return;
    const step = e.shiftKey ? NUDGE * 5 : NUDGE;
    if (e.key === 'ArrowLeft') this.h.onAim(clamp(this.h.angle() + step));
    else if (e.key === 'ArrowRight') this.h.onAim(clamp(this.h.angle() - step));
    else if (e.key === ' ' || e.key === 'Enter') {
      if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
      this.h.onFire();
    } else return;
    e.preventDefault();
  };
}
