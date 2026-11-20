import { isHazard } from '../content/bricks';
import {
  BALL_R, CELL, DROP_TIME, FLOOR, H, ROWS, TOP, W, brickX, brickY, cellCenterX, cellCenterY, span,
} from '../sim/constants';
import type { Trace } from '../sim/trace';
import type { Ball, Brick, Item } from '../sim/types';
import type { Sim } from '../sim/world';
import { bossFor } from '../content/bosses';
import { COMBO_SHOW, type Fx } from './fx';
import { biomeName, inksFor, type Inks } from './palette';
import type { View } from './view';

const FONT = '"Space Mono", ui-monospace, Menlo, monospace';
const TAU = Math.PI * 2;
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
  /** Show small damage numbers. */
  numbers: boolean;
  /** Ball skin id. */
  skin: string;
}

/**
 * Draws the game in the Risograph style: paper, two inks, halftone and misregistration.
 * Only the cached background uses real multiply blending. Per-frame drawing uses normal blending,
 * which looks nearly the same on light paper but avoids a costly read-back on phone GPUs.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private bgCache: { key: string; canvas: HTMLCanvasElement } | null = null;
  private dark: HTMLCanvasElement | null = null;

  constructor(private view: View) {
    // Opaque canvas: we paint the whole background every frame, and phones composite it faster.
    this.ctx = view.canvas.getContext('2d', { alpha: false })!;
  }

  /** Forget cached layers (after a resolution change). */
  invalidate(): void {
    this.bgCache = null;
    this.dark = null;
  }

  inks(sim: Sim): Inks {
    return inksFor(sim.biome);
  }

  draw(s: RenderState): void {
    const { ctx, view } = this;
    this.skin = s.skin;
    const inks = this.inks(s.sim);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.background(inks), 0, 0);

    ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY);
    ctx.save();
    if (s.fx.shake > 0) ctx.translate((Math.random() - 0.5) * s.fx.shake, (Math.random() - 0.5) * s.fx.shake);

    const off = s.sim.phase === 'drop' ? -(1 - easeOutBack(Math.min(1, s.sim.phaseTime / DROP_TIME))) * CELL : 0;
    if (s.sim.gimmick === 'current') this.drawCurrent(s, inks);
    this.drawDanger(s, inks);
    this.drawFloor(inks, s.sim);
    this.drawItems(s, inks, off);
    this.drawBricks(s, inks, off);
    if (s.sim.gimmick === 'dark') this.drawDarkness(s, inks);
    if (s.trace) this.drawTrace(s.trace, inks);
    this.drawBeams(s, inks);
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
    this.drawWipe(s, inks);
    this.drawBanner(s, inks);
  }

  /** Biome change: a band of the new secondary ink sweeps down the board with a halftone edge. */
  private drawWipe(s: RenderState, inks: Inks): void {
    const left = s.fx.wipeLeft;
    if (left <= 0) return;
    const { ctx } = this;
    const t = 1 - left / s.fx.wipeTime;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const band = 90;
    const y = -band + e * (H + band * 2);
    ctx.save();
    ctx.fillStyle = inks.i2;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, y - band, W, band);
    // Halftone fringe on both edges.
    for (const [edge, dir] of [[y, 1], [y - band, -1]] as const) {
      for (let row = 0; row < 4; row++) {
        const r = 2.6 - row * 0.6;
        const yy = edge + dir * (row * 6 + 3);
        ctx.beginPath();
        for (let x = 3 + (row % 2) * 3; x < W; x += 6) { ctx.moveTo(x + r, yy); ctx.arc(x, yy, r, 0, TAU); }
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---- background and biome effects ----

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
    // Paper grain, baked in once instead of a full-screen blended overlay every frame.
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 0.5;
    const pattern = g.createPattern(grainTile(), 'repeat');
    if (pattern) {
      g.fillStyle = pattern;
      g.fillRect(0, 0, c.width, c.height);
    }
    this.bgCache = { key, canvas: c };
    return c;
  }

  /** The Deep: faint chevrons drifting the way the current pushes. */
  private drawCurrent(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    const dir = Math.sign(s.sim.current);
    ctx.save();
    ctx.strokeStyle = inks.i1;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1.5;
    const shift = ((s.time * 22 * dir) % 36 + 36) % 36;
    for (let r = 0; r < ROWS; r++) {
      const y = TOP + r * CELL + CELL / 2;
      for (let x = -36 + shift + (r % 2) * 18; x < W + 36; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x - 3 * dir, y - 5);
        ctx.lineTo(x + 3 * dir, y);
        ctx.lineTo(x - 3 * dir, y + 5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Caverns: everything is in shadow except near balls, the launcher and the aim laser.
   * Drawn at half resolution with a capped number of lights to keep phones at 60fps.
   */
  private drawDarkness(s: RenderState, inks: Inks): void {
    const { ctx, view } = this;
    const k = 0.5;
    const w = Math.ceil(view.canvas.width * k), h = Math.ceil(view.canvas.height * k);
    if (!this.dark || this.dark.width !== w || this.dark.height !== h) {
      this.dark = document.createElement('canvas');
      this.dark.width = w;
      this.dark.height = h;
    }
    const g = this.dark.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(view.scale * k, 0, 0, view.scale * k, view.offX * k, view.offY * k);
    g.globalCompositeOperation = 'source-over';
    const dark = 0.6 + 0.3 * s.sim.intensity;
    const reach = 1.15 - 0.3 * s.sim.intensity;
    g.fillStyle = inks.i1;
    g.globalAlpha = dark;
    g.fillRect(0, TOP, W, FLOOR - TOP);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-out';
    const light = (x: number, y: number, r: number) => {
      const grad = g.createRadialGradient(x, y, r * 0.25, x, y, r);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const sources: [number, number, number][] = [[s.sim.launchX, FLOOR, 60 * reach]];
    const flying = s.sim.balls.filter((b) => b.state === 'flying');
    const step = Math.max(1, Math.ceil(flying.length / 24));
    for (let i = 0; i < flying.length; i += step) sources.push([flying[i].x, flying[i].y, (flying[i].fire ? 70 : 48) * reach]);
    if (s.trace) for (let i = 0; i < s.trace.points.length; i += 5) sources.push([s.trace.points[i][0], s.trace.points[i][1], 28 * reach]);
    for (const [x, y, r] of sources) light(x, y, r);
    // Remember bricks once they've been lit, so they stay outlined in the dark.
    for (const b of s.sim.bricks) {
      if (this.seenInDark.has(b.id)) continue;
      const bx = cellCenterX(b.c), by = cellCenterY(b.r);
      if (sources.some(([x, y, r]) => (x - bx) ** 2 + (y - by) ** 2 < (r * 0.8) ** 2)) this.seenInDark.add(b.id);
    }
    for (const r of s.fx.rings.slice(-12)) light(r.x, r.y, r.radius * 2);
    for (const it of s.sim.items) if (it.kind === 'orb') light(cellCenterX(it.c), cellCenterY(it.r), 16);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.dark, 0, 0, view.canvas.width, view.canvas.height);
    ctx.restore();
    // Outlines of remembered bricks.
    ctx.save();
    ctx.strokeStyle = inks.i2;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    for (const b of s.sim.bricks) if (this.seenInDark.has(b.id)) ctx.rect(brickX(b.c) + 1, brickY(b.r) + 1, span(b.w) - 2, span(b.h) - 2);
    ctx.stroke();
    ctx.restore();
    if (this.seenInDark.size > 400) this.seenInDark = new Set([...this.seenInDark].slice(-200));
  }
  private seenInDark = new Set<number>();

  private drawFloor(inks: Inks, sim: Sim): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = inks.i1;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, FLOOR + 0.5);
    ctx.lineTo(W, FLOOR + 0.5);
    ctx.stroke();
    const danger = sim.dangerRow;
    if (sim.lowestRow >= danger - 1) {
      ctx.setLineDash([]);
      ctx.strokeStyle = inks.i2;
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(performance.now() * 0.012);
      ctx.lineWidth = 2;
      ctx.strokeRect(1, TOP + (danger - 1) * CELL, W - 2, CELL);
    }
    ctx.restore();
    this.drawLava(inks, sim);
  }

  /** Forge: lava rows at the bottom, and a dashed warning where it will reach next turn. */
  private drawLava(inks: Inks, sim: Sim): void {
    if (sim.gimmick !== 'heat') return;
    const { ctx } = this;
    const t = performance.now() / 1000;
    const now = sim.lava, next = sim.lavaAt(sim.turn + 1);
    ctx.save();
    if (now > 0) {
      const y0 = TOP + (ROWS - now) * CELL;
      ctx.fillStyle = inks.i2;
      ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t * 3);
      ctx.fillRect(0, y0, W, FLOOR - y0);
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 6) ctx.lineTo(x, y0 + Math.sin(x * 0.12 + t * 4) * 2.5);
      ctx.lineTo(W, y0 + 6); ctx.lineTo(0, y0 + 6); ctx.closePath();
      ctx.fill();
    }
    if (next > now && sim.phase === 'aim') {
      const y1 = TOP + (ROWS - next) * CELL;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 8);
      ctx.strokeStyle = inks.i2;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(W, y1); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = inks.i2;
      ctx.font = `700 8px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText('LAVA RISES NEXT TURN', W - 6, y1 - 4);
    }
    ctx.restore();
  }

  // ---- bricks ----

  private drawBricks(s: RenderState, inks: Inks, off: number): void {
    const ref = Math.max(1, s.sim.level * 1.5);
    this.drawShieldLinks(s, inks, off);
    for (const b of s.sim.bricks) {
      if (b.kind === 'boss') this.drawBoss(s, inks, b, off);
      else if (b.kind === 'loot') this.drawLoot(s, inks, b, off);
      else this.drawBrick(s, inks, b, off, ref);
    }
  }

  private drawBrick(s: RenderState, inks: Inks, b: Brick, off: number, ref: number): void {
    const { ctx } = this;
    const fx = s.fx.bricks.get(b.id);
    const flash = fx?.flash ?? 0;
    const k = 1 + (fx?.wobble ?? 0) * 0.1;
    const size = span(1);
    const x = brickX(b.c), y = brickY(b.r) + off;
    const half = size / 2;
    const hazard = isHazard(b.kind);
    const steel = b.kind === 'steel';
    const ratio = steel ? 1 : Math.min(1, b.hp / ref);
    const alpha = steel ? 0.9 : hazard ? 0.2 + ratio * 0.45 : 0.28 + ratio * 0.67;

    ctx.save();
    ctx.translate(x + half, y + half);
    ctx.scale(k, k);

    // Body.
    ctx.globalAlpha = alpha;
    ctx.fillStyle = flash > 0.3 ? inks.i2 : hazard ? inks.i2 : inks.i1;
    if (hazard) {
      sawtooth(ctx, half, 5, 2.2);
      ctx.fill();
    } else ctx.fillRect(-half, -half, size, size);

    // Outline (hazards: jagged; armored: double; others: offset print).
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 1.5;
    if (hazard) {
      ctx.strokeStyle = inks.i1;
      sawtooth(ctx, half, 5, 2.2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = inks.i2;
      ctx.strokeRect(-half + 1.8, -half + 1.2, size - 1.5, size - 1.5);
      if (b.kind === 'armored') {
        ctx.strokeStyle = inks.i1;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-half + 4, -half + 4, size - 8, size - 8);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const dark = alpha > 0.62;
    const ink = dark ? inks.paper : inks.i1;
    const glyph = this.glyph(b.kind, ink, inks);
    if (b.kind !== 'normal' && b.kind !== 'steel') {
      // Symbol on top, small HP below.
      ctx.save();
      ctx.translate(0, -5);
      glyph();
      ctx.restore();
      if (b.kind !== 'popper') this.hpLabel(b.hp, 0, 9, 9, ink);
    } else if (steel) {
      glyph();
    } else this.hpLabel(b.hp, 0, 1, 13, ink);

    if (b.frozen) this.drawFrost(inks, half);
    if (b.bloom) this.drawBloom(inks, half, s.time);
    if (b.timer && (b.kind === 'fuse' || b.kind === 'thief')) this.drawTimer(inks, half, b.timer, b.kind === 'fuse' ? 3 : 2);
    if (b.burn > 0) this.drawFlames(inks, s.time, b.id);
    ctx.restore();
  }

  private hpLabel(hp: number, x: number, y: number, max: number, color: string): void {
    const { ctx } = this;
    const label = hp >= 10000 ? `${Math.round(hp / 1000)}k` : String(hp);
    ctx.fillStyle = color;
    ctx.font = `700 ${label.length > 3 ? max - 3 : label.length > 2 ? max - 2 : max}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
  }

  /** Small symbols drawn in brick-local space, centred on 0,0, about 12px across. */
  glyph(kind: Brick['kind'], ink: string, inks: Inks): () => void {
    const { ctx } = this;
    const line = (pts: number[][], close = false) => {
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      if (close) ctx.closePath();
    };
    return () => {
      ctx.strokeStyle = ink;
      ctx.fillStyle = ink;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      switch (kind) {
        case 'bomb':
          ctx.beginPath(); ctx.arc(0, 1.5, 4.5, 0, TAU); ctx.fill();
          line([[2.5, -2.5], [5, -5.5]]); ctx.stroke();
          ctx.fillStyle = inks.i2; ctx.beginPath(); ctx.arc(5.5, -6, 1.6, 0, TAU); ctx.fill();
          break;
        case 'armored':
          line([[0, -5.5], [5, -3.5], [4, 3], [0, 5.5], [-4, 3], [-5, -3.5]], true); ctx.stroke();
          break;
        case 'splitter':
          ctx.setLineDash([2, 2]); line([[0, -6], [0, 6]]); ctx.stroke(); ctx.setLineDash([]);
          line([[-5, -2], [-2, 0], [-5, 2]]); ctx.stroke();
          line([[5, -2], [2, 0], [5, 2]]); ctx.stroke();
          break;
        case 'steel':
          ctx.lineWidth = 2;
          line([[-6, -6], [6, 6]]); ctx.stroke();
          line([[6, -6], [-6, 6]]); ctx.stroke();
          break;
        case 'popper':
          star(ctx, 0, 5, 8, 3.2, 8); ctx.fill();
          break;
        case 'anchor':
          line([[0, -5.5], [0, 5]]); ctx.stroke();
          line([[-3, -3], [3, -3]]); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 1, 5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
          break;
        case 'balloon':
          ctx.beginPath(); ctx.ellipse(0, -1.5, 3.8, 4.6, 0, 0, TAU); ctx.stroke();
          line([[0, 3], [-1.5, 5], [1, 6.5]]); ctx.stroke();
          break;
        case 'sponge':
          for (const [px, py, r] of [[-3, -2, 1.6], [2.5, -3, 1.2], [1, 2, 1.8], [-3, 3.5, 1]]) {
            ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
          }
          break;
        case 'shrinker':
          line([[-6, -6], [-2, -2]]); ctx.stroke(); line([[-2, -5], [-2, -2], [-5, -2]]); ctx.stroke();
          line([[6, 6], [2, 2]]); ctx.stroke(); line([[2, 5], [2, 2], [5, 2]]); ctx.stroke();
          break;
        case 'spawner':
          ctx.fillRect(-5, -5, 4, 4); ctx.fillRect(1, 1, 4, 4);
          line([[3, -5], [3, -1]]); ctx.stroke(); line([[1, -3], [5, -3]]); ctx.stroke();
          break;
        case 'sprinter':
          line([[-4, -5], [0, -1.5], [4, -5]]); ctx.stroke();
          line([[-4, 0], [0, 3.5], [4, 0]]); ctx.stroke();
          break;
        case 'shielder':
          line([[0, -6], [5, -4], [4.5, 2], [0, 6], [-4.5, 2], [-5, -4]], true); ctx.stroke();
          line([[0, -2.5], [0, 2.5]]); ctx.stroke(); line([[-2.5, 0], [2.5, 0]]); ctx.stroke();
          break;
        case 'healer':
          ctx.fillRect(-1.8, -6, 3.6, 12); ctx.fillRect(-6, -1.8, 12, 3.6);
          break;
        case 'fuse':
          ctx.beginPath(); ctx.arc(0, 1.5, 4.5, 0, TAU); ctx.stroke();
          line([[2.5, -2.5], [4.5, -5], [6.5, -4.5]]); ctx.stroke();
          break;
        case 'thief':
          ctx.fillRect(-6.5, -2.5, 13, 5);
          ctx.fillStyle = inks.i2;
          ctx.beginPath(); ctx.arc(-3, 0, 1.6, 0, TAU); ctx.arc(3, 0, 1.6, 0, TAU); ctx.fill();
          break;
        default:
          break;
      }
    };
  }

  /** Countdown badge in the corner (Fuse, Thief). Pulses on its last turn. */
  private drawTimer(inks: Inks, half: number, t: number, max: number): void {
    const { ctx } = this;
    const urgent = t <= 1;
    const r = urgent ? 6.5 + Math.sin(performance.now() * 0.015) * 1 : 6;
    ctx.save();
    ctx.translate(half - 3, -half + 3);
    ctx.fillStyle = urgent ? inks.i2 : inks.paper;
    ctx.strokeStyle = inks.i1;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = urgent ? inks.paper : inks.i1;
    ctx.font = `700 9px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.min(t, max)), 0, 0.5);
    ctx.restore();
  }

  /** Meadow bloom: a little two-ink flower in the corner. Break it for an extra ball. */
  private drawBloom(inks: Inks, half: number, time: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(-half + 5, -half + 5);
    ctx.rotate(time * 0.8);
    ctx.fillStyle = inks.i2;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 3, Math.sin(a) * 3, 2.2, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = inks.paper;
    ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /** Shielders tie their neighbours together with a dashed ink line. */
  private drawShieldLinks(s: RenderState, inks: Inks, off: number): void {
    const shielders = s.sim.bricks.filter((b) => b.kind === 'shielder');
    if (!shielders.length) return;
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = inks.i2;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = -s.time * 12;
    ctx.beginPath();
    for (const sh of shielders) {
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = s.sim.grid.get((sh.r + dr) * 64 + sh.c + dc);
        if (!n || n === sh || n.boss) continue;
        ctx.moveTo(cellCenterX(sh.c), cellCenterY(sh.r) + off);
        ctx.lineTo(cellCenterX(n.c), cellCenterY(n.r) + off);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Loot brick: paper card with a genre symbol, pulsing so it reads as a prize. */
  private drawLoot(s: RenderState, inks: Inks, b: Brick, off: number): void {
    const { ctx } = this;
    const fx = s.fx.bricks.get(b.id);
    const size = span(1), half = size / 2;
    const k = 1 + (fx?.wobble ?? 0) * 0.12 + Math.sin(s.time * 4 + b.c) * 0.03;
    ctx.save();
    ctx.translate(brickX(b.c) + half, brickY(b.r) + half + off);
    ctx.scale(k, k);
    ctx.fillStyle = inks.i2;
    ctx.fillRect(-half + 2, -half + 2, size, size);
    ctx.fillStyle = (fx?.flash ?? 0) > 0.3 ? inks.i2 : inks.paper;
    ctx.fillRect(-half, -half, size, size);
    ctx.strokeStyle = inks.i1;
    ctx.lineWidth = 2;
    ctx.strokeRect(-half + 1, -half + 1, size - 2, size - 2);
    ctx.save();
    ctx.translate(0, -4);
    lootGlyph(ctx, b.loot ?? 'wild', inks);
    ctx.restore();
    this.hpLabel(b.hp, 0, 10, 8, inks.i1);
    ctx.restore();
  }

  /** Frostline: an icy crust, cracked off by the first hit. */
  private drawFrost(inks: Inks, half: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-half, -half, half * 2, half * 2);
    ctx.clip();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = inks.paper;
    ctx.lineWidth = 1.2;
    for (let d = -half * 2; d <= half * 2; d += 7) {
      ctx.beginPath();
      ctx.moveTo(d - half, half);
      ctx.lineTo(d + half, -half);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = inks.i2;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(-half + 1, -half + 1, half * 2 - 2, half * 2 - 2);
    ctx.restore();
  }

  /** Little ink flames licking up a burning brick (drawn in brick-local space). */
  private drawFlames(inks: Inks, time: number, seed: number): void {
    const { ctx } = this;
    const size = span(1);
    ctx.save();
    ctx.fillStyle = inks.i2;
    for (let i = 0; i < 3; i++) {
      const t = (time * 1.6 + i / 3 + (seed % 7) * 0.13) % 1;
      const x = (i - 1) * 9 + Math.sin(time * 5 + i + seed) * 2;
      const y = size / 2 - t * size * 0.9;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y - 6 * (1 - t) - 2);
      ctx.quadraticCurveTo(x + 3.5, y, x, y + 3);
      ctx.quadraticCurveTo(x - 3.5, y, x, y - 6 * (1 - t) - 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBoss(s: RenderState, inks: Inks, b: Brick, off: number): void {
    const { ctx } = this;
    const fx = s.fx.bricks.get(b.id);
    const flash = fx?.flash ?? 0;
    const k = 1 + (fx?.wobble ?? 0) * 0.05;
    const w = span(b.w), h = span(b.h);
    const x = brickX(b.c), y = brickY(b.r) + off;
    const st = b.boss!;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(k, k);
    // Body: dense halftone over a solid fill, offset print.
    ctx.fillStyle = flash > 0.3 ? inks.i2 : inks.i1;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = inks.i2;
    ctx.lineWidth = 3;
    ctx.strokeRect(-w / 2 + 2.5, -h / 2 + 2, w - 2, h - 2);
    // Teeth along the bottom edge.
    ctx.fillStyle = inks.paper;
    ctx.globalCompositeOperation = 'source-over';
    const teeth = b.w > 2 ? 7 : 5;
    for (let i = 0; i < teeth; i++) {
      const tx = -w / 2 + 8 + i * ((w - 16) / (teeth - 1));
      ctx.beginPath();
      ctx.moveTo(tx - 3, h / 2 - 12);
      ctx.lineTo(tx + 3, h / 2 - 12);
      ctx.lineTo(tx, h / 2 - 6);
      ctx.fill();
    }
    // Eyes that follow the nearest ball (or the launcher).
    const target = s.sim.balls.find((bb) => bb.state === 'flying') ?? { x: s.sim.launchX, y: FLOOR };
    const eyeY = -h / 2 + 18, eyeR = b.w > 2 ? 9 : 6;
    const eyes = b.w > 2 ? [-24, 0, 24] : [-12, 12];
    for (const ex of eyes) {
      const cx = x + w / 2 + ex, cy = y + h / 2 + eyeY;
      const a = Math.atan2(target.y - cy, target.x - cx);
      ctx.fillStyle = inks.paper;
      ctx.beginPath(); ctx.arc(ex, eyeY, eyeR, 0, TAU); ctx.fill();
      ctx.fillStyle = inks.i2;
      ctx.beginPath(); ctx.arc(ex + Math.cos(a) * eyeR * 0.4, eyeY + Math.sin(a) * eyeR * 0.4, eyeR * 0.47, 0, TAU); ctx.fill();
    }
    this.hpLabel(b.hp, 0, b.h > 2 ? 12 : 9, b.w > 2 ? 16 : 13, inks.paper);

    // Gimmick tells.
    switch (st.id) {
      case 'glacier': {
        ctx.fillStyle = inks.i2;
        const t = 5;
        const sides: [number, number, number, number][] = [
          [-w / 2 - t, -h / 2 - t, w + t * 2, t], [w / 2, -h / 2 - t, t, h + t * 2],
          [-w / 2 - t, h / 2, w + t * 2, t], [-w / 2 - t, -h / 2 - t, t, h + t * 2],
        ];
        ctx.fillRect(...sides[st.side]);
        break;
      }
      case 'lantern': {
        ctx.strokeStyle = inks.i2;
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(s.time * 4);
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(0, 0, w * 0.75, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        break;
      }
      case 'leviathan': {
        ctx.fillStyle = inks.i2;
        const ax = (w / 2 + 6) * st.dir;
        ctx.beginPath();
        ctx.moveTo(ax, -6); ctx.lineTo(ax + 7 * st.dir, 0); ctx.lineTo(ax, 6);
        ctx.fill();
        break;
      }
      case 'anvil': {
        const need = b.maxHp * 0.2;
        const prog = Math.min(1, st.turnDamage / need);
        ctx.fillStyle = inks.i2;
        ctx.fillRect(-w / 2, h / 2 + 3, w * prog, 3);
        ctx.strokeStyle = inks.i1;
        ctx.lineWidth = 1;
        ctx.strokeRect(-w / 2, h / 2 + 3, w, 3);
        break;
      }
      case 'core': {
        if (st.phase === 1) {
          ctx.fillStyle = inks.i2;
          const t = 6;
          const sides: [number, number, number, number][] = [
            [-w / 2 - t, -h / 2 - t, w + t * 2, t], [w / 2, -h / 2 - t, t, h + t * 2],
            [-w / 2 - t, h / 2, w + t * 2, t], [-w / 2 - t, -h / 2 - t, t, h + t * 2],
          ];
          ctx.fillRect(...sides[st.side]);
          ctx.fillRect(...sides[(st.side + 2) % 4]);
        } else if (st.phase === 2) {
          ctx.strokeStyle = inks.i2;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(s.time * 6);
          ctx.strokeRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10);
          ctx.globalAlpha = 1;
        } else {
          // Meltdown: cracks and a hot glow.
          ctx.strokeStyle = inks.paper;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-w / 2 + 6, -h / 2 + 30); ctx.lineTo(-6, 4); ctx.lineTo(-14, h / 2 - 16);
          ctx.moveTo(w / 2 - 8, -h / 2 + 8); ctx.lineTo(10, -2); ctx.lineTo(20, 18);
          ctx.stroke();
          ctx.strokeStyle = inks.i2;
          ctx.lineWidth = 3;
          ctx.globalAlpha = 0.4 + 0.4 * Math.sin(s.time * 14);
          ctx.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'brood': {
        ctx.fillStyle = inks.i2;
        for (const [ex, ey] of [[-w / 2 - 4, -8], [w / 2 + 4, 4], [-w / 2 - 4, 10]]) {
          ctx.beginPath(); ctx.ellipse(ex, ey, 2.5, 3.2, 0, 0, TAU); ctx.fill();
        }
        break;
      }
    }
    if (b.burn > 0) this.drawFlames(inks, s.time, b.id);
    ctx.restore();
  }

  // ---- items ----

  private drawItems(s: RenderState, inks: Inks, off: number): void {
    const { ctx } = this;
    const pulse = 1 + Math.sin(s.time * 6) * 0.1;
    for (const it of s.sim.items) {
      ctx.save();
      ctx.translate(cellCenterX(it.c), cellCenterY(it.r) + off);
      this.drawItem(it, inks, pulse, s.time);
      ctx.restore();
    }
  }

  drawItem(it: Item, inks: Inks, pulse: number, time: number): void {
    const { ctx } = this;
    switch (it.kind) {
      case 'orb':
        ctx.scale(pulse, pulse);
        ctx.strokeStyle = inks.i2;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.stroke();
        ctx.fillStyle = inks.i1;
        ctx.fillRect(-1.2, -4.5, 2.4, 9);
        ctx.fillRect(-4.5, -1.2, 9, 2.4);
        break;
      case 'laserH':
      case 'laserV': {
        if (it.kind === 'laserV') ctx.rotate(Math.PI / 2);
        ctx.globalAlpha = it.used ? 0.35 : 1;
        ctx.strokeStyle = inks.i2;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.stroke();
        ctx.strokeStyle = inks.i1;
        ctx.beginPath();
        ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
        ctx.moveTo(-6, 0); ctx.lineTo(-3, -3); ctx.moveTo(-6, 0); ctx.lineTo(-3, 3);
        ctx.moveTo(6, 0); ctx.lineTo(3, -3); ctx.moveTo(6, 0); ctx.lineTo(3, 3);
        ctx.stroke();
        break;
      }
      case 'spikes':
        ctx.fillStyle = inks.i2;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const q = i % 2 ? 4 : 13;
          const a = (i * Math.PI) / 8;
          ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q);
        }
        ctx.closePath();
        ctx.globalAlpha = 0.85;
        ctx.fill();
        break;
      case 'portal':
        ctx.rotate(time * 2 * (it.id % 2 ? 1 : -1));
        for (const [r, ink] of [[9, inks.i2], [6, inks.i1], [3, inks.i2]] as const) {
          ctx.strokeStyle = ink;
          ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 1.5); ctx.stroke();
        }
        break;
    }
  }

  // ---- shots and balls ----

  private drawTrace(t: Trace, inks: Inks): void {
    const { ctx } = this;
    ctx.save();
    let dist = 0;
    for (let i = 1; i < t.points.length; i++) {
      const [x0, y0] = t.points[i - 1], [x1, y1] = t.points[i];
      dist += Math.hypot(x1 - x0, y1 - y0);
      if (dist < 11) continue;
      dist = 0;
      ctx.fillStyle = inks.i2;
      ctx.beginPath(); ctx.arc(x1, y1, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = inks.i1;
      ctx.beginPath(); ctx.arc(x1 + 1, y1 + 0.7, 2, 0, TAU); ctx.fill();
    }
    for (const [x, y] of t.contacts) {
      ctx.strokeStyle = inks.i2;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, BALL_R, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  private skin = 'ink';

  /** A ball printed in two inks, slightly out of register. Stretches along its motion and squashes on impact. */
  private ball(x: number, y: number, inks: Inks, vx = 0, vy = 0, squash = 0, scale = 1): void {
    const { ctx } = this;
    const moving = vx !== 0 || vy !== 0;
    const stretch = moving ? 1.1 : 1;
    const sx = scale * stretch * (1 - squash * 0.35);
    const sy = (scale / stretch) * (1 + squash * 0.3);
    const hollow = this.skin === 'hollow';
    ctx.save();
    ctx.translate(x, y);
    if (moving) ctx.rotate(Math.atan2(vy, vx));
    ctx.scale(sx, sy);
    ctx.lineWidth = 1.8 / Math.max(sx, sy);
    for (const [ink, dx, dy] of [[inks.i1, 1.2, 0.8], [inks.i2, 0, 0]] as const) {
      ctx.beginPath();
      ballPath(ctx, dx / sx, dy / sy, BALL_R, this.skin);
      if (hollow) { ctx.strokeStyle = ink; ctx.stroke(); } else { ctx.fillStyle = ink; ctx.fill(); }
    }
    ctx.restore();
  }

  private drawBalls(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    ctx.save();
    // Trails: one path per fade level instead of one fill per dot.
    ctx.fillStyle = inks.i2;
    const levels = 3;
    for (let lv = 1; lv <= levels; lv++) {
      ctx.globalAlpha = (lv / levels) * 0.5;
      ctx.beginPath();
      for (const tr of s.fx.trails.values()) {
        const n = tr.length / 2;
        for (let i = 0; i < n; i += 2) {
          if (Math.ceil(((i + 1) / n) * levels) !== lv) continue;
          ctx.moveTo(tr[i * 2] + 1.6, tr[i * 2 + 1]);
          ctx.arc(tr[i * 2], tr[i * 2 + 1], 1.6, 0, TAU);
        }
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const visible = s.sim.balls.filter((b) => b.state !== 'held' || b.heldBy === -1);
    if (visible.length > 30) this.drawBallsBatched(s, inks, visible);
    else {
      for (const b of visible) {
        if (b.state === 'flying') this.drawFlyingBall(s, inks, b);
        else this.ball(b.x, b.y, inks);
      }
    }
    ctx.restore();
  }

  /** Lots of balls: plain two-ink circles in two fills, plus one stroke for all the fireball rings. */
  private drawBallsBatched(s: RenderState, inks: Inks, balls: Ball[]): void {
    const { ctx } = this;
    const r = (b: Ball) => BALL_R * (b.fire ? 1.35 : b.copy ? 0.75 : b.shrunk ? 0.65 : 1);
    const hollow = this.skin === 'hollow';
    ctx.lineWidth = 1.8;
    for (const [ink, dx, dy] of [[inks.i1, 1.2, 0.8], [inks.i2, 0, 0]] as const) {
      ctx.beginPath();
      for (const b of balls) ballPath(ctx, b.x + dx, b.y + dy, r(b), this.skin);
      if (hollow) { ctx.strokeStyle = ink; ctx.stroke(); } else { ctx.fillStyle = ink; ctx.fill(); }
    }
    const rings = balls.filter((b) => b.state === 'flying' && (b.fire || b.golden));
    if (rings.length) {
      ctx.strokeStyle = inks.i2;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (const b of rings) {
        const rr = BALL_R * (b.fire ? 1.9 : 1.6);
        ctx.moveTo(b.x + rr, b.y);
        ctx.arc(b.x, b.y, rr, 0, TAU);
      }
      ctx.stroke();
    }
    void s;
  }

  private drawFlyingBall(s: RenderState, inks: Inks, b: Ball): void {
    const { ctx } = this;
    const ring = (r: number, w: number, dash?: number[]) => {
      ctx.strokeStyle = inks.i2;
      ctx.lineWidth = w;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    };
    if (b.fire) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(s.time * 30 + b.id);
      ring(BALL_R * 1.9, 1.5);
      ctx.globalAlpha = 1;
    }
    if (b.golden) ring(BALL_R * 1.6, 1.2, [2, 2]);
    if (b.slow) {
      ctx.globalAlpha = 0.6;
      ring(BALL_R * 2.1, 1);
      ctx.globalAlpha = 1;
    }
    if (b.heavy) {
      ctx.strokeStyle = inks.i1;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(b.x, b.y + BALL_R + 2); ctx.lineTo(b.x, b.y + BALL_R + 7); ctx.stroke();
    }
    if (b.copy) ctx.globalAlpha = 0.7;
    const scale = b.fire ? 1.35 : b.copy ? 0.75 : b.shrunk ? 0.65 : 1;
    this.ball(b.x, b.y, inks, b.vx, b.vy, s.fx.squash.get(b.id) ?? 0, scale);
    ctx.globalAlpha = 1;
  }

  private drawLauncher(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    const sim = s.sim;
    const firing = sim.phase === 'fire' || sim.phase === 'run';
    const count = firing ? sim.unfired : sim.ballCount;
    const showBall = !firing || sim.unfired > 0;
    ctx.save();
    if (showBall && sim.phase !== 'settle') this.ball(sim.launchX, FLOOR - BALL_R, inks, 0, 0, 0, 1 + s.fx.launcherKick * 0.45);
    ctx.restore();
    if (count > 0 && sim.phase !== 'settle') {
      ctx.fillStyle = inks.i1;
      ctx.font = `700 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`×${count}`, Math.max(16, Math.min(W - 16, sim.launchX)), FLOOR + 15);
    }
  }

  // ---- effects ----

  private drawBeams(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    ctx.save();
    for (const b of s.fx.beams) {
      const f = b.life / b.max;
      const thick = CELL * b.width * (0.4 + 0.6 * f);
      ctx.globalAlpha = f * 0.8;
      ctx.fillStyle = inks.i2;
      if (b.kind === 'laserH') ctx.fillRect(0, b.y - thick / 2, W, thick);
      else ctx.fillRect(b.x - thick / 2, TOP, thick, FLOOR - TOP);
      ctx.fillStyle = inks.i1;
      ctx.globalAlpha = f;
      if (b.kind === 'laserH') ctx.fillRect(0, b.y - 1, W, 2);
      else ctx.fillRect(b.x - 1, TOP, 2, FLOOR - TOP);
    }
    ctx.restore();
  }

  /** Particles in at most 6 fills: two inks × three fade levels. Squares are rotated by hand. */
  private drawParticles(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    const ps = s.fx.particles;
    if (!ps.length) return;
    ctx.save();
    for (const ink of [0, 1] as const) {
      ctx.fillStyle = ink ? inks.i2 : inks.i1;
      for (let lv = 1; lv <= 3; lv++) {
        ctx.globalAlpha = Math.min(1, lv / 3 + 0.15);
        ctx.beginPath();
        let any = false;
        for (const p of ps) {
          if (p.ink !== ink || Math.min(3, Math.ceil((p.life / p.max) * 1.6 * 3)) !== lv) continue;
          any = true;
          if (p.square) {
            const c = Math.cos(p.rot) * p.size, sn = Math.sin(p.rot) * p.size;
            ctx.moveTo(p.x + c - sn, p.y + sn + c);
            ctx.lineTo(p.x - c - sn, p.y - sn + c);
            ctx.lineTo(p.x - c + sn, p.y - sn - c);
            ctx.lineTo(p.x + c + sn, p.y + sn - c);
            ctx.closePath();
          } else {
            ctx.moveTo(p.x + p.size, p.y);
            ctx.arc(p.x, p.y, p.size, 0, TAU);
          }
        }
        if (any) ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawRings(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    ctx.save();
    for (const r of s.fx.rings) {
      const f = 1 - r.life / r.max;
      ctx.globalAlpha = (1 - f) * 0.9;
      ctx.strokeStyle = r.ink ? inks.i2 : inks.i1;
      ctx.lineWidth = 3 * (1 - f) + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.radius * (0.3 + f * 0.9), 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  /** Jagged lightning between two points, re-randomised every frame so it crackles. */
  private drawZaps(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    ctx.save();
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
          ctx.lineTo(z.x1 + (z.x2 - z.x1) * t + (Math.random() - 0.5) * 9 + off, z.y1 + (z.y2 - z.y1) * t + (Math.random() - 0.5) * 9);
        }
        ctx.lineTo(z.x2 + off, z.y2);
        ctx.stroke();
      }
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
    ctx.fillStyle = inks.i2;
    ctx.globalAlpha = 0.55 * d * pulse;
    for (let y = FLOOR; y > FLOOR - height; y -= 6) {
      const k = 1 - (FLOOR - y) / height;
      const r = 2.4 * k * k * d;
      if (r < 0.3) continue;
      for (let x = 3; x < W; x += 6) {
        ctx.beginPath(); ctx.arc(x + ((y / 6) % 2) * 3, y, r, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawTexts(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    for (const t of s.fx.texts) {
      if (!t.big && !s.numbers && t.number) continue;
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
    for (const b of s.sim.bricks) ctx.strokeRect(brickX(b.c), brickY(b.r), span(b.w), span(b.h));
    for (const b of s.sim.balls) {
      ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, TAU); ctx.stroke();
    }
    ctx.strokeRect(0, TOP, W, FLOOR - TOP);
    ctx.restore();
  }

  // ---- HUD, combo, banners ----

  private drawHud(s: RenderState, inks: Inks): void {
    const { ctx } = this;
    const sim = s.sim;
    ctx.fillStyle = inks.i1;
    ctx.textBaseline = 'middle';
    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`DEPTH ${sim.level}`, 34, 13);
    ctx.font = `400 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`BEST ${Math.max(s.best, sim.level)}`, W / 2 + 20, 13);
    if (sim.shields > 0) {
      ctx.textAlign = 'right';
      ctx.font = `700 10px ${FONT}`;
      ctx.fillStyle = inks.i2;
      ctx.fillText(`◆${sim.shields}`, W - 44, 13);
    }
    const boss = sim.boss;
    ctx.textAlign = 'left';
    ctx.font = `700 8px ${FONT}`;
    const label = boss
      ? `${bossFor(sim.biome).name.toUpperCase()}${boss.boss?.id === 'core' ? ` · ${boss.boss.phase}/3` : ''}`
      : biomeName(sim.biome).toUpperCase();
    ctx.fillStyle = boss ? inks.i2 : inks.i1;
    ctx.fillText(label, 10, 27);
    const x0 = 14 + ctx.measureText(label).width, x1 = W - 10;
    ctx.save();
    ctx.fillStyle = inks.i1;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x0, boss ? 25 : 26, x1 - x0, boss ? 4 : 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = inks.i2;
    if (boss) ctx.fillRect(x0, 25, (x1 - x0) * Math.max(0, boss.hp / boss.maxHp), 4);
    else {
      ctx.fillRect(x0, 26, (x1 - x0) * sim.biomeProgress, 2);
      ctx.fillStyle = inks.i1;
      ctx.fillRect(x0 + (x1 - x0) * 0.5 - 0.5, 24, 1, 6);
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
    ctx.fillStyle = inks.i1;
    ctx.fillText(`${fx.combo}× COMBO`, 1.5, 1);
    ctx.fillStyle = inks.i2;
    ctx.fillText(`${fx.combo}× COMBO`, 0, 0);
    ctx.restore();
  }

  /** Big two-ink title card (a new biome, a boss) with a wrapped subtitle. */
  private drawBanner(s: RenderState, inks: Inks): void {
    const b = s.fx.banner;
    if (!b) return;
    const { ctx } = this;
    const age = b.max - b.life;
    const a = Math.min(1, age * 4, b.life * 2.5);
    const slide = Math.max(0, 1 - age * 5) * 30;
    ctx.save();
    ctx.font = `400 10px ${FONT}`;
    const lines = wrap(ctx, b.sub, W - 32);
    const top = H * 0.36;
    const height = 50 + lines.length * 13;
    ctx.globalAlpha = a * 0.88;
    ctx.fillStyle = inks.paper;
    ctx.fillRect(0, top, W, height);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${b.title.length > 12 ? 20 : 26}px ${FONT}`;
    ctx.fillStyle = inks.i1;
    ctx.fillText(b.title, W / 2 - slide + 2, top + 26);
    ctx.fillStyle = inks.i2;
    ctx.fillText(b.title, W / 2 - slide, top + 24);
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = `400 10px ${FONT}`;
    ctx.fillStyle = inks.i1;
    lines.forEach((l, i) => ctx.fillText(l, W / 2 + slide, top + 48 + i * 13));
    ctx.restore();
  }
}

/** A square outline with a sawtooth edge: the shared shape language for every hazard brick. */
export function sawtooth(ctx: CanvasRenderingContext2D, half: number, teeth: number, depth: number): void {
  const step = (half * 2) / teeth;
  ctx.beginPath();
  ctx.moveTo(-half, -half);
  for (let i = 0; i < teeth; i++) { ctx.lineTo(-half + step * (i + 0.5), -half + depth); ctx.lineTo(-half + step * (i + 1), -half); }
  for (let i = 0; i < teeth; i++) { ctx.lineTo(half - depth, -half + step * (i + 0.5)); ctx.lineTo(half, -half + step * (i + 1)); }
  for (let i = 0; i < teeth; i++) { ctx.lineTo(half - step * (i + 0.5), half - depth); ctx.lineTo(half - step * (i + 1), half); }
  for (let i = 0; i < teeth; i++) { ctx.lineTo(-half + depth, half - step * (i + 0.5)); ctx.lineTo(-half, half - step * (i + 1)); }
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, ro: number, ri: number, n: number): void {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const q = i % 2 ? ri : ro;
    const a = (i * Math.PI) / n - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(a) * q, cy - 5 + Math.sin(a) * q);
  }
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  if (!text) return [];
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > width && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
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
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
  }
}

let grainCanvas: HTMLCanvasElement | null = null;
/** A small tile of paper speckle, multiplied into the background. */
function grainTile(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const d = g.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = 200 + Math.random() * 55;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = Math.random() < 0.55 ? 255 : 0;
  }
  g.putImageData(d, 0, 0);
  grainCanvas = c;
  return c;
}

/** Add one ball outline (in the chosen skin) to the current path. */
export function ballPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, skin: string): void {
  switch (skin) {
    case 'star': {
      const ro = r * 1.3, ri = r * 0.6;
      for (let i = 0; i < 10; i++) {
        const q = i % 2 ? ri : ro, a = (i * Math.PI) / 5 - Math.PI / 2;
        if (i === 0) ctx.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
        else ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
      }
      ctx.closePath();
      break;
    }
    case 'square':
      ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
      break;
    case 'bolt':
      ctx.moveTo(x + r * 0.3, y - r * 1.4); ctx.lineTo(x - r * 0.8, y + r * 0.15); ctx.lineTo(x - r * 0.05, y + r * 0.15);
      ctx.lineTo(x - r * 0.35, y + r * 1.4); ctx.lineTo(x + r * 0.85, y - r * 0.2); ctx.lineTo(x + r * 0.1, y - r * 0.2);
      ctx.closePath();
      break;
    case 'heart':
      ctx.moveTo(x, y + r * 1.1);
      ctx.bezierCurveTo(x - r * 1.6, y, x - r * 0.9, y - r * 1.3, x, y - r * 0.45);
      ctx.bezierCurveTo(x + r * 0.9, y - r * 1.3, x + r * 1.6, y, x, y + r * 1.1);
      ctx.closePath();
      break;
    case 'moon':
      ctx.moveTo(x + r * 0.5, y - r * 1.05);
      ctx.arc(x, y, r * 1.15, -Math.PI / 3.2, Math.PI / 3.2, true);
      ctx.arc(x + r * 0.55, y, r * 0.85, Math.PI / 2.2, -Math.PI / 2.2, false);
      ctx.closePath();
      break;
    case 'gem':
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        if (i === 0) ctx.moveTo(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15);
        else ctx.lineTo(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15);
      }
      ctx.closePath();
      break;
    case 'spark':
      ctx.moveTo(x, y - r * 1.35); ctx.lineTo(x + r * 0.9, y); ctx.lineTo(x, y + r * 1.35); ctx.lineTo(x - r * 0.9, y);
      ctx.closePath();
      break;
    default:
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
  }
}

