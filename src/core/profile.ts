import { ACHIEVEMENTS, LOCKED_CLASSES, LOCKED_UPGRADES, SKINS, type LifetimeStats, type RunFacts } from '../content/achievements';
import type { ClassId } from '../content/classes';
import { load, save } from './storage';

/** Everything that persists between runs (besides settings and scores). */
export interface Profile {
  v: 1;
  stats: LifetimeStats;
  achievements: string[];
  /** Brick kinds and bosses you've met. */
  seenBricks: string[];
  /** Upgrades you've taken at least once. */
  seenUpgrades: string[];
  skin: string;
  tipsSeen: string[];
}

const KEY = 'profile';

const fresh = (): Profile => ({
  v: 1,
  stats: { runs: 0, wins: 0, kills: 0, damage: 0, bosses: 0, deepest: 0, bestCombo: 0, maxBalls: 0, crits: 0, pops: 0, time: 0, classWins: [] },
  achievements: [],
  seenBricks: [],
  seenUpgrades: [],
  skin: 'ink',
  tipsSeen: [],
});

export class ProfileStore {
  p: Profile;
  /** Testing switch: treat everything as unlocked. */
  unlockAll = true;

  constructor() {
    const saved = load<Profile | null>(KEY, null);
    const base = fresh();
    this.p = saved && saved.v === 1 ? { ...base, ...saved, stats: { ...base.stats, ...saved.stats } } : base;
  }

  save(): void {
    save(KEY, this.p);
  }

  reset(): void {
    this.p = fresh();
    this.save();
  }

  has(id: string): boolean {
    return this.p.achievements.includes(id);
  }

  classUnlocked(id: ClassId): boolean {
    if (this.unlockAll || !LOCKED_CLASSES.includes(id)) return true;
    return ACHIEVEMENTS.some((a) => a.reward?.kind === 'class' && a.reward.id === id && this.has(a.id));
  }

  upgradeUnlocked(id: string): boolean {
    if (this.unlockAll || !LOCKED_UPGRADES.includes(id)) return true;
    return ACHIEVEMENTS.some((a) => a.reward?.kind === 'upgrade' && a.reward.id === id && this.has(a.id));
  }

  /** Skins are always earned: the testing switch doesn't cover them. */
  skinUnlocked(id: string): boolean {
    if (id === 'ink') return true;
    return ACHIEVEMENTS.some((a) => a.reward?.kind === 'skin' && a.reward.id === id && this.has(a.id));
  }

  /** Upgrade ids the next run may not offer. */
  lockedUpgrades(): string[] {
    return LOCKED_UPGRADES.filter((id) => !this.upgradeUnlocked(id));
  }

  get skin(): string {
    return this.skinUnlocked(this.p.skin) && SKINS.some((s) => s.id === this.p.skin) ? this.p.skin : 'ink';
  }

  seeBrick(kind: string): boolean {
    if (this.p.seenBricks.includes(kind)) return false;
    this.p.seenBricks.push(kind);
    return true;
  }

  seeUpgrade(id: string): void {
    if (!this.p.seenUpgrades.includes(id)) this.p.seenUpgrades.push(id);
  }

  tip(id: string): boolean {
    if (this.p.tipsSeen.includes(id)) return false;
    this.p.tipsSeen.push(id);
    this.save();
    return true;
  }

  /** Check every achievement; returns the ones earned just now. */
  check(run: RunFacts | null): string[] {
    const earned: string[] = [];
    for (const a of ACHIEVEMENTS) {
      if (this.has(a.id)) continue;
      if (a.check(this.p.stats, run)) {
        this.p.achievements.push(a.id);
        earned.push(a.id);
      }
    }
    if (earned.length) this.save();
    return earned;
  }
}
