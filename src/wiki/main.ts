import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './wiki.css';
import { ACHIEVEMENTS, SKINS, unlockSource, type Reward } from '../content/achievements';
import { BOSSES, CORE_BOSS, CORE_PHASES } from '../content/bosses';
import { BRICKS, type BrickKind } from '../content/bricks';
import { CLASSES, CLASS_BY_ID, type ClassId } from '../content/classes';
import { LOOT_CATEGORIES, LOOT_INFO, THEMES, UPGRADES, UPGRADE_BY_ID, baseStats, categoryOf, type Rarity } from '../content/upgrades';
import { BIOME_INKS, type Inks } from '../render/palette';
import { ballPath, drawBrickIcon, drawItemIcon } from '../render/renderer';
import { MAX_LAUNCH_TIME, ROWS } from '../sim/constants';
import { BIOME_ROWS, GIMMICK_TEXT, GIMMICKS } from '../sim/run';
import { brickHp, orbChance } from '../sim/rows';

/**
 * The Ricochet Press wiki. Every number and description comes from the game's own content files,
 * so the wiki can't drift out of date.
 */

const INK: Inks = BIOME_INKS[0];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pct = (n: number) => `${Math.round(n * 100)}%`;

function rewardName(r: Reward): string {
  if (r.kind === 'class') return `${CLASS_BY_ID.get(r.id as ClassId)?.name} class`;
  if (r.kind === 'upgrade') return `${UPGRADE_BY_ID.get(r.id)?.name} upgrade`;
  return `${SKINS.find((s) => s.id === r.id)?.name} ball skin`;
}

function unlockLine(kind: Reward['kind'], id: string): string {
  const a = unlockSource(kind, id);
  return a ? `<p class="unlock">🔒 Unlocked by <a href="#achievements">${esc(a.name)}</a>: ${esc(a.desc)}</p>` : '';
}

interface Page {
  id: string;
  title: string;
  render: () => string;
  /** Searchable entries: [title, text]. */
  index: () => [string, string][];
}

const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'cursed'];
const base = baseStats();

