// Summarise bot ablation results: node balance/ablate-summary.mjs [baselineTag]
import { readdirSync, readFileSync } from 'node:fs';
const dir = new URL('./.out/', import.meta.url);
const by = {};
for (const f of readdirSync(dir).filter((f) => f.startsWith('ablate-'))) {
  const tag = f.replace(/^ablate-/, '').replace(/-\d+\.json$/, '');
  (by[tag] ??= []).push(...JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
}
const base = process.argv[2] ?? 'v2';
const baseBy = new Map((by[base] ?? []).map((r) => [r.seed, r.depth]));
const rows = Object.entries(by).map(([tag, rs]) => {
  const d = rs.map((r) => r.depth).sort((a, b) => a - b);
  const vs = rs.filter((r) => baseBy.has(r.seed));
  const wins = vs.filter((r) => r.depth > baseBy.get(r.seed)).length, losses = vs.filter((r) => r.depth < baseBy.get(r.seed)).length;
  return { tag, n: rs.length, mean: d.reduce((a, b) => a + b, 0) / d.length, median: d[Math.floor(d.length / 2)], alive: rs.filter((r) => r.capped).length, wins, losses };
}).sort((a, b) => b.mean - a.mean);
console.log(`| Bot | Runs | Mean depth | Median | Alive at limit | vs ${base} (better / worse seeds) |`);
console.log('|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.tag} | ${r.n} | ${r.mean.toFixed(0)} | ${r.median} | ${r.alive} | ${r.tag === base ? '–' : `${r.wins} / ${r.losses}`} |`);
