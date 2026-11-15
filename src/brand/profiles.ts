/*
 * Style profiles. A profile is one complete way of dressing the grain: three letters, two grounds,
 * a row of dyes. The page, the tokens download and every mockup read the same object, so a new
 * profile is one more entry here.
 *
 * Draft one is "Sheaf". The two after it are named and empty, waiting on review.
 */

export interface Ground {
  name: string
  page: string
  surface: string
  surface2: string
  ink: string
  ink2: string
  ink3: string
  rule: string
}

export interface Dye {
  key: string
  name: string
  /** on the day ground */
  day: string
  /** on the night ground */
  night: string
  note: string
}

export interface Letter {
  role: 'display' | 'text' | 'console'
  family: string
  css: string
  use: string
  why: string
  /** the font suggested in the brief that this one stands in for */
  after: string
  foundry: string
}

export interface Profile {
  key: string
  name: string
  draft: string
  ready: boolean
  motto: string
  letters: Letter[]
  day: Ground
  night: Ground
  dyes: Dye[]
  radius: [number, number, number]
}

export const SHEAF: Profile = {
  key: 'sheaf',
  name: 'Sheaf',
  draft: 'draft one',
  ready: true,
  motto: 'A grain is a tree you can hold.',
  letters: [
    {
      role: 'display',
      family: 'Jacquard 24',
      css: "'Jacquard 24', 'VT323', monospace",
      use: 'the wordmark, covers, one line per page',
      why: 'A blackletter cut on a 24-pixel loom. It has the old-book serifs and the screen grid at once.',
      after: 'Venice Classic, Haiku, Sburbits',
      foundry: 'Sarah Cadigan-Fried, Soft Type (OFL)',
    },
    {
      role: 'text',
      family: 'Xanh Mono',
      css: "'Xanh Mono', 'Courier Prime', monospace",
      use: 'reading: paragraphs, cards, captions',
      why: 'A monospace with real serifs and a calligraphic italic. Every letter keeps the same width, but it reads like a book.',
      after: 'Reindeer Modern, Cavalhatriz',
      foundry: 'Lam Bao and Duy Dao, Yellow Type (OFL)',
    },
    {
      role: 'console',
      family: 'VT323',
      css: "'VT323', monospace",
      use: 'labels, numbers, the interface, the prompt',
      why: 'A DEC terminal face with small pixel serifs: the console voice, used for anything a machine says.',
      after: 'PC Senior, 000webfont, CairoPixel',
      foundry: 'Peter Hull (OFL)',
    },
  ],
  day: {
    name: 'Linen',
    page: '#efe7d6',
    surface: '#e7dcc6',
    surface2: '#ddd0b5',
    ink: '#241f1a',
    ink2: '#5a4f42',
    ink3: '#8a7c69',
    rule: '#cdbf9f',
  },
  night: {
    name: 'Hearth',
    page: '#221d18',
    surface: '#2c2620',
    surface2: '#373028',
    ink: '#ece2cc',
    ink2: '#b8ab93',
    ink3: '#867a67',
    rule: '#473d32',
  },
  dyes: [
    { key: 'grain', name: 'Grain', day: '#a87a22', night: '#d9b45a', note: 'the kernel itself; the one accent most pages need' },
    { key: 'madder', name: 'Madder', day: '#a3412e', night: '#d27a63', note: 'root red; for what is alive, urgent or new' },
    { key: 'sage', name: 'Sage', day: '#5f6e3f', night: '#a3b07a', note: 'leaf; for growth, done, open' },
    { key: 'elder', name: 'Elder', day: '#6a4c66', night: '#b998b2', note: 'berry; for memory, the past, links' },
    { key: 'weld', name: 'Weld', day: '#b8901a', night: '#e6c75a', note: 'flower yellow; highlight, sparingly' },
  ],
  radius: [4, 8, 14],
}

export const PROFILES: Profile[] = [
  SHEAF,
  { ...SHEAF, key: 'kiln', name: 'Kiln', draft: 'draft two', ready: false, motto: '' },
  { ...SHEAF, key: 'chaff', name: 'Chaff', draft: 'draft three', ready: false, motto: '' },
]

export type GroundKey = 'day' | 'night'

export interface Tuning {
  profile: string
  mark: string
  ground: GroundKey
  dye: string
  scale: number
  texture: boolean
  still: boolean
}

export const DEFAULT_TUNING: Tuning = {
  profile: 'sheaf',
  mark: 'stalk',
  ground: 'day',
  dye: 'grain',
  scale: 1,
  texture: true,
  still: false,
}

export function tokens(p: Profile, ground: GroundKey, dyeKey: string): Record<string, string> {
  const g = p[ground]
  const out: Record<string, string> = {
    '--page': g.page,
    '--surface': g.surface,
    '--surface-2': g.surface2,
    '--ink': g.ink,
    '--ink-2': g.ink2,
    '--ink-3': g.ink3,
    '--rule': g.rule,
    '--paper-day': p.day.page,
    '--ink-day': p.day.ink,
    '--paper-night': p.night.page,
    '--ink-night': p.night.ink,
    '--r1': p.radius[0] + 'px',
    '--r2': p.radius[1] + 'px',
    '--r3': p.radius[2] + 'px',
  }
  for (const l of p.letters) out[`--font-${l.role}`] = l.css
  for (const d of p.dyes) out[`--${d.key}`] = d[ground]
  const accent = p.dyes.find((d) => d.key === dyeKey) ?? p.dyes[0]
  out['--accent'] = accent[ground]
  return out
}

/** tokens.css for download: both grounds, every dye */
export function tokensCSS(p: Profile): string {
  const block = (sel: string, ground: GroundKey) =>
    `${sel} {\n` +
    Object.entries(tokens(p, ground, 'grain'))
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n') +
    `\n}\n`
  return (
    `/* grain.school -- ${p.name} (${p.draft}) design tokens */\n\n` +
    block(':root,\n[data-ground="day"]', 'day') +
    '\n' +
    block('[data-ground="night"]', 'night')
  )
}

export function tokensJSON(p: Profile): string {
  return JSON.stringify(
    {
      profile: p.name,
      draft: p.draft,
      letters: Object.fromEntries(p.letters.map((l) => [l.role, { family: l.family, stack: l.css, use: l.use }])),
      grounds: { day: p.day, night: p.night },
      dyes: Object.fromEntries(p.dyes.map((d) => [d.key, { name: d.name, day: d.day, night: d.night, use: d.note }])),
      radius: p.radius,
    },
    null,
    2,
  )
}

/** a GIMP / Inkscape / Krita palette */
export function paletteGPL(p: Profile): string {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16).toString().padStart(3))
  const rows: [string, string][] = []
  for (const k of ['page', 'surface', 'surface2', 'ink', 'ink2', 'ink3', 'rule'] as const) {
    rows.push([p.day[k], `${p.day.name} ${k}`])
    rows.push([p.night[k], `${p.night.name} ${k}`])
  }
  for (const d of p.dyes) {
    rows.push([d.day, `${d.name} (day)`])
    rows.push([d.night, `${d.name} (night)`])
  }
  return `GIMP Palette\nName: grain ${p.name}\nColumns: 7\n#\n` + rows.map(([h, n]) => `${hex(h).join(' ')}\t${n}`).join('\n') + '\n'
}
