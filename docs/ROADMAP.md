# Roadmap

Each milestone ends with something **playable on my phone**. Details are in [DESIGN.md](./DESIGN.md).

Legend: ⬜ todo · 🟨 in progress · ✅ done

---

## M0: Skeleton and pipeline *(get it on the phone on day one)*
- ✅ Vite, TypeScript (strict), Vitest. ESLint/Prettier skipped for now
- ✅ Canvas that scales a 9:16 world to any screen, sharp on high-DPI phones
- ✅ `vite-plugin-pwa`: manifest, icons (placeholder), offline precache
- ✅ GitHub Action deploying to Pages
- 🟨 **Done when:** I can open the URL on my phone, tap "Add to Home Screen", and it launches full screen and works offline

## M1: The core toy *(is bouncing balls fun?)*
- ✅ Fixed-timestep loop and seeded RNG
- ✅ Aim by dragging, with a laser to the first bounce
- ✅ Fire a stream of balls; bounce off walls, ceiling and bricks; collect them at the floor
- ✅ Bricks with HP numbers; they drop a row each turn; a new row spawns
- ✅ +Ball pickups
- ✅ Game over when a brick crosses the line; tap to restart
- ✅ Fast-forward and recall buttons; nudge for horizontal loops
- ✅ Debug panel (show hitboxes, set the seed, speed)
- ✅ Unit tests: collision, RNG
- 🟨 **Done when:** an endless Ballz-like I'd actually play for 5 minutes

## Controls (revised after first phone test)
- ✅ Point to aim: touch or drag anywhere, and the laser points from the launcher to your finger (touches below the launcher are mirrored upward)
- ✅ Aim stays when you lift your finger, and carries over to the next turn; a **Fire** button confirms
- ✅ Desktop: arrow keys nudge the aim (Shift for bigger steps), Space or Enter fires

## Controls (revision 2)
- ✅ Drag left/right anywhere to turn the aim like a dial (slow = precise, fast = quick); tap to jump the aim to a spot
- ✅ The laser eases toward the new angle, which gives aiming some weight

