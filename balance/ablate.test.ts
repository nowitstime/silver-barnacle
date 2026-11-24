/**
 * Bot ablation: play the same seeds with one bot variant and save the depths, to compare variants.
 * BOT=v2 | v3 | v4, V4=corridor,pockets,top,triage,safe (or "none"), CLASS, RUNS, MAX_TURNS, SHARDS/SHARD, TAG.
 * Results go to balance/.out/ablate-<TAG>-<SHARD>.json. Summarise with `node balance/ablate-summary.mjs`.
 */
import { it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { CLASSES, type ClassId } from '../src/content/classes';
import { mulberry32 } from '../src/core/rng';
import { finishTurn, smartAngle, strategistAngle, v4Angle, V4_BEST, type V4Feature } from '../src/sim/bot';
import { Sim } from '../src/sim/world';

const RUNS = Number(process.env.RUNS ?? 24), MAX_TURNS = Number(process.env.MAX_TURNS ?? 200);
const SHARDS = Number(process.env.SHARDS ?? 1), SHARD = Number(process.env.SHARD ?? 0);
const BOT = process.env.BOT ?? 'v4', TAG = process.env.TAG ?? BOT;
const FEATURES: V4Feature[] = process.env.V4 === 'none' ? [] : process.env.V4 ? (process.env.V4.split(',') as V4Feature[]) : V4_BEST;

it('ablate', async () => {
  const out: { seed: number; classId: string; depth: number; capped: boolean }[] = [];
  for (let i = SHARD; i < RUNS; i += SHARDS) {
    const seed = 70000 + i * 7919, classId = (process.env.CLASS as ClassId | undefined) ?? CLASSES[i % CLASSES.length].id;
    const sim = new Sim(seed, { classId });
    const rnd = mulberry32(seed ^ 0xe9d);
    let turns = 0;
    while (sim.phase !== 'over' && turns < MAX_TURNS) {
      if (sim.phase === 'won') { if (!sim.continueEndless()) break; continue; }
      if (sim.phase === 'pick') { sim.choose(Math.floor(rnd() * sim.offer!.ids.length)); continue; }
      sim.fire(BOT === 'v2' ? smartAngle(sim) : BOT === 'v3' ? strategistAngle(sim) : v4Angle(sim, FEATURES));
      finishTurn(sim);
      turns++;
    }
    out.push({ seed, classId, depth: sim.level, capped: sim.phase !== 'over' });
    console.log(`${TAG} run ${i + 1}: depth ${sim.level}`);
    await new Promise((ok) => setTimeout(ok, 0));
  }
  const dir = new URL('./.out/', import.meta.url);
  if (!existsSync(dir)) mkdirSync(dir);
  writeFileSync(new URL(`ablate-${TAG}-${SHARD}.json`, dir), JSON.stringify(out));
});
