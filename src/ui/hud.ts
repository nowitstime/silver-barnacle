import type { Sim } from '../sim/world';

/** Seconds into a volley before the fast-forward and recall buttons appear. */
const FF_AFTER = 2.5;
const RECALL_AFTER = 8;
const SPEEDS = [1, 2, 4];

export interface HudHandlers {
  onSpeed: (speed: number) => void;
  onRecall: () => void;
  onRestart: () => void;
}

/** DOM controls that sit over the canvas. */
export class Hud {
  private ff: HTMLButtonElement;
  private recall: HTMLButtonElement;
  private over: HTMLElement;
  private overDepth: HTMLElement;
  private overBest: HTMLElement;
  private overNew: HTMLElement;

  constructor(root: HTMLElement, private h: HudHandlers) {
    root.innerHTML = `
      <div class="turn-controls">
        <button class="pill" id="recall" type="button" hidden>Recall</button>
        <button class="pill" id="ff" type="button" hidden aria-label="Fast forward">▶▶ 1×</button>
      </div>
      <div class="overlay" id="over" hidden>
        <div class="sheet" role="dialog" aria-labelledby="over-title">
          <p class="eyebrow">Run over</p>
          <h2 id="over-title">Depth <span id="over-depth">0</span></h2>
          <p class="sub">Best <span id="over-best">0</span> <span class="new" id="over-new" hidden>New best!</span></p>
          <button class="btn-primary" id="restart" type="button">Play again</button>
        </div>
      </div>`;
    this.ff = root.querySelector('#ff')!;
    this.recall = root.querySelector('#recall')!;
    this.over = root.querySelector('#over')!;
    this.overDepth = root.querySelector('#over-depth')!;
    this.overBest = root.querySelector('#over-best')!;
    this.overNew = root.querySelector('#over-new')!;

    this.ff.addEventListener('click', () => {
      const cur = Number(this.ff.dataset.speed ?? 1);
      const next = SPEEDS[(SPEEDS.indexOf(cur) + 1) % SPEEDS.length];
      this.h.onSpeed(next);
    });
    this.recall.addEventListener('click', () => this.h.onRecall());
    root.querySelector('#restart')!.addEventListener('click', () => this.h.onRestart());
    // Buttons must not start an aim drag on the canvas underneath.
    for (const el of root.querySelectorAll('button')) el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  update(sim: Sim, speed: number): void {
    const inVolley = sim.phase === 'fire' || sim.phase === 'run';
    this.ff.hidden = !(inVolley && (sim.turnTime > FF_AFTER || speed > 1));
    this.recall.hidden = !(inVolley && sim.turnTime > RECALL_AFTER);
    if (this.ff.dataset.speed !== String(speed)) {
      this.ff.dataset.speed = String(speed);
      this.ff.textContent = `▶▶ ${speed}×`;
      this.ff.classList.toggle('on', speed > 1);
    }
  }

  showOver(depth: number, best: number, isNew: boolean): void {
    this.overDepth.textContent = String(depth);
    this.overBest.textContent = String(best);
    this.overNew.hidden = !isNew;
    this.over.hidden = false;
    this.over.querySelector<HTMLButtonElement>('#restart')!.focus();
  }

  hideOver(): void {
    this.over.hidden = true;
  }
}
