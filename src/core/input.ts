import type { View } from '../render/view';

export interface AimHandlers {
  canAim: () => boolean;
  /** World position the shot leaves from. */
  launcher: () => [number, number];
  /** Current target aim. */
  angle: () => number;
  onAim: (angle: number) => void;
  onFire: () => void;
  /** Called when a drag starts/stops (to show the angle readout). */
  onActive?: (active: boolean) => void;
}

const deg = Math.PI / 180;
/** Shallowest aim allowed: flatter than this the laser just runs into a side wall. */
export const AIM_MIN = 10 * deg;
export const clampAim = (a: number) => Math.max(AIM_MIN, Math.min(Math.PI - AIM_MIN, a));

/** Radians of turn per CSS pixel of slow drag (~0.16° per pixel) at the bottom of the screen. */
const BASE_SENSITIVITY = 0.16 * deg;
/** Movement (CSS px) below which a press counts as a tap. */
const TAP_SLOP = 8;
const TAP_MAX_MS = 300;
/** Keyboard / nudge-button step. */
export const NUDGE = 0.2 * deg;

/**
 * Two ways to aim, both anywhere on screen:
 * - Drag left/right like a dial. Slow drags are precise; fast flicks turn quicker.
 *   Full speed near the bottom of the screen; the higher your finger, the finer the control.
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
  /** Smoothed drag speed (px/ms), so one jumpy event doesn't spike the acceleration. */
  private speed = 0;
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
    this.speed = 0;
    this.dragging = false;
  };

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId || !this.h.canAim()) return;
    if (!this.dragging) {
      if (Math.hypot(e.clientX - this.startX, e.clientY - this.startY) <= TAP_SLOP) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastT = performance.now();
      this.h.onActive?.(true);
      return;
    }
    // Coalesced events give every intermediate finger position, for smoother aiming on phones.
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) this.step(ev.clientX, ev.clientY, ev.timeStamp || performance.now());
  };

  private step(x: number, y: number, t: number): void {
    const dx = x - this.lastX;
    const dt = Math.max(1, t - this.lastT);
    this.lastX = x;
    this.lastT = t;
    if (!dx) return;
    this.speed += (Math.abs(dx) / dt - this.speed) * 0.35;
    // Gentle acceleration: precise when slow, quicker only on real flicks.
    const accel = 1 + Math.min(2.5, (this.speed / 0.9) ** 2);
    // Finger position on screen sets the precision: full speed in the bottom quarter,
    // getting finer as you go up, 3x finer from three-quarters of the way up.
    const h = window.innerHeight || 800;
    const up = Math.max(0, Math.min(1, (h * 0.75 - y) / (h * 0.5)));
    const precision = 1 + 2 * up;
    // Dragging right turns the shot right (smaller angle).
    this.h.onAim(clampAim(this.h.angle() - (dx * BASE_SENSITIVITY * accel) / precision));
  }

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    const tap = !this.dragging && performance.now() - this.downAt < TAP_MAX_MS;
    if (this.dragging) this.h.onActive?.(false);
    this.pointerId = null;
    if (tap && this.h.canAim()) this.h.onAim(this.angleTo(e.clientX, e.clientY));
  };

  private cancel = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    if (this.dragging) this.h.onActive?.(false);
    this.pointerId = null;
  };

  private key = (e: KeyboardEvent) => {
    if (!this.h.canAim()) return;
    const step = e.shiftKey ? NUDGE * 10 : NUDGE;
    if (e.key === 'ArrowLeft') this.h.onAim(clampAim(this.h.angle() + step));
    else if (e.key === 'ArrowRight') this.h.onAim(clampAim(this.h.angle() - step));
    else if (e.key === ' ' || e.key === 'Enter') {
      if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
      this.h.onFire();
    } else return;
    e.preventDefault();
  };
}
