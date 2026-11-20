import { UPGRADE_BY_ID } from '../content/upgrades';

export interface PickView {
  kind: 'mid' | 'biome';
  ids: string[];
  owned: Record<string, number>;
  /** Name of the biome you're heading into (biome picks only). */
  next?: string;
  /** Free rerolls left. */
  rerolls?: number;
  /** Real-number preview lines per card (same order as ids). */
  previews?: string[][];
}

const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', cursed: 'Cursed' } as const;

/** Upgrade choice screen: tap a card to select it, tap Take (or the same card again) to confirm. */
export class PickScreen {
  private el: HTMLElement;
  private selected = -1;
  private onChoose: ((i: number) => void) | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'overlay pick';
    this.el.hidden = true;
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.appendChild(this.el);
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  show(v: PickView, onChoose: (i: number) => void, onSelect?: () => void, onReroll?: () => PickView | null): void {
    this.onChoose = onChoose;
    this.selected = -1;
    const title = v.kind === 'biome' ? 'Biome cleared' : 'Halfway there';
    const sub = v.kind === 'biome' ? `Choose an upgrade. Next stop: ${v.next ?? 'deeper'}.` : 'Choose an upgrade.';
    this.el.innerHTML = `
      <div class="pick-inner" role="dialog" aria-labelledby="pick-title">
        <p class="eyebrow">${v.kind === 'biome' ? 'Big pick' : 'Small pick'}</p>
        <h2 id="pick-title">${title}</h2>
        <p class="sub">${sub}</p>
        <div class="cards">
          ${v.ids.map((id, i) => {
            const u = UPGRADE_BY_ID.get(id)!;
            const n = v.owned[id] ?? 0;
            return `<button class="card" type="button" data-i="${i}" data-rarity="${u.rarity}" aria-pressed="false" style="animation-delay:${i * 70}ms">
              <span class="rarity">${RARITY_LABEL[u.rarity]}</span>
              <span class="name">${u.name}</span>
              <span class="desc">${u.desc(n)}</span>
              ${v.previews?.[i]?.length ? `<span class="nums">${v.previews[i].map((l) => `<span>${l}</span>`).join('')}</span>` : ''}
              ${n > 0 ? `<span class="owned">Owned ×${n}</span>` : ''}
            </button>`;
          }).join('')}
        </div>
        <div class="row">
          ${v.rerolls && onReroll ? `<button class="btn-secondary reroll" type="button">Reroll (free, same rarities)</button>` : ''}
          <button class="btn-primary take" type="button" disabled>Take it</button>
        </div>
      </div>`;
    const take = this.el.querySelector<HTMLButtonElement>('.take')!;
    this.el.querySelectorAll<HTMLButtonElement>('.card').forEach((card) => {
      card.addEventListener('click', () => {
        const i = Number(card.dataset.i);
        if (this.selected === i) return this.confirm();
        this.selected = i;
        this.el.querySelectorAll('.card').forEach((c) => c.setAttribute('aria-pressed', String(c === card)));
        take.disabled = false;
        onSelect?.();
      });
    });
    take.addEventListener('click', () => this.confirm());
    this.el.querySelector('.reroll')?.addEventListener('click', () => {
      const next = onReroll?.();
      if (next) this.show(next, onChoose, onSelect, onReroll);
    });
    this.el.hidden = false;
  }

  private confirm(): void {
    if (this.selected < 0 || !this.onChoose) return;
    const cb = this.onChoose;
    this.onChoose = null;
    this.el.hidden = true;
    cb(this.selected);
  }

  hide(): void {
    this.el.hidden = true;
    this.onChoose = null;
  }
}
