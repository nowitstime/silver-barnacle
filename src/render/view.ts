import { H, W } from '../sim/constants';

/** Maps the fixed world box onto the screen, letterboxed and centred. */
export class View {
  dpr = 1;
  /** CSS pixels. */
  cssW = 0;
  cssH = 0;
  /** World units to device pixels. */
  scale = 1;
  offX = 0;
  offY = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    const s = Math.min(this.cssW / W, this.cssH / H);
    this.scale = s * this.dpr;
    this.offX = (this.canvas.width - W * this.scale) / 2;
    this.offY = (this.canvas.height - H * this.scale) / 2;
  }

  /** CSS pixel coordinates (e.g. from a pointer event) to world units. */
  toWorld(cssX: number, cssY: number): [number, number] {
    return [
      (cssX * this.dpr - this.offX) / this.scale,
      (cssY * this.dpr - this.offY) / this.scale,
    ];
  }

  /** World units to CSS pixels. */
  toCss(x: number, y: number): [number, number] {
    return [(x * this.scale + this.offX) / this.dpr, (y * this.scale + this.offY) / this.dpr];
  }
}
