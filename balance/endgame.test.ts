/**
 * Endgame report: which random builds can beat The Core, and how far past it they go.
 * The bot plays whole runs taking random cards, keeps going into endless after a win, and
 * has a much higher turn limit than the other reports so strong builds can show their ceiling.
 * Run with `npm run balance -- endgame` (RUNS=60, MAX_TURNS=600 by default). Writes docs/endgame-report.md.
 * To use several cores: run SHARDS=4 SHARD=0..3 in parallel, then MERGE=4 to write the report.
 */
import { it } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { CLASSES, type ClassId } from '../src/content/classes';
import { UPGRADE_BY_ID, THEMES } from '../src/content/upgrades';
import { mulberry32 } from '../src/core/rng';
import { bestAngle, finishTurn, smartAngle, strategistAngle, v4Angle } from '../src/sim/bot';
import { Sim } from '../src/sim/world';
import { CORE } from '../src/sim/run';

const SEEDS = Number(process.env.RUNS ?? 60);
const CANDIDATES = Number(process.env.CANDIDATES ?? 4);
const MAX_TURNS = Number(process.env.MAX_TURNS ?? 600);
/** v4 (default): v2 plus triage. v2: aims at corners, gaps and bank shots with a precision check. v1: 4 evenly spaced angles. v3: strategist (triage, pockets, corridors, top lane). */
const BOT = process.env.BOT ?? 'v4';
/** Names this test's shard files, so a restarted shard picks up where it left off. */
const TAG = process.env.TAG ?? 'run';
const SHARDS = Number(process.env.SHARDS ?? 1), SHARD = Number(process.env.SHARD ?? 0), MERGE = Number(process.env.MERGE ?? 0);
const OUT = new URL('./.out/', import.meta.url);

interface Result { seed: number; classId: ClassId; depth: number; won: boolean; capped: boolean; atCore: Record<string, number> | null; atDeep: Record<string, number> | null; final: Record<string, number>; balls: number }

function play(seed: number, classId: ClassId): Result {
  const sim = new Sim(seed, { classId });
  const rnd = mulberry32(seed ^ 0xe9d);
  let turns = 0, atCore: Record<string, number> | null = null, atDeep: Record<string, number> | null = null, won = false;
  while (sim.phase !== 'over' && turns < MAX_TURNS) {
    if (!atCore && sim.biome >= CORE && sim.phase === 'aim') atCore = { ...sim.upgrades };
    if (!atDeep && sim.biome >= 2 && sim.phase === 'aim') atDeep = { ...sim.upgrades };
    if (sim.phase === 'won') { won = true; if (!sim.continueEndless()) break; continue; }
    if (sim.phase === 'pick') { sim.choose(Math.floor(rnd() * sim.offer!.ids.length)); continue; }
    sim.fire(BOT === 'v1' ? bestAngle(sim, CANDIDATES) : BOT === 'v3' ? strategistAngle(sim) : BOT === 'v4' ? v4Angle(sim) : smartAngle(sim));
    finishTurn(sim);
    turns++;
  }
  return { seed, classId, depth: sim.level, won: won || sim.won, capped: sim.phase !== 'over', atCore, atDeep, final: { ...sim.upgrades }, balls: sim.ballCount };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '–');
const name = (id: string) => UPGRADE_BY_ID.get(id)?.name ?? id;
const has = (b: Record<string, number>, id: string) => (b[id] ?? 0) > 0;
const fmt = (b: Record<string, number>) => Object.entries(b).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).map(([id, n]) => (n > 1 ? `${name(id)} ×${n}` : name(id))).join(', ');
const themesOf = (b: Record<string, number>) => {
  const counts = new Map<string, number>();
  for (const [id, n] of Object.entries(b)) for (const t of THEMES[id] ?? []) if (t !== 'general') counts.set(t, (counts.get(t) ?? 0) + n);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([t]) => t).join('+') || '(none)';
};

