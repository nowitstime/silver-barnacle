import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './styles/main.css';
import { registerSW } from 'virtual:pwa-register';
import { Haptics, Sfx } from './core/audio';
import { AimInput } from './core/input';
import { Loop } from './core/loop';
import { load, save } from './core/storage';
import { Fx } from './render/fx';
import { BIOME_INKS } from './render/palette';
import { Renderer } from './render/renderer';
import { View } from './render/view';
import { BALL_R, FLOOR, ROWS } from './sim/constants';
import { traceShot, type Trace } from './sim/trace';
import type { SimEvent } from './sim/types';
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
let aimAngle = Math.PI / 2;
let trace: Trace | null = null;
let time = 0;
let fast = false;
let showHitboxes = false;
/** Hits this volley, for rising pitch. */
let volleyHits = 0;

const sfx = new Sfx();
const haptics = new Haptics();
sfx.enabled = load<boolean>('sound', true);
// Browsers only allow audio after a user gesture.
addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
addEventListener('keydown', () => sfx.unlock(), { capture: true });

applyInks();

const loop = new Loop(
  (h) => sim.tick(h),
  (realDt) => {
    time += realDt;
    const events = sim.drainEvents();
    fx.consume(events);
    feedback(events);
    if (events.some((e) => e.type === 'over')) onGameOver();
    fx.update(realDt, sim);
    if (sim.phase === 'aim' && loop.speed !== 1 && !fast) loop.speed = 1;
    trace = sim.phase === 'aim' ? traceShot(sim.grid, sim.launchX, aimAngle, 1) : null;
    renderer.draw({ sim, fx, trace, best, time, showHitboxes });
    hud.update(sim, loop.speed);
    updateDebug?.(1 / Math.max(realDt, 1e-3));
  },
);

const hud = new Hud(uiRoot, {
  onFire: () => fire(),
  onToggleSound: () => {
    sfx.enabled = !sfx.enabled;
    save('sound', sfx.enabled);
    if (sfx.enabled) sfx.click();
    return sfx.enabled;
  },
  onSpeed: (s) => {
    loop.speed = s;
    sfx.click();
  },
  onRecall: () => sim.recall(),
  onRestart: () => restart(),
});

hud.setSound(sfx.enabled);

new AimInput(view, canvas, {
  canAim: () => sim.phase === 'aim',
  launcher: () => [sim.launchX, FLOOR - BALL_R],
  angle: () => aimAngle,
  onAim: (a) => (aimAngle = a),
  onFire: () => fire(),
});

function fire(): void {
  if (!sim.fire(aimAngle)) return;
  volleyHits = 0;
  sfx.fire();
  haptics.buzz(12);
}

/** Sound, vibration and hit-stop for sim events. */
function feedback(events: SimEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'launch':
        sfx.launch();
        break;
      case 'wall':
        sfx.wall();
        break;
      case 'hit':
        volleyHits++;
        if (e.killed) {
          sfx.kill(fx.combo);
          haptics.buzz(10);
          if (fx.combo > 0 && fx.combo % 5 === 0) {
            sfx.combo(fx.combo / 5);
            loop.hold(0.07);
            haptics.buzz([20, 30, 20], 0);
          } else loop.hold(0.025);
        } else sfx.hit(volleyHits);
        break;
      case 'orb':
        sfx.orb();
        haptics.buzz(15);
        break;
      case 'drop':
        sfx.drop();
        if (sim.lowestRow >= ROWS - 2) {
          sfx.heartbeat();
          haptics.buzz([30, 120, 30], 0);
        }
        break;
      case 'over':
        sfx.over();
        haptics.buzz([60, 40, 140], 0);
        break;
    }
  }
}

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
