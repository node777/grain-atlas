# Grain Atlas -- notes for working in this repo

A static Vite + React + TypeScript site that maps the grain monorepo (github.com/grain-ww/grain).
It is inspired by grain but is its own interface: do not apply grain's development rules (ASCII
prose, session logs, witnesses) here.

## Commands

- `npm run dev` -- dev server
- `npm test` -- vitest (astro engine against almanac days, stamps, headers)
- `npm run build` -- `tsc --noEmit` then `vite build`
- `npm run data:almanac` -- snapshot of grain into `public/data/almanac.json` (gitignored; CI builds it).
  Use `GRAIN_DIR=/path/to/grain` to read an existing checkout.
- `npm run data:stars` -- rebuild `public/data/sky/` (committed)

## Where things live

- `src/core/` -- store (`createStore`/`useStore`; selectors are shallow-cached), settings, hash router, plugin registry
- `src/plugins/<feature>/` -- every view and renderer is a plugin; register in `src/plugins/index.ts`
- `src/astro/` -- engine; `src/astro/data/` reference tables (sources and disagreements in `docs/research/astrology-sources.md`)
- `src/grain/` -- repo model and loading order, one-clock stamps + clock seasons, header/link parser, regions (after MAP.md), journeys
- `docs/PLAN.md` -- research, design system, architecture, roadmap

## Conventions

- Colours come from CSS variables in `src/styles/tokens.css` (Linengrow: Stone/Hearth, plant dyes, no blue). Canvas code reads them with `cssVar`.
- Fonts are self-hosted via `@fontsource`; no external font or script hosts.
- Respect `prefersStill()` for any non-user-triggered motion.
- Astro changes: add or extend a test in `src/astro/__tests__/` against a published panchanga or ephemeris value.
- Verify UI changes in a real browser (Playwright is available; see `.claude/skills/webapp-testing`). In the cloud sandbox, serve with `vite preview --host 0.0.0.0` and browse the host IP, because the proxy intercepts localhost.
