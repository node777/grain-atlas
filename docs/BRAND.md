# grain.school brand book: plan

The brand book is a separate page in this repository, `brand/index.html`, with its code in `src/brand/`.
It builds to `dist/brand/` next to the atlas. It is plain TypeScript with no framework, so it can move into
the grain.school site as it is.

```sh
npm run dev        # then open /brand/
npm run build      # dist/brand/
```

## What is in draft one

| Part | Where | Notes |
| --- | --- | --- |
| Profiles | `src/brand/profiles.ts` | A profile is three letters, two grounds and five dyes. Draft one is **Sheaf**. **Kiln** and **Chaff** are listed in the dock but are empty for now. |
| Marks | `src/brand/marks.ts` | Four candidates drawn from one kernel path: **Stalk** (primary), **Ear**, **Grain**, **Awn**. You can cycle them from the dock, the cover, the candidate row, or with `[` and `]`. |
| Letters | fontsource | Jacquard 24 for display, Xanh Mono for text, VT323 for the console. All are under the SIL Open Font License. |
| Dyes | `profiles.ts` | Linen (day) and Hearth (night) grounds. Grain, Madder, Sage, Elder and Weld dyes. No blue. |
| Elements | page section 04 | Buttons, field, tags, switch, grain rule and list, frame, card, and four pointers. |
| Motion | page section 05 | Settle, Sprout, Thresh, Blink. All hold still under reduced motion or the dock's motion switch. |
| Mockups | page section 06 | Business card (print SVG), 18×24 poster (print SVG), billboard, social post, console ad, stickers. |
| Interfaces | `src/brand/os.ts` | Three OS sketches: **Furrow** (rows of days instead of windows), **Sheaf** (bundles instead of apps), **Sieve** (one prompt, with results sifted by kind). |
| Kit | `src/brand/kit.ts` | Every file can be downloaded on its own, or all of them as one zip for the current profile, ground, dye and mark. Lockups and print SVGs carry their fonts inside them. |

## Fonts: the brief and what stands in for it

The dafont faces in the brief could not be fetched from the build sandbox, and most dafont licences
are "free for personal use" or unclear. Draft one uses open-licensed faces with the same character
instead:

| Brief | Stand-in | Why |
| --- | --- | --- |
| Venice Classic, Haiku, Sburbits (logo) | **Jacquard 24** | A pixel blackletter: the serifs of an old book cut on a screen grid. |
| Reindeer Modern, Cavalhatriz (body) | **Xanh Mono** | A monospace with real serifs and a calligraphic italic. |
| PC Senior, 000webfont, CairoPixel, Calamity (console) | **VT323** | A DEC terminal face with small pixel serifs. |

If grain owns or licenses any of the brief's faces, a profile can name it. Each profile sets its
own `letters`.

## Roadmap

1. **Review draft one.** Choose the mark, and decide whether the type and dyes are right.
2. **Draft two, Kiln.** A darker, more technical profile: console-first, with a burnt-orange accent and a stricter grid.
3. **Draft three, Chaff.** A lighter, airier profile: more paper, a hand-set italic, and quieter marks.
4. **Hand-finished marks.** Redraw the chosen mark's pixel cuts by hand at 12, 16 and 24 cells, and set the wordmark in outlines so the SVGs need no font.
5. **Move to grain.school.** Copy `brand/` and `src/brand/` into the grain.school site, and point the site cursor at `cursor/grain-cursor.css`.

## Open questions

- What does the grain.school pointer look like? Draft one assumes a wheat stalk leaned like a cursor, with the awn as the hotspot.
- Where does grain.school's source live, and how is it deployed? This session could not reach it.
- Are any of the brief's dafont faces licensed for commercial use, or should the open stand-ins stay?
- Should the wordmark be `grain` alone, or `grain.school`?
- Should the brand keep the atlas's "no blue" rule, or is that only for the atlas?

---

<sub>Brand book drafted with DJINN.</sub>
