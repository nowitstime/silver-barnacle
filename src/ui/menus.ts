import { CLASSES, CLASS_BY_ID, type ClassId } from '../content/classes';
import { UPGRADE_BY_ID } from '../content/upgrades';
import type { Score } from '../core/scores';
import type { Settings } from '../core/settings';
import { biomeName as nameOf } from '../render/palette';

export interface MenuHandlers {
  onContinue: () => void;
  onNewRun: (classId: ClassId) => void;
  onResume: () => void;
  onAbandon: () => void;
  onToMenu: () => void;
  onSettings: (s: Settings) => void;
  onEndless: () => void;
  onEndRun: () => void;
  onResetData: () => void;
  /** Play a UI click. */
  click: () => void;
}

export interface TitleView {
  canContinue: boolean;
  continueDepth?: number;
  continueClass?: ClassId;
  scores: Score[];
  lastClass: ClassId;
  endlessBest: number;
}

export interface SummaryView {
  depth: number;
  biome: number;
  classId: ClassId;
  kills: number;
  damage: number;
  bestCombo: number;
  bosses: number;
  upgrades: Record<string, number>;
  rank: number;
  best: number;
  won?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const biomeName = nameOf;

/** All full-screen menus. One overlay, re-rendered per screen. */
export class Menus {
  private el: HTMLElement;
  private back: (() => void) | null = null;
  private settings: Settings;
  private title: TitleView | null = null;

