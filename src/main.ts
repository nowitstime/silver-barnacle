import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './styles/main.css';
import { registerSW } from 'virtual:pwa-register';
import { Haptics, Sfx } from './core/audio';
import { AimInput } from './core/input';
import { Loop } from './core/loop';
import { load, save } from './core/storage';
import { UPGRADES } from './content/upgrades';
import { Fx } from './render/fx';
import { BIOME_INKS } from './render/palette';
import { Renderer } from './render/renderer';
import { View } from './render/view';
import { BALL_R, FLOOR, ROWS } from './sim/constants';
import { traceShot, type Trace } from './sim/trace';
import type { SimEvent } from './sim/types';
import { Sim, type SaveData } from './sim/world';
import { mountDebug } from './ui/debug';
import { Hud } from './ui/hud';
import { PickScreen } from './ui/pick';
import { toast } from './ui/toast';

const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const newSeed = () => (Math.random() * 2 ** 32) >>> 0;
const SAVE_KEY = 'run';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui')!;
const view = new View(canvas);
const renderer = new Renderer(view);
const fx = new Fx();
fx.enabledShake = !matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- start or resume a run ----
const saved = load<SaveData | null>(SAVE_KEY, null);
const seedParam = Number(params.get('seed'));
let sim: Sim;
let resumed = false;
if (!seedParam && Sim.isValidSave(saved)) {
  try {
    sim = new Sim(saved.seed, saved);
    resumed = true;
  } catch {
    sim = new Sim(newSeed());
  }
} else sim = new Sim(seedParam || newSeed());

let best = load<number>('best', 0);
/** Where the player wants to aim. */
let aimTarget = load<number>('aim', Math.PI / 2);
/** Where the laser is drawn: eases towards the target so aiming has some weight. */
let aimShown = aimTarget;
let trace: Trace | null = null;
let time = 0;
let fast = false;
let showHitboxes = false;
/** Hits this volley, for rising pitch. */
let volleyHits = 0;
let lastSavedPhase = '';

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
    fx.update(realDt, sim);
    if (sim.phase === 'aim' && loop.speed !== 1 && !fast) loop.speed = 1;
    aimShown += (aimTarget - aimShown) * Math.min(1, realDt * 16);
    trace = sim.phase === 'aim' ? traceShot(sim.grid, sim.launchX, aimShown, sim.stats.sight) : null;
    autosave();
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
const pick = new PickScreen(uiRoot);

new AimInput(view, canvas, {
  canAim: () => sim.phase === 'aim' && !pick.open,
  launcher: () => [sim.launchX, FLOOR - BALL_R],
  angle: () => aimTarget,
  onAim: (a) => (aimTarget = a),
  onFire: () => fire(),
});

function fire(): void {
  if (pick.open || !sim.fire(aimTarget)) return;
  aimShown = aimTarget;
  save('aim', aimTarget);
  volleyHits = 0;
  sfx.fire();
  haptics.buzz(12);
}

function showPick(): void {
  if (!sim.offer || pick.open) return;
  const nextBiome = BIOME_INKS[sim.biome % BIOME_INKS.length].name;
  pick.show(
    { kind: sim.offer.kind, ids: sim.offer.ids, owned: sim.upgrades, next: nextBiome },
    (i) => {
      sim.choose(i);
      sfx.orb();
      haptics.buzz(20);
    },
    () => sfx.click(),
  );
}

/** Save the run whenever it settles between turns. */
function autosave(): void {
  const p = sim.phase;
  if (p === lastSavedPhase) return;
  lastSavedPhase = p;
  if (p === 'aim' || p === 'pick') save(SAVE_KEY, sim.toSave());
  if (p === 'pick') showPick();
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
        } else if (e.source === 'ball') sfx.hit(volleyHits);
        if (e.crit) {
          sfx.crit();
          loop.hold(0.04);
          haptics.buzz(14);
        }
        break;
      case 'zap':
        sfx.zap();
        break;
      case 'split':
        sfx.split();
        break;
      case 'ignite':
        sfx.ignite();
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
      case 'shield':
        sfx.shield();
        haptics.buzz([40, 40, 80], 0);
        break;
      case 'pick':
        sfx.fanfare(e.kind === 'biome');
        break;
      case 'biome': {
        applyInks();
        const inks = BIOME_INKS[e.index % BIOME_INKS.length];
        fx.showBanner(inks.name.toUpperCase(), `Depth ${sim.level} · biome ${e.index + 1}`);
        break;
      }
      case 'over':
        sfx.over();
        haptics.buzz([60, 40, 140], 0);
        onGameOver();
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
      upgrades: UPGRADES.map((u) => u.id),
    })
  : null;

function onGameOver(): void {
  save(SAVE_KEY, null);
  const depth = sim.level;
  const isNew = depth > best;
  if (isNew) {
    best = depth;
    save('best', best);
  }
  setTimeout(() => hud.showOver(depth, best, isNew, sim.totals), 700);
}

function restart(seed = newSeed()): void {
  sim = new Sim(seed);
  fx.reset();
  pick.hide();
  hud.hideOver();
  loop.speed = fast ? 10 : 1;
  lastSavedPhase = '';
  applyInks();
}

function applyInks(): void {
  const inks = renderer.inks(sim);
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
if (resumed) toast(`Run resumed at depth ${sim.level}.`, undefined, 2500);

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
