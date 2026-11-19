import {
  BALL_R, BRICK, CELL, DROP_TIME, FLOOR, H, ROWS, TOP, W, brickX, brickY, cellCenterX, cellCenterY,
} from '../sim/constants';
import type { Trace } from '../sim/trace';
import type { Sim } from '../sim/world';
import { COMBO_SHOW, type Fx } from './fx';
import { BIOME_INKS, type Inks } from './palette';
import type { View } from './view';

const FONT = '"Space Mono", ui-monospace, Menlo, monospace';
const easeOutBack = (x: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

export interface RenderState {
  sim: Sim;
  fx: Fx;
  trace: Trace | null;
  best: number;
  time: number;
  showHitboxes: boolean;
}

/** Draws the game in the Risograph style: paper, two multiplying inks, halftone and misregistration. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private bgCache: { key: string; canvas: HTMLCanvasElement } | null = null;

  constructor(private view: View) {
    this.ctx = view.canvas.getContext('2d')!;
  }

  inks(sim: Sim): Inks {
    return BIOME_INKS[sim.biome % BIOME_INKS.length];
  }

  draw(s: RenderState): void {
    const { ctx, view } = this;
    const inks = this.inks(s.sim);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.background(inks), 0, 0);

    ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY);
    ctx.save();
    if (s.fx.shake > 0) ctx.translate((Math.random() - 0.5) * s.fx.shake, (Math.random() - 0.5) * s.fx.shake);

    this.drawDanger(s, inks);
    this.drawFloor(inks, s.sim);
    const off = s.sim.phase === 'drop' ? -(1 - easeOutBack(Math.min(1, s.sim.phaseTime / DROP_TIME))) * CELL : 0;
    this.drawBricks(s, inks, off);
    this.drawOrbs(s, inks, off);
    if (s.trace) this.drawTrace(s.trace, inks);
    this.drawBalls(s, inks);
    this.drawLauncher(s, inks);
    this.drawParticles(s, inks);
    this.drawRings(s, inks);
    this.drawZaps(s, inks);
    this.drawTexts(s, inks);
    if (s.showHitboxes) this.drawHitboxes(s);
    ctx.restore();

    this.drawHud(s, inks);
    this.drawCombo(s, inks);
    this.drawBanner(s, inks);
  }

  /** Jagged lightning between two points, re-randomised every frame so it crackles. */
  private drawZaps(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineJoin = 'round';
    for (const z of s.fx.zaps) {
      const f = z.life / z.max;
      for (const [ink, off, w] of [[inks.i1, 1, 2.5], [inks.i2, 0, 1.6]] as const) {
        ctx.strokeStyle = ink;
        ctx.globalAlpha = f;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(z.x1 + off, z.y1);
        const n = 6;
        for (let i = 1; i < n; i++) {
          const t = i / n;
          const jx = (Math.random() - 0.5) * 9, jy = (Math.random() - 0.5) * 9;
          ctx.lineTo(z.x1 + (z.x2 - z.x1) * t + jx + off, z.y1 + (z.y2 - z.y1) * t + jy);
        }
        ctx.lineTo(z.x2 + off, z.y2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Big two-ink title card, e.g. a new biome. */
  private drawBanner(s: RenderState, inks: Inks): void {
    const b = s.fx.banner;
    if (!b) return;
    const { ctx } = this;
    const age = b.max - b.life;
    const a = Math.min(1, age * 4, b.life * 2.5);
    const slide = Math.max(0, 1 - age * 5) * 30;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = inks.paper;
    ctx.globalAlpha = a * 0.85;
    ctx.fillRect(0, H * 0.38, W, 64);
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = 'multiply';
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = inks.i1;
    ctx.fillText(b.title, W / 2 - slide + 2, H * 0.38 + 26);
    ctx.fillStyle = inks.i2;
    ctx.fillText(b.title, W / 2 - slide, H * 0.38 + 24);
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = `400 10px ${FONT}`;
    ctx.fillStyle = inks.i1;
    ctx.fillText(b.sub, W / 2 + slide, H * 0.38 + 48);
    ctx.restore();
  }

  // ---- background ----

  private background(inks: Inks): HTMLCanvasElement {
    const { view } = this;
    const key = `${inks.name}|${view.canvas.width}x${view.canvas.height}`;
    if (this.bgCache?.key === key) return this.bgCache.canvas;
    const c = document.createElement('canvas');
    c.width = view.canvas.width;
    c.height = view.canvas.height;
    const g = c.getContext('2d')!;
    g.fillStyle = inks.paper;
    g.fillRect(0, 0, c.width, c.height);
    g.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY);
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.45;
    halftone(g, W * 0.82, H * 0.2, 90, 6, inks.i2, 2.6);
    halftone(g, W * 0.12, H * 0.88, 170, 6, inks.i1, 2.2);
    this.bgCache = { key, canvas: c };
    return c;
  }

  // ---- world ----

  private drawFloor(inks: Inks, sim: Sim): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = inks.i1;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, FLOOR + 0.5);
    ctx.lineTo(W, FLOOR + 0.5);
    ctx.stroke();
    // Danger: the row a brick must not cross.
    if (sim.lowestRow >= ROWS - 1) {
      ctx.setLineDash([]);
      ctx.strokeStyle = inks.i2;
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(performance.now() * 0.012);
      ctx.lineWidth = 2;
      ctx.strokeRect(1, TOP + (ROWS - 1) * CELL, W - 2, CELL);
    }
    ctx.restore();
  }

  private drawBricks(s: RenderState, inks: Inks, off: number): void {
    const { ctx } = this;
    const ref = Math.max(1, s.sim.level * 1.5);
    for (const b of s.sim.bricks) {
      const fx = s.fx.bricks.get(b.id);
      const flash = fx?.flash ?? 0;
      const k = 1 + (fx?.wobble ?? 0) * 0.1;
      const x = brickX(b.c), y = brickY(b.r) + off;
      const ratio = Math.min(1, b.hp / ref);
      const alpha = 0.28 + ratio * 0.67;
      ctx.save();
      ctx.translate(x + BRICK / 2, y + BRICK / 2);
      ctx.scale(k, k);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = alpha;
      ctx.fillStyle = flash > 0.3 ? inks.i2 : inks.i1;
      ctx.fillRect(-BRICK / 2, -BRICK / 2, BRICK, BRICK);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = inks.i2;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-BRICK / 2 + 1.8, -BRICK / 2 + 1.2, BRICK - 1.5, BRICK - 1.5);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = alpha > 0.62 ? inks.paper : inks.i1;
      const label = String(b.hp);
      ctx.font = `700 ${label.length > 3 ? 10 : label.length > 2 ? 11 : 13}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 1);
      if (b.burn > 0) this.drawFlames(inks, s.time, b.id);
      ctx.restore();
    }
  }

  /** Little ink flames licking up a burning brick (drawn in brick-local space). */
  private drawFlames(inks: Inks, time: number, seed: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = inks.i2;
    for (let i = 0; i < 3; i++) {
      const t = (time * 1.6 + i / 3 + (seed % 7) * 0.13) % 1;
      const x = (i - 1) * 9 + Math.sin(time * 5 + i + seed) * 2;
      const y = BRICK / 2 - t * BRICK * 0.9;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y - 6 * (1 - t) - 2);
      ctx.quadraticCurveTo(x + 3.5, y, x, y + 3);
      ctx.quadraticCurveTo(x - 3.5, y, x, y - 6 * (1 - t) - 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawOrbs(s: RenderState, inks: Inks, off: number): void {
    const { ctx } = this;
    const k = 1 + Math.sin(s.time * 6) * 0.1;
    for (const o of s.sim.orbs) {
      ctx.save();
      ctx.translate(cellCenterX(o.c), cellCenterY(o.r) + off);
      ctx.scale(k, k);
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = inks.i2;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = inks.i1;
      ctx.fillRect(-1.2, -4.5, 2.4, 9);
      ctx.fillRect(-4.5, -1.2, 9, 2.4);
      ctx.restore();
    }
  }

  private drawTrace(t: Trace, inks: Inks): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    let dist = 0;
    for (let i = 1; i < t.points.length; i++) {
      const [x0, y0] = t.points[i - 1], [x1, y1] = t.points[i];
      dist += Math.hypot(x1 - x0, y1 - y0);
      if (dist < 11) continue;
      dist = 0;
      ctx.fillStyle = inks.i2;
      ctx.beginPath();
      ctx.arc(x1, y1, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = inks.i1;
      ctx.beginPath();
      ctx.arc(x1 + 1, y1 + 0.7, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [x, y] of t.contacts) {
      ctx.strokeStyle = inks.i2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A ball printed in two inks, slightly out of register. Stretches along its motion and squashes on impact. */
  private ball(x: number, y: number, inks: Inks, vx = 0, vy = 0, squash = 0, scale = 1): void {
    const { ctx } = this;
    const moving = vx !== 0 || vy !== 0;
    const stretch = moving ? 1.1 : 1;
    const sx = scale * stretch * (1 - squash * 0.35);
    const sy = (scale / stretch) * (1 + squash * 0.3);
    ctx.save();
    ctx.translate(x, y);
    if (moving) ctx.rotate(Math.atan2(vy, vx));
    ctx.fillStyle = inks.i1;
    ctx.beginPath();
    ctx.ellipse(1.2, 0.8, BALL_R * sx, BALL_R * sy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = inks.i2;
    ctx.beginPath();
    ctx.ellipse(0, 0, BALL_R * sx, BALL_R * sy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBalls(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (const tr of s.fx.trails.values()) {
      const n = tr.length / 2;
      ctx.fillStyle = inks.i2;
      for (let i = 0; i < n; i += 2) {
        ctx.globalAlpha = (i / n) * 0.6;
        ctx.beginPath();
        ctx.arc(tr[i * 2], tr[i * 2 + 1], 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const b of s.sim.balls) {
      if (b.state === 'flying') {
        if (b.fire) {
          ctx.strokeStyle = inks.i2;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.6 + 0.4 * Math.sin(s.time * 30 + b.id);
          ctx.beginPath();
          ctx.arc(b.x, b.y, BALL_R * 1.9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (b.copy) ctx.globalAlpha = 0.7;
        this.ball(b.x, b.y, inks, b.vx, b.vy, s.fx.squash.get(b.id) ?? 0, b.fire ? 1.35 : b.copy ? 0.75 : 1);
        ctx.globalAlpha = 1;
      }
      else this.ball(b.x, b.y, inks);
    }
    ctx.restore();
  }

  private drawLauncher(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    const sim = s.sim;
    const showBall = sim.phase === 'aim' || sim.phase === 'drop' || sim.phase === 'over' ||
      (sim.phase === 'fire' && sim.ballsInFlight > sim.balls.filter((b) => b.state === 'flying').length);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    if (showBall) this.ball(sim.launchX, FLOOR - BALL_R, inks, 0, 0, 0, 1 + s.fx.launcherKick * 0.45);
    ctx.restore();
    let count = sim.ballCount;
    if (sim.phase === 'fire' || sim.phase === 'run') {
      count = sim.ballsInFlight - sim.balls.filter((b) => b.state === 'flying').length;
    }
    if (count > 0) {
      ctx.fillStyle = inks.i1;
      ctx.font = `700 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`×${count}`, Math.max(16, Math.min(W - 16, sim.launchX)), FLOOR + 15);
    }
  }

  private drawParticles(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (const p of s.fx.particles) {
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
      ctx.fillStyle = p.ink ? inks.i2 : inks.i1;
      if (p.square) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawRings(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (const r of s.fx.rings) {
      const f = 1 - r.life / r.max;
      ctx.globalAlpha = (1 - f) * 0.9;
      ctx.strokeStyle = r.ink ? inks.i2 : inks.i1;
      ctx.lineWidth = 3 * (1 - f) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * (0.3 + f * 0.9), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Halftone dots rising from the floor as bricks get close: more danger, bigger dots. */
  private drawDanger(s: RenderState, inks: Inks): void {
    const d = s.fx.danger;
    if (d < 0.02) return;
    const { ctx } = this;
    const pulse = 0.75 + 0.25 * Math.sin(s.time * 7);
    const height = CELL * 4;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = inks.i2;
    ctx.globalAlpha = 0.55 * d * pulse;
    for (let y = FLOOR; y > FLOOR - height; y -= 6) {
      const k = 1 - (FLOOR - y) / height;
      const r = 2.4 * k * k * d;
      if (r < 0.3) continue;
      for (let x = 3; x < W; x += 6) {
        ctx.beginPath();
        ctx.arc(x + ((y / 6) % 2) * 3, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawCombo(s: RenderState, inks: Inks): void {
    const { fx } = s;
    if (fx.combo < COMBO_SHOW || fx.comboFade <= 0) return;
    const { ctx } = this;
    const k = 1 + fx.comboPop * 0.5;
    ctx.save();
    ctx.translate(W / 2, TOP + 26);
    ctx.scale(k, k);
    ctx.rotate(-0.06 + fx.comboPop * 0.08);
    ctx.globalAlpha = Math.min(1, fx.comboFade * 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 20px ${FONT}`;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = inks.i1;
    ctx.fillText(`${fx.combo}× COMBO`, 1.5, 1);
    ctx.fillStyle = inks.i2;
    ctx.fillText(`${fx.combo}× COMBO`, 0, 0);
    ctx.restore();
  }

  private drawTexts(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    for (const t of s.fx.texts) {
      const f = t.life / t.max;
      const k = t.big ? 1 + Math.max(0, f - 0.72) * 2.6 : 1;
      ctx.save();
      ctx.globalAlpha = Math.min(1, f * 2.2);
      ctx.translate(t.x, t.y);
      ctx.scale(k, k);
      ctx.font = `700 ${t.big ? 16 : 10}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = inks.paper;
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = t.alt ? inks.i2 : inks.i1;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
  }

  private drawHitboxes(s: RenderState): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,0,0,.7)';
    ctx.lineWidth = 0.5;
    for (const b of s.sim.bricks) ctx.strokeRect(brickX(b.c), brickY(b.r), BRICK, BRICK);
    for (const b of s.sim.balls) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeRect(0, TOP, W, FLOOR - TOP);
    ctx.restore();
  }

  // ---- HUD ----

  private drawHud(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    ctx.fillStyle = inks.i1;
    ctx.textBaseline = 'middle';
    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`DEPTH ${s.sim.level}`, 10, 13);
    ctx.font = `400 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`BEST ${Math.max(s.best, s.sim.level)}`, W / 2, 13);
    if (s.sim.shields > 0) {
      ctx.textAlign = 'right';
      ctx.font = `700 10px ${FONT}`;
      ctx.fillStyle = inks.i2;
      ctx.fillText(`◆${s.sim.shields}`, W - 44, 13);
    }
    // Biome name and progress through it.
    ctx.fillStyle = inks.i1;
    ctx.textAlign = 'left';
    ctx.font = `700 8px ${FONT}`;
    const name = inks.name.toUpperCase();
    ctx.fillText(name, 10, 27);
    const x0 = 14 + ctx.measureText(name).width, x1 = W - 10;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x0, 26, x1 - x0, 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = inks.i2;
    ctx.fillRect(x0, 26, (x1 - x0) * s.sim.biomeProgress, 2);
    // Tick marking the halfway pick.
    ctx.fillStyle = inks.i1;
    ctx.fillRect(x0 + (x1 - x0) * 0.5 - 0.5, 24, 1, 6);
    ctx.restore();
  }
}

function halftone(
  g: CanvasRenderingContext2D, cx: number, cy: number, rad: number, step: number, color: string, maxDot: number,
): void {
  g.fillStyle = color;
  for (let y = cy - rad; y < cy + rad; y += step) {
    for (let x = cx - rad; x < cx + rad; x += step) {
      const d = Math.hypot(x - cx, y - cy) / rad;
      if (d > 1) continue;
      const r = maxDot * (1 - d * d);
      if (r < 0.3) continue;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
}
