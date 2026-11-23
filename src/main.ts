import { addRun } from './core/history';
import { inspectAt } from './content/inspect';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './styles/main.css';
import { registerSW } from 'virtual:pwa-register';
import { Haptics, Sfx } from './core/audio';
import { AimInput, NUDGE, clampAim } from './core/input';
import { Loop } from './core/loop';
import { addScore, bestDepth, endlessBest, loadScores } from './core/scores';
import { loadSettings, saveSettings, type Settings } from './core/settings';
import { load, save } from './core/storage';
import { ProfileStore } from './core/profile';
import { ACHIEVEMENTS, type RunFacts } from './content/achievements';
import type { ClassId } from './content/classes';
import { UPGRADES, previewUpgrade } from './content/upgrades';
import { CLASS_BY_ID } from './content/classes';
import { Fx } from './render/fx';
import { biomeName, inksFor } from './render/palette';
import { Renderer } from './render/renderer';
import { View } from './render/view';
import { demoAngle } from './sim/bot';
import { BALL_R, FLOOR, ROWS } from './sim/constants';
import { GIMMICK_TEXT, endlessLap, gimmickFor } from './sim/run';
import { traceShot, type Trace } from './sim/trace';
import type { SimEvent } from './sim/types';
import { Sim, type SaveData } from './sim/world';
import { mountDebug } from './ui/debug';
import { Hud } from './ui/hud';
import { Menus } from './ui/menus';
import { PickScreen } from './ui/pick';
import { toast } from './ui/toast';
import { Tips } from './ui/tips';
import { BRICKS } from './content/bricks';

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
const profile = new ProfileStore();
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
let aimTarget = clampAim(load<number>('aim', Math.PI / 2));
/** When the aim last changed (for the angle readout). */
let aimTouched = -10;
let aimDragging = false;
let aimShown = aimTarget;
let trace: Trace | null = null;
let time = 0;
let fast = false;
let showHitboxes = false;
let volleyHits = 0;
let lastSavedPhase = '';
let demoWait = 0;

/** Frame timing, exposed as window.__perf with ?debug for profiling. */
const perf = { sim: 0, render: 0, frames: [] as { dt: number; game: number; sim: number; render: number; balls: number; fx: number }[] };
if (debug) (window as unknown as { __perf: typeof perf }).__perf = perf;
/** With ?debug, window.__sim() returns the live game (for testing in the console). */
if (debug) (window as unknown as { __sim: () => Sim }).__sim = () => sim;

const loop = new Loop(
  (h) => {
    const t0 = performance.now();
    sim.tick(h);
    perf.sim += performance.now() - t0;
  },
  (realDt, gameDt) => {
    time += realDt;
    const events = sim.drainEvents();
    fx.consume(events);
    if (mode === 'run') feedback(events);
    else demoStep(realDt, events);
    fx.update(realDt, sim);
    if (slowUntil && performance.now() > slowUntil) { slowUntil = 0; loop.speed = 1; }
    if (sim.phase === 'aim' && loop.speed !== 1 && !fast && mode === 'run' && !slowUntil) loop.speed = 1;
    aimShown += (aimTarget - aimShown) * Math.min(1, realDt * 22);
    trace = mode === 'run' && sim.phase === 'aim' ? traceShot(sim.grid, sim.launchX, aimShown, sim.stats.sight, sim.traceAccel, sim.stats.wrap, 5, 4000, sim.ballRadius) : null;
    if (mode === 'run') autosave();
    const r0 = performance.now();
    renderer.draw({ sim, fx, trace, best, time, showHitboxes, numbers: settings.numbers, skin: profile.skin,
      aimReadout: mode === 'run' && sim.phase === 'aim' && (aimDragging || time - aimTouched < 1.2) ? aimShown : null });
    if (mode === 'run' && !loop.paused) track(realDt);
    perf.render = performance.now() - r0;
    if (debug) {
      perf.frames.push({ dt: realDt * 1000, game: gameDt * 1000, sim: perf.sim, render: perf.render, balls: sim.balls.length,
        fx: fx.particles.length + fx.rings.length + fx.texts.length + fx.zaps.length });
      if (perf.frames.length > 2000) perf.frames.shift();
    }
    perf.sim = 0;
    hud.update(sim, loop.speed, pick.open || menus.open);
    adaptQuality(realDt);
    updateDebug?.(1 / Math.max(realDt, 1e-3));
  },
);

