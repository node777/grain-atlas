# Grain Atlas

*A grain is a tree you can hold.*

An atlas, star chart and workbench for the [grain](https://github.com/grain-ww/grain) monorepo,
built as a static site. It reads grain live from GitHub, or from your own checkout. It works with
grain's voices on the **Threshing Floor**, and shows the tree seven ways:
- **Fields** -- the tree as land, one grain per file.
- **Ledger** -- folders and files, sorted and searchable.
- **Heavens** -- grain's history as a sky.
- **Sky** -- an astrolabe that opens into a dome of real stars.
- **Journeys** -- walks grain itself recommends.
- **Bench** -- try formats, copy run lines, keep notes.
- **Floor** -- the Threshing Floor, for working grain with its voices:
  - talk with a voice;
  - sow a seed and let a field of agents grow it;
  - keep long memory in sheaves;
  - review drafts;
  - watch spend against the Gauge.

The current voice also lives in the dock at the corner of every view. See [`docs/ADE.md`](docs/ADE.md).

**Versions.** The atlas names the version you are reading the way grain does. The public seed is
"incense", after its root commit subject; `grain-os/grain` is a pointer to it. You can switch to any
fork, open a grain folder on your own computer (Chromium browsers), or connect through the bridge.
See [`docs/research/versions.md`](docs/research/versions.md).

Every timestamp in the atlas is read in Vedic terms and as a plain datetime. Click one to open the
sky of that moment.

## Run it

```sh
npm install
npm run data:almanac   # optional: snapshot grain's tree, stamps and links (clones grain-ww/grain)
npm run dev            # http://localhost:5173
```

```sh
npm test               # astro engine checked against published almanac days; stamp and header parsing
npm run build          # typecheck + static build into dist/
```

Without the almanac snapshot, the atlas reads the tree live from the GitHub API. That costs one or
two calls; unauthenticated GitHub allows 60 an hour. A token in Settings raises the limit to 5,000.

`npm run data:stars` rebuilds the sky data in `public/data/sky/` from HYG and Stellarium. It is
already built and committed.

## The bridge (Claude Code on your machine)

```sh
node scripts/bridge.mjs ~/grain     # prints a token; paste it under Floor > Keys
```

The bridge serves your checkout to the atlas and runs Claude Code headless in it, under your
Claude Code login. It listens on 127.0.0.1 only and requires its token on every request.

## Deploy

`.github/workflows/deploy.yml` builds the almanac, tests and builds the site, and publishes it to
GitHub Pages. It runs on every push to `main`, once a day so the snapshot follows grain, and on
demand. Turn it on once under **Settings → Pages → Source: GitHub Actions**.

## Add a feature

Every feature is a plugin (`src/core/registry.ts`). A plugin can add:
- a view, which becomes a new point on the compass rose;
- a file renderer for some kind of file;
- commands;
- panels for other views.

```ts
// src/plugins/my-thing/index.tsx
export const myPlugin: AtlasPlugin = {
  id: 'my-thing', title: 'My thing', description: '…',
  views: [{ id: 'my-thing', title: 'Thing', hint: 'what it shows', kind: 'tool', glyph: '✶', order: 6, component: MyView }],
}
```

Then add it to `src/plugins/index.ts`. [`docs/PLAN.md`](docs/PLAN.md) holds the research, design
and roadmap.

## Credits

- Positions: [astronomy-engine](https://github.com/cosinekitty/astronomy) (MIT).
- Stars: [HYG Database](https://github.com/astronexus/HYG-Database) v4.1 (CC BY-SA 4.0).
- Constellation figures: [Stellarium](https://github.com/Stellarium/stellarium) sky cultures
  (CC BY-SA 4.0 / CC BY 4.0).
- Milky Way: [d3-celestial](https://github.com/ofrohn/d3-celestial) (BSD-3).

See `public/data/sky/ATTRIBUTION.md`. The design borrows grain's own Linengrow notes, and the
astrology sources are listed in [`docs/research/astrology-sources.md`](docs/research/astrology-sources.md).

Code is MIT (see `LICENSE`). The derived star data in `public/data/sky/` keeps its upstream
licenses. The vendored skills in `.claude/skills/` are Apache-2.0, from
[anthropics/skills](https://github.com/anthropics/skills).
