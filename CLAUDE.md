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
- `src/sources/` -- which grain is read: GitHub, a local folder (File System Access), or the bridge; `versions.ts` names a version grain's way
- `src/agent/` -- the Threshing Floor runtime:
  - `runtime.ts`: the Claude API loop (browser, user key), hands and threshing
  - `tools.ts`: the watering tools
  - `sheaves.ts`: memory
  - `gauge.ts`: spend limits
  - `sowing.ts`: the autonomous mode
  - `threads.ts`: conversations, for the API and the bridge
- `src/voices/` -- the voices of grain, and procedural characters (`Character.tsx`)
- `scripts/bridge.mjs` -- local companion: file access plus Claude Code headless (`claude -p --output-format stream-json`)
- `docs/PLAN.md` -- research, design system, architecture, roadmap; `docs/ADE.md` -- the Threshing Floor

## Conventions

- Colours come from CSS variables in `src/styles/tokens.css` (Linengrow: Stone/Hearth, plant dyes, no blue). Canvas code reads them with `cssVar`.
- Fonts are self-hosted via `@fontsource`; no external font or script hosts.
- Respect `prefersStill()` for any non-user-triggered motion.
- Agent code uses `@anthropic-ai/sdk`. The default model is `claude-opus-5-5` with adaptive thinking, and the server-side refusal fallback (`fallbacks: "default"`) is on by default. Keep history append-only, since threshing starts a new thread rather than editing one. `src/agent/__tests__/runtime.test.ts` drives the loop through a mocked SSE fetch.
- Astro changes: add or extend a test in `src/astro/__tests__/` against a published panchanga or ephemeris value.
- Verify UI changes in a real browser (Playwright is available; see `.claude/skills/webapp-testing`). In the cloud sandbox, serve with `vite preview --host 0.0.0.0` and browse the host IP, because the proxy intercepts localhost.
