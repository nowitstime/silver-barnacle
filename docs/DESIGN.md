# Game Design Doc (working title: TBD)

A turn-based, aim-and-shoot brick breaker roguelike for phones held in portrait.
Each turn you fire a volley of balls, the bricks drop one row, and as you sink deeper you pass through biomes.
Each biome changes how the game plays and ends with a mini-boss and an upgrade pick.
Clear the final boss to win, then keep going in optional endless mode.

Status: **draft**. Anything marked ❓ is still open.

---

## 1. Decisions so far

| Area | Decision |
|---|---|
| Platform | Phone in portrait first. Desktop letterboxed. Mouse works for free; keyboard is a nice-to-have |
| Stack | HTML5 Canvas 2D, TypeScript, Vite, `vite-plugin-pwa`, Vitest, GitHub Pages |
| UI framework | None. Menus are DOM overlays, the game is drawn on the canvas |
| Style of play | Aim and shoot, turn-based (ball-blast style) |
| Lose condition | A brick reaches the bottom line |
| Run length | 15–30 min |
| Structure | 5 biomes that get longer as you go, a mini-boss at the end of each, then the final boss, then optional endless |
| Upgrades | Pick 1 of 3 cards, with rarity tiers. Shared pool. Synergies come out of how upgrades combine |
| Active abilities | None. All passive (the aim laser can be upgraded) |
| Classes | All unlocked while testing. Different starting stats plus one unique signature perk |
| Meta progression | Unlocks only (no permanent stat boosts) |
| Saving | Autosave every turn and resume after closing. High scores, unlocks and settings stored in localStorage |
| Art style | **Risograph**: paper stock plus two inks per biome, multiply blending, halftone, grain |
| Aiming | Slingshot: press anywhere, pull back, release |
| Juice | An absurd amount |
| Audio | Generated sound effects (ZzFX / WebAudio) |
| Haptics | Light vibration (Android only, because iOS Safari has no Vibration API) |
| Audience | Mostly for me, but the menus should be nice |

---

## 2. Core turn loop

1. **Aim.** Drag anywhere on screen. A dotted laser shows the path up to the **first bounce** (upgrades extend it).
2. **Launch.** Release to fire. Balls leave in a stream from the launcher, a few frames apart.
3. **Bounce.** Balls bounce off walls, the ceiling and bricks, doing damage on every hit. Balls pass through each other.
4. **Return.** A ball that reaches the floor is collected.
   - ✅ **The next volley launches from where the first ball landed** (Ballz style).
5. **Descend.** Once every ball is back, all bricks move down one row and a new row appears at the top.
6. **Check.** If any brick crossed the danger line, the run is over (unless a shield or extra life saves you).

**Quality-of-life:**
- A **fast-forward** button appears after ~3s of a turn (2× speed, then 4×).
- A **recall** button after ~10s brings all balls home, so a ball stuck in a horizontal loop can't ruin the run.
- Balls that bounce almost perfectly horizontally get a tiny nudge so they can't loop forever.

---

## 3. Run structure and pacing

Target: about 10 seconds per turn, about 110 turns, so roughly 20 minutes.

| # | Biome (placeholder) | Rows | Gimmick (draft) | Ends with |
|---|---|---|---|---|
| 1 | **Meadow** | 12 | None (teaches the basics) | Mini-boss → pick |
| 2 | **Caverns** | 16 | Darkness: bricks only show near balls and the laser | Mini-boss → pick |
| 3 | **The Deep** | 20 | Current: a slow sideways drift on balls that flips each turn | Mini-boss → pick |
| 4 | **Frostline** | 24 | Ice: balls speed up on every wall bounce. Frozen bricks shrug off the first hit | Mini-boss → pick |
| 5 | **Forge** | 28 | Heat: bricks regain HP if they aren't hit for a turn. Some bricks are molten and burst when broken | Mini-boss → pick |
| ★ | **The Core** | — | Final boss arena | Win → endless? |
| ∞ | **Endless** | ∞ | The biomes repeat with modifiers stacking up | High score |

- **Biome transition:** the background color and pattern slide in, the music key changes, and a title card appears ("DEPTH 2 · CAVERNS").
- ❓ **Upgrade frequency:** decided that there will be **more than 5 picks per run**. How to add them is still open:
  - (a) A small **common pick halfway through each biome**, plus the big pick (rare or better guaranteed) after each mini-boss.
  - (b) **Loot bricks** that give a pick when you break them.
  - (c) Both. *Leaning (a), maybe adding (b) later.*

