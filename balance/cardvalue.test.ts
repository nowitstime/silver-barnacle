/**
 * Forked card tests: which cards are actually best?
 *
 * The bot plays whole runs. At every card pick it copies the run once per card offered, takes a
 * different card in each copy, and plays each copy on for HORIZON turns with the same luck.
 * How much further a copy got than the average of its offer is that card's value at that moment,
 * with run-to-run randomness cancelled out. The main run then takes the card that did best, so it
 * drafts like a strong player.
 *
 * `npm run balance -- cardvalue` (RUNS=40, HORIZON=30). Several cores: SHARDS=4 SHARD=0..3, then MERGE=4.
 * Writes docs/card-values.md and balance/card-values.json (the learned value table).
 */
import { it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CLASSES, type ClassId } from '../src/content/classes';
import { UPGRADE_BY_ID } from '../src/content/upgrades';
import { finishTurn, smartAngle, v4Angle } from '../src/sim/bot';
import { ROWS } from '../src/sim/constants';
import { Sim } from '../src/sim/world';

const SEEDS = Number(process.env.RUNS ?? 40);
const HORIZON = Number(process.env.HORIZON ?? 30);
const MAX_TURNS = Number(process.env.MAX_TURNS ?? 400);
const SHARDS = Number(process.env.SHARDS ?? 1), SHARD = Number(process.env.SHARD ?? 0), MERGE = Number(process.env.MERGE ?? 0);
const OUT = new URL('./.out/', import.meta.url);

interface Sample { card: string; offer: string[]; classId: ClassId; biome: number; owned: string[]; value: number; adv: number }

/** Play a copy on for up to `turns` turns with a quick bot; how far it got (alive copies get a bonus for a safe board). */
function rollout(sim: Sim, turns: number): number {
  const start = sim.level;
  let t = 0;
  while (sim.phase !== 'over' && t < turns) {
    if (sim.phase === 'won') { if (!sim.continueEndless()) break; continue; }
    if (sim.phase === 'pick') { sim.choose(0); continue; }
    sim.fire(smartAngle(sim, { budget: 5, robust: false, lookahead: false }));
    finishTurn(sim);
    t++;
  }
  const gained = sim.level - start;
  return sim.phase === 'over' ? gained : gained + 10 + (ROWS - 1 - Math.max(-1, sim.lowestRow));
}

