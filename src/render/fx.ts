import { BALL_R, FLOOR, cellCenterX, cellCenterY } from '../sim/constants';
import type { Sim } from '../sim/world';
import type { SimEvent } from '../sim/types';

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  gravity: number; life: number; max: number; size: number;
  /** 0 = primary ink, 1 = secondary ink. */
  ink: 0 | 1;
  square: boolean;
  rot: number; spin: number;
}

export interface FloatText {
  x: number; y: number; text: string; big: boolean; life: number; max: number;
}

export interface Ring {
  x: number; y: number; radius: number; life: number; max: number; ink: 0 | 1;
}

export interface BrickFx { flash: number; wobble: number }

/** Kills in one volley needed before the combo counter shows. */
export const COMBO_SHOW = 3;
const MAX_PARTICLES = 700;

/** Visual-only effects driven by sim events. Never feeds back into the sim. */
export class Fx {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  rings: Ring[] = [];
  bricks = new Map<number, BrickFx>();
  trails = new Map<number, number[]>();
  squash = new Map<number, number>();
  shake = 0;
  enabledShake = true;
  /** Kills this volley. */
  combo = 0;
  /** 1 right after the combo goes up, decays to 0. */
  comboPop = 0;
  /** Fades the combo label out after the volley. */
  comboFade = 0;
  launcherKick = 0;
  /** 0..1, how close bricks are to the bottom (drives the danger vignette). */
  danger = 0;

  consume(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'launch':
          this.launcherKick = 1;
          this.combo = 0;
          break;
        case 'hit': {
          const fx = this.brickFx(e.brick.id);
          fx.flash = 1;
          fx.wobble = 1;
          this.squash.set(e.ballId, 1);
          this.burst(e.x, e.y, 3, 55, 0.3, 0);
          if (e.killed) {
            const cx = cellCenterX(e.brick.c), cy = cellCenterY(e.brick.r);
            this.burst(cx, cy, 14, 180, 0.75, 0, true, 420, true);
            this.burst(cx, cy, 8, 120, 0.6, 1, false);
            this.rings.push({ x: cx, y: cy, radius: 30, life: 0.35, max: 0.35, ink: 1 });
            this.bricks.delete(e.brick.id);
            this.combo++;
            this.comboFade = 1;
            if (this.combo >= COMBO_SHOW) this.comboPop = 1;
            this.kick(2.5 + Math.min(this.combo, 10) * 0.25);
          } else {
            this.text(e.x, e.y, String(e.damage));
          }
          break;
        }
        case 'wall':
          this.squash.set(e.ballId, 1);
          this.burst(e.x, e.y, 2, 30, 0.2, 1);
          break;
        case 'orb':
          this.burst(e.x, e.y, 16, 150, 0.6, 1, true, 0);
          this.rings.push({ x: e.x, y: e.y, radius: 22, life: 0.4, max: 0.4, ink: 1 });
          this.text(e.x, e.y - 4, '+1', true);
          break;
        case 'land':
          this.burst(e.x, FLOOR - 1, 3, 40, 0.25, 0, false, 200);
          break;
        case 'drop':
          this.kick(1.5);
          break;
        case 'over':
          this.kick(9);
          break;
      }
    }
  }

  update(dt: number, sim: Sim): void {
    for (const p of this.particles) {
      p.vx *= 0.985;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.y -= 26 * dt;
      t.life -= dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const fx of this.bricks.values()) {
      fx.flash = Math.max(0, fx.flash - dt * 7);
      fx.wobble = Math.max(0, fx.wobble - dt * 6);
    }
    for (const [id, v] of this.squash) {
      const n = v - dt * 9;
      if (n <= 0) this.squash.delete(id);
      else this.squash.set(id, n);
    }
    this.shake = Math.max(0, this.shake - dt * 18);
    this.comboPop = Math.max(0, this.comboPop - dt * 4);
    this.launcherKick = Math.max(0, this.launcherKick - dt * 8);
    const volley = sim.phase === 'fire' || sim.phase === 'run';
    if (!volley) this.comboFade = Math.max(0, this.comboFade - dt * 1.5);
    const target = sim.lowestRow >= 8 ? (sim.lowestRow - 7) / 2 : 0;
    this.danger += (Math.min(1, target) - this.danger) * Math.min(1, dt * 4);

    // Trails follow flying balls and fade out when they land.
    const alive = new Set<number>();
    for (const b of sim.balls) {
      alive.add(b.id);
      let tr = this.trails.get(b.id);
      if (!tr) this.trails.set(b.id, (tr = []));
      if (b.state === 'flying') {
        tr.push(b.x, b.y);
        if (tr.length > 18) tr.splice(0, 2);
      } else if (tr.length) tr.splice(0, 2);
    }
    for (const id of this.trails.keys()) if (!alive.has(id)) this.trails.delete(id);
  }

  brickFx(id: number): BrickFx {
    let fx = this.bricks.get(id);
    if (!fx) this.bricks.set(id, (fx = { flash: 0, wobble: 0 }));
    return fx;
  }

  kick(amount: number): void {
    if (this.enabledShake) this.shake = Math.min(10, Math.max(this.shake, amount));
  }

  burst(
    x: number, y: number, n: number, speed: number, life: number, ink: 0 | 1,
    mixInk = false, gravity = 420, square = false,
  ): void {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      const l = life * (0.6 + Math.random() * 0.6);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.3,
        gravity, life: l, max: l,
        size: BALL_R * (0.3 + Math.random() * 0.5) * (speed > 100 ? 1.3 : 0.8),
        ink: mixInk && Math.random() < 0.5 ? ((1 - ink) as 0 | 1) : ink,
        square, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 14,
      });
    }
  }

  text(x: number, y: number, text: string, big = false): void {
    if (this.texts.length > 60 && !big) return;
    const life = big ? 0.85 : 0.4;
    this.texts.push({ x, y, text, big, life, max: life });
  }

  reset(): void {
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.bricks.clear();
    this.trails.clear();
    this.squash.clear();
    this.shake = 0;
    this.combo = 0;
    this.comboPop = 0;
    this.comboFade = 0;
    this.danger = 0;
  }
}
