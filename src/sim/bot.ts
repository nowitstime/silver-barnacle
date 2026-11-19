import { STEP, FLOOR, MIN_ANGLE, brickX, brickY, span } from './constants';
import { Sim } from './world';

/** Play a single turn to completion (until the next aim, pick or game over). */
export function finishTurn(sim: Sim, maxSeconds = 120): void {
  let guard = 0;
  const max = maxSeconds / STEP;
  while (!['aim', 'pick', 'over'].includes(sim.phase) && guard++ < max) sim.tick(STEP);
  if (guard >= max) sim.recall();
}

/** Score the board after a turn: lower and tougher is worse. */
function boardScore(sim: Sim): number {
  let danger = 0;
  for (const b of sim.bricks) if (b.kind !== 'steel') danger += b.hp * (1 + (b.r + b.h) ** 2 * 0.15);
  return -danger + sim.ballCount * 20 + sim.pendingBalls * 20 - (sim.phase === 'over' ? 1e9 : 0);
}

/**
 * Pick the best of `n` evenly spread angles by simulating each on a copy of the game.
 * Only valid in the aim phase.
 */
export function bestAngle(sim: Sim, n = 12): number {
  const save = sim.toSave();
  let best = Math.PI / 2, bestScore = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = MIN_ANGLE + ((Math.PI - 2 * MIN_ANGLE) * (i + 0.5)) / n;
    const copy = new Sim(save.seed, {}, structuredClone(save));
    copy.fire(a);
    finishTurn(copy, 30);
    const score = boardScore(copy);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

/** Cheap aim for the title-screen demo: at a random brick, with a little wobble. */
export function demoAngle(sim: Sim, rnd: () => number): number {
  const targets = sim.bricks.filter((b) => b.kind !== 'steel');
  if (!targets.length) return MIN_ANGLE + rnd() * (Math.PI - 2 * MIN_ANGLE);
  const t = targets[Math.floor(rnd() * targets.length)];
  const tx = brickX(t.c) + span(t.w) / 2, ty = brickY(t.r) + span(t.h) / 2;
  const a = Math.atan2(FLOOR - ty, tx - sim.launchX) + (rnd() - 0.5) * 0.3;
  return Math.max(MIN_ANGLE, Math.min(Math.PI - MIN_ANGLE, a));
}
