import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, LOCKED_UPGRADES, SKINS } from '../src/content/achievements';
import { UPGRADE_BY_ID, previewUpgrade, rerollSameTiers, rollOffer } from '../src/content/upgrades';
import { CLASS_BY_ID } from '../src/content/classes';
import { mulberry32 } from '../src/core/rng';
import { ProfileStore } from '../src/core/profile';

describe('achievements and unlocks', () => {
  it('every reward points at real content', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      if (!a.reward) continue;
      if (a.reward.kind === 'class') expect(CLASS_BY_ID.has(a.reward.id)).toBe(true);
      if (a.reward.kind === 'upgrade') expect(UPGRADE_BY_ID.has(a.reward.id)).toBe(true);
      if (a.reward.kind === 'skin') expect(SKINS.some((s) => s.id === a.reward!.id)).toBe(true);
    }
  });

  it('locked content opens when its achievement is earned', () => {
    const p = new ProfileStore();
    p.reset();
    p.unlockAll = false;
    expect(p.classUnlocked('striker')).toBe(true);
    expect(p.classUnlocked('bomber')).toBe(false);
    expect(p.lockedUpgrades()).toEqual(LOCKED_UPGRADES);
    p.p.stats.bosses = 1;
    expect(p.check(null)).toContain('boss1');
    expect(p.classUnlocked('bomber')).toBe(true);
    expect(p.check(null)).toEqual([]); // not earned twice
    p.unlockAll = true;
    expect(p.lockedUpgrades()).toEqual([]);
    expect(p.skinUnlocked('comet')).toBe(false); // skins are always earned
    expect(p.skinUnlocked('ink')).toBe(true);
  });

  it('run-based achievements read the run facts', () => {
    const p = new ProfileStore();
    p.reset();
    const facts = { classId: 'striker' as const, depth: 30, bossesBeaten: ['Lantern'], won: false, bestCombo: 3, maxBalls: 10, upgrades: {} };
    expect(p.check(facts)).toContain('lantern');
  });

  it('locked upgrades are never offered', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 300; i++) {
      const offer = rollOffer(rng, {}, 4, 'biome', true, LOCKED_UPGRADES);
      for (const id of LOCKED_UPGRADES) expect(offer).not.toContain(id);
    }
  });
});

describe('reroll keeps rarities', () => {
  it('each card rerolls into a different card of the same rarity', () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 200; i++) {
      const offer = rollOffer(rng, {}, 3, 'biome', i % 2 === 0);
      const next = rerollSameTiers(rng, {}, offer);
      expect(next).toHaveLength(offer.length);
      next.forEach((id, k) => {
        expect(UPGRADE_BY_ID.get(id)!.rarity).toBe(UPGRADE_BY_ID.get(offer[k])!.rarity);
        expect(offer).not.toContain(id);
      });
      expect(new Set(next).size).toBe(next.length);
    }
  });

  it('falls back to a lower rarity when a tier is exhausted', () => {
    const rng = mulberry32(10);
    // Own every legendary except the one on offer, so no other legendary is available.
    const owned = { glass: 1, wind: 1, singularity: 2 };
    const next = rerollSameTiers(rng, owned, ['lava']);
    expect(next[0]).not.toBe('lava');
    expect(UPGRADE_BY_ID.get(next[0])!.rarity).toBe('epic');
  });
});

describe('card previews', () => {
  it('show real before → after numbers', () => {
    const run = { balls: 12, shields: 1 };
    expect(previewUpgrade('sharp', {}, undefined, run)).toEqual(['Crit chance 5% → 13%']);
    expect(previewUpgrade('heavy', { heavy: 2 }, undefined, run)).toEqual(['Damage 3 → 4']);
    expect(previewUpgrade('extra', {}, undefined, run)).toEqual(['Balls 12 → 17']);
    expect(previewUpgrade('glass', {}, undefined, run)).toContain('Shields 1 → 0');
    // Class perks are included: Striker starts at 15% crit.
    expect(previewUpgrade('sharp', {}, CLASS_BY_ID.get('striker')!.apply, run)).toEqual(['Crit chance 15% → 23%']);
  });
});
