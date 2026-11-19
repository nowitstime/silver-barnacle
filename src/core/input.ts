import { MIN_ANGLE } from '../sim/constants';
import type { View } from '../render/view';

export interface AimHandlers {
  canAim: () => boolean;
  /** World position the shot leaves from. */
  launcher: () => [number, number];
  /** Current target aim. */
  angle: () => number;
  onAim: (angle: number) => void;
  onFire: () => void;
}

export const clampAim = (a: number) => Math.max(MIN_ANGLE, Math.min(Math.PI - MIN_ANGLE, a));

/** Radians of turn per CSS pixel of slow drag. ~0.15° per pixel. */
const BASE_SENSITIVITY = (0.15 * Math.PI) / 180;
/** Movement (CSS px) below which a press counts as a tap. */
const TAP_SLOP = 8;
const TAP_MAX_MS = 300;
const NUDGE = (0.5 * Math.PI) / 180;

/**
 * Two ways to aim, both anywhere on screen:
 * - Drag left/right like a dial. Slow drags are very precise; fast drags turn quicker.
 * - Quick tap: jump the aim to point at the tapped spot (touches below the launcher are mirrored up).
 * A separate Fire control confirms the shot.
 */
export class AimInput {
  private pointerId: number | null = null;
  private downAt = 0;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastT = 0;
  private dragging = false;

  constructor(private view: View, private el: HTMLElement, private h: AimHandlers) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
    window.addEventListener('keydown', this.key);
  }

  /** Angle from the launcher to a CSS-pixel point. */
  angleTo(cssX: number, cssY: number): number {
    const [x, y] = this.view.toWorld(cssX, cssY);
    const [lx, ly] = this.h.launcher();
    const dx = x - lx;
    const up = Math.abs(ly - y);
    if (Math.hypot(dx, up) < 1) return this.h.angle();
    return clampAim(Math.atan2(up, dx));
  }

  private down = (e: PointerEvent) => {
    if (!this.h.canAim() || this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.el.setPointerCapture(e.pointerId);
    this.downAt = performance.now();
    this.startX = this.lastX = e.clientX;
    this.startY = e.clientY;
    this.lastT = this.downAt;
    this.dragging = false;
  };

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId || !this.h.canAim()) return;
    if (!this.dragging && Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > TAP_SLOP) {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastT = performance.now();
      return;
    }
    if (!this.dragging) return;
    const now = performance.now();
    const dx = e.clientX - this.lastX;
    const speed = Math.abs(dx) / Math.max(1, now - this.lastT); // px per ms
    this.lastX = e.clientX;
    this.lastT = now;
    // Pointer acceleration: precise when slow, quicker when flicked.
    const k = BASE_SENSITIVITY * (1 + Math.min(4, speed * speed * 2.5));
    // Dragging right turns the shot right (smaller angle).
    this.h.onAim(clampAim(this.h.angle() - dx * k));
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    const tap = !this.dragging && performance.now() - this.downAt < TAP_MAX_MS;
    this.pointerId = null;
    if (tap && this.h.canAim()) this.h.onAim(this.angleTo(e.clientX, e.clientY));
  };

  private cancel = (e: PointerEvent) => {
    if (e.pointerId === this.pointerId) this.pointerId = null;
  };

  private key = (e: KeyboardEvent) => {
    if (!this.h.canAim()) return;
    const step = e.shiftKey ? NUDGE * 6 : NUDGE;
    if (e.key === 'ArrowLeft') this.h.onAim(clampAim(this.h.angle() + step));
    else if (e.key === 'ArrowRight') this.h.onAim(clampAim(this.h.angle() - step));
    else if (e.key === ' ' || e.key === 'Enter') {
      if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
      this.h.onFire();
    } else return;
    e.preventDefault();
  };
}
