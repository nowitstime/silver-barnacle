# Ricochet Press

A turn-based, aim-and-shoot brick breaker roguelike for phones held in portrait. Installable as a PWA and hosted on GitHub Pages.

- Design: [docs/DESIGN.md](docs/DESIGN.md)
- Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)

## Develop

```sh
npm install
npm run dev        # http://localhost:5173/silver-barnacle/  (add ?debug for the dev panel, ?seed=123 for a fixed seed)
npm test           # unit tests (Vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm run icons      # regenerate PNG icons from public/favicon.svg
```

## Layout

```
src/core     loop, input, rng, storage
src/sim      pure game rules (no DOM): physics, rows, turn state machine
src/render   canvas drawing in the Risograph style, visual effects
src/ui       DOM overlays: turn controls, game over, toasts, debug panel
tests/       Vitest
```

## Deploy

`.github/workflows/deploy.yml` builds, tests and publishes to GitHub Pages on every push to `main`.
One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
