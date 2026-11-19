import type { Sim } from '../sim/world';

export interface DebugHooks {
  sim: () => Sim;
  restart: (seed?: number) => void;
  setFast: (on: boolean) => void;
  setHitboxes: (on: boolean) => void;
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
    <button type="button" data-a="seed">New seed</button>`;
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
  });
  return (fps: number) => {
    const s = hooks.sim();
    stats.textContent = `${fps.toFixed(0)} fps · seed ${s.seed} · ${s.phase} · balls ${s.ballCount} · bricks ${s.bricks.length}`;
  };
}