const PAGES: Page[] = [
  {
    id: 'overview', title: 'Overview',
    index: () => [['Overview', 'turn-based brick breaker roguelike biomes core endless']],
    render: () => `
      <h1>Ricochet Press</h1>
      <p class="lede">A turn-based, aim-and-shoot brick breaker roguelike. Fire a volley, watch it ricochet, and keep the bricks from reaching the bottom as the board sinks one row per turn. Clear five biomes, beat the mini-boss guarding each one, then break <a href="#bosses">The Core</a>.</p>
      <h2>A run at a glance</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Biome</th><th>Rows</th><th>Rule</th><th>Boss</th></tr></thead>
        <tbody>
          ${BIOME_ROWS.map((rows, i) => `<tr><td>${i + 1}</td><td>${swatch(BIOME_INKS[i])} ${BIOME_INKS[i].name}</td><td>${rows}</td><td>${esc(GIMMICK_TEXT[GIMMICKS[i]].split(':')[0])}</td><td>${BOSSES[i].name}</td></tr>`).join('')}
          <tr><td>6</td><td>${swatch(BIOME_INKS[5])} The Core</td><td>0</td><td>Final boss only</td><td>${CORE_BOSS.name}</td></tr>
          <tr><td>∞</td><td>Endless</td><td>24 each</td><td>Biomes repeat, tougher every lap</td><td>All five again</td></tr>
        </tbody>
      </table></div>
      <p>Every biome has three upgrade moments: <b>loot bricks</b> a third of the way through (three genre-marked bricks; break the one you want), a <b>small pick</b> two-thirds of the way through (three cards, mostly commons and rares), and the <b>big pick</b> after its boss (rare or better, one free reroll). That's 15 upgrades before The Core.</p>
      <p>Every biome has a <b>rule</b> that gets stronger the deeper you go into it.</p>
      <h2>Where to start</h2>
      <ul>
        <li><a href="#mechanics">How the game works</a>: aiming, damage, crits, shields.</li>
        <li><a href="#classes">Classes</a>: pick a starting style.</li>
        <li><a href="#upgrades">Upgrades</a>: all ${UPGRADES.length}, with how they stack.</li>
        <li><a href="#strategy">Strategy</a>: tips for each biome and boss.</li>
      </ul>`,
  },
  {
    id: 'mechanics', title: 'How it works',
    index: () => [['Aiming', 'drag dial tap fire keyboard'], ['Damage', 'damage formula crit multiplier'], ['Shields', 'shield second wind'], ['Orbs', 'orb balls taper'], ['Brick HP', 'hp scaling depth']],
    render: () => `
      <h1>How it works</h1>
      <h2 id="aiming">Aiming and firing</h2>
      <ul>
        <li><b>Drag left or right</b> anywhere to turn the aim like a dial. Near the bottom of the screen it turns at full speed; <b>the higher your finger, the finer the control</b> (up to 3× finer near the top). Fast flicks turn quicker.</li>
        <li><b>◀ ▶</b> beside Fire nudge the aim by 0.2° (hold to keep turning). The exact angle shows above the launcher while you aim.</li>
        <li><b>Tap</b> to point the aim at a spot (touches below the launcher are mirrored upward).</li>
        <li><b>Fire</b> confirms. Your aim carries over to the next turn.</li>
        <li>Desktop: arrow keys nudge the aim (Shift for bigger steps), Space or Enter fires.</li>
        <li>The dotted laser shows the path to the first bounce. <a href="#upgrades">Long Sight</a> shows more bounces.</li>
      </ul>
      <h2>A turn</h2>
      <ol>
        <li>Your volley leaves the launcher. However many balls you have, the whole volley is out within ${MAX_LAUNCH_TIME} seconds.</li>
        <li>Balls bounce off walls, the ceiling and bricks, dealing damage on every hit.</li>
        <li>The <b>first ball to land</b> sets where you fire from next turn.</li>
        <li>Every brick moves down one row and a new row appears at the top.</li>
        <li>If any brick crosses the bottom row (row ${ROWS}), the run ends, unless a <b>shield</b> or <b>Second Wind</b> saves you.</li>
      </ol>
      <p><b>Fast-forward</b> (▶▶) appears a few seconds into a volley; <b>Recall</b> brings every ball home after a while.</p>
      <h2 id="orbs">Orbs</h2>
      <p>Every ⊕ orb you collect adds a ball to your next volley. Every row has one until depth 20; after that they thin out, down to ${pct(orbChance(1000))} of rows.</p>
      <h2 id="damage">Damage</h2>
      <p class="formula">hit = (damage + bonus) × damage multiplier × [first ball] × [fireball ×2] × [golden ×2] × [shrunk ×0.5] × [Last Stand] × [crit]</p>
      <ul>
        <li>Base damage <b>${base.damage}</b>, crit chance <b>${pct(base.critChance)}</b>, crits deal <b>×${base.critMult}</b>.</li>
        <li><b>Bonus</b> comes from Ricochet Rush (after a ball's first brick hit) and Momentum, and resets each turn.</li>
        <li>Armored bricks take 1 damage per hit unless you crit (or own Can Opener).</li>
      </ul>
      <h2 id="hp">Brick HP</h2>
      <p>HP grows a little faster than depth and jumps 20% with each biome. Some bricks spawn tough, with double HP. A normal brick at:</p>
      <div class="table-wrap"><table><thead><tr><th>Depth</th><th>Biome</th><th>HP</th></tr></thead><tbody>
        ${[[5, 0], [12, 0], [25, 1], [50, 3], [75, 4], [100, 4]].map(([d, b]) => `<tr><td>${d}</td><td>${BIOME_INKS[b].name}</td><td>${Math.round(brickHp(d, b))}</td></tr>`).join('')}
      </tbody></table></div>
      <h2 id="shields">Shields and Second Wind</h2>
      <p>When a brick would end your run, a <b>shield</b> clears the bottom two rows instead. <b>Second Wind</b> (legendary) does it once per run for the bottom three rows, after your shields are gone. <b>Glass Cannon</b> removes all shields.</p>`,
  },
  {
    id: 'classes', title: 'Classes',
    index: () => CLASSES.map((c) => [c.name, `${c.tagline} ${c.perk} ${c.perkDesc}`]),
    render: () => `
      <h1>Classes</h1>
      <p class="lede">Every class shares the same upgrade pool. A class changes your starting balls and gives one signature perk.</p>
      <div class="cards">${CLASSES.map((c) => `
        <article class="card" id="class-${c.id}">
          <h3>${c.name} <span class="balls">${'●'.repeat(c.startBalls)}</span></h3>
          <p class="tag">${esc(c.tagline)} Starts with ${c.startBalls} ball${c.startBalls > 1 ? 's' : ''}.</p>
          <p><b>${esc(c.perk)}.</b> ${esc(c.perkDesc)}</p>
          ${unlockLine('class', c.id)}
        </article>`).join('')}</div>`,
  },
  {
    id: 'upgrades', title: 'Upgrades',
    index: () => UPGRADES.map((u) => [u.name, `${u.rarity} ${u.desc(0)}`]),
    render: () => `
      <h1>Upgrades</h1>
      <p class="lede">${UPGRADES.length} upgrades. Each has themes (crit, fire, explosion, lightning, bank, multi, damage, defense, general). <b>General</b> cards are solid in any build; the rest pay off when you stack a theme, and cards that fit your build are marked in the pick screen. Most stack: the card always describes the <i>next</i> stack. Rarer cards show up more often deeper in a run, and big picks never offer commons. Cursed cards only appear for the Gambler.</p>
      <div class="filters" role="group" aria-label="Filter by rarity">
        <button type="button" class="chip" data-filter="all" aria-pressed="true">All</button>
        ${RARITY_ORDER.map((r) => `<button type="button" class="chip" data-filter="${r}" aria-pressed="false">${r}</button>`).join('')}
      </div>
      <div class="cards">${[...UPGRADES].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)).map((u) => `
        <article class="card upgrade" data-rarity="${u.rarity}" id="up-${u.id}">
          <p class="rarity">${u.rarity}${u.max > 1 && u.max < 99 ? ` · up to ×${u.max}` : u.max >= 99 ? ' · stacks' : ' · once'}</p>
          <h3>${esc(u.name)}</h3>
          <p class="tag">${(THEMES[u.id] ?? []).join(' · ')}</p>
          <p>${esc(u.desc(0))}</p>
          ${u.max > 1 && u.desc(1) !== u.desc(0) ? `<p class="stack">Stack 2: ${esc(u.desc(1))}</p>` : ''}
          ${unlockLine('upgrade', u.id)}
        </article>`).join('')}</div>`,
  },
  {
    id: 'bricks', title: 'Bricks & hazards',
    index: () => Object.entries(BRICKS).map(([, b]) => [b.name, b.desc]),
    render: () => `
      <h1>Bricks &amp; hazards</h1>
      <p class="lede">Special bricks appear gradually as you go deeper. <b>Hazards always have a jagged outline</b>; they mess with the ball that hits them.</p>
      <div class="cards">
        <article class="card brick"><canvas width="80" height="80" data-brick="normal" aria-hidden="true"></canvas><div><h3>Normal</h3><p>Just HP. Darker bricks have more.</p></div></article>
        ${Object.entries(BRICKS).map(([k, b]) => `
        <article class="card brick${b.hazard ? ' hazard' : ''}" id="brick-${k}">
          <canvas width="80" height="80" data-brick="${k}" aria-hidden="true"></canvas>
          <div><h3>${esc(b.name)} ${b.hazard ? '<span class="pill">hazard</span>' : ''}</h3><p>${esc(b.desc)}</p><p class="tag">From depth ${b.from}${b.hp && b.hp !== 1 ? ` · ${pct(b.hp)} normal HP` : ''}</p></div>
        </article>`).join('')}
      </div>
      <h2 id="loot">Loot bricks</h2>
      <p>A third of the way through every biome, three loot bricks land in the top row. The first one you break gives you an upgrade from its genre; the other two shatter. Loot bricks never end your run, and they fall off the bottom if you ignore them.</p>
      <div class="table-wrap"><table><thead><tr><th>Genre</th><th>What's inside</th><th>Upgrades</th></tr></thead><tbody>
        ${LOOT_CATEGORIES.map((c) => `<tr><td><b>${LOOT_INFO[c].name}</b></td><td>${LOOT_INFO[c].hint}</td><td>${c === 'wild' ? 'Any (skews rare)' : UPGRADES.filter((u) => categoryOf(u.id) === c).map((u) => esc(u.name)).join(', ')}</td></tr>`).join('')}
      </tbody></table></div>
      <h2 id="items">Pickups</h2>
      <p>Balls pass straight through these.</p>
      <div class="cards">
        <article class="card brick"><canvas width="64" height="64" data-item="orb" aria-hidden="true"></canvas><div><h3>Orb</h3><p>+1 ball for your next volley.</p></div></article>
        <article class="card brick"><canvas width="64" height="64" data-item="laserH" aria-hidden="true"></canvas><div><h3>Line laser</h3><p>Every ball that passes through blasts its whole row (or column, for the vertical kind). Gone at the end of the turn. From depth 6.</p></div></article>
        <article class="card brick"><canvas width="64" height="64" data-item="portal" aria-hidden="true"></canvas><div><h3>Portal pair</h3><p>A ball that enters one comes out of the other, keeping its speed. From depth 16.</p></div></article>
      </div>`,
  },
  {
    id: 'biomes', title: 'Biomes',
    index: () => BIOME_INKS.map((b, i) => [b.name, i < 5 ? GIMMICK_TEXT[GIMMICKS[i]] : 'final boss']),
    render: () => `
      <h1>Biomes</h1>
      <p class="lede">Each biome is printed in its own pair of inks and changes one rule.</p>
      <div class="cards">${BIOME_INKS.map((b, i) => `
        <article class="card biome" style="--p:${b.paper};--a:${b.i1};--b:${b.i2}">
          <h3>${i + 1}. ${b.name}</h3>
          <p class="inks"><span style="background:${b.i1}"></span><span style="background:${b.i2}"></span></p>
          <p>${i < 5 ? `${BIOME_ROWS[i]} rows, then <a href="#bosses">${BOSSES[i].name}</a>.` : 'No rows: just The Core.'}</p>
          <p>${i < 5 ? esc(GIMMICK_TEXT[GIMMICKS[i]]) + '.' : esc(CORE_BOSS.tell) + '.'}</p>
        </article>`).join('')}</div>
      <h2 id="endless">Endless</h2>
      <p>After breaking The Core you can keep going. The five biomes repeat as laps (Caverns II, Caverns III…). Each lap multiplies brick HP by 1.35 and hazard frequency by 1.3, on top of normal depth scaling. Mini-bosses keep guarding every biome. Your deepest won run is your <b>endless best</b>.</p>`,
  },
  {
    id: 'bosses', title: 'Bosses',
    index: () => [...BOSSES, CORE_BOSS].map((b) => [b.name, b.tell]),
    render: () => `
      <h1>Bosses</h1>
      <p class="lede">A 2×2 mini-boss guards the end of every biome. New rows stop while it's alive (an orb still arrives each turn), but it keeps moving down. Beat it for the big upgrade pick.</p>
      <div class="cards">${BOSSES.map((b, i) => `
        <article class="card boss"><h3>${b.name}</h3><p class="tag">${BIOME_INKS[i].name}</p><p>${esc(b.tell)}.</p></article>`).join('')}</div>
      <h2 id="core">The Core</h2>
      <p>A 3×3 final boss with three phases, switching at two-thirds and one-third HP. It stays put until its last phase.</p>
      <ol>${CORE_PHASES.slice(1).map((p) => `<li>${esc(p)}.</li>`).join('')}</ol>`,
  },
  {
    id: 'achievements', title: 'Achievements',
    index: () => ACHIEVEMENTS.map((a) => [a.name, `${a.desc} ${a.reward ? rewardName(a.reward) : ''}`]),
    render: () => `
      <h1>Achievements</h1>
      <p class="lede">${ACHIEVEMENTS.length} achievements. Many unlock classes, upgrades and ball skins. (The "Unlock everything" setting opens classes and upgrades for testing; skins always have to be earned.)</p>
      <div class="table-wrap"><table><thead><tr><th>Achievement</th><th>How</th><th>Unlocks</th></tr></thead><tbody>
        ${ACHIEVEMENTS.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td>${esc(a.desc)}</td><td>${a.reward ? esc(rewardName(a.reward)) : '–'}</td></tr>`).join('')}
      </tbody></table></div>`,
  },
  {
    id: 'skins', title: 'Ball skins',
    index: () => SKINS.map((s) => [s.name, 'ball skin']),
    render: () => `
      <h1>Ball skins</h1>
      <p class="lede">Purely cosmetic. Equip them from the Collection screen.</p>
      <div class="cards skins">${SKINS.map((s) => {
        const a = unlockSource('skin', s.id);
        return `<article class="card skin"><canvas width="96" height="96" data-skin="${s.id}" aria-hidden="true"></canvas><h3>${esc(s.name)}</h3><p class="tag">${a ? `${esc(a.name)}: ${esc(a.desc)}` : 'Default'}</p></article>`;
      }).join('')}</div>`,
  },
  {
    id: 'strategy', title: 'Strategy',
    index: () => [['Strategy', 'tips bank shots caverns deep frostline forge bosses']],
    render: () => `
      <h1>Strategy</h1>
      <h2>General</h2>
      <ul>
        <li><b>Get behind the wall.</b> Shots that slip above a row of bricks bounce along the ceiling and hit them from behind for many hits.</li>
        <li><b>Grab orbs early.</b> Ball count is your main growth until the first few upgrades kick in.</li>
        <li><b>Watch where you land.</b> The first ball home sets your next launch point; corners give steep, ceiling-hugging angles.</li>
        <li><b>Clear the bottom first</b> when it gets tight. The danger halftone and heartbeat mean two rows to go.</li>
        <li><b>Priority targets.</b> Kill Shielders before the bricks they protect, Healers before they undo your work, and Fuses or Thieves before their countdown badge hits zero.</li>
        <li><b>Pick your loot.</b> Loot bricks show their genre. Aim for the one your build needs: the first one broken is the one you get.</li>
      </ul>
      <h2>Builds that click</h2>
      <ul>
        <li><b>Crit engine:</b> Sharp Eye + Brutal + Chain Lightning + Mitosis. Striker's Executioner finishes the job.</li>
        <li><b>Bank shots:</b> Ricochet Rush and Momentum reward balls that hit a brick and then rattle around. Wall bounces only count after the first brick hit.</li>
        <li><b>Fire and blast:</b> Kindling + Wildfire + Splash, or Bomber with Short Fuse and Volatile.</li>
        <li><b>The Ceiling Is Lava</b> plus Pierce turns every ceiling shot into a drill.</li>
      </ul>
      <h2>Biomes</h2>
      <ul>
        <li><b>Caverns:</b> the laser lights the dark; sweep the aim before firing to see what's there.</li>
        <li><b>The Deep:</b> the current flips every turn (the laser accounts for it), and the tide shifts the whole board a column. Late in the biome it comes every other turn.</li>
        <li><b>Frostline:</b> frozen bricks waste your first hit, and the first ball home slides on black ice, so your next launch point drifts the way it was moving.</li>
        <li><b>Meadow:</b> leave a few bricks alone and they sprout blooms worth an extra ball. Greedy, but early balls snowball.</li>
        <li><b>Forge:</b> bricks you skip regrow, and the lava raises the danger line every few turns. The dashed line shows where it will be next turn.</li>
      </ul>
      <h2>Bosses</h2>
      <ul>
        <li><b>Lantern:</b> aim at a wall first; only balls that bounced off a wall can hurt it.</li>
        <li><b>Glacier:</b> the shielded side turns each turn, so hit it from the open side.</li>
        <li><b>Anvil:</b> commit everything in one turn: a fifth of its HP, or it heals.</li>
        <li><b>The Core:</b> save shields for the meltdown, when it finally comes down.</li>
      </ul>`,
  },
];

function swatch(i: Inks): string {
  return `<span class="sw" style="background:${i.i1};box-shadow:3px 2px 0 ${i.i2}"></span>`;
}

// ---- shell ----

const root = document.getElementById('wiki')!;
root.innerHTML = `
  <header class="top">
    <a class="brand" href="#overview"><span>RICOCHET</span><span>PRESS</span> <small>wiki</small></a>
    <input id="q" type="search" placeholder="Search the wiki" aria-label="Search the wiki" autocomplete="off">
    <a class="play" href="./">▶ Play</a>
  </header>
  <div class="layout">
    <nav class="nav" aria-label="Wiki sections">${PAGES.map((p) => `<a href="#${p.id}" data-page="${p.id}">${p.title}</a>`).join('')}</nav>
    <main id="content" tabindex="-1"></main>
  </div>`;

const content = document.getElementById('content')!;
const q = document.getElementById('q') as HTMLInputElement;

function show(id: string): void {
  const page = PAGES.find((p) => p.id === id) ?? PAGES[0];
  content.innerHTML = page.render();
  root.querySelectorAll('.nav a').forEach((a) => a.setAttribute('aria-current', String((a as HTMLElement).dataset.page === page.id)));
  document.title = `${page.title} · Ricochet Press Wiki`;
  paintIcons();
  wireFilters();
  window.scrollTo(0, 0);
}

function paintIcons(): void {
  content.querySelectorAll<HTMLCanvasElement>('canvas[data-brick]').forEach((c) => drawBrickIcon(c, c.dataset.brick as BrickKind, INK));
  content.querySelectorAll<HTMLCanvasElement>('canvas[data-item]').forEach((c) => drawItemIcon(c, c.dataset.item as 'orb', INK));
  content.querySelectorAll<HTMLCanvasElement>('canvas[data-skin]').forEach((c) => {
    const g = c.getContext('2d')!;
    const k = c.width / 64;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.lineWidth = 3;
    for (const [ink, dx] of [[INK.i1, 2.5], [INK.i2, 0]] as const) {
      g.beginPath();
      ballPath(g, 32 + dx, 32 + dx * 0.6, 14, c.dataset.skin!);
      if (c.dataset.skin === 'hollow') { g.strokeStyle = ink; g.stroke(); } else { g.fillStyle = ink; g.fill(); }
    }
  });
}

function wireFilters(): void {
  const chips = content.querySelectorAll<HTMLButtonElement>('[data-filter]');
  chips.forEach((chip) => chip.addEventListener('click', () => {
    const f = chip.dataset.filter!;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    content.querySelectorAll<HTMLElement>('.upgrade').forEach((card) => { card.hidden = f !== 'all' && card.dataset.rarity !== f; });
  }));
}

function search(term: string): void {
  const t = term.trim().toLowerCase();
  if (!t) return show(location.hash.slice(1) || 'overview');
  const hits: string[] = [];
  for (const p of PAGES) {
    for (const [title, text] of p.index()) {
      if (title.toLowerCase().includes(t) || text.toLowerCase().includes(t)) {
        hits.push(`<li><a href="#${p.id}"><b>${esc(title)}</b> <small>${p.title}</small></a><span>${esc(text.slice(0, 140))}</span></li>`);
      }
    }
  }
  content.innerHTML = `<h1>Search: “${esc(term)}”</h1>${hits.length ? `<ul class="results">${hits.join('')}</ul>` : '<p>Nothing found. Try “crit”, “boss” or a brick name.</p>'}`;
}

q.addEventListener('input', () => search(q.value));
window.addEventListener('hashchange', () => {
  q.value = '';
  show(location.hash.slice(1));
});
show(location.hash.slice(1) || 'overview');
