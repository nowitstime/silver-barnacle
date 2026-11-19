import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './styles/main.css';
import { registerSW } from 'virtual:pwa-register';
import { AimInput } from './core/input';
import { Loop } from './core/loop';
import { load, save } from './core/storage';
import { Fx } from './render/fx';
import { BIOME_INKS } from './render/palette';
import { Renderer } from './render/renderer';
import { View } from './render/view';
import { traceShot, type Trace } from './sim/trace';
import { Sim } from './sim/world';
import { mountDebug } from './ui/debug';
import { Hud } from './ui/hud';
import { toast } from './ui/toast';

const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui')!;
const view = new View(canvas);
const renderer = new Renderer(view);
const fx = new Fx();
fx.enabledShake = !matchMedia('(prefers-reduced-motion: reduce)').matches;

let sim = new Sim(Number(params.get('seed')) || newSeed());
let best = load<number>('best', 0);
let aimAngle: number | null = null;
let trace: Trace | null = null;
let time = 0;
let fast = false;
let showHitboxes = false;

applyInks();

const loop = new Loop(
  (h) => sim.tick(h),
  (realDt) => {
    time += realDt;
    const events = sim.drainEvents();
    fx.consume(events);
    if (events.some((e) => e.type === 'over')) onGameOver();
    fx.update(realDt, sim);
    if (sim.phase === 'aim' && loop.speed !== 1 && !fast) loop.speed = 1;
    trace = aimAngle !== null && sim.phase === 'aim' ? traceShot(sim.grid, sim.launchX, aimAngle, 1) : null;
    renderer.draw({ sim, fx, trace, best, time, showHitboxes });
    hud.update(sim, loop.speed);
    updateDebug?.(1 / Math.max(realDt, 1e-3));
  },
);

const hud = new Hud(uiRoot, {
  onSpeed: (s) => (loop.speed = s),
  onRecall: () => sim.recall(),
  onRestart: () => restart(),
});

new AimInput(view, canvas, {
  canAim: () => sim.phase === 'aim',
  onAim: (a) => (aimAngle = a),
  onFire: (a) => sim.fire(a),
});

const updateDebug = debug
  ? mountDebug(uiRoot, {
      sim: () => sim,
      restart: () => restart(newSeed()),
      setFast: (on) => {
        fast = on;
        loop.speed = on ? 10 : 1;
      },
      setHitboxes: (on) => (showHitboxes = on),
    })
  : null;

function onGameOver(): void {
  const depth = sim.level;
  const isNew = depth > best;
  if (isNew) {
    best = depth;
    save('best', best);
  }
  setTimeout(() => hud.showOver(depth, best, isNew), 700);
}

function restart(seed = newSeed()): void {
  sim = new Sim(seed);
  fx.reset();
  hud.hideOver();
  loop.speed = fast ? 10 : 1;
  applyInks();
}

function applyInks(): void {
  const inks = renderer.inks(sim) ?? BIOME_INKS[0];
  const s = document.documentElement.style;
  s.setProperty('--paper', inks.paper);
  s.setProperty('--i1', inks.i1);
  s.setProperty('--i2', inks.i2);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', inks.paper);
}

addEventListener('resize', () => view.resize());
document.addEventListener('visibilitychange', () => (loop.paused = document.hidden));
mountGrain();
loop.start();

const updateSW = registerSW({
  onNeedRefresh: () => toast('A new version is ready.', { label: 'Update', run: () => updateSW(true) }),
  onOfflineReady: () => toast('Ready to play offline.'),
});

/** Paper grain as a CSS overlay so the GPU composites it instead of the canvas redrawing it every frame. */
function mountGrain(): void {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d')!;
  const d = g.createImageData(160, 160);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = 200 + Math.random() * 55;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = Math.random() < 0.55 ? 255 : 0;
  }
  g.putImageData(d, 0, 0);
  const el = document.createElement('div');
  el.className = 'grain';
  el.style.backgroundImage = `url(${c.toDataURL()})`;
  document.body.appendChild(el);
}
