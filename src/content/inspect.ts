import { BRICKS, type ItemKind } from './bricks';
import { CORE_PHASES, bossFor } from './bosses';
import { LOOT_INFO } from './upgrades';
import { CELL, COLS, ROWS, TOP } from '../sim/constants';
import type { Sim } from '../sim/world';

export interface InspectCard {
  title: string;
  lines: string[];
  /** Highlighted warning line (e.g. about to cross the line). */
  warn?: string;
}

export const ITEM_INFO: Record<ItemKind, { name: string; desc: string }> = {
  orb: { name: 'Orb', desc: '+1 ball for your next volley.' },
  laserH: { name: 'Line laser', desc: 'Every ball that passes through blasts its whole row. Gone at the end of the turn.' },
  laserV: { name: 'Line laser', desc: 'Every ball that passes through blasts its whole column. Gone at the end of the turn.' },
  portal: { name: 'Portal', desc: 'A ball that enters one comes out of the other, keeping its speed.' },
  spikes: { name: 'Spikes', desc: 'Left by a Popper: pops any ball passing through for the rest of the turn.' },
};

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : String(Math.max(0, Math.round(n))));

/** Info card for whatever is at world point (x, y), or null for empty space. */
export function inspectAt(sim: Sim, x: number, y: number): InspectCard | null {
  const c = Math.floor(x / CELL), r = Math.floor((y - TOP) / CELL);
  if (c < 0 || c >= COLS || r < 0 || r > ROWS) return null;
  const brick = sim.bricks.find((b) => c >= b.c && c < b.c + b.w && r >= b.r && r < b.r + b.h);
  if (brick) {
    const threat = sim.threats.includes(brick) ? 'Ends your run if it’s still here when the board moves.' : undefined;
    if (brick.kind === 'boss' && brick.boss) {
      const def = bossFor(sim.biome);
      const lines = [def.tell + '.', `HP ${fmt(brick.hp)} / ${fmt(brick.maxHp)}`];
      if (brick.boss.id === 'core' && CORE_PHASES[brick.boss.phase]) lines.push(`Phase ${brick.boss.phase}: ${CORE_PHASES[brick.boss.phase]}.`);
      return { title: def.name, lines, warn: threat };
    }
    if (brick.kind === 'loot') {
      const info = LOOT_INFO[brick.loot ?? 'wild'];
      return { title: `${info.name} loot`, lines: [`Break it for a free upgrade: ${info.hint.toLowerCase()}.`, `HP ${fmt(brick.hp)} / ${fmt(brick.maxHp)}`] };
    }
    const info = brick.kind === 'normal' || brick.kind === 'boss' ? { name: 'Brick', desc: 'Just HP. Darker bricks have more.' } : BRICKS[brick.kind];
    const lines = [info.desc];
    if (brick.kind !== 'steel') lines.push(`HP ${fmt(brick.hp)} / ${fmt(brick.maxHp)}`);
    if (brick.burn > 0) lines.push(`Burning: ${fmt(brick.burn)} damage at the end of the turn.`);
    if (brick.frozen) lines.push('Frozen: the next hit only cracks the ice.');
    if (brick.kind !== 'shielder' && sim.shielded(brick)) lines.push('Shielded by a Shielder: takes a quarter of ball damage.');
    if (brick.timer && (brick.kind === 'fuse' || brick.kind === 'thief')) lines.push(`${brick.timer} turn${brick.timer > 1 ? 's' : ''} left on its countdown.`);
    if (brick.bloom) lines.push('In bloom: drops a ball orb when broken.');
    return { title: info.name, lines, warn: threat };
  }
  const item = sim.items.find((i) => i.c === c && i.r === r);
  if (item) return { title: ITEM_INFO[item.kind].name, lines: [ITEM_INFO[item.kind].desc] };
  return null;
}