### Difficulty scaling
- ✅ Brick HP scales with **depth**.
- ❓ Maybe also scale with **how many balls you have**. Decide during balancing (M6), since it can make +ball upgrades feel pointless.
- Row density and the mix of special bricks rise within each biome and reset a little when a new one starts, giving a breather.
- Hand-made **row patterns** (walls, funnels, checkerboards, columns) mixed with random rows, so the layouts stay interesting.

---

## 4. Bricks

### Shapes
Squares first. Later: triangles (deflect at an angle), half-height bricks, and big 2×2 bricks.

### Helpful / neutral
| Brick | Effect |
|---|---|
| **+Ball orb** | Not a brick, a pickup. Touch it to gain +1 ball permanently |
| **Coin / loot** | Drops currency, or a pick (if we go with option (b)) |
| **Bomb** | When it breaks, it damages everything around it |
| **Line laser** | When hit, it blasts its whole row or column |
| **Armored** | Takes 1 damage per hit whatever your damage is. Crits do full damage |
| **Splitter** | Breaks into 2 smaller bricks |
| **Portal pair** | A ball that enters one comes out the other |
| **Steel** | Can't be broken. Blocks paths, scrolls away eventually |

### Hazards (the bad ones)
| Brick | Effect on the ball |
|---|---|
| **Popper** | Breaks in 1 hit, but **destroys the ball that hit it for this turn** |
| **Anchor** | The ball that hits it **gets heavy**: gravity pulls it to the floor faster |
| **Balloon** | The ball **goes floaty**: it drifts up and slows down, wasting time |
| **Sponge** | Absorbs the ball, holds it, and spits it out a few seconds later in a random direction |
| **Shrinker** | The ball shrinks and deals half damage for the rest of the turn |
| **Mirror** | Reflects the ball back the way it came |
| **Leech** | Each hit it takes heals the bricks next to it |
| **Spawner** | Adds a new brick next to itself every turn |
| **Sprinter** | Moves down 2 rows per turn instead of 1 |

---

## 5. Bosses

### Mini-bosses (one per biome)
A big multi-HP brick (2×2 or 3×3) with one gimmick. Rows stop spawning during the fight, but the boss still moves down.
- **Brood Mother** (Meadow): spawns small bricks around itself each turn.
- **Lantern** (Caverns): only takes damage from balls that already bounced off a wall.
- **Leviathan** (The Deep): moves sideways every turn.
- **Glacier** (Frostline): has a rotating shield on one side.
- **Anvil** (Forge): fully heals unless you deal X damage in one turn.

### Final boss: **The Core**
Several phases (for example a rotating shield, then minion waves, then a moving and shrinking core). ❓ Design it later, in M7.

---

## 6. Upgrades

### Rarity
| Tier | Color (draft) | Notes |
|---|---|---|
| Common | gray | Stat bumps |
| Rare | blue | New behaviors |
| Epic | purple | Behaviors that change how you play |
| Legendary | gold | Run-defining, rule-bending |

The odds of higher tiers improve with depth. Mini-boss picks guarantee rare or better.
Some upgrades **stack** (take them again for a bigger effect); others are unique.

### Hook system (where synergies come from)
Every upgrade attaches to one or more **events**:
`onLaunch`, `onBounceWall`, `onHitBrick`, `onCrit`, `onKill`, `onBallReturn`, `onTurnEnd`, `onRowSpawn`.
Synergies happen on their own. For example, "crits split the ball" combined with "split balls also crit more" gives a chain reaction without any special-case code.
Explicit named combos can be added later as a bonus.

### Brainstorm (✅ = suggested for v1)

**Common (stats)**
- ✅ **Heavier Balls**: +1 damage
- ✅ **Sharp Eye**: +8% crit chance
- ✅ **Brutal**: +50% crit damage
- ✅ **Extra Ball**: +1 ball per volley
- ✅ **Long Sight**: the aim laser shows +1 bounce
- **Quickdraw**: balls launch faster and travel faster
- **Thick Skin**: +1 shield (saves you once from a brick reaching the bottom)