const hud = new Hud(uiRoot, {
  onFire: () => fire(),
  onNudge: (dir) => {
    if (mode !== 'run' || sim.phase !== 'aim') return;
    aimTarget = clampAim(aimTarget - dir * NUDGE);
    aimTouched = time;
  },
  onPause: () => pause(),
  onSpeed: (s) => {
    loop.speed = s;
    sfx.click();
  },
  onRecall: () => sim.recall(),
});
const pick = new PickScreen(uiRoot);
const tips = new Tips(uiRoot);
const menus = new Menus(uiRoot, {
  onContinue: () => continueRun(),
  onNewRun: (c) => startRun(c),
  onResume: () => resume(),
  onAbandon: () => {
    save(SAVE_KEY, null);
    recordRun(true);
    showTitle();
  },
  onLeave: () => {
    // The run is saved at the start of every turn (and at picks), so Continue picks up from there.
    if (sim.phase === 'aim' || sim.phase === 'pick' || sim.phase === 'won') save(SAVE_KEY, sim.toSave());
    demoRunning = false;
    showTitle();
  },
  onToMenu: () => showTitle(),
  onEndless: () => {
    menus.hide();
    sim.continueEndless();
    hud.show(true);
  },
  onEndRun: () => {
    // Bank the win and show the summary.
    finishRun();
  },
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
    profile.reset();
    applySettings();
    best = 0;
    toast('All data erased.', undefined, 2500);
    showTitle();
  },
  onSkin: (id) => {
    profile.p.skin = id;
    profile.save();
    fx.trailLen = profile.skin === 'comet' ? 20 : 9;
  },
  click: () => sfx.click(),
}, settings, profile);

new AimInput(view, canvas, {
  canAim: () => mode === 'run' && sim.phase === 'aim' && !pick.open && !menus.open,
  launcher: () => [sim.launchX, FLOOR - BALL_R],
  angle: () => aimTarget,
  onAim: (a) => { aimTarget = a; aimTouched = time; },
  onActive: (on) => { aimDragging = on; aimTouched = time; },
  onInspect: (pos) => hud.showInspect(pos ? inspectAt(sim, pos[0], pos[1]) : null),
  onFire: () => fire(),
});

// ---- screens and runs ----

function savedRun(): SaveData | null {
  const s = load<SaveData | null>(SAVE_KEY, null);
  return Sim.isValidSave(s) ? s : null;
}

function showTitle(): void {
  mode = 'title';
  tips.clear();
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
    endlessBest: endlessBest(),
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
  if (!profile.classUnlocked(classId)) classId = 'striker';
  save('class', classId);
  sim = new Sim(seed, { classId, locked: profile.lockedUpgrades() });
  // Fresh runs start aiming straight up.
  aimTarget = aimShown = Math.PI / 2;
  demoRunning = false;
  beginRun();
  fx.showBanner(inksFor(0).name.toUpperCase(), 'Depth 1 · break bricks, grab orbs, don’t let them reach the bottom', 2.4);
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
  resetTracking();
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
    classId: sim.classId, upgrades: sim.upgrades, stats: sim.stats, triggers: [...(sim.stats.bigBall ? [`Heavyweight +${sim.growth.big ?? 0} damage`] : []), ...sim.triggerLabels()], depth: sim.level, biome: sim.biome,
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
  const nextBiome = biomeName(sim.biome);
  const classApply = CLASS_BY_ID.get(sim.classId)?.apply;
  const view = () => ({
    kind: sim.offer!.kind, ids: sim.offer!.ids, owned: sim.upgrades, next: nextBiome, rerolls: sim.offer!.rerolls,
    previews: sim.offer!.ids.map((id) => previewUpgrade(id, sim.upgrades, classApply, { balls: sim.ballCount, shields: sim.shields })),
  });
  pick.show(
    view(),
    (i) => {
      const id = sim.offer?.ids[i];
      if (id) profile.seeUpgrade(id);
      sim.choose(i);
      sfx.orb();
      haptics.buzz(20);
    },
    () => sfx.click(),
    () => {
      if (!sim.reroll()) return null;
      sfx.portal();
      save(SAVE_KEY, sim.toSave());
      return view();
    },
  );
}