/** Draw a brick as the game shows it, for menus and the wiki. */
export function drawBrickIcon(c: HTMLCanvasElement, kind: Brick['kind'], inks: Inks, hp = 12): void {
  const ctx = c.getContext('2d')!;
  const k = c.width / 40;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(k, 0, 0, k, c.width / 2, c.height / 2);
  const half = 16;
  const hazard = isHazard(kind);
  ctx.globalAlpha = kind === 'steel' ? 0.9 : hazard ? 0.55 : 0.75;
  ctx.fillStyle = hazard ? inks.i2 : inks.i1;
  if (hazard) { sawtooth(ctx, half, 5, 2.2); ctx.fill(); } else ctx.fillRect(-half, -half, half * 2, half * 2);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
  if (hazard) { ctx.strokeStyle = inks.i1; sawtooth(ctx, half, 5, 2.2); ctx.stroke(); }
  else {
    ctx.strokeStyle = inks.i2;
    ctx.strokeRect(-half + 1.8, -half + 1.2, half * 2 - 1.5, half * 2 - 1.5);
    if (kind === 'armored') { ctx.strokeStyle = inks.i1; ctx.lineWidth = 2.5; ctx.strokeRect(-half + 4, -half + 4, half * 2 - 8, half * 2 - 8); }
  }
  const ink = hazard ? inks.i1 : inks.paper;
  const fake = { ctx } as unknown as Renderer;
  if (kind === 'normal') {
    ctx.fillStyle = ink;
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(hp), 0, 1);
  } else {
    ctx.save();
    if (kind !== 'steel') ctx.translate(0, kind === 'popper' ? 0 : -5);
    Renderer.prototype.glyph.call(fake, kind, ink, inks)();
    ctx.restore();
    if (kind !== 'popper' && kind !== 'steel') {
      ctx.fillStyle = ink;
      ctx.font = `700 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(hp), 0, 9);
    }
  }
}

/** Draw a pickup (orb, laser, portal) as the game shows it. */
export function drawItemIcon(c: HTMLCanvasElement, kind: Item['kind'], inks: Inks): void {
  const ctx = c.getContext('2d')!;
  const k = c.width / 28;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(k, 0, 0, k, c.width / 2, c.height / 2);
  Renderer.prototype.drawItem.call({ ctx } as unknown as Renderer, { id: 1, c: 0, r: 0, kind }, inks, 1, 0.4);
}

/** Symbol for each loot genre, about 12px across, centred on 0,0. */
function lootGlyph(ctx: CanvasRenderingContext2D, cat: string, inks: Inks): void {
  ctx.strokeStyle = inks.i1;
  ctx.fillStyle = inks.i2;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (cat) {
    case 'power': // a burst
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const q = i % 2 ? 2.6 : 7;
        const a = (i * Math.PI) / 8 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case 'arsenal': // three balls
      for (const [x, y] of [[-4, 2.5], [4, 2.5], [0, -4]]) {
        ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); ctx.stroke();
      }
      break;
    case 'elemental': // flame
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.quadraticCurveTo(6, -1, 4, 4);
      ctx.quadraticCurveTo(2, 7, 0, 7);
      ctx.quadraticCurveTo(-5, 6, -4.5, 1.5);
      ctx.quadraticCurveTo(-4, -2, -1, -3);
      ctx.quadraticCurveTo(-1, -5, 0, -7);
      ctx.fill(); ctx.stroke();
      break;
    case 'guard': // shield
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(6, -4.5); ctx.lineTo(5, 2.5); ctx.lineTo(0, 7); ctx.lineTo(-5, 2.5); ctx.lineTo(-6, -4.5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    default: // wild: a question mark
      ctx.fillStyle = inks.i2;
      ctx.font = `700 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, 0.5);
      ctx.strokeText('?', 0, 0.5);
  }
}
