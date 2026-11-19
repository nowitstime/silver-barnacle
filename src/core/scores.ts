import type { ClassId } from '../content/classes';
import { load, save } from './storage';

export interface Score {
  depth: number;
  classId: ClassId;
  biome: number;
  kills: number;
  bosses: number;
  /** ms since epoch */
  date: number;
}

const KEY = 'scores';
const MAX = 10;

export function loadScores(): Score[] {
  const list = load<Score[]>(KEY, []);
  return Array.isArray(list) ? list : [];
}

/** Add a score; returns its 0-based rank, or -1 if it didn't make the table. */
export function addScore(s: Score): number {
  const list = loadScores();
  list.push(s);
  list.sort((a, b) => b.depth - a.depth || b.kills - a.kills || a.date - b.date);
  const rank = list.indexOf(s);
  save(KEY, list.slice(0, MAX));
  return rank < MAX ? rank : -1;
}

export function bestDepth(): number {
  return loadScores()[0]?.depth ?? load<number>('best', 0);
}
