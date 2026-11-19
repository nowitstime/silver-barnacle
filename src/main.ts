import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './styles/main.css';
import { registerSW } from 'virtual:pwa-register';
import { Haptics, Sfx } from './core/audio';
import { AimInput } from './core/input';
import { Loop } from './core/loop';
import { addScore, bestDepth, loadScores } from './core/scores';
import { loadSettings, saveSettings, type Settings } from './core/settings';
import { load, save } from './core/storage';
import type { ClassId } from './content/classes';
import { UPGRADES } from './content/upgrades';
import { Fx } from './render/fx';
import { BIOME_INKS } from './render/palette';
import { Renderer } from './render/renderer';
import { View } from './render/view';
import { demoAngle } from './sim/bot';
import { BALL_R, FLOOR, ROWS } from './sim/constants';
import { GIMMICK_TEXT, gimmickFor } from './sim/run';
import { traceShot, type Trace } from './sim/trace';
import type { SimEvent } from './sim/types';
import { Sim, type SaveData } from './sim/world';
import { mountDebug } from './ui/debug';
import { Hud } from './ui/hud';
import { Menus } from './ui/menus';
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
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let settings: Settings = loadSettings();
const sfx = new Sfx();
const haptics = new Haptics();
applySettings();
// Browsers only allow audio after a user gesture.
addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
addEventListener('keydown', () => sfx.unlock(), { capture: true });

/** 'title' runs a self-playing demo behind the menu; 'run' is a real game. */
let mode: 'title' | 'run' = 'title';
let sim = new Sim(newSeed(), { classId: 'juggler' });
let best = bestDepth();
let aimTarget = load<number>('aim', Math.PI / 2);
let aimShown = aimTarget;
let trace: Trace | null = null;
let time = 0;
let fast = false;
let showHitboxes = false;
let volleyHits = 0;
let lastSavedPhase = '';
let demoWait = 0;

const loop = new Loop(
  (h) => sim.tick(h),
  (realDt) => {
    time += realDt;
    const events = sim.drainEvents();
    fx.consume(events);
    if (mode === 'run') feedback(events);
    else demoStep(realDt, events);
    fx.update(realDt, sim);
    if (sim.phase === 'aim' && loop.speed !== 1 && !fast && mode === 'run') loop.speed = 1;
    aimShown += (aimTarget - aimShown) * Math.min(1, realDt * 16);
    trace = mode === 'run' && sim.phase === 'aim' ? traceShot(sim.grid, sim.launchX, aimShown, sim.stats.sight, sim.accel) : null;
    if (mode === 'run') autosave();
    renderer.draw({ sim, fx, trace, best, time, showHitboxes, numbers: settings.numbers });
    hud.update(sim, loop.speed, pick.open || menus.open);
    updateDebug?.(1 / Math.max(realDt, 1e-3));
  },
);

const hud = new Hud(uiRoot, {
  onFire: () => fire(),
  onPause: () => pause(),
  onSpeed: (s) => {
    loop.speed = s;
    sfx.click();
  },
  onRecall: () => sim.recall(),
});
const pick = new PickScreen(uiRoot);
const menus = new Menus(uiRoot, {
  onContinue: () => continueRun(),
  onNewRun: (c) => startRun(c),
  onResume: () => resume(),
  onAbandon: () => {
    save(SAVE_KEY, null);
    showTitle();
  },
  onToMenu: () => showTitle(),
  onSettings: (s) => {
    settings = s;
    saveSettings(s);
    applySettings();
  },
  onResetData: () => {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('bricks:')) localStorage.removeItem(k);
    } catch { /* ignore */ }
    settings = loadSettings();
    applySettings();
    best = 0;
    toast('All data erased.', undefined, 2500);
    showTitle();
  },
  click: () => sfx.click(),
}, settings);

new AimInput(view, canvas, {
  canAim: () => mode === 'run' && sim.phase === 'aim' && !pick.open && !menus.open,
  launcher: () => [sim.launchX, FLOOR - BALL_R],
  angle: () => aimTarget,
  onAim: (a) => (aimTarget = a),
  onFire: () => fire(),
});

// ---- screens and runs ----

function savedRun(): SaveData | null {
  const s = load<SaveData | null>(SAVE_KEY, null);
  return Sim.isValidSave(s) ? s : null;
}

function showTitle(): void {
  mode = 'title';
  hud.show(false);
  pick.hide();
  loop.paused = false;
  loop.speed = 1;
  if (sim.phase === 'over' || !demoRunning) newDemo();
  const s = savedRun();
  menus.showTitle({
    canContinue: !!s,
    continueDepth: s ? s.turn + 1 : undefined,
    continueClass: s?.classId,
    scores: loadScores(),
    lastClass: load<ClassId>('class', 'striker'),
  });
}

let demoRunning = false;
function newDemo(): void {
  sim = new Sim(newSeed(), { classId: 'juggler' });
  sim.debugAddBalls(12);
  demoRunning = true;
  fx.reset();
  applyInks();
}

/** Title-screen demo: aim at something, fire, take whatever pick comes up. */
function demoStep(dt: number, events: SimEvent[]): void {
  if (events.some((e) => e.type === 'biome')) applyInks();
  if (sim.phase === 'over') {
    demoWait += dt;
    if (demoWait > 1.5) { demoWait = 0; newDemo(); }
    return;
  }
  if (sim.phase === 'pick') { sim.choose(0); return; }
  if (sim.phase !== 'aim') return;
  demoWait += dt;
  if (demoWait > 0.9) {
    demoWait = 0;
    sim.fire(demoAngle(sim, Math.random));
  }
}

