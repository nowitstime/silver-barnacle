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
  /** Print in the secondary ink. */
  alt: boolean;
  /** A plain damage number (can be hidden in settings). */
  number: boolean;
}

export interface Beam { kind: 'laserH' | 'laserV'; x: number; y: number; width: number; life: number; max: number }

const HAZARD_LABEL: Partial<Record<string, string>> = {
  popper: 'POP!', anchor: 'HEAVY', balloon: 'FLOATY', sponge: 'GULP', shrinker: 'SHRUNK',
};
const IMMUNE_LABEL: Record<string, string> = { steel: '', ice: 'CRACK', lantern: 'NO EFFECT', shield: 'BLOCKED' };

export interface Ring {
  x: number; y: number; radius: number; life: number; max: number; ink: 0 | 1;
}

export interface BrickFx { flash: number; wobble: number }

export interface Zap { x1: number; y1: number; x2: number; y2: number; life: number; max: number; seed: number }

export interface Banner { title: string; sub: string; life: number; max: number }

/** Kills in one volley needed before the combo counter shows. */
export const COMBO_SHOW = 3;
const MAX_PARTICLES = 450;
/** Caps so a late-game storm of hits can't flood the screen (or the frame budget). */
const MAX_RINGS = 50, MAX_ZAPS = 24, MAX_BEAMS = 8, MAX_TEXTS = 45;