  constructor(root: HTMLElement, private h: MenuHandlers, settings: Settings) {
    this.settings = { ...settings };
    this.el = document.createElement('div');
    this.el.className = 'menu';
    this.el.hidden = true;
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.appendChild(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.hidden && this.back) {
        e.preventDefault();
        this.back();
      }
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  hide(): void {
    this.el.hidden = true;
    this.back = null;
  }

  private render(html: string, cls: string, back: (() => void) | null): void {
    this.el.className = `menu ${cls}`;
    this.el.innerHTML = html;
    this.el.hidden = false;
    this.back = back;
    this.el.scrollTop = 0;
    this.el.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => this.h.click()));
    // Only move focus for keyboard users; on touch it just draws a stray outline.
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) this.el.querySelector<HTMLElement>('[data-focus]')?.focus({ preventScroll: true });
  }

  private on(sel: string, fn: () => void): void {
    this.el.querySelector(sel)?.addEventListener('click', fn);
  }

  // ---- title ----

  showTitle(v: TitleView): void {
    this.title = v;
    const cls = v.continueClass ? CLASS_BY_ID.get(v.continueClass)?.name : '';
    this.render(`
      <div class="title-inner">
        <h1 class="logo" aria-label="Bricks"><span>BRI</span><span>CKS</span></h1>
        <p class="tagline">A brick-breaking roguelike</p>
        <div class="stack">
          ${v.canContinue ? `<button class="btn-primary" id="m-continue" type="button" data-focus>Continue <small>${cls ? `${esc(cls)} · ` : ''}depth ${v.continueDepth}</small></button>` : ''}
          <button class="${v.canContinue ? 'btn-secondary' : 'btn-primary'}" id="m-new" type="button" ${v.canContinue ? '' : 'data-focus'}>New run</button>
          <button class="btn-secondary" id="m-settings" type="button">Settings</button>
        </div>
        ${this.scoresHtml(v.scores)}
      </div>`, 'title', null);
    this.on('#m-continue', () => this.h.onContinue());
    this.on('#m-new', () => this.showClassSelect(v.lastClass));
    this.on('#m-settings', () => this.showSettings(() => this.showTitle(v)));
  }

  private scoresHtml(scores: Score[]): string {
    if (!scores.length) return '<p class="scores-empty">Your best runs will show up here.</p>';
    return `
      <section class="scores" aria-label="Best runs">
        <h2>Best runs</h2>
        <ol>${scores.slice(0, 5).map((s) => `
          <li><span class="d">${s.depth}</span><span class="c">${esc(CLASS_BY_ID.get(s.classId)?.name ?? '')}</span><span class="b">${s.won ? '<b class="crown" title="Broke the Core">★</b> ' : ''}${esc(biomeName(s.biome))}</span></li>`).join('')}
        </ol>
        ${this.title?.endlessBest ? `<p class="endless-best">Endless best: depth ${this.title.endlessBest}</p>` : ''}
      </section>`;
  }

  // ---- class select ----

  showClassSelect(selected: ClassId): void {
    let cur = selected;
    const back = () => this.title && this.showTitle(this.title);
    this.render(`
      <div class="sheet-inner">
        <p class="eyebrow">New run</p>
        <h2>Choose a class</h2>
        <div class="classes" role="radiogroup" aria-label="Class">
          ${CLASSES.map((c) => `
            <button class="class-card" type="button" role="radio" data-id="${c.id}" aria-checked="${c.id === cur}">
              <span class="cname">${c.name}</span>
              <span class="ctag">${c.tagline}</span>
              <span class="cballs">${'●'.repeat(c.startBalls)} <small>${c.startBalls} ball${c.startBalls > 1 ? 's' : ''}</small></span>
              <span class="cperk"><b>${c.perk}.</b> ${c.perkDesc}</span>
            </button>`).join('')}
        </div>
        <div class="row">
          <button class="btn-secondary" id="m-back" type="button">Back</button>
          <button class="btn-primary" id="m-start" type="button" data-focus>Start run</button>
        </div>
      </div>`, 'classes-screen', back);
    this.el.querySelectorAll<HTMLButtonElement>('.class-card').forEach((card) => {
      card.addEventListener('click', () => {
        if (cur === card.dataset.id) return this.h.onNewRun(cur);
        cur = card.dataset.id as ClassId;
        this.el.querySelectorAll('.class-card').forEach((c) => c.setAttribute('aria-checked', String(c === card)));
      });
    });
    this.on('#m-back', back);
    this.on('#m-start', () => this.h.onNewRun(cur));
  }

  // ---- pause ----

  showPause(v: { classId: ClassId; upgrades: Record<string, number>; depth: number; biome: number; shields: number; balls: number }): void {
    const c = CLASS_BY_ID.get(v.classId)!;
    const ups = Object.entries(v.upgrades).filter(([, n]) => n > 0);
    this.render(`
      <div class="sheet-inner">
        <p class="eyebrow">Paused</p>
        <h2>Depth ${v.depth} · ${esc(biomeName(v.biome))}</h2>
        <p class="sub">${v.balls} balls${v.shields ? ` · ${v.shields} shield${v.shields > 1 ? 's' : ''}` : ''}</p>
        <div class="row">
          <button class="btn-primary" id="m-resume" type="button" data-focus>Resume</button>
          <button class="btn-secondary" id="m-settings" type="button">Settings</button>
        </div>
        <section class="build">
          <h3>Your build</h3>
          <div class="perk"><b>${c.name}: ${c.perk}.</b> ${c.perkDesc}</div>
          ${ups.length ? `<ul>${ups.map(([id, n]) => {
            const u = UPGRADE_BY_ID.get(id)!;
            return `<li data-rarity="${u.rarity}"><span class="uname">${esc(u.name)}${n > 1 ? ` ×${n}` : ''}</span><span class="udesc">${esc(u.desc(n - 1))}</span></li>`;
          }).join('')}</ul>` : '<p class="sub">No upgrades yet. The first pick comes halfway through the biome.</p>'}
        </section>
        <button class="btn-text danger" id="m-abandon" type="button">Abandon run</button>
      </div>`, 'pause', () => this.h.onResume());
    this.on('#m-resume', () => this.h.onResume());
    this.on('#m-settings', () => this.showSettings(() => this.showPause(v)));
    const abandon = this.el.querySelector<HTMLButtonElement>('#m-abandon')!;
    abandon.addEventListener('click', () => {
      if (abandon.dataset.armed) return this.h.onAbandon();
      abandon.dataset.armed = '1';
      abandon.textContent = 'Tap again to abandon this run';
    });
  }

  // ---- settings ----

  showSettings(back: () => void): void {
    const s = this.settings;
    const toggle = (key: keyof Settings, label: string, hint: string) => `
      <label class="toggle">
        <span><b>${label}</b><small>${hint}</small></span>
        <input type="checkbox" id="set-${key}" ${s[key] ? 'checked' : ''}>
        <span class="switch" aria-hidden="true"></span>
      </label>`;
    this.render(`
      <div class="sheet-inner">
        <h2>Settings</h2>
        <div class="toggles">
          ${toggle('sound', 'Sound', 'Hits, pops and jingles')}
          ${toggle('haptics', 'Vibration', 'Android only')}
          ${toggle('shake', 'Screen shake', 'Turn off if it makes you dizzy')}
          ${toggle('numbers', 'Damage numbers', 'Small numbers on every hit')}
        </div>
        <button class="btn-primary" id="m-done" type="button" data-focus>Done</button>
        <button class="btn-text danger" id="m-reset" type="button">Reset all data</button>
      </div>`, 'settings', back);
    for (const key of ['sound', 'haptics', 'shake', 'numbers'] as (keyof Settings)[]) {
      this.el.querySelector<HTMLInputElement>(`#set-${key}`)!.addEventListener('change', (e) => {
        this.settings = { ...this.settings, [key]: (e.target as HTMLInputElement).checked };
        this.h.onSettings(this.settings);
      });
    }
    this.on('#m-done', back);
    const reset = this.el.querySelector<HTMLButtonElement>('#m-reset')!;
    reset.addEventListener('click', () => {
      if (reset.dataset.armed) return this.h.onResetData();
      reset.dataset.armed = '1';
      reset.textContent = 'Tap again to erase scores, settings and your saved run';
    });
  }

  // ---- win ----

  showWin(v: SummaryView): void {
    const c = CLASS_BY_ID.get(v.classId)!;
    this.render(`
      <div class="sheet-inner win-inner">
        <p class="eyebrow">Run complete</p>
        <h2 class="big">The Core is broken</h2>
        <p class="sub">${esc(c.name)} · depth ${v.depth} · ${v.bosses} bosses</p>
        <dl class="totals">
          <div><dt>Bricks</dt><dd>${v.kills.toLocaleString()}</dd></div>
          <div><dt>Damage</dt><dd>${v.damage.toLocaleString()}</dd></div>
          <div><dt>Best combo</dt><dd>${v.bestCombo}</dd></div>
          <div><dt>Upgrades</dt><dd>${Object.values(v.upgrades).reduce((a, n) => a + n, 0)}</dd></div>
        </dl>
        <p class="sub">Keep going in endless mode: the five biomes come back, tougher every lap. Or end the run here and bank the win.</p>
        <div class="row">
          <button class="btn-secondary" id="m-end" type="button">End run</button>
          <button class="btn-primary" id="m-endless" type="button" data-focus>Keep going</button>
        </div>
        <section class="credits">
          <h3>Credits</h3>
          <p>Designed by you, built with Claude. Every brick, ink, sound and shake is generated in code: no image or audio files.</p>
          <p>Set in Space Mono. Printed in two inks per biome.</p>
        </section>
      </div>`, 'win', null);
    this.on('#m-endless', () => this.h.onEndless());
    this.on('#m-end', () => this.h.onEndRun());
  }

  // ---- run summary ----

  showSummary(v: SummaryView): void {
    const c = CLASS_BY_ID.get(v.classId)!;
    const ups = Object.entries(v.upgrades).filter(([, n]) => n > 0);
    const isBest = v.rank === 0;
    this.render(`
      <div class="sheet-inner summary-inner">
        <p class="eyebrow">${v.won ? 'Run complete ★' : 'Run over'}</p>
        <h2 class="big">Depth ${v.depth}</h2>
        <p class="sub">${esc(c.name)} · reached ${esc(biomeName(v.biome))}${isBest ? ' · <span class="new">New best!</span>' : v.rank > 0 ? ` · #${v.rank + 1} best run` : ` · best ${v.best}`}</p>
        <dl class="totals">
          <div><dt>Bricks</dt><dd>${v.kills.toLocaleString()}</dd></div>
          <div><dt>Damage</dt><dd>${v.damage.toLocaleString()}</dd></div>
          <div><dt>Best combo</dt><dd>${v.bestCombo}</dd></div>
          <div><dt>Bosses</dt><dd>${v.bosses}</dd></div>
        </dl>
        ${ups.length ? `<div class="chips">${ups.map(([id, n]) => {
          const u = UPGRADE_BY_ID.get(id)!;
          return `<span class="chip" data-rarity="${u.rarity}">${esc(u.name)}${n > 1 ? ` ×${n}` : ''}</span>`;
        }).join('')}</div>` : ''}
        <div class="row">
          <button class="btn-secondary" id="m-menu" type="button">Menu</button>
          <button class="btn-primary" id="m-again" type="button" data-focus>Play again</button>
        </div>
      </div>`, 'summary', () => this.h.onToMenu());
    this.on('#m-menu', () => this.h.onToMenu());
    this.on('#m-again', () => this.h.onNewRun(v.classId));
  }
}