## M2: Juice pass #1 and sound *(make it feel amazing early, so every later feature feels good too)*
- ✅ Squash and stretch, hit flash, brick fragments, shockwave rings, screen shake, hit-stop
- ✅ Damage numbers, combo counter (with a bigger sound and freeze every 5 kills)
- ✅ Ball trails, launcher recoil, landing puffs, halftone danger warning with heartbeat
- ✅ Procedural WebAudio sound effects with rising pitch (own tiny synth instead of ZzFX), mute toggle
- ✅ Haptics (Android)
- ✅ **Art direction test**: picked **Risograph** from the [Art Style Lab](https://claude.ai/artifact/9mYfSuqwu9A1sXcB81RYBs)

## M3: The roguelike run *(first real "run")*
- ✅ Depth counter, biome name and progress bar (with a tick at the halfway pick)
- ✅ All 5 biomes (each a new ink pair; gameplay gimmicks come in M5) with title cards
- ✅ HP and density scaling (HP grows ~12% per biome); hand-made row patterns (wall with a gap, pillars, edges, center block)
- ✅ Upgrade system: pick-1-of-3 screen, 14 upgrades across all 4 rarities, depth-weighted odds. Small pick halfway through each biome, big pick (no commons) at the end
- ✅ Crits
- ✅ Autosave between turns; the run resumes automatically when the app reopens (a Continue button comes with the title screen in M4)
- ✅ Tests: upgrade math, offers, pick timing, shields, save round-trip determinism
- 🟨 **Done when:** a 3-biome run with meaningful build choices

## M4: Menus and shell *(make it feel like a real game)*
- ✅ Title screen with a self-playing demo behind it, Continue / New run / Settings, top 5 runs
- ✅ Class select with signature perks (all 5 classes, see M6)
- ✅ Pause menu (also on leaving the app) with your current build and an Abandon option
- ✅ Run summary: depth, biome reached, bricks, damage, best combo, bosses, upgrades taken, rank; top-10 local scores
- ✅ Settings: sound, vibration, screen shake, damage numbers, reset all data (with a confirm tap)
- ✅ First-run aiming hint; "update available" toast
- ⬜ Final app icon and splash (waits for a name, M9)

## M5: Bricks, hazards and biome gimmicks *(depth and variety)*
- ✅ Helpful bricks: Bomb, Armored, Splitter, Steel; items: Line Lasers (row or column) and Portal pairs
- ✅ Hazards: Popper, Anchor, Balloon, Sponge, Shrinker, Spawner, Sprinter
- ✅ Bricks are introduced gradually by depth (armored and bombs from depth 4 … spawners and sprinters from 40)
- ✅ Biome gimmicks: Caverns darkness, The Deep's flipping current (the laser accounts for it), Frostline ice (balls speed up, frozen bricks), Forge heat (untouched bricks regrow, more bombs)
- ✅ Biome lengths follow the curve (12 / 16 / 20 / 24 / 28 rows)
- ✅ A 2×2 mini-boss at the end of each biome: Brood Mother, Lantern, Leviathan, Glacier, Anvil. Beating it gives the big pick
- ✅ Hazards share a jagged sawtooth outline and every special brick has its own symbol, so nothing relies on color alone

## M6: The upgrade expansion *(the replayability engine)*
- ✅ 38 upgrades across all rarities, plus 3 cursed (Gambler only)
- ✅ Stacking upgrades, depth-weighted rarity odds
- ✅ Mid-biome pick (from M3)
- ✅ Classes 4 and 5: Bomber (Payload) and Gambler (Wildcard: 4 cards, one cursed)
- ✅ Cursed upgrades (Gambler only). Synergies come from upgrades combining, no named combos yet
- ✅ **Headless balance bot** (`npm run balance`): plays full runs, writes [balance.md](./balance.md)
- ✅ First tuning pass: brick HP now grows faster than depth and +20% per biome; boss HP follows the same curve

## M7: Final boss, win and endless
- ✅ The Core (biome 6): a 3×3, three-phase final boss: rotating two-sided shell → swarm (spawns bricks every turn) → meltdown (takes +50% damage, finally descends)
- ✅ Win screen with stats and credits, slow-mo finish; bank the win or keep going
- ✅ Endless: the five biomes repeat as laps (Caverns II…), each lap with tougher bricks and more hazards; scores mark wins with ★ and the title shows your endless best

## M8: Meta progression
- ✅ Lifetime stats and 17 achievements; many unlock content (Bomber and Gambler, 7 upgrades, 5 ball skins). "Unlock everything" setting is on by default while testing
- ✅ Collection screen: awards, upgrades, bricks and bosses met, skins, stats
- ✅ Ball skins: Ink, Hollow, Star, Block, Comet, Spark

## M9: Polish
- ✅ Juice pass #2: boss-kill slow-mo and confetti, phase banners for the final boss, an ink-wipe transition between biomes (danger heartbeat was already in)
- ✅ First-time tips: every new brick and hazard explains itself once, plus tips for orbs, picks, danger, lasers, portals and bosses
- ✅ Balance: orbs thin out after depth 20 and brick HP climbs faster, which ends the runaway late game; wall-spam check added to the bot report
- ✅ Performance: adaptive resolution, batched drawing, no per-frame multiply blending, hit-stop budget (see the lag fixes)
- ⬜ Name the game, final icon (waiting on a name)

## Later / ideas parking lot
- Daily seeded run
- Generated music per biome
- Triangle and big 2×2 bricks
- Shareable run summary image
- Custom seeds
- Leaderboard (would need a backend; probably never)

---

## Still open (decide before or during the milestone listed)
| Question | Needed by |
|---|---|
| Loot bricks as an extra pick source? (mid-biome picks are in) | M9 |
| Should brick HP also scale with ball count? (not needed so far, per the bot) | M9 |
| Game name | M9 |