function startRun(classId: ClassId): void {
  const seed = Number(params.get('seed')) || newSeed();
  save('class', classId);
  sim = new Sim(seed, { classId });
  demoRunning = false;
  beginRun();
  const inks = BIOME_INKS[0];
  fx.showBanner(inks.name.toUpperCase(), 'Depth 1 · break bricks, grab orbs, don’t let them reach the bottom', 2.4);
}

function continueRun(): void {
  const s = savedRun();
  if (!s) return startRun(load<ClassId>('class', 'striker'));
  try {
    sim = new Sim(s.seed, {}, s);
  } catch {
    return startRun(s.classId);
  }
  demoRunning = false;
  beginRun();
  toast(`Run resumed at depth ${sim.level}.`, undefined, 2000);
}

function beginRun(): void {
  mode = 'run';
  fx.reset();
  menus.hide();
  pick.hide();
  hud.show(true);
  hud.showHint(!load<boolean>('fired', false));
  loop.speed = fast ? 10 : 1;
  loop.paused = false;
  lastSavedPhase = '';
  applyInks();
}

function pause(): void {
  if (mode !== 'run' || sim.phase === 'over') return;
  loop.paused = true;
  menus.showPause({
    classId: sim.classId, upgrades: sim.upgrades, depth: sim.level, biome: sim.biome,
    shields: sim.shields, balls: sim.ballCount,
  });
}

function resume(): void {
  menus.hide();
  loop.paused = false;
  if (sim.phase === 'pick') showPick();
}

function fire(): void {
  if (mode !== 'run' || pick.open || menus.open || !sim.fire(aimTarget)) return;
  aimShown = aimTarget;
  save('aim', aimTarget);
  if (!load<boolean>('fired', false)) {
    save('fired', true);
    hud.showHint(false);
  }
  volleyHits = 0;
  sfx.fire();
  haptics.buzz(12);
}

function showPick(): void {
  if (!sim.offer || pick.open || menus.open) return;
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

function onGameOver(): void {
  save(SAVE_KEY, null);
  const depth = sim.level;
  const rank = addScore({
    depth, classId: sim.classId, biome: sim.biome, kills: sim.totals.kills, bosses: sim.totals.bosses, date: Date.now(),
  });
  best = Math.max(best, depth);
  save('best', best);
  const summary = {
    depth, biome: sim.biome, classId: sim.classId, kills: sim.totals.kills, damage: sim.totals.damage,
    bestCombo: sim.totals.bestCombo, bosses: sim.totals.bosses, upgrades: { ...sim.upgrades }, rank, best,
  };
  setTimeout(() => {
    hud.show(false);
    menus.showSummary(summary);
  }, 900);
}

/** Sound, vibration and hit-stop for sim events. */
function feedback(events: SimEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'launch': sfx.launch(); break;
      case 'wall': sfx.wall(); break;
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
      case 'immune': sfx.immune(); break;
      case 'zap': sfx.zap(); break;
      case 'split': sfx.split(); break;
      case 'ignite': sfx.ignite(); break;
      case 'explode':
        sfx.explode();
        loop.hold(0.05);
        haptics.buzz(30);
        break;
      case 'laser': sfx.laser(); haptics.buzz(15); break;
      case 'portal': sfx.portal(); break;
      case 'hazard': sfx.hazard(e.kind); haptics.buzz(20); break;
      case 'orb': sfx.orb(); haptics.buzz(15); break;
      case 'bounty': sfx.orb(); break;
      case 'drop':
        sfx.drop();
        if (sim.lowestRow >= ROWS - 2) {
          sfx.heartbeat();
          haptics.buzz([30, 120, 30], 0);
        }
        break;
      case 'shield': sfx.shield(); haptics.buzz([40, 40, 80], 0); break;
      case 'boss':
        sfx.bossRoar();
        haptics.buzz([60, 40, 60, 40, 120], 0);
        break;
      case 'bossDown':
        sfx.bossDown();
        loop.hold(0.12);
        haptics.buzz([80, 40, 160], 0);
        break;
      case 'pick': sfx.fanfare(e.kind === 'biome'); break;
      case 'biome': {
        applyInks();
        const inks = BIOME_INKS[e.index % BIOME_INKS.length];
        const g = GIMMICK_TEXT[gimmickFor(e.index)];
        fx.showBanner(inks.name.toUpperCase(), g || `Depth ${sim.level}`, g ? 3.4 : 2.2);
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
      restart: () => startRun(sim.classId),
      setFast: (on) => {
        fast = on;
        loop.speed = on ? 10 : 1;
      },
      setHitboxes: (on) => (showHitboxes = on),
      upgrades: UPGRADES.map((u) => u.id),
    })
  : null;

function applySettings(): void {
  sfx.enabled = settings.sound;
  haptics.enabled = settings.haptics;
  fx.enabledShake = settings.shake && !reducedMotion;
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
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'run' && !menus.open) pause();
  else if (document.hidden) loop.paused = true;
  else if (!menus.open || mode === 'title') loop.paused = false;
});
mountGrain();
newDemo();
showTitle();
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