/** Visual-only effects driven by sim events. Never feeds back into the sim. */
export class Fx {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  rings: Ring[] = [];
  zaps: Zap[] = [];
  beams: Beam[] = [];
  private lastImmune = 0;
  private lastHazard = 0;
  banner: Banner | null = null;
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
  /** Trail length in points (the Comet skin doubles it). */
  trailLen = 9;
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
          fx.flash = e.source === 'burn' ? 0.5 : 1;
          fx.wobble = e.source === 'ball' || e.crit ? 1 : 0.5;
          if (e.ballId >= 0) this.squash.set(e.ballId, 1);
          if (e.source === 'burn') this.burst(e.x, e.y, 4, 40, 0.4, 1, false, -60);
          else this.burst(e.x, e.y, e.crit ? 8 : 3, e.crit ? 110 : 55, 0.3, e.crit ? 1 : 0);
          if (e.crit) {
            this.rings.push({ x: e.x, y: e.y, radius: 18, life: 0.25, max: 0.25, ink: 1 });
            this.kick(2);
          }
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
          }
          if (e.brick.kind === 'boss') this.kick(e.killed ? 10 : 1.2);
          if (e.crit) this.text(e.x, e.y - 6, `${e.damage}!`, true);
          else if (!e.killed || e.source === 'burn') this.text(e.x, e.y, String(e.damage), false, e.source === 'burn', true);
          break;
        }
        case 'immune': {
          const label = IMMUNE_LABEL[e.reason];
          this.burst(e.x, e.y, 2, 40, 0.2, 1);
          if (label && performance.now() - this.lastImmune > 250) {
            this.lastImmune = performance.now();
            this.text(e.x, e.y - 4, label, false, true);
          }
          if (e.reason === 'ice') this.burst(e.x, e.y, 8, 90, 0.4, 0, false, 300, true);
          break;
        }
        case 'explode':
          this.rings.push({ x: e.x, y: e.y, radius: e.radius * 1.4, life: 0.4, max: 0.4, ink: 1 });
          this.rings.push({ x: e.x, y: e.y, radius: e.radius, life: 0.3, max: 0.3, ink: 0 });
          this.burst(e.x, e.y, 22, 220, 0.6, 1, true, 300, true);
          this.kick(5);
          break;
        case 'laser':
          this.beams.push({ kind: e.kind, x: e.x, y: e.y, width: e.width, life: 0.35, max: 0.35 });
          this.kick(3);
          break;
        case 'portal':
          this.rings.push({ x: e.x1, y: e.y1, radius: 16, life: 0.3, max: 0.3, ink: 0 });
          this.rings.push({ x: e.x2, y: e.y2, radius: 16, life: 0.3, max: 0.3, ink: 1 });
          break;
        case 'hazard': {
          const label = HAZARD_LABEL[e.kind];
          if (label && performance.now() - this.lastHazard > 350) {
            this.lastHazard = performance.now();
            this.text(e.x, e.y - 8, label, true);
          }
          if (e.kind === 'popper') {
            this.burst(e.x, e.y, 16, 160, 0.5, 1, true, 200);
            this.rings.push({ x: e.x, y: e.y, radius: 20, life: 0.3, max: 0.3, ink: 1 });
            this.kick(4);
          }
          break;
        }
        case 'spawn':
          this.rings.push({ x: cellCenterX(e.c), y: cellCenterY(e.r), radius: 18, life: 0.3, max: 0.3, ink: 0 });
          break;
        case 'heal':
          this.text(cellCenterX(e.brick.c) + (e.brick.w - 1) * 18, cellCenterY(e.brick.r), `+${e.amount}`, e.brick.kind === 'boss');
          break;
        case 'bounty':
          this.text(e.x, e.y - 10, '+1 BALL', true);
          break;
        case 'boss':
          this.showBanner(e.name.toUpperCase(), e.tell, 2.8);
          this.kick(6);
          break;
        case 'bossDown':
          this.showBanner(`${e.name.toUpperCase()} DOWN`, 'Biome cleared', 2);
          break;
        case 'zap':
          this.zaps.push({ ...e, life: 0.22, max: 0.22, seed: Math.random() * 1000 });
          break;
        case 'split':
          this.rings.push({ x: e.x, y: e.y, radius: 14, life: 0.25, max: 0.25, ink: 0 });
          break;
        case 'ignite':
          this.burst(e.x, e.y, 12, 120, 0.5, 1, true, 0);
          this.rings.push({ x: e.x, y: e.y, radius: 26, life: 0.35, max: 0.35, ink: 1 });
          break;
        case 'shield':
          this.kick(7);
          if (e.kind === 'wind') this.showBanner('SECOND WIND', 'The bottom 3 rows are wiped. This only happens once.', 1.8);
          else this.showBanner('SHIELD!', 'The bottom rows are cleared', 1.4);
          break;
        case 'wall':
          this.squash.set(e.ballId, 1);
          this.burst(e.x, e.y, 2, 30, 0.2, 1);
          break;
        case 'orb':
          this.burst(e.x, e.y, 16, 150, 0.6, 1, true, 0);
          this.rings.push({ x: e.x, y: e.y, radius: 22, life: 0.4, max: 0.4, ink: 1 });
          this.text(e.x, e.y - 4, e.extra ? '+2' : '+1', true);
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
    for (const z of this.zaps) z.life -= dt;
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter((b) => b.life > 0);
    if (this.rings.length > MAX_RINGS) this.rings.splice(0, this.rings.length - MAX_RINGS);
    if (this.zaps.length > MAX_ZAPS) this.zaps.splice(0, this.zaps.length - MAX_ZAPS);
    if (this.beams.length > MAX_BEAMS) this.beams.splice(0, this.beams.length - MAX_BEAMS);
    this.zaps = this.zaps.filter((z) => z.life > 0);
    if (this.banner && (this.banner.life -= dt) <= 0) this.banner = null;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const fx of this.bricks.values()) {
      fx.flash = Math.max(0, fx.flash - dt * 7);
      fx.wobble = Math.max(0, fx.wobble - dt * 6);
    }
    // Forget effects for bricks that left the board some other way (scrolled off, shield, etc).
    if (this.bricks.size > sim.bricks.length + 40) {
      const ids = new Set(sim.bricks.map((b) => b.id));
      for (const id of this.bricks.keys()) if (!ids.has(id)) this.bricks.delete(id);
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
        if (tr.length > this.trailLen * 2) tr.splice(0, 2);
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
    // Thin out bursts as the screen fills up.
    n = Math.ceil(n * Math.max(0.15, 1 - this.particles.length / MAX_PARTICLES));
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

  text(x: number, y: number, text: string, big = false, alt = big, number = false): void {
    if (this.texts.length > (big ? MAX_TEXTS : MAX_TEXTS * 0.6)) return;
    const life = big ? 0.85 : 0.4;
    this.texts.push({ x, y, text, big, life, max: life, alt, number });
  }

  showBanner(title: string, sub: string, seconds = 2.2): void {
    this.banner = { title, sub, life: seconds, max: seconds };
  }

  reset(): void {
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.zaps = [];
    this.beams = [];
    this.banner = null;
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