**Rare (new behaviors)**
- ✅ **Pierce**: balls go through the first brick they kill
- ✅ **Ricochet Rush**: each wall bounce adds +1 damage to that ball (resets each turn)
- ✅ **Chain Lightning**: crits zap 2 nearby bricks
- ✅ **Kindling**: hits set bricks on fire (damage each turn)
- **Splash**: kills deal half damage to neighbors
- **Magnet Floor**: returning balls get one extra bounce off the floor
- **First Blood**: the first ball of every volley deals 5× damage
- **Last Call**: the last ball of every volley is huge and pierces

**Epic (change how you play)**
- ✅ **Mitosis**: on crit, the ball splits in two (the copy lasts only this turn)
- ✅ **Gravity Well**: kills leave a small vortex for a few seconds that pulls balls toward it
- **Echo**: every 5th volley fires twice
- **Boomerang**: balls return to the launcher in a curve, hitting things on the way back
- **Time Dilation**: bricks drop only every other turn, but each new row has +50% HP
- **Prism**: a ball that hits a wall at a steep angle splits into 3 weaker beams
- **Bounty Hunter**: kills give coins, and coins add a permanent bonus to crit chance

**Legendary (rule-bending)**
- ✅ **The Ceiling Is Lava**: hitting the ceiling turns a ball into a fireball for the rest of the turn
- **Singularity**: at the end of the turn, all balls still flying merge into one black hole that eats the weakest brick in every column
- **Ouroboros**: balls no longer return. They keep going until you tap, at the cost of the next row dropping during the turn
- **Glass Cannon**: ×3 damage, but you have no shields and the danger line moves up one row
- **Fractal**: split balls can split again (Mitosis plus Prism goes wild)
- **Second Wind**: once per run, when you would lose, clear the bottom 3 rows instead

**Cursed (❓ maybe)**: strong upgrades with a downside, offered now and then. Example: "+2 balls, but Poppers appear twice as often."

---

## 7. Classes

Same upgrade pool for everyone. Each class changes starting stats and has one **signature perk**.

| Class | Start | Signature perk |
|---|---|---|
| **Striker** | 1 ball, high damage, +crit | **Executioner**: crits on bricks below 25% HP kill them instantly |
| **Juggler** | 3 balls, low damage | **Encore**: one random ball each volley is a golden ball with double damage |
| **Ricochet** | 2 balls | **Billiards**: every wall bounce gives +1 damage, and the laser shows +1 bounce |
| **Bomber** | 2 balls, low damage | **Payload**: every 10th hit causes a small explosion |
| **Gambler** | 2 balls | **Wildcard**: picks offer 4 cards instead of 3, but one is always cursed |

Start with 2–3 classes in v1 (Striker, Juggler, Ricochet).

---

## 8. Meta progression (unlocks only)

- New **upgrades** join the pool (for example, beat biome 3 to unlock Gravity Well).
- New **classes** (all unlocked while testing).
- **Endless mode** unlocks after your first win.
- Cosmetic **ball skins and trails**, earned from achievements.
- A **collection screen** showing every upgrade you've found and every brick you've met.
- Later: a daily seeded run (cheap, since the RNG is seeded from day one).

---

## 9. Art direction

Minimal geometric shapes, **not neon**. Some alternatives to look at:

| Option | What it looks like |
|---|---|
| **A. Paper cut** | Soft flat pastel shapes with a small drop shadow, as if cut from paper and layered. Calm and tactile |
| **B. Bauhaus / Swiss** | Off-white background, bold primary colors, circles, squares and triangles, thick black outlines. Graphic and bold |
| **C. Risograph print** | 2–3 ink colors per biome, grainy texture, slight color offset. Looks like a zine |
| **D. Soft toy / clay** | Rounded bricks with a highlight and squash-and-stretch. Feels bouncy and friendly |
| **E. Mono + accent** | Each biome is one dark color plus one accent color. Very clean, and color tells you what each thing is |

