/**
 * Does building around synergies beat taking random cards? That's the goal of the upgrade design.
 * Same seeds, same classes, two pickers: random, and "synergy" (takes the card that best matches
 * the themes it already owns). Run with `npm run balance -- synergy`. Writes docs/synergy-report.md.
 */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { CLASSES, type ClassId } from '../src/content/classes';
import { UPGRADE_BY_ID, synergyScore, THEMES } from '../src/content/upgrades';
import { mulberry32 } from '../src/core/rng';
import { bestAngle, finishTurn } from '../src/sim/bot';
import { Sim } from '../src/sim/world';
import { CELL, FLOOR, MIN_ANGLE, TOP } from '../src/sim/constants';
import { traceShot } from '../src/sim/trace';
import type { Theme } from '../src/content/upgrades';

/** Which build themes each loot genre feeds. */
const GENRE_THEMES: Record<string, Theme[]> = {
  power: ['damage', 'crit', 'general'], arsenal: ['multi', 'bank'], elemental: ['fire', 'explosion', 'lightning'],
  guard: ['defense'], wild: ['damage', 'crit', 'multi', 'fire', 'explosion', 'lightning', 'bank'],
};

/** Synergy bot: aim straight at the loot brick whose genre best fits what it owns. */
function lootAim(sim: Sim): number | null {
  const loot = sim.bricks.filter((b) => b.kind === 'loot');
  if (!loot.length) return null;
  const owned = new Map<string, number>();
  for (const [id, n] of Object.entries(sim.upgrades)) for (const t of THEMES[id] ?? []) owned.set(t, (owned.get(t) ?? 0) + n);
  const fit = (g: string) => GENRE_THEMES[g].reduce((a, t) => a + (owned.get(t) ?? 0), 0) / (g === 'wild' ? 2 : 1);
  const target = loot.reduce((a, b) => (fit(b.loot ?? 'wild') > fit(a.loot ?? 'wild') ? b : a));
  const tx = target.c * CELL + CELL / 2, ty = TOP + target.r * CELL + CELL / 2;
  // Only take the shot if the first thing the ball would hit is that loot brick.
  for (const off of [0, -6, 6, -12, 12]) {
    const a = Math.max(MIN_ANGLE, Math.min(Math.PI - MIN_ANGLE, Math.atan2(FLOOR - ty, tx + off - sim.launchX)));
    const t = traceShot(sim.grid, sim.launchX, a, 1, sim.accel);
    const hit = t.contacts[0];
    if (hit && Math.abs(hit[0] - tx) < CELL * 0.75 && Math.abs(hit[1] - ty) < CELL * 0.75) return a;
  }
  return null;
}

const SEEDS = Number(process.env.RUNS ?? 30);
const CANDIDATES = Number(process.env.CANDIDATES ?? 4);
const MAX_TURNS = Number(process.env.MAX_TURNS ?? 220);
type Picker = 'random' | 'synergy';

interface Result { depth: number; won: boolean; bosses: number; themes: string; build: Record<string, number>; snap: Record<string, number> | null; snapDepth: number; picker: Picker; classId: ClassId }

function play(seed: number, classId: ClassId, picker: Picker): Result {
  const sim = new Sim(seed, { classId });
  const rnd = mulberry32(seed ^ 0x51e);
  let turns = 0;
  // Snapshot of the build when the run reaches The Deep (biome index 2), for fair comparisons.
  let snap: Record<string, number> | null = null, snapDepth = 0;
  while (sim.phase !== 'over' && sim.phase !== 'won' && turns < MAX_TURNS) {
    if (!snap && sim.biome >= 2 && sim.phase === 'aim') { snap = { ...sim.upgrades }; snapDepth = sim.level; }
    if (sim.phase === 'pick') {
      const ids = sim.offer!.ids.filter((id) => UPGRADE_BY_ID.get(id)!.rarity !== 'cursed' || picker === 'random');
      let i = Math.floor(rnd() * sim.offer!.ids.length);
      if (picker === 'synergy' && ids.length) {
        const best = ids.reduce((a, b) => (synergyScore(b, sim.upgrades) + rnd() * 0.3 > synergyScore(a, sim.upgrades) + rnd() * 0.3 ? b : a));
        i = sim.offer!.ids.indexOf(best);
      }
      sim.choose(i);
      continue;
    }
    const aim = picker === 'synergy' ? lootAim(sim) : null;
    sim.fire(aim ?? bestAngle(sim, CANDIDATES));
    finishTurn(sim);
    turns++;
  }
  const counts = new Map<string, number>();
  for (const [id, n] of Object.entries(sim.upgrades)) for (const t of THEMES[id] ?? []) counts.set(t, (counts.get(t) ?? 0) + n);
  const themes = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t).join('+');
  return { depth: sim.level, won: sim.won, bosses: sim.totals.bosses, themes, build: { ...sim.upgrades }, snap, snapDepth, picker, classId };
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