/** Save the run whenever it settles between turns. */
function autosave(): void {
  const p = sim.phase;
  if (p === lastSavedPhase) return;
  lastSavedPhase = p;
  if (p === 'aim' || p === 'pick' || p === 'won') save(SAVE_KEY, sim.toSave());
  if (p === 'pick') showPick();
  if (p === 'won') setTimeout(() => { if (sim.phase === 'won') { hud.show(false); menus.showWin(summaryView(-1)); } }, 1800);
}

function summaryView(rank: number) {
  return {
    depth: sim.level, biome: sim.biome, classId: sim.classId, kills: sim.totals.kills, damage: sim.totals.damage,
    bestCombo: sim.totals.bestCombo, bosses: sim.totals.bosses, upgrades: { ...sim.upgrades }, rank, best,
    won: sim.won, cause: [...sim.deathCause],
  };
}

/** Add the run to the history list. */
function recordRun(abandoned = false): void {
  addRun({
    date: Date.now(), classId: sim.classId, depth: sim.level, biome: sim.biome, won: sim.won, abandoned,
    kills: sim.totals.kills, bosses: sim.totals.bosses, upgrades: { ...sim.upgrades }, cause: abandoned ? [] : [...sim.deathCause],
  });
}

/** Record the run's score and show the summary (after losing, or ending a won run). */
function finishRun(delay = 0): void {
  save(SAVE_KEY, null);
  recordRun();
  const st = profile.p.stats;
  st.runs++;
  st.deepest = Math.max(st.deepest, sim.level);
  achievementsCheck();
  profile.save();
  const depth = sim.level;
  const rank = addScore({
    depth, classId: sim.classId, biome: sim.biome, kills: sim.totals.kills, bosses: sim.totals.bosses,
    date: Date.now(), won: sim.won,
  });
  best = Math.max(best, depth);
  save('best', best);
  const summary = { ...summaryView(rank), earned: [...runEarned] };
  setTimeout(() => {
    hud.show(false);
    menus.showSummary(summary);
  }, delay);
}

function onGameOver(): void {
  finishRun(900);
}

