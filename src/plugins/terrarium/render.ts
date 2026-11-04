// World -> a grid of coloured characters. Pure: the canvas painter in Terrarium.tsx just draws it.

import { boundsOf, DECOR, floorTop, SPECIES, type World } from './engine'
import { creatureRows, decorRows, labelFor } from './art'

/** Palette names -> the CSS variables they read (see src/styles/tokens.css; no blue). */
export const PALETTE: Record<string, string> = {
  star: '--star', gold: '--gold', brass: '--brass', sand: '--brass-dim',
  sage: '--el-air', annatto: '--el-fire', madder: '--el-water', weld: '--el-earth', elder: '--el-aether',
  haze: '--star-warm',
}
export const COLOR_NAMES = Object.keys(PALETTE)
const CI = Object.fromEntries(COLOR_NAMES.map((n, i) => [n, i])) as Record<string, number>

export interface Frame {
  cols: number; rows: number
  ch: string[]
  col: Uint8Array
  /** 0 = empty, 1..8 = alpha in eighths */
  a: Uint8Array
}

export function newFrame(cols: number, rows: number): Frame {
  return { cols, rows, ch: new Array(cols * rows).fill(' '), col: new Uint8Array(cols * rows), a: new Uint8Array(cols * rows) }
}

function put(f: Frame, c: number, r: number, ch: string, color: string, alpha: number): void {
  if (c < 0 || r < 0 || c >= f.cols || r >= f.rows || ch === ' ') return
  const i = r * f.cols + c
  f.ch[i] = ch
  f.col[i] = CI[color] ?? 0
  f.a[i] = Math.max(1, Math.min(8, Math.round(alpha * 8)))
}
function text(f: Frame, c: number, r: number, s: string, color: string, alpha: number): void {
  for (let i = 0; i < s.length; i++) put(f, c + i, r, s[i], color, alpha)
}

export interface Overlay { hover?: { id: number } | null }

export function compose(w: World, cols: number, rows: number, overlay: Overlay = {}): Frame {
  const f = newFrame(cols, rows)
  const L = w.light
  const sandRow = Math.floor(floorTop(w) / 2)

  // light shafts from the surface, faint and slow
  if (L > 0.3) {
    for (let k = 0; k < Math.ceil(cols / 40); k++) {
      const base = k * 40 + 12 + Math.sin(w.t * 0.12 + k * 2.3) * 5
      const len = Math.floor(sandRow * 0.75)
      for (let r = 1; r < len; r++) put(f, Math.round(base + r * 0.7), r, '/', 'haze', 0.11 * L * (1 - r / len))
    }
  }

  // the surface
  for (let c = 0; c < cols; c++) {
    const v = Math.sin(c * 0.55 + w.t * 1.6) + Math.sin(c * 0.2 - w.t * 0.9)
    put(f, c, 0, v > 0.6 ? '-' : v < -0.6 ? '_' : '~', 'star', (0.35 + 0.25 * Math.max(0, v)) * (0.3 + L * 0.7))
  }
  for (const rp of w.ripples) {
    const r = Math.floor(rp.t * 6)
    const alpha = 1 - rp.t / 1.4
    put(f, Math.round(rp.x - r), 0, '(', 'star', alpha); put(f, Math.round(rp.x + r), 0, ')', 'star', alpha)
    if (r > 1) { put(f, Math.round(rp.x - r), 1, '.', 'star', alpha * 0.7); put(f, Math.round(rp.x + r), 1, '.', 'star', alpha * 0.7) }
  }

  // sand, greening with algae
  const green = w.algae
  for (let r = sandRow; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453
      const u = n - Math.floor(n)
      const algaeHere = u < green * 0.55 && r === sandRow
      if (algaeHere) put(f, c, r, '"', 'sage', 0.9)
      else put(f, c, r, r === sandRow ? (u < 0.45 ? '.' : u < 0.7 ? ':' : ',') : u < 0.5 ? ':' : u < 0.8 ? '.' : ';', 'sand', 0.55 + 0.45 * L)
    }
  }

  // scenery, back to front: rooted things first
  const order = [...w.decor].sort((a, b) => (DECOR[a.d].floats ? 1 : 0) - (DECOR[b.d].floats ? 1 : 0) || a.y - b.y)
  for (const d of order) {
    const b = boundsOf(w, d)
    const rowsOf = decorRows(d, w.t)
    const color = d.d === 'kelp' ? 'sage' : d.d === 'coral' ? 'madder' : d.d === 'brain' ? 'elder' : d.d === 'rock' ? 'sand' : d.d === 'shell' ? 'star' : d.d === 'castle' ? 'brass' : d.d === 'vent' ? 'sand' : d.d === 'pill' ? 'gold' : d.d === 'www' ? 'gold' : 'star'
    const hot = overlay.hover?.id === d.id
    rowsOf.forEach((line, i) => {
      for (let j = 0; j < line.length; j++) {
        let col = color
        if (d.d === 'coral' && line[j] === '|') col = 'sage'
        if (d.d === 'brain' && line[j] === '@') col = 'annatto'
        if (d.d === 'www' && (line[j] === '[' || line[j] === ']')) col = 'star'
        put(f, b.c0 + j, b.r0 + i, line[j], hot ? 'star' : col, (0.5 + 0.5 * L) * (d.d === 'kelp' ? 0.85 : 1))
      }
    })
    const lab = labelFor(d)
    if (lab) text(f, Math.round(d.x - lab.length / 2), d.d === 'app' ? b.r0 + b.h : b.r0 + b.h, lab, hot ? 'gold' : 'haze', hot ? 1 : 0.55 * (0.4 + L * 0.6))
  }

  // plankton and flakes
  for (const fd of w.food) {
    put(f, Math.round(fd.x), Math.round(fd.y / 2), fd.k === 'plankton' ? '.' : fd.rest > 0 ? ',' : '*', fd.k === 'plankton' ? 'sage' : 'weld', fd.k === 'plankton' ? 0.55 : 1)
  }

  // creatures
  for (const c of w.creatures) {
    const spec = SPECIES[c.sp]
    const rowsOf = creatureRows(c, w.t)
    const b = boundsOf(w, c)
    const hot = overlay.hover?.id === c.id
    const sleepy = c.belly < 0.08
    const base = (sleepy ? 0.5 : 0.9) * (0.35 + 0.65 * L)
    rowsOf.forEach((line, i) => {
      for (let j = 0; j < line.length; j++) {
        const ch = line[j]
        let col = spec.color
        let a = base
        if (c.sp === 'jelly') { a = (0.6 + 0.4 * Math.sin(c.ph * 2.6)) * (0.5 + 0.5 * (1 - L) + 0.5 * L); if (ch === 'o') col = 'star' }
        if (c.sp === 'angler' && (ch === '*' || ch === 'o')) { col = 'star'; a = 0.7 + 0.3 * Math.sin(c.ph * 3) }
        if (ch === 'o' && c.sp !== 'jelly' && c.sp !== 'angler') col = 'star'
        put(f, b.c0 + j, b.r0 + i, ch, hot ? 'star' : col, hot ? 1 : a)
      }
    })
  }

  // bubbles
  for (const bu of w.bubbles) put(f, Math.round(bu.x), Math.round(bu.y / 2), bu.y > w.H * 0.5 ? '.' : bu.y > w.H * 0.25 ? 'o' : 'O', 'star', 0.6)

  // the cold hart: before Aurora the whole glass is dim
  return f
}
