import type { Sim } from '../sim/world';

/** Seconds into a volley before the fast-forward and recall buttons appear. */
const FF_AFTER = 2.5;
const RECALL_AFTER = 8;
const SPEEDS = [1, 2, 4];

export interface HudHandlers {
  onFire: () => void;
  onPause: () => void;
  onSpeed: (speed: number) => void;
  onRecall: () => void;
}

/** In-run DOM controls that sit over the canvas. */
export class Hud {
  private root: HTMLElement;
  private fire: HTMLButtonElement;
  private ff: HTMLButtonElement;
  private recall: HTMLButtonElement;
  private pause: HTMLButtonElement;
  private hint: HTMLElement;
  visible = false;

  constructor(parent: HTMLElement, private h: HudHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <button class="icon-btn pause-btn" id="pause" type="button" aria-label="Pause">❚❚</button>
      <p class="hint" id="hint" hidden>Drag left or right to aim · tap to point · then Fire</p>
      <button class="fire" id="fire" type="button">Fire</button>
      <div class="turn-controls">
        <button class="pill" id="recall" type="button" hidden>Recall</button>
        <button class="pill" id="ff" type="button" hidden aria-label="Fast forward">▶▶ 1×</button>
      </div>`;
    parent.appendChild(this.root);
    this.fire = this.root.querySelector('#fire')!;
    this.ff = this.root.querySelector('#ff')!;
    this.recall = this.root.querySelector('#recall')!;
    this.pause = this.root.querySelector('#pause')!;
    this.hint = this.root.querySelector('#hint')!;

    this.fire.addEventListener('click', () => this.h.onFire());
    this.pause.addEventListener('click', () => this.h.onPause());
    this.ff.addEventListener('click', () => {
      const cur = Number(this.ff.dataset.speed ?? 1);
      this.h.onSpeed(SPEEDS[(SPEEDS.indexOf(cur) + 1) % SPEEDS.length]);
    });
    this.recall.addEventListener('click', () => this.h.onRecall());
    // Buttons must not start an aim drag on the canvas underneath.
    for (const el of this.root.querySelectorAll('button')) el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  show(on: boolean): void {
    this.visible = on;
    this.root.hidden = !on;
  }

  showHint(on: boolean): void {
    this.hint.hidden = !on;
  }

  update(sim: Sim, speed: number, blocked: boolean): void {
    if (!this.visible) return;
    const inVolley = sim.phase === 'fire' || sim.phase === 'run';
    this.fire.hidden = sim.phase !== 'aim' || blocked;
    this.ff.hidden = !(inVolley && (sim.turnTime > FF_AFTER || speed > 1));
    this.recall.hidden = !(inVolley && sim.turnTime > RECALL_AFTER);
    this.pause.hidden = sim.phase === 'over';
    if (this.ff.dataset.speed !== String(speed)) {
      this.ff.dataset.speed = String(speed);
      this.ff.textContent = `▶▶ ${speed}×`;
      this.ff.classList.toggle('on', speed > 1);
    }
  }
}
