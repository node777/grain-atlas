# Grain Atlas: research, design and build plan

Written 2026-10-10, alongside v0.1. This is the map of the map: what we learned about grain, the
choices that follow from it, what v0.1 ships, and where it grows next.

---

## 1. What grain is, as seen from outside

[grain-ww/grain](https://github.com/grain-ww/grain) is the public seed of a much larger private
"field". It is **9,321 tracked files** in 72 top-level folders, with one commit (2026-10-07). Each
time the maintainer projects a fresh seed with `tools/s/sow.rish`, it starts a new history.

| Measure | Value |
|---|---|
| Biggest rooms | `tools/` 4,235 files (letter-bucketed witnesses), `active-designing/` 1,284, `glow/` 492, `external-research/` 389 |
| Extensions | md 2,714 - rish 2,618 - rye 1,597 - sh 1,277 - glow 454 - kyri 112 - brix 13 |
| Own languages | **Rye** (bounded systems language with Zig syntax), **Rishi** (the shell, `.rish`), **Glow** (Hoon-like runes), **Kyri** / **Brix** (line notations) |
| Stamped files | 3,278 carry a one-clock stamp in their filename or header |

Findings that shaped the atlas:

- **Time lives in names, not in git.** The public repo has a single commit, so git dates say
  nothing per file. grain's own *one-clock* stamps do: `YYYYMMDD-HHMMSS_sprig.md` in filenames,
  ``**Stamp:** `YYYYMMDD.HHMMSS` `` in headers, and `*_version = "…"` in code. The stamp is wall
  time on the maintainer's host, and that host changed zones over the summer. The specs in
  `context/specs/` record the seasons: UTC ("UDT") early on, Pacific from `20260713.201910`,
  Eastern from `20260717.003132`, UTC again from `20260720.232932`, and Eastern from
  `20260722.125845`. `src/grain/stamps.ts` encodes this table, so every stamp becomes a real instant.
- **grain already maps itself.** `MAP.md` groups the root into *seven rooms*: Front Door, Law, Why,
  Language & Machines, Teaching, Workrooms and Reading Room. It adds study rooms and private field
  rooms. The atlas's regions follow it exactly (`src/grain/rooms.ts`), and any folder it doesn't
  know lands in **Uncharted**, so the map grows with the tree.
- **grain already says where to start.** It gives several reading orders, all ready-made quests:
  - "Three Doors" (MAP), "The First Hour" (docs-geode), "Eight Evening Walks" (lessons).
  - "The Day-One Rose" (COMPASS), the five element threshold pages in `foundations/`.
  - The study room, and "Four Questions, Four Rooms".
- **Missing doors are part of the story.** About 127 pages link to `SOURCE.md`, and others link to
  `construction/`, `session-logs/` and `context/LEXICON.md`. All of these live only in the
  maintainer's field. The atlas marks them as *field rooms, out of reach* rather than as broken links.
- **Every page says which room it is in.** Status lines carry *checkable*, *vision* or *mixed*
  ("Two Rooms"). The atlas shows them as tags and colours.
- **Astrology is native to grain.**
  - `classical-vedic-astrology/` casts charts as a hybrid: tropical signs for dignity, sidereal
    Lahiri nakshatras for the stars, and whole-sign houses.
  - It counts the 27 nakshatras from Krittika, after the Taittiriya Brahmana.
  - `cubist-bhakti-astrology/` re-reads the same sky through a fifteen-seat palette. The palette is
    five elements (aether, air, fire, water, earth) by three modalities, with day and night words
    such as *rockstar / hermit* for fire's cardinal seat.
- **grain has a design system on paper.** *Linengrow* (active-designing, Aug-Sep 2026) supplies most of the atlas's look:
  - Grounds: Stone `#DDD3BD` by day and Hearth `#2A2520` by night, with Oat and Ember surfaces.
  - A woven-linen texture, where "elevation is weave fineness".
  - Plant-dye accents (madder, annatto, weld, sage, elder) and no blue.
  - Type: Vollkorn ("wholegrain") for the body, Public Sans for labels, and a mono.
  - Shape: rounded, never square or circular. Motion: Still, Settle (one second, whole view), and
    Respond (local, at most four pulses).
  - The mapping from palette words to visual tokens is left "DJINN's to draw".

The atlas borrows grain's ideas, language and look, but it is its own interface. It does not
follow grain's development rules: no ASCII-only prose, session logs or witness discipline.

## 2. The astrology, researched independently

grain's astrology is one input, not the authority. The atlas defaults to standard Jyotish and offers grain's own choices as a lens:

- **Positions:** [astronomy-engine](https://github.com/cosinekitty/astronomy) (MIT,
  arcminute-class), true ecliptic of date.
- **Ayanamsa:** Lahiri / Chitrapaksha. It is anchored as Swiss Ephemeris anchors it (23.245524743°
  at JD 2435553.5) and carried forward with IAU 2006 precession. *True* ayanamsa (mean plus
  nutation) is subtracted from true-of-date longitudes. Checked: 24°13′19″ on 2026-01-01, matching
  Jagannatha Hora and Swiss Ephemeris within 3″. Raman, KP and Fagan-Bradley are also offered.
- **Rahu:** the osculating true node, from the Moon's state vector. That is what Swiss
  Ephemeris's `TRUE_NODE`, and grain's own caster, use. Ketu is opposite.
- **Lagna:** from local apparent sidereal time and true obliquity, with whole-sign houses.
- **Panchanga:**
  - tithi, nakshatra and pada, yoga, karana (60-slot mapping);
  - vara counted from sunrise, with ghati and pala since sunrise;
  - the 30 muhurtas, planetary hora, and Rahu kala;
  - the amanta masa, with adhika-month detection;
  - Vikram, Shaka and Kali years, and the 60-year samvatsara (southern reckoning).
- **Vimshottari dasha:** mahadashas and antardashas, using 365.25-day years.
- **Other skies:**
  - Western: tropical signs and aspects.
  - Hellenistic: sect, Chaldean decan faces, Egyptian bounds, Lot of Fortune.
  - Chinese: four pillars on solar terms, and the xiu matching the Moon's nakshatra.
  - Arabic: the 28 manazil.
- **Reference tables** (`src/astro/data/`) were cross-checked by a research pass. Every
  disagreement between sources, and the choice made, is in
  [`docs/research/astrology-sources.md`](research/astrology-sources.md). The main ones:
  - Rahu/Ketu exaltation.
  - Several yogatara identifications: Bharani, Vishakha, Shatabhisha, the Bhadrapadas.
  - Taittiriya versus Muhurta deity lists.
- **Engine tests** (`src/astro/__tests__/`) check published almanac days:
  - Ugadi 2024: Chaitra Shukla Pratipada, VS 2081, Krodhi.
  - The Ayodhya consecration on 2024-01-22: Pausha Shukla Dwadashi, Mrigashira, a Monday.
  - Diwali 2024 Amavasya.
  - Makar Sankranti.
  - The sunrise rule for vara.
  - Chinese day and year pillars.
- **Star data:**
  - HYG v4.1 to magnitude 6.5, plus the fainter stars a figure needs (8,972 stars), CC BY-SA 4.0.
  - Stellarium figures for four sky cultures: Modern, Indian (nakshatras and rashis), Nakshatras
    after the Tirupperunthurai temple carvings, and Chinese.
  - The Milky Way outline from d3-celestial.
  - Built by `scripts/build-stars.mjs`; attribution is in `public/data/sky/ATTRIBUTION.md`.

## 3. Design

**Feel.** A cartographer's table at night: warm linen, brass instruments, plant-dye inks. The one
bold element is the **compass rose** used to move between views. It rests small at the corner,
opens under the hand, and its needle turns toward where you are. Everything else stays quiet.

**Tokens** (`src/styles/tokens.css`): grain's Stone/Hearth grounds and inks; brass `#c8992f` and
gold `#d9b45a` from the wheat mark; the five element rows as accents. The sky is a warm near-black
(`#120f0c`), never navy, and stars run from linen-white to amber by B−V.

**Type.** Vollkorn for reading and cartographic labels (italic for region names), Public Sans for
interface labels, Source Code Pro for paths and stamps, and Tiro Devanagari Sanskrit for Devanagari.
All fonts are self-hosted through `@fontsource`.

**The stamp.** Every timestamp reads two ways at once: a small Moon drawn at its true phase, the
Vedic line (*Mūla 4, Shukla Ekadashi*), and under it the plain datetime. Hovering gives the weekday
counted from sunrise, the clock season, and your own local time. Clicking opens the Sky of that moment.

## 4. Architecture

```
src/
  core/       store, settings, hash router, plugin registry          <- the spine
  github/     REST client (time- and sha-cached), IndexedDB kv
  grain/      repo model, stamps + clock seasons, header parser, rooms, journeys, progress, kyri
  astro/      positions, ayanamsa, panchanga, dasha, traditions, describe; data/ reference tables
  app/        Shell, Compass, Folio (reader), NowChip, SettingsDrawer
  ui/         Stamp, MoonGlyph, Mark, Toast, useCanvas (pan/zoom canvas)
  plugins/    one folder per feature: fields, ledger, heavens, sky, journeys, bench, intro, renderers
scripts/      build-stars.mjs (sky data), build-almanac.mjs (tree snapshot)
```

- **Plugins.** Each feature is an `AtlasPlugin` (`src/core/registry.ts`). A plugin can contribute:
  - views (each one becomes a point on the compass);
  - file renderers (chosen by priority per path);
  - commands;
  - panels for named slots.

  To add a feature, make `src/plugins/<name>/`, export a plugin, and add one line to
  `src/plugins/index.ts`.
- **Data flow, gentlest first.** The unauthenticated GitHub REST API allows 60 calls an hour, and a
  304 still counts without a token. So:
  1. The deploy builds an **almanac snapshot** (`public/data/almanac.json`): every path, size,
     blob sha, header fields, stamp and link, from a shallow clone. It costs zero API calls at runtime.
  2. On load, **one** API call checks the branch head (cached for 10 minutes). If grain has moved
     on, **one** more fetches the live tree (cached forever by sha), keeping snapshot metadata for
     unchanged blobs.
  3. File bodies come from raw.githubusercontent.com, outside the API quota, and are cached
     forever by blob sha. Headers learned while reading fold back into the map.
  4. An optional token in Settings raises the limit to 5,000 calls an hour.
- **One projection for every sky.** A stereographic projection is centred wherever the camera
  looks, in the observer's horizontal frame:
  - Aimed at the celestial pole with a wide field, it *is* a planispheric astrolabe.
  - Aimed at the horizon, it is the dome.
  - Switching between the two is a slerp of the camera.

## 5. What v0.1 ships

| View | What it does |
|---|---|
| **Opening** | Stars fall and become seeds, the seeds grow into wheat, and the field, seen from above, becomes the map. It is skippable, has a single still frame under reduced motion, and offers "Begin where grain begins" or "Wander the fields". |
| **Fields** | Freeform map: regions are islands with contour rings, rooms are furrowed fields, folders are plots within plots, and every file is a grain. Rhumb lines run out from the Front Door. Pan, zoom, hover and click; an inspector shows a room's first and latest stamps; read pages glow gold; the active journey is drawn as a road. |
| **Ledger** | Structured view: a folder tree, a sortable table (name, room, moment, size), and search over every path and title. |
| **Folio** | The reader slides over any view, so the map stays visible. Markdown is set on linen, with grain's languages highlighted, internal links kept in the atlas, field rooms marked, inline stamps clickable, backlinks shown, copyable run lines, and audio for `.peal` files. |
| **Sky** | Astrolabe (rete, plate, limb with hours, alidade through the Sun) and the dome. Drag the rete to turn time; fade the brass with the slider; choose a sky culture; click stars and grahas. Readings: Panchanga, a South Indian chart, Dasha, Other skies, and the pages "Born under" the same nakshatra or tithi. |
| **Heavens** | grain's history as a sky. Each stamped page sits at the Moon's sidereal longitude when it was written, at a distance set by its time. Rooms become constellations, you can filter by region, and "play the history" grows the sky. A tally shows the nakshatras grain was written under. |
| **Journeys** | Seven walks taken from grain's own reading orders. Reading plants seeds, a stalk grows a grain per stop, and a finished walk is harvested with its benediction. There are no streaks or timers. |
| **Bench** | Format playground (Kyri/Brix records, one-clock stamps, page headers), run lines for every script with a copy button, notes pinned to paths with grain-style markdown export, and the plan for Rishi in the page. |

Settings cover:
- **Place:** set once from geolocation, with Reno, Nevada as the default (Ujjain, the traditional
  meridian of Jyotish, is one click away in Settings). It can also be a city or
  coordinates.
- **Sky:** the zodiac lens (Jyotish, grain's hybrid, or Western), the ayanamsa, and the nakshatra
  count order (Ashvini or Krittika).
- **Look and source:** Hearth or Stone mode, still motion, the repo/branch to read, and an optional
  token.

## 6. Roadmap

Everything below is direction, not promise.

1. **Fields, richer.** Label collision avoidance; folders named on the coast at low zoom; a
   minimap; "you are here" trails from your reading history; regions coloured by Two Rooms ratio.
2. **Heavens, deeper.** Link-constellations, with lines drawn from the pages each page cites; a
   time scrubber shared with the Sky; nativities for rooms, cast from a room's first stamp.
3. **Sky.** Planetary paths across a range of dates (retrograde loops), eclipses and node
   crossings, muhurta finder, divisional charts (navamsha D9, which grain's studies use), North
   Indian chart style, sound (the `.peal` bell on sunrise).
4. **People, kindly.** Contributor nativities cast from public commit times only, never from birth
   data. grain keeps natal readings private by design, and the atlas will too.
5. **Rishi in the page.** Step one is a small TypeScript reader for the first-hour subset over a
   virtual file system built from the tree. Step two is Rishi built for `wasm32-wasi`.
6. **The ADE.** Fork-aware: point at your own grain, see your branch's differences on the map, and
   edit with a CodeMirror pane that knows Rye, Rishi and Kyri. Draft pages in grain's header style,
   with the stamp filled from the clock.
7. **Linengrow tokens.** Draw the fifteen palette seats as real tokens, one encapsulation per
   element row, and let the reader pick a row to theme the whole atlas.

## 7. Open questions for the friend who owns grain

- Should the atlas follow `grain-ww/grain`, or the template at `grain-os/grain` that MAP.md names?
- Is there a place grain considers its home meridian for charts, other than Ujjain?
- Would the maintainer like the atlas to read the Linengrow palette seats once they are drawn?

## 8. Phase two (2026-10-10): versions, voices, the Threshing Floor

- **Versions** (`src/sources/`, [`docs/research/versions.md`](research/versions.md)). The atlas
  names what you are reading the way grain does:
  - the public seed by its root commit subject (**incense**);
  - grain-os/grain as a pointer you can follow;
  - forks by subject or hash;
  - your own checkout as seed, ship (`grain-<aroma>`) or pier, with its git nib and
    `GLOW_PROFILE.kyri` voice.

  Open a local grain folder (File System Access API) to read and write it, or reach a checkout
  through the bridge.
- **Voices** (`src/voices/`, [`docs/research/voices.md`](research/voices.md)). Twelve of grain's
  voices are seated, from Kyri, Kyli and the elders to the nested voices and Kyri's four faculties,
  and you can seat your own. Each has a procedural face (head, eyes, brows, mouth, cheeks, crown,
  element colour) that breathes, blinks, follows the pointer and talks. Page headers show the
  writing voice's face.
- **The Threshing Floor** ([`docs/ADE.md`](ADE.md)):
  - **Talk**, with hands and threshing;
  - **Sow**, the autonomous field;
  - **Sheaves**, long memory;
  - **Drafts and changes**;
  - **the Gauge**, spend limits;
  - **Voices** and **Keys**.

  It runs on the Claude API from the page, or on Claude Code through `scripts/bridge.mjs`. The dock
  puts the current voice on every view.
- **Visual upgrades**:
  - label collision avoidance on the map and in the sky;
  - a minimap, fog of war for undiscovered rooms, hover pulses and keyboard travel;
  - engraved-brass rete pointers and ecliptic degree ticks on the astrolabe;
  - comet trails as the Heavens history plays.

Next: Rishi in the page (the Bench plan), commits and PRs from the Floor for GitHub versions
(token-authenticated), contributor nativities from public commit times, and the Linengrow palette
seats drawn as themes.

---

<sub>Part of the Grain Atlas, an atlas by DJINN.</sub>