it('endgame report', async () => {
  let res: Result[] = [];
  if (MERGE) {
    for (let k = 0; k < MERGE; k++) res.push(...JSON.parse(readFileSync(new URL(`endgame-${TAG}-${k}.json`, OUT), 'utf8')) as Result[]);
    res.sort((a, b) => a.seed - b.seed);
  } else {
   const file = new URL(`endgame-${TAG}-${SHARD}.json`, OUT);
   // Resume: keep runs this shard already finished (it saves after every run).
   if (SHARDS > 1 && existsSync(file)) res = JSON.parse(readFileSync(file, 'utf8')) as Result[];
   for (let i = SHARD; i < SEEDS; i += SHARDS) {
    const seed = 70000 + i * 7919, cls = (process.env.CLASS as ClassId | undefined) ?? CLASSES[i % CLASSES.length].id;
    if (res.some((x) => x.seed === seed)) continue;
    const r = play(seed, cls);
    res.push(r);
    if (SHARDS > 1) { if (!existsSync(OUT)) mkdirSync(OUT); writeFileSync(file, JSON.stringify(res)); }
    console.log(`run ${i + 1}/${SEEDS} ${cls}: depth ${r.depth}${r.won ? ' (beat The Core)' : ''}${r.capped ? ' [turn limit]' : ''}`);
    await new Promise((ok) => setTimeout(ok, 0));
   }
  }
  if (SHARDS > 1) {
    writeFileSync(new URL(`endgame-${TAG}-${SHARD}.done`, OUT), '');
    return;
  }
  const RUNS_DONE = res.length;
  const core = res.filter((r) => r.atCore);
  const wins = res.filter((r) => r.won);
  const lines = [
    '# Endgame report', '',
    `${RUNS_DONE} whole runs, bot aiming, **random card picks**, classes in rotation. Runs continue into endless after beating The Core; turn limit ${MAX_TURNS}. Generated by \`npm run balance -- endgame\`.`, '',
    '| Runs | Reached The Core | Beat The Core | Hit the turn limit | Median depth | Mean depth |', '|---|---|---|---|---|---|',
    `| ${RUNS_DONE} | ${core.length} | ${wins.length} | ${res.filter((r) => r.capped).length} | ${median(res.map((r) => r.depth))} | ${avg(res.map((r) => r.depth)).toFixed(0)} |`, '',
    '## By class', '', '| Class | Runs | Beat The Core | Median depth | Best |', '|---|---|---|---|---|',
  ];
  for (const c of CLASSES) {
    const rs = res.filter((r) => r.classId === c.id);
    lines.push(`| ${c.name} | ${rs.length} | ${rs.filter((r) => r.won).length} | ${median(rs.map((r) => r.depth))} | ${Math.max(0, ...rs.map((r) => r.depth))} |`);
  }

  lines.push('', '## Deepest runs', '', 'Build as it stood when the run reached The Core (what it had to win with), then the final depth.', '',
    '| Depth | Class | Balls at end | Build at The Core |', '|---|---|---|---|');
  for (const r of [...core].sort((a, b) => b.depth - a.depth).slice(0, 15)) lines.push(`| ${r.depth}${r.won ? ' ★' : ''}${r.capped ? ' (limit)' : ''} | ${r.classId} | ${r.balls} | ${fmt(r.atCore!)} |`);

  lines.push('', '## Build families', '', 'Runs that reached The Core, grouped by their two biggest themes at that point.', '',
    '| Main themes | Runs | Beat The Core | Mean final depth |', '|---|---|---|---|');
  const fam = new Map<string, Result[]>();
  for (const r of core) { const k = themesOf(r.atCore!); fam.set(k, [...(fam.get(k) ?? []), r]); }
  for (const [k, rs] of [...fam].sort((a, b) => avg(b[1].map((r) => r.depth)) - avg(a[1].map((r) => r.depth)))) {
    lines.push(`| ${k} | ${rs.length} | ${pct(rs.filter((r) => r.won).length, rs.length)} | ${avg(rs.map((r) => r.depth)).toFixed(0)} |`);
  }

  // Cards held at The Core: does holding it make a win (and a deep endless) more likely?
  const baseWin = wins.length / Math.max(1, core.length), baseDepth = avg(core.map((r) => r.depth));
  const ids = [...new Set(core.flatMap((r) => Object.keys(r.atCore!).filter((k) => has(r.atCore!, k))))];
  lines.push('', '## Cards held at The Core', '',
    `${core.length} runs reached The Core; ${pct(wins.length, core.length)} of them beat it, mean final depth ${baseDepth.toFixed(0)}. Cards seen in at least 4 of those runs.`, '',
    '| Card | Runs holding it | Beat The Core | Mean final depth | vs. average |', '|---|---|---|---|---|');
  const singles = ids.map((id) => ({ id, rs: core.filter((r) => has(r.atCore!, id)) })).filter((x) => x.rs.length >= 4)
    .map((x) => ({ ...x, d: avg(x.rs.map((r) => r.depth)), w: x.rs.filter((r) => r.won).length / x.rs.length }))
    .sort((a, b) => b.d - a.d);
  for (const x of singles) lines.push(`| ${name(x.id)} | ${x.rs.length} | ${Math.round(x.w * 100)}% (${x.w >= baseWin ? '+' : ''}${Math.round((x.w - baseWin) * 100)}) | ${x.d.toFixed(0)} | ${x.d >= baseDepth ? '+' : ''}${(x.d - baseDepth).toFixed(0)} |`);

  // Pairs: better together than either alone.
  const pairs: { a: string; b: string; n: number; d: number; lift: number }[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j];
    const both = core.filter((r) => has(r.atCore!, a) && has(r.atCore!, b));
    const onlyA = core.filter((r) => has(r.atCore!, a) && !has(r.atCore!, b));
    const onlyB = core.filter((r) => !has(r.atCore!, a) && has(r.atCore!, b));
    if (both.length < 3 || onlyA.length < 2 || onlyB.length < 2) continue;
    const d = avg(both.map((r) => r.depth));
    pairs.push({ a, b, n: both.length, d, lift: d - Math.max(avg(onlyA.map((r) => r.depth)), avg(onlyB.map((r) => r.depth))) });
  }
  pairs.sort((x, y) => y.lift - x.lift);
  lines.push('', '## Combos at The Core', '', 'A pair counts if runs holding both went deeper than runs holding only one of them.', '',
    '| Pair | Runs with both | Mean final depth | Better than either alone by |', '|---|---|---|---|');
  for (const p of pairs.slice(0, 15)) lines.push(`| ${name(p.a)} + ${name(p.b)} | ${p.n} | ${p.d.toFixed(0)} | +${p.lift.toFixed(0)} |`);

  // Early game: cards held on reaching The Deep (biome 3). Which ones carry a run through the middle?
  const deep = res.filter((r) => r.atDeep);
  const deepCore = deep.filter((r) => r.atCore).length / Math.max(1, deep.length), deepDepth = avg(deep.map((r) => r.depth));
  const early = [...new Set(deep.flatMap((r) => Object.keys(r.atDeep!).filter((k) => has(r.atDeep!, k))))]
    .map((id) => ({ id, rs: deep.filter((r) => has(r.atDeep!, id)) })).filter((x) => x.rs.length >= 5)
    .map((x) => ({ ...x, c: x.rs.filter((r) => r.atCore).length / x.rs.length, d: avg(x.rs.map((r) => r.depth)) }))
    .sort((a, b) => b.c - a.c || b.d - a.d);
  lines.push('', '## Early game: cards held on reaching The Deep', '',
    `${deep.length} runs reached The Deep (biome 3); ${pct(deep.filter((r) => r.atCore).length, deep.length)} of them went on to reach The Core, mean final depth ${deepDepth.toFixed(0)}. Cards seen in at least 5 of those runs.`, '',
    '| Card | Runs holding it | Reached The Core | Mean final depth |', '|---|---|---|---|');
  for (const x of early) lines.push(`| ${name(x.id)} | ${x.rs.length} | ${Math.round(x.c * 100)}% (${x.c >= deepCore ? '+' : ''}${Math.round((x.c - deepCore) * 100)}) | ${x.d.toFixed(0)} |`);
  const ep: { a: string; b: string; n: number; c: number; lift: number }[] = [];
  const eids = early.map((x) => x.id);
  const reach = (rs: Result[]) => rs.filter((r) => r.atCore).length / Math.max(1, rs.length);
  for (let i = 0; i < eids.length; i++) for (let j = i + 1; j < eids.length; j++) {
    const a = eids[i], b = eids[j];
    const both = deep.filter((r) => has(r.atDeep!, a) && has(r.atDeep!, b));
    const onlyA = deep.filter((r) => has(r.atDeep!, a) && !has(r.atDeep!, b));
    const onlyB = deep.filter((r) => !has(r.atDeep!, a) && has(r.atDeep!, b));
    if (both.length < 4 || onlyA.length < 3 || onlyB.length < 3) continue;
    ep.push({ a, b, n: both.length, c: reach(both), lift: reach(both) - Math.max(reach(onlyA), reach(onlyB)) });
  }
  ep.sort((x, y) => y.lift - x.lift);
  lines.push('', '### Early combos', '', 'Pairs held on reaching The Deep that got to The Core more often than either card alone.', '',
    '| Pair | Runs with both | Reached The Core | Better than either alone by |', '|---|---|---|---|');
  for (const p of ep.slice(0, 12)) lines.push(`| ${name(p.a)} + ${name(p.b)} | ${p.n} | ${Math.round(p.c * 100)}% | +${Math.round(p.lift * 100)} pts |`);
  lines.push('');
  writeFileSync(new URL('../docs/endgame-report.md', import.meta.url), lines.join('\n'));
  console.log(lines.join('\n'));
});
