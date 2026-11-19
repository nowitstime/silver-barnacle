import { STEP } from '../sim/constants';

/**
 * Fixed-timestep loop. `tick` runs at exactly 1/STEP Hz of game time; `speed` scales game time
 * (fast-forward just runs more ticks per frame). `frame` runs once per display frame.
 */
export class Loop {
  speed = 1;
  paused = false;
  private acc = 0;
  /** Real seconds left in a hit-stop freeze. */
  private holdLeft = 0;
  private last = 0;
  private running = false;

  constructor(
    private tick: (h: number) => void,
    private frame: (realDt: number, gameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const realDt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      let gameDt = 0;
      if (this.holdLeft > 0) this.holdLeft -= realDt;
      else if (!this.paused) {
        this.acc += realDt * this.speed;
        // Never try to catch up more than a few frames' worth after a stall.
        this.acc = Math.min(this.acc, (1 / 15) * this.speed);
        while (this.acc >= STEP) {
          this.tick(STEP);
          this.acc -= STEP;
          gameDt += STEP;
        }
      }
      this.frame(realDt, gameDt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Freeze game time briefly (hit-stop). Doesn't stack beyond the longest request. */
  hold(seconds: number): void {
    this.holdLeft = Math.max(this.holdLeft, Math.min(seconds, 0.12));
  }

  stop(): void {
    this.running = false;
  }
}