it('synergy report', async () => {
  const res: Record<Picker, Result[]> = { random: [], synergy: [] };
  for (let i = 0; i < SEEDS; i++) {
    const seed = 30000 + i * 104729, cls = CLASSES[i % CLASSES.length].id;
    res.random.push(play(seed, cls, 'random'));
    res.synergy.push(play(seed, cls, 'synergy'));
    console.log(`seed ${i + 1}/${SEEDS} ${cls}: random ${res.random[i].depth}, synergy ${res.synergy[i].depth} (${res.synergy[i].themes})`);
    await new Promise((r) => setTimeout(r, 0));
  }
  const better = res.synergy.filter((r, i) => r.depth > res.random[i].depth).length;
  const lines = [
    '# Synergy report', '',
    `Same ${SEEDS} seeds and classes, played twice by the bot: once taking random cards, once taking the card that best matches the themes it already owns. Generated by \`npm run balance -- synergy\`.`, '',
    '| Picker | Median depth | Mean depth | Median bosses | Wins |', '|---|---|---|---|---|',
    ...(['random', 'synergy'] as Picker[]).map((p) => `| ${p} | ${median(res[p].map((r) => r.depth))} | ${mean(res[p].map((r) => r.depth)).toFixed(0)} | ${median(res[p].map((r) => r.bosses))} | ${res[p].filter((r) => r.won).length}/${SEEDS} |`),
    '', `Synergy picker went deeper on **${better} of ${SEEDS}** seeds.`, '',
    '## Synergy runs by main themes', '', '| Themes | Runs | Median depth |', '|---|---|---|',
  ];
  const byTheme = new Map<string, number[]>();
  for (const r of res.synergy) byTheme.set(r.themes || '(none)', [...(byTheme.get(r.themes || '(none)') ?? []), r.depth]);
  for (const [t, ds] of [...byTheme].sort((a, b) => median(b[1]) - median(a[1]))) lines.push(`| ${t} | ${ds.length} | ${median(ds)} |`);
  lines.push('');

  // ---- build examinations ----
  const all = [...res.random, ...res.synergy];
  const name = (id: string) => UPGRADE_BY_ID.get(id)?.name ?? id;
  const fmt = (b: Record<string, number>) => Object.entries(b).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).map(([id, n]) => (n > 1 ? `${name(id)} ×${n}` : name(id))).join(', ');
  lines.push('## Best runs (both pickers)', '', '| Depth | Picker | Class | Final build |', '|---|---|---|---|');
  for (const r of [...all].sort((a, b) => b.depth - a.depth).slice(0, 10)) lines.push(`| ${r.depth}${r.won ? ' ★' : ''} | ${r.picker} | ${r.classId} | ${fmt(r.build)} |`);

  // Fair comparison: builds as they stood on reaching The Deep, scored by how far the run went after that.
  const snaps = all.filter((r) => r.snap).map((r) => ({ cards: Object.keys(r.snap!).filter((k) => r.snap![k] > 0), gain: r.depth - r.snapDepth }));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const base = avg(snaps.map((x) => x.gain));
  lines.push('', '## Combos', '', `Builds snapshotted on reaching The Deep (${snaps.length} runs got there; average ${base.toFixed(0)} more rows afterwards). A pair is a real combo if runs holding **both** went further than runs holding only one of them.`, '');
  const ids = [...new Set(snaps.flatMap((x) => x.cards))];
  const pairs: { a: string; b: string; n: number; both: number; lift: number }[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j];
    const both = snaps.filter((x) => x.cards.includes(a) && x.cards.includes(b));
    const onlyA = snaps.filter((x) => x.cards.includes(a) && !x.cards.includes(b));
    const onlyB = snaps.filter((x) => !x.cards.includes(a) && x.cards.includes(b));
    if (both.length < 3 || onlyA.length < 2 || onlyB.length < 2) continue;
    const mb = avg(both.map((x) => x.gain));
    pairs.push({ a, b, n: both.length, both: mb, lift: mb - Math.max(avg(onlyA.map((x) => x.gain)), avg(onlyB.map((x) => x.gain))) });
  }
  pairs.sort((x, y) => y.lift - x.lift);
  lines.push('| Pair | Runs with both | Rows gained with both | Better than either alone by |', '|---|---|---|---|');
  for (const p of pairs.slice(0, 12)) lines.push(`| ${name(p.a)} + ${name(p.b)} | ${p.n} | ${p.both.toFixed(0)} | ${p.lift >= 0 ? '+' : ''}${p.lift.toFixed(0)} |`);
  lines.push('', '**Anti-combos** (worse together than apart):', '', '| Pair | Runs with both | Worse than the better one alone by |', '|---|---|---|');
  for (const p of pairs.slice(-6).reverse()) lines.push(`| ${name(p.a)} + ${name(p.b)} | ${p.n} | ${p.lift.toFixed(0)} |`);

  // Single cards held at the snapshot.
  lines.push('', '## Single cards at the snapshot', '', '| Card | Runs holding it | Rows gained afterwards (avg) |', '|---|---|---|');
  const singles = ids.map((id) => ({ id, xs: snaps.filter((x) => x.cards.includes(id)).map((x) => x.gain) })).filter((x) => x.xs.length >= 4).sort((x, y) => avg(y.xs) - avg(x.xs));
  for (const x of singles) lines.push(`| ${name(x.id)} | ${x.xs.length} | ${avg(x.xs).toFixed(0)} |`);
  lines.push('');
  writeFileSync(new URL('../docs/synergy-report.md', import.meta.url), lines.join('\n'));
  console.log(lines.join('\n'));
});
