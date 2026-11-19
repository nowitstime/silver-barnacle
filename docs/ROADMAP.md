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
- ⬜ Title screen with animated background
- ⬜ Class select (Striker, Juggler, Ricochet) with signature perks
- ⬜ HUD polish, pause menu with current build
- ⬜ Run summary and local high scores
- ⬜ Settings (volume, haptics, shake, damage numbers, reset data)
- ⬜ App icon and splash in the chosen art style; "update available" toast

## M5: Bricks, hazards and biome gimmicks *(depth and variety)*
- ⬜ Helpful bricks: Bomb, Line Laser, Armored, Splitter, Steel, Portals
- ⬜ Hazards: Popper, Anchor, Balloon, Sponge, Shrinker, Spawner, Sprinter
- ⬜ All 5 biomes with their gimmicks (Darkness, Current, Ice, Heat)
- ⬜ Biome lengths follow the curve (12 / 16 / 20 / 24 / 28 rows)
- ⬜ Mini-boss at the end of each biome (5 bosses)
- ⬜ Hazard visuals don't rely on color alone

## M6: The upgrade expansion *(the replayability engine)*
- ⬜ 35+ upgrades across all 4 rarities, including legendaries
- ⬜ Stacking upgrades, depth-weighted rarity odds
- ⬜ Mid-biome common pick (or loot bricks, whichever we choose)
- ⬜ Classes 4 and 5 (Bomber, Gambler)
- ⬜ Maybe: cursed upgrades, named synergy combos
- ⬜ **Headless balance bot**: simulate many runs, chart where they die

## M7: Final boss, win and endless
- ⬜ Multi-phase final boss in The Core
- ⬜ Win screen and credits
- ⬜ Endless mode: biomes repeat with stacking modifiers, separate high score

## M8: Meta progression
- ⬜ Unlock system (upgrades, classes, endless, cosmetics)
- ⬜ Collection screen and lifetime stats
- ⬜ Achievements, ball skins and trails

## M9: Polish
- ⬜ Juice pass #2 (boss slow-mo, biome-clear spectacle, danger heartbeat)
- ⬜ Balance tuning from bot and play data
- ⬜ Performance check on a cheap Android phone (particle limits)
- ⬜ Tutorial hints in the first biome
- ⬜ Name the game, final icon

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
| Loot bricks as an extra pick source? (mid-biome picks are in) | M6 |
| Should brick HP also scale with ball count? | M6 |
| Final boss phases | M7 |
| Cursed upgrades: yes or no? | M6 |
| Game name | M9 |
