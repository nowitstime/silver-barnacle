import { BALL_R, cellCenterX, cellCenterY } from '../sim/constants';
import type { Sim } from '../sim/world';
import type { SimEvent } from '../sim/types';

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  gravity: number; life: number; max: number; size: number;
  /** 0 = primary ink, 1 = secondary ink. */
  ink: 0 | 1;
}

export interface FloatText {
  x: number; y: number; text: string; big: boolean; life: number; max: number;
}

export interface BrickFx { flash: number; wobble: number }

const MAX_PARTICLES = 600;

/** Visual-only effects driven by sim events. Never feeds back into the sim. */
export class Fx {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  bricks = new Map<number, BrickFx>();
  trails = new Map<number, number[]>();
  shake = 0;
  enabledShake = true;

  consume(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const fx = this.brickFx(e.brick.id);
          fx.flash = 1;
          fx.wobble = 1;
          this.burst(e.x, e.y, 3, 50, 0.3, 0);
          if (e.killed) {
            this.burst(cellCenterX(e.brick.c), cellCenterY(e.brick.r), 18, 170, 0.7, 0, 1);
            this.bricks.delete(e.brick.id);
            this.kick(3);
          }
          break;
        }
        case 'orb':
          this.burst(e.x, e.y, 14, 140, 0.6, 1, 0, 0);
          this.text(e.x, e.y - 4, '+1', true);
          break;
        case 'wall':
          this.burst(e.x, e.y, 2, 30, 0.2, 1);
          break;
        case 'over':
          this.kick(8);
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
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.y -= 26 * dt;
      t.life -= dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const fx of this.bricks.values()) {
      fx.flash = Math.max(0, fx.flash - dt * 7);
      fx.wobble = Math.max(0, fx.wobble - dt * 6);
    }
    this.shake = Math.max(0, this.shake - dt * 18);

    // Trails follow flying balls and fade out when they land.
    const alive = new Set<number>();
    for (const b of sim.balls) {
      alive.add(b.id);
      let tr = this.trails.get(b.id);
      if (!tr) this.trails.set(b.id, (tr = []));
      if (b.state === 'flying') {
        tr.push(b.x, b.y);
        if (tr.length > 16) tr.splice(0, 2);
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
    if (this.enabledShake) this.shake = Math.max(this.shake, amount);
  }

  burst(x: number, y: number, n: number, speed: number, life: number, ink: 0 | 1, mixInk = 0, gravity = 420): void {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      const l = life * (0.6 + Math.random() * 0.6);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.3,
        gravity, life: l, max: l,
        size: BALL_R * (0.3 + Math.random() * 0.5) * (speed > 100 ? 1.3 : 0.8),
        ink: mixInk && Math.random() < 0.5 ? (1 - ink) as 0 | 1 : ink,
      });
    }
  }

  text(x: number, y: number, text: string, big = false): void {
    const life = big ? 0.85 : 0.45;
    this.texts.push({ x, y, text, big, life, max: life });
  }

  reset(): void {
    this.particles = [];
    this.texts = [];
    this.bricks.clear();
    this.trails.clear();
    this.shake = 0;
  }
}