❓ **Round 1 mockups are live:** [Art Style Lab](https://claude.ai/artifact/9mYfSuqwu9A1sXcB81RYBs) (A–E above plus **F. Blueprint**: line art on a technical grid, hatching shows HP, and the aim line shows its angle). Pick 1–2 finalists for round 2. *My gut: **A or D**, because they pair best with heavy juice without turning into neon soup.*

**Readability rules, whatever the style:** hazard bricks always share one recognizable shape language (for example spikes or dashed outlines), not only color, so they're colorblind-safe. The HP number is always readable.

---

## 10. Juice checklist

- Squash and stretch on balls when they bounce, and on bricks when hit
- Bricks flash white and push back a little on hit; break into fragments that scatter
- Screen shake scaled to impact, with an off switch
- Hit-stop (a 30–60ms freeze) on crits, kills and boss hits
- Damage numbers that pop and drift. Crits are bigger, colored, and have a "!"
- A combo counter for kills within a single volley, with rising sound pitch
- Ball trails that change with upgrades (fire, lightning)
- The row drop eases in with a little bounce at the end
- A big zoom and flash when you clear a biome. Cards flip in for the pick
- A danger pulse: red vignette and heartbeat when bricks are near the bottom
- Slow-motion on the final ball of the final boss
- Haptic taps on crits, kills and danger (Android)

## 11. Audio

- Generated with **ZzFX** (a ~1KB WebAudio synth): bounce, hit, crit, kill, launch, row drop, card flip, pick, boss roar.
- Pitch goes up across a volley combo.
- ❓ Music: maybe generated ambient loops per biome later. Not in v1.

---

## 12. Menus and screens

- **Title**: animated background (balls bouncing around the logo), Continue / New Run / Collection / Settings
- **Class select**: cards you swipe through, each with a preview of its perk
- **In-run HUD**: depth, biome progress bar, ball count, coins, a pause button, fast-forward
- **Pause**: resume, settings, abandon run, current build (list of upgrades)
- **Upgrade pick**: 3 cards with rarity borders, tap to look closer, tap again to take it
- **Run summary**: depth reached, damage, best combo, upgrades taken, new unlocks, high score
- **Settings**: sound volume, haptics, screen shake, damage numbers, fast-forward default, reset data
- **Collection**: upgrades, bricks, classes, stats

---

## 13. Technical architecture

### Project layout (planned)
```
src/
  main.ts            # boot, canvas setup, scene manager
  core/              # loop, input, rng, events, save, audio, haptics
  sim/               # PURE game logic, no DOM: physics, bricks, turn state machine
  content/           # data: upgrades, bricks, biomes, classes, row patterns
  render/            # canvas drawing, particles, camera/shake, effects
  ui/                # DOM menus and overlays (title, pick, pause, summary)
  styles/
public/              # icons, manifest assets
tests/               # vitest
.github/workflows/   # deploy to Pages
```

### Key choices
- **Logical resolution**: a fixed virtual 9:16 world (for example 7 columns × ~12 rows), scaled to the screen, with devicePixelRatio for sharp rendering.
- **Simulation separate from rendering**: `sim/` never touches the DOM, which makes it testable and lets a headless bot play thousands of runs to check balance.
- **Fixed timestep**: physics runs in small fixed steps (sub-stepped so fast balls can't tunnel through bricks). Rendering interpolates. Fast-forward just runs more steps per frame.
- **Collision**: circle against axis-aligned box using a uniform grid lookup (bricks sit on a grid, so this is cheap). Balls don't collide with each other.
- **Seeded RNG** (mulberry32) with **separate streams** for row generation, loot and effects, so what you pick doesn't change the map.
- **Event bus** for upgrade hooks (see §6). An upgrade is `{ id, rarity, tags, stacks, hooks: {...} }`.
- **Scene and state machine**: `Title → ClassSelect → Run(Aim → Fire → Resolve → Descend → [Pick]) → Summary`.
- **Save**: the game is turn-based, so the full state is serialized **at the start of each aim phase**, which is easy and reliable. Saves carry a version number so updates don't corrupt them.
- **PWA**: `vite-plugin-pwa` with precache of all assets so it works fully offline. Manifest has portrait orientation, `display: standalone` and an icon set. Shows an "update available" toast.
- **Deploy**: a GitHub Action builds and publishes to Pages on every push to `main`. Vite `base` is set to `/silver-barnacle/` (changes if the repo is renamed).
- **Dev tools**: a debug panel (`?debug`) to grant any upgrade, jump to any biome, set the seed, show hitboxes, and run at 10× speed.
- **Tests**: Vitest on the RNG, collision, damage and crit math, upgrade hooks, save round-trips, and row generation.