function play(seed: number, classId: ClassId): Sample[] {
  const sim = new Sim(seed, { classId });
  const samples: Sample[] = [];
  let turns = 0;
  while (sim.phase !== 'over' && turns < MAX_TURNS) {
    if (sim.phase === 'won') { if (!sim.continueEndless()) break; continue; }
    if (sim.phase === 'pick') {
      const offer = sim.offer!.ids;
      const save = sim.toSave();
      const values = offer.map((_, i) => {
        const fork = new Sim(save.seed, {}, structuredClone(save));
        fork.choose(i);
        return rollout(fork, HORIZON);
      });
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const owned = Object.keys(sim.upgrades).filter((k) => sim.upgrades[k] > 0);
      offer.forEach((card, i) => samples.push({ card, offer, classId, biome: sim.biome, owned, value: values[i], adv: values[i] - mean }));
      sim.choose(values.indexOf(Math.max(...values)));
      continue;
    }
    sim.fire(v4Angle(sim));
    finishTurn(sim);
    turns++;
  }
  console.log(`  ${classId} seed ${seed}: depth ${sim.level}, ${samples.length} card samples`);
  return samples;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const stage = (b: number) => (b <= 1 ? 'early' : b <= 3 ? 'mid' : 'late');
const name = (id: string) => UPGRADE_BY_ID.get(id)?.name ?? id;
const sgn = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;

it('card value report', async () => {
  let all: Sample[] = [];
  if (MERGE) {
    for (let k = 0; k < MERGE; k++) all.push(...(JSON.parse(readFileSync(new URL(`cards-${k}.json`, OUT), 'utf8')) as { samples: Sample[] }[]).flatMap((d) => d.samples));
  } else {
    const file = new URL(`cards-${SHARD}.json`, OUT);
    // Resume: keep runs this shard already finished (it saves after every run).
    const done: { seed: number; samples: Sample[] }[] = SHARDS > 1 && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
    for (let i = SHARD; i < SEEDS; i += SHARDS) {
      const seed = 90000 + i * 6007;
      if (done.some((d) => d.seed === seed)) continue;
      done.push({ seed, samples: play(seed, (process.env.CLASS as ClassId | undefined) ?? CLASSES[i % CLASSES.length].id) });
      if (SHARDS > 1) { if (!existsSync(OUT)) mkdirSync(OUT); writeFileSync(file, JSON.stringify(done)); }
      await new Promise((ok) => setTimeout(ok, 0));
    }
    all = done.flatMap((d) => d.samples);
    if (SHARDS > 1) {
      writeFileSync(new URL(`cards-${SHARD}.done`, OUT), '');
      return;
    }
  }

  // Per-card value, overall and by stage of the run.
  const cards = [...new Set(all.map((s) => s.card))];
  const rows = cards.map((id) => {
    const xs = all.filter((s) => s.card === id);
    const by = (st: string) => xs.filter((s) => stage(s.biome) === st).map((s) => s.adv);
    return { id, n: xs.length, adv: avg(xs.map((s) => s.adv)), early: by('early'), mid: by('mid'), late: by('late') };
  }).filter((r) => r.n >= 3).sort((a, b) => b.adv - a.adv);
  const cell = (xs: number[]) => (xs.length >= 3 ? sgn(avg(xs)) : '–');
  const lines = [
    '# Card values (forked tests)', '',
    `At every pick, the run was copied once per card offered and each copy played on ${HORIZON} turns with the same luck. **Value** = how many more rows that copy got than the average of its offer (alive copies also score for a safe board). Positive means the card beat the other options it was offered with. ${all.length} card samples from ${Math.round(all.reduce((a, s) => a + 1 / s.offer.length, 0))} picks. Generated by \`npm run balance -- cardvalue\`.`, '',
    '| Card | Rarity | Offered | Value | Early (biomes 1–2) | Mid (3–4) | Late (5+) |', '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${name(r.id)} | ${UPGRADE_BY_ID.get(r.id)?.rarity ?? ''} | ${r.n} | **${sgn(r.adv)}** | ${cell(r.early)} | ${cell(r.mid)} | ${cell(r.late)} |`),
  ];

  // By class: the five best cards for each.
  lines.push('', '## Best cards by class', '', '| Class | Top cards (value) |', '|---|---|');
  for (const c of CLASSES) {
    const xs = all.filter((s) => s.classId === c.id);
    const top = [...new Set(xs.map((s) => s.card))].map((id) => ({ id, v: xs.filter((s) => s.card === id).map((s) => s.adv) }))
      .filter((x) => x.v.length >= 3).sort((a, b) => avg(b.v) - avg(a.v)).slice(0, 5);
    if (top.length) lines.push(`| ${c.name} | ${top.map((x) => `${name(x.id)} (${sgn(avg(x.v))})`).join(', ')} |`);
  }

  // Combos: a card's value when you already own another, against its value overall.
  const pairs: { card: string; with: string; n: number; v: number; lift: number }[] = [];
  const overall = new Map(rows.map((r) => [r.id, r.adv]));
  for (const card of cards) for (const w of cards) {
    if (card === w) continue;
    const xs = all.filter((s) => s.card === card && s.owned.includes(w)).map((s) => s.adv);
    if (xs.length < 4 || !overall.has(card)) continue;
    pairs.push({ card, with: w, n: xs.length, v: avg(xs), lift: avg(xs) - overall.get(card)! });
  }
  pairs.sort((a, b) => b.lift - a.lift);
  lines.push('', '## Combos', '', 'How much more a card was worth when you already owned another card.', '',
    '| Take | Already owning | Times | Value then | Better than usual by |', '|---|---|---|---|---|');
  for (const p of pairs.slice(0, 20)) lines.push(`| ${name(p.card)} | ${name(p.with)} | ${p.n} | ${sgn(p.v)} | ${sgn(p.lift)} |`);
  lines.push('', '**Anti-combos** (worth less together):', '', '| Take | Already owning | Times | Worse than usual by |', '|---|---|---|---|');
  for (const p of pairs.slice(-8).reverse()) lines.push(`| ${name(p.card)} | ${name(p.with)} | ${p.n} | ${sgn(p.lift)} |`);
  lines.push('');
  writeFileSync(new URL('../docs/card-values.md', import.meta.url), lines.join('\n'));

  // The learned value table, for a picker that drafts from it.
  const table: Record<string, { all: number; early?: number; mid?: number; late?: number; n: number }> = {};
  for (const r of rows) table[r.id] = { all: +r.adv.toFixed(2), n: r.n, ...(r.early.length >= 3 ? { early: +avg(r.early).toFixed(2) } : {}), ...(r.mid.length >= 3 ? { mid: +avg(r.mid).toFixed(2) } : {}), ...(r.late.length >= 3 ? { late: +avg(r.late).toFixed(2) } : {}) };
  writeFileSync(new URL('./card-values.json', import.meta.url), JSON.stringify(table, null, 1));
  console.log(lines.join('\n'));
});
