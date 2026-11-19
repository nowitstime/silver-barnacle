# Roadmap

Each milestone ends with something **playable on my phone**. Details are in [DESIGN.md](./DESIGN.md).

Legend: ⬜ todo · 🟨 in progress · ✅ done

---

## M0: Skeleton and pipeline *(get it on the phone on day one)*
- ⬜ Vite, TypeScript, ESLint/Prettier, Vitest
- ⬜ Canvas that scales a 9:16 world to any screen, sharp on high-DPI phones
- ⬜ `vite-plugin-pwa`: manifest, icons (placeholder), offline precache
- ⬜ GitHub Action deploying to Pages
- ⬜ **Done when:** I can open the URL on my phone, tap "Add to Home Screen", and it launches full screen and works offline

## M1: The core toy *(is bouncing balls fun?)*
- ⬜ Fixed-timestep loop and seeded RNG
- ⬜ Aim by dragging, with a laser to the first bounce
- ⬜ Fire a stream of balls; bounce off walls, ceiling and bricks; collect them at the floor
- ⬜ Bricks with HP numbers; they drop a row each turn; a new row spawns
- ⬜ +Ball pickups
- ⬜ Game over when a brick crosses the line; tap to restart
- ⬜ Fast-forward and recall buttons; nudge for horizontal loops
- ⬜ Debug panel (show hitboxes, set the seed, speed)
- ⬜ Unit tests: collision, RNG
- ⬜ **Done when:** an endless Ballz-like I'd actually play for 5 minutes

## M2: Juice pass #1 and sound *(make it feel amazing early, so every later feature feels good too)*
- ⬜ Squash and stretch, hit flash, brick fragments, screen shake, hit-stop
- ⬜ Damage numbers, combo counter
- ⬜ Ball trails
- ⬜ ZzFX sound effects with rising combo pitch
- ⬜ Haptics (Android)
- ⬜ **Art direction test**: mock up 2 styles from DESIGN §9 and pick one

## M3: The roguelike run *(first real "run")*
- ⬜ Depth counter, biome progress bar
- ⬜ 3 biomes (looks only for now) with transitions and title cards
- ⬜ HP and density scaling; hand-made row patterns
- ⬜ Upgrade system: event hooks, pick-1-of-3 screen, ~12 upgrades (the ✅ ones), rarity
- ⬜ Crits
- ⬜ Autosave each turn, and "Continue" after closing the app
- ⬜ Tests: upgrade math, save round-trip
- ⬜ **Done when:** a 3-biome run with meaningful build choices

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
| Next launch from where the first ball landed, or always center? | M1 |
| Art style (A–E in DESIGN §9) | M2 |
| Mid-biome common pick vs. loot bricks vs. both | M3 / M6 |
| Final boss phases | M7 |
| Cursed upgrades: yes or no? | M6 |
| Game name | M9 |