/** Sound, vibration and hit-stop for sim events. */
function feedback(events: SimEvent[]): void {
  for (const e of events) {
    momentTips(e);
    switch (e.type) {
      case 'launch': sfx.launch(); break;
      case 'wall': sfx.wall(); break;
      case 'hit': {
        volleyHits++;
        // Small freezes only while the screen is calm; with lots of balls they'd stall the game.
        const calm = sim.balls.length < 25;
        if (e.killed) {
          sfx.kill(fx.combo);
          haptics.buzz(10);
          if (fx.combo > 0 && fx.combo % 5 === 0) {
            sfx.combo(fx.combo / 5);
            loop.hold(0.06, 0.5);
            haptics.buzz([20, 30, 20], 0);
          } else if (calm) loop.hold(0.025);
        } else if (e.source === 'ball') sfx.hit(volleyHits);
        if (e.crit) {
          profile.p.stats.crits++;
          sfx.crit();
          if (calm) loop.hold(0.04);
          haptics.buzz(14);
        }
        break;
      }
      case 'immune': sfx.immune(); break;
      case 'zap': sfx.zap(); break;
      case 'split': sfx.split(); break;
      case 'ignite': sfx.ignite(); break;
      case 'explode':
        sfx.explode();
        if (sim.balls.length < 25) loop.hold(0.05);
        haptics.buzz(30);
        break;
      case 'laser': sfx.laser(); haptics.buzz(15); break;
      case 'portal': sfx.portal(); break;
      case 'hazard':
        if (e.kind === 'popper' && !sim.stats.hazardProof) profile.p.stats.pops++;
        sfx.hazard(e.kind);
        haptics.buzz(20);
        break;
      case 'orb': sfx.orb(); haptics.buzz(15); break;
      case 'bounty': sfx.orb(); break;
      case 'drop':
        noticeBricks();
        achievementsCheck();
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
        runFacts.bossesBeaten.push(e.name);
        slowMo(0.7);
        fx.confetti();
        sfx.bossDown();
        loop.hold(0.12, 0);
        haptics.buzz([80, 40, 160], 0);
        break;
      case 'pick': sfx.fanfare(e.kind === 'biome'); break;
      case 'lootAppear': sfx.fanfare(false); haptics.buzz([20, 40, 20], 0); break;
      case 'loot':
        if (e.upgrade) profile.seeUpgrade(e.upgrade);
        sfx.orb();
        sfx.fanfare(true);
        haptics.buzz([30, 30, 60], 0);
        loop.hold(0.1, 0);
        break;
      case 'steal': sfx.hazard('popper'); haptics.buzz(40); break;
      case 'lunge': sfx.drop(); haptics.buzz(30); break;
      case 'burst': sfx.explode(); break;
      case 'bloom': sfx.split(); break;
      case 'tide': sfx.portal(); break;
      case 'lava': sfx.heartbeat(); sfx.drop(); haptics.buzz([40, 60, 40], 0); break;
      case 'trigger':
        fx.text(126, 150, e.text, true);
        if (e.text.endsWith('RESET')) sfx.drop(); else sfx.orb();
        haptics.buzz(20, 0);
        break;
      case 'bossPhase':
        sfx.bossRoar();
        fx.showBanner(`PHASE ${e.phase}`, e.text, 2.6);
        fx.kick(7);
        loop.hold(0.1, 0);
        haptics.buzz([50, 30, 50], 0);
        break;
      case 'win':
        runFacts.bossesBeaten.push('The Core');
        profile.p.stats.wins++;
        if (!profile.p.stats.classWins.includes(sim.classId)) profile.p.stats.classWins.push(sim.classId);
        runFacts.won = true;
        achievementsCheck();
        sfx.bossDown();
        sfx.fanfare(true);
        fx.showBanner('THE CORE IS BROKEN', 'You win', 3);
        fx.kick(10);
        slowMo(1.4);
        haptics.buzz([100, 50, 100, 50, 300], 0);
        break;
      case 'biome': {
        fx.wipe();
        applyInks();
        const g = GIMMICK_TEXT[gimmickFor(e.index)];
        const lap = endlessLap(e.index);
        const sub = lap ? `Endless lap ${lap}: bricks are tougher and hazards more common. ${g}` : g || `Depth ${sim.level}`;
        fx.showBanner(biomeName(e.index).toUpperCase(), sub, g || lap ? 3.4 : 2.2);
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

// ---- lifetime stats and achievements ----

let runFacts: RunFacts = newFacts();
let runEarned: string[] = [];
let lastTotals = { kills: 0, damage: 0, bosses: 0 };
let saveTimer = 0;

function newFacts(): RunFacts {
  return { classId: sim.classId, depth: 1, bossesBeaten: [], won: sim.won, bestCombo: 0, maxBalls: 0, upgrades: {} };
}

function resetTracking(): void {
  runFacts = newFacts();
  runEarned = [];
  lastTotals = { kills: sim.totals.kills, damage: sim.totals.damage, bosses: sim.totals.bosses };
  fx.trailLen = profile.skin === 'comet' ? 20 : 9;
}

/** Fold this frame's progress into lifetime stats. */
function track(dt: number): void {
  const st = profile.p.stats;
  const t = sim.totals;
  st.kills += t.kills - lastTotals.kills;
  st.damage += t.damage - lastTotals.damage;
  st.bosses += t.bosses - lastTotals.bosses;
  lastTotals = { kills: t.kills, damage: t.damage, bosses: t.bosses };
  st.time += dt;
  st.bestCombo = Math.max(st.bestCombo, t.bestCombo);
  st.maxBalls = Math.max(st.maxBalls, sim.ballCount);
  st.deepest = Math.max(st.deepest, sim.level);
  runFacts.depth = sim.level;
  runFacts.bestCombo = t.bestCombo;
  runFacts.maxBalls = Math.max(runFacts.maxBalls, sim.ballCount);
  runFacts.upgrades = sim.upgrades;
  saveTimer += dt;
  if (saveTimer > 5) {
    saveTimer = 0;
    profile.save();
  }
}

function achievementsCheck(): void {
  for (const id of profile.check(runFacts)) {
    runEarned.push(id);
    const a = ACHIEVEMENTS.find((x) => x.id === id)!;
    toast(`★ ${a.name}`, undefined, 2600);
    sfx.fanfare(false);
  }
}

/** Note new brick kinds and bosses on the board (for the collection, and first-time tips). */
function noticeBricks(): void {
  for (const b of sim.bricks) {
    const id = b.boss ? b.boss.id : b.kind;
    if (id !== 'normal' && profile.seeBrick(id)) onFirstSight(id);
  }
}

/** First time a brick kind shows up, explain it. */
function onFirstSight(id: string): void {
  const info = BRICKS[id as keyof typeof BRICKS];
  if (!info) return;
  tips.show(`${info.hazard ? 'Hazard' : 'New brick'}: <b>${info.name}</b>. ${info.desc}${info.hazard && profile.tip('hazards') ? ' Hazards always have a jagged outline.' : ''}`);
}

/** Tips tied to moments rather than bricks. Each shows once ever. */
function momentTips(e: SimEvent): void {
  if (e.type === 'orb' && profile.tip('orb')) tips.show('Every ⊕ orb you grab adds a ball to your next volley.');
  if (e.type === 'pick' && profile.tip('pick')) tips.show('Every biome has three upgrades: loot bricks at a third, this small pick at two-thirds, and a big pick after the boss. Cards marked “Fits your build” share themes with what you own.');
  if (e.type === 'drop' && sim.lowestRow >= ROWS - 2 && profile.tip('danger')) tips.show('If a brick crosses the bottom row, the run ends. Shields and Second Wind can save you once.');
  if (e.type === 'laser' && profile.tip('laser')) tips.show('Line lasers blast every brick in their row or column each time a ball passes through.');
  if (e.type === 'portal' && profile.tip('portal')) tips.show('Portals come in pairs: a ball that enters one comes out of the other.');
  if (e.type === 'boss' && profile.tip('boss')) tips.show('Mini-bosses stop new rows from arriving. Beat them for the big upgrade pick (with one free reroll).');
  if (e.type === 'lootAppear' && profile.tip('loot')) tips.show('Loot! The symbol shows the genre: ✶ Power, ●●● Arsenal, flame Elemental, shield Guard, ? Wild. The first one you break is yours.');
  if (e.type === 'bloom' && profile.tip('bloom')) tips.show('Bricks you leave alone sprout blooms in Meadow. Break a bloom for an extra ball.');
  if (e.type === 'tide' && profile.tip('tide')) tips.show('The tide shifts every brick one column. It comes more often deeper into The Deep.');
  if (e.type === 'lava' && profile.tip('lava')) tips.show('Lava raised the danger line. Watch for the dashed warning: it shows where lava will reach next turn.');
  if (e.type === 'immune' && e.reason === 'shielded' && profile.tip('shielded')) tips.show('That brick is protected by a Shielder (dashed link): your balls only deal 25% to it. Break the Shielder, or use explosions, lightning, lasers, splash or fire, which ignore shields.');
  if (e.type === 'steal' && profile.tip('steal')) tips.show('A Thief stole a ball. The badge on a Thief or Fuse counts down the turns until it acts.');
}

/** Briefly run the game in slow motion (big finishes). */
let slowUntil = 0;
function slowMo(seconds: number): void {
  if (reducedMotion) return;
  slowUntil = performance.now() + seconds * 1000;
  loop.speed = 0.3;
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

/**
 * If frames stay slow for a couple of seconds, render at a lower resolution.
 * Only ever steps down (a 60Hz screen can't tell us when there's headroom again); resets on reload.
 */
let slowTime = 0, quietTime = 0;
function adaptQuality(dt: number): void {
  if (loop.paused || document.hidden) return;
  if (dt > 1 / 40 && dt < 0.25) {
    slowTime += dt;
    quietTime = 0;
  } else {
    quietTime += dt;
    if (quietTime > 1) slowTime = Math.max(0, slowTime - dt);
  }
  if (slowTime > 1.5) {
    slowTime = 0;
    if (view.lowerQuality()) renderer.invalidate();
  }
}

function applySettings(): void {
  profile.unlockAll = settings.unlockAll;
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
preventZoom();

/**
 * The viewport meta asks for no zoom, but iOS Safari ignores it, so block the gestures directly:
 * pinch (iOS gesture events and any two-finger move), and Ctrl+wheel on desktop.
 * Double-tap zoom is turned off with CSS touch-action, which doesn't delay taps.
 */
function preventZoom(): void {
  const stop = (e: Event) => e.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, stop, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '0'].includes(e.key)) e.preventDefault();
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'run' && !menus.open) pause();
  else if (document.hidden) loop.paused = true;
  else if (!menus.open || mode === 'title') loop.paused = false;
});
newDemo();
showTitle();
loop.start();

const updateSW = registerSW({
  onNeedRefresh: () => toast('A new version is ready.', { label: 'Update', run: () => updateSW(true) }),
  onOfflineReady: () => toast('Ready to play offline.'),
});
