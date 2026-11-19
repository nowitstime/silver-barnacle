import type { Sim } from '../sim/world';

export interface DebugHooks {
  sim: () => Sim;
  restart: (seed?: number) => void;
  setFast: (on: boolean) => void;
  setHitboxes: (on: boolean) => void;
  upgrades: string[];
}

/** Developer panel, shown with ?debug in the URL. */
export function mountDebug(root: HTMLElement, hooks: DebugHooks): (fps: number) => void {
  const el = document.createElement('div');
  el.className = 'debug';
  el.innerHTML = `
    <div class="debug-stats"></div>
    <button type="button" data-a="balls">+10 balls</button>
    <button type="button" data-a="fast">10× speed</button>
    <button type="button" data-a="hit">Hitboxes</button>
    <button type="button" data-a="seed">New seed</button>
    <button type="button" data-a="pick">Skip to pick</button>
    <button type="button" data-a="boss">Boss next</button>
    <button type="button" data-a="core">Go to Core</button>
    <select data-a="place" aria-label="Place brick"><option value="">Place brick…</option>${['armored','bomb','splitter','steel','popper','anchor','balloon','sponge','shrinker','spawner','sprinter'].map((k) => `<option>${k}</option>`).join('')}</select>
    <select data-a="grant" aria-label="Grant upgrade"><option value="">Grant upgrade…</option>${hooks.upgrades.map((id) => `<option>${id}</option>`).join('')}</select>`;
  root.appendChild(el);
  const stats = el.querySelector<HTMLElement>('.debug-stats')!;
  let fast = false, hit = false;
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).dataset.a;
    if (a === 'balls') hooks.sim().debugAddBalls(10);
    if (a === 'fast') hooks.setFast((fast = !fast));
    if (a === 'hit') hooks.setHitboxes((hit = !hit));
    if (a === 'seed') hooks.restart();
    if (a === 'pick') hooks.sim().debugSkipToPick();
    if (a === 'boss') hooks.sim().debugJumpToBoss();
    if (a === 'core') hooks.sim().debugJumpToBoss(5);
  });
  el.querySelector('select[data-a=place]')!.addEventListener('change', (e) => {
    const sel = e.target as HTMLSelectElement;
    const sim = hooks.sim();
    if (sel.value && sim.phase === 'aim') sim.debugPlace(sel.value as never, Math.floor(Math.random() * 7), 1 + Math.floor(Math.random() * 3), 8);
    sel.value = '';
  });
  el.querySelector('select[data-a=grant]')!.addEventListener('change', (e) => {
    const sel = e.target as HTMLSelectElement;
    if (sel.value) hooks.sim().debugGrant(sel.value);
    sel.value = '';
  });
  return (fps: number) => {
    const s = hooks.sim();
    const ups = Object.entries(s.upgrades).map(([k, v]) => (v > 1 ? `${k}×${v}` : k)).join(' ');
    stats.textContent = `${fps.toFixed(0)} fps · seed ${s.seed} · ${s.phase} · balls ${s.ballCount} · bricks ${s.bricks.length} · ${ups || 'no upgrades'}`;
  };
}
