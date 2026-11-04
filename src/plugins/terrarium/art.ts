// ASCII sprites. Everything is drawn facing right; the left-facing frames are mirrored on demand.
// A space is transparent. Frames of one creature may differ in height; they are padded to match.

import type { Creature, Decor, SpeciesId } from './engine'

const SWAP: Record<string, string> = { '<': '>', '>': '<', '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '/': '\\', '\\': '/', '`': "'", "'": '`', 'd': 'b', 'b': 'd', 'p': 'q', 'q': 'p' }

export const rowsWidth = (rows: string[]) => rows.reduce((m, r) => Math.max(m, r.length), 0)

export function pad(rows: string[]): string[] {
  const w = rowsWidth(rows)
  return rows.map((r) => r.padEnd(w, ' '))
}

export function mirror(rows: string[]): string[] {
  return pad(rows).map((r) => [...r].reverse().map((ch) => SWAP[ch] ?? ch).join(''))
}

type Frames = string[][]

interface Art {
  swim: Frames          // normal frames, cycled
  fry: Frames
  startled?: Frames     // puffer swollen
  symmetric?: boolean
}

const ART: Record<SpeciesId, Art> = {
  tetra: {
    swim: [['><>'], ['>=>']],
    fry: [['>'], ['}']],
  },
  angel: {
    swim: [
      ['  /\\  ', '><(o)>', '  \\/  '],
      ['  /\\  ', '>=(o)>', '  \\/  '],
    ],
    fry: [['<>'], ['=>']],
  },
  betta: {
    swim: [
      [' ~~,  ', '}}(o)>', " ~~'  "],
      [' ~,   ', '}>(o)>', " ~'   "],
    ],
    fry: [['->'], ['=>']],
  },
  puffer: {
    swim: [
      [' .-. ', '( o)>', " '-' "],
      [' .-. ', '( o)>', " '-' "],
    ],
    startled: [
      [' ,*^*, ', '(   o )>', " `*v*' "],
      [' ,*^*, ', '(  o  )>', " `*v*' "],
    ],
    fry: [['o>'], ['o>']],
  },
  ray: {
    swim: [
      ['    __     ', ' .-"/__\\"-. ', '>-.______.-\''],
      ['    __     ', '  ,"/__\\".  ', ' >-"""""""-\''],
    ],
    fry: [['~>'], ['->']],
  },
  seahorse: {
    swim: [
      [' ,~,', ' (o>', '  ))', ' (_\''],
      [' ,~,', ' (o>', '  ))', ' (_,'],
    ],
    fry: [['s'], ['c']],
  },
  jelly: {
    swim: [
      [' .-"-. ', '( o o )', ' \\/|\\/ ', ' /|\\|\\ '],
      [' .---. ', ' (o o) ', '  \\|/  ', '  /|\\  '],
    ],
    fry: [['o'], ['.']],
    symmetric: true,
  },
  angler: {
    swim: [
      ['    ,*  ', '  ,-\'   ', '><(Vww)>'],
      ['    ,o  ', '  ,-\'   ', '>=(Vww)>'],
    ],
    fry: [['*>'], ['.>']],
  },
  crab: {
    swim: [
      ['\\(oo)/', ' /""\\ '],
      ['/(oo)\\', ' \\""/ '],
    ],
    fry: [['v'], ['w']],
    symmetric: true,
  },
  snail: {
    swim: [
      [' _@_   ', '(___)=>'],
      [' _@_   ', '(___)->'],
    ],
    fry: [['.'], [',']],
  },
  star: {
    swim: [
      ['  \\|/  ', '--(*)--', '  /|\\  '],
      ['  \\|/  ', '-- * --', '  /|\\  '],
    ],
    fry: [['*'], ['+']],
    symmetric: true,
  },
}

export function creatureRows(c: Creature, _t: number): string[] {
  const a = ART[c.sp]
  const fry = c.age < 45
  const set = fry ? a.fry : c.startle > 0 && a.startled ? a.startled : a.swim
  const speedy = Math.hypot(c.vx, c.vy)
  const rate = c.sp === 'jelly' ? 0 : 2 + speedy * 0.5
  let idx = Math.floor((c.ph * rate) % set.length)
  if (c.sp === 'jelly' && !fry) {
    // the bell opens as the pulse rises and shuts as it sinks
    idx = (c.ph % 2.4) < 0.7 ? 1 : 0
  }
  const frame = pad(set[idx % set.length])
  return c.face < 0 && !a.symmetric ? mirror(frame) : frame
}

const KELP_CHARS = [')', '(']

export function kelpRows(h: number, t: number, seed: number): string[] {
  const rows: string[] = []
  for (let i = 0; i < h; i++) {
    const fromTop = i
    const sway = Math.round(Math.sin(t * 0.8 + seed + (h - i) * 0.55) * (1 + (h - i) / h * 0.9) * 0.9)
    const ch = i === 0 ? 'Y' : KELP_CHARS[(i + Math.floor(seed)) % 2]
    rows.push(' '.repeat(Math.max(0, 2 + sway)) + ch)
    void fromTop
  }
  return pad(rows)
}

const STATIC: Record<string, string[]> = {
  coral: ['\\ | /', ' \\|/ ', '  |  '],
  brain: ['  .--.  ', ' (@@@@) ', '(@@@@@@)'],
  rock: ['  ___  ', ' /   \\ ', '/_____\\'],
  shell: [' .-. ', '(vvv)'],
  castle: ['|^|^|^|', '| _ _ |', '|_|_|_|'],
  vent: [' ,^, ', '/___\\'],
  pill: ['(=|=)'],
  www: ['  ______  ', ' /______\\ ', ' |__[]__| '],
  app: ['  ||  ', ' /  \\ ', '|  v |', '|____|'],
}

export function decorRows(d: Decor, t: number): string[] {
  if (d.d === 'kelp') return kelpRows(d.h || 5, t, d.seed)
  return STATIC[d.d] ?? ['?']
}

export function labelFor(d: Decor): string | null {
  if (d.d === 'www') return 'grain-www >'
  if (d.d === 'app') return 'Terrarium.app v'
  return null
}

/** For the Add tray: a one-line glyph of each thing. */
export function glyphOf(id: string): string {
  const a = ART[id as SpeciesId]
  if (a) return a.swim[0].join(' ').replace(/\s+/g, ' ').trim().slice(0, 9) || id
  return (STATIC[id]?.[0] ?? id).trim()
}
