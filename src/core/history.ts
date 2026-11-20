import type { ClassId } from '../content/classes';
import type { BrickKind } from '../content/bricks';
import { load, save } from './storage';

/** One finished run, for the history list ("what killed me?"). */
export interface RunRecord {
  date: number;
  classId: ClassId;
  depth: number;
  biome: number;
  won: boolean;
  /** Abandoned from the pause menu. */
  abandoned?: boolean;
  kills: number;
  bosses: number;
  upgrades: Record<string, number>;
  /** Brick kinds that crossed the line (empty if the run didn't end that way). */
  cause: BrickKind[];
}

const KEY = 'history';
export const HISTORY_MAX = 20;

export function loadHistory(): RunRecord[] {
  const list = load<RunRecord[]>(KEY, []);
  return Array.isArray(list) ? list : [];
}

/** Newest first, capped at the last 20 runs. */
export function addRun(r: RunRecord): void {
  save(KEY, [r, ...loadHistory()].slice(0, HISTORY_MAX));
}
