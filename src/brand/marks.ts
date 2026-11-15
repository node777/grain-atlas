/*
 * The marks. Several candidates share one drawing system, and the user can cycle between them:
 *
 *   stalk  one stalk of wheat, leaned like a pointer: the whole pointer
 *   ear    the head of that stalk, the end of the pointer, drawn larger
 *   grain  a single kernel
 *   awn    a single kernel with its awn, a grain that points
 *
 * Every candidate is built from the same kernel path, set on a 64-unit square. The leaned version
 * (-32 degrees) is the pointer, and the end of it is the cursor hotspot. The pixel cuts are sampled
 * from the same parts.
 */

export const KERNEL = 'M32 5C42 11 47 25 46 37C45 49 39.5 58 32 59C24.5 58 19 49 18 37C17 25 22 11 32 5Z'
/** the crease runs a little right of centre, as on a real wheat grain */
export const CREASE = 'M32.6 14.5C35.4 25 35.4 40 32.2 51'
/** the germ: a short cut at the foot of the kernel */
export const GERM = 'M25.6 50.2C27.4 53.6 29.8 55.2 32 55.6'
export const TILT = -32

export interface MarkInk {
  body: string
  cut: string
}

/* ---------- parts ---------- */

/** map every coordinate pair of an absolute M/C/L/Z path through a matrix */
function xf(d: string, m: DOMMatrix): string {
  return d.replace(/(-?\d*\.?\d+)[ ,](-?\d*\.?\d+)/g, (_, x, y) => {
    const p = m.transformPoint({ x: +x, y: +y })
    return `${+p.x.toFixed(2)} ${+p.y.toFixed(2)}`
  })
}

const place = (cx: number, cy: number, rot: number, s: number) =>
  new DOMMatrix().translate(cx, cy).rotate(rot).scale(s).translate(-32, -32)

type Part =
  | { kind: 'fill'; d: string }
  | { kind: 'cut'; d: string; w: number }
  | { kind: 'line'; d: string; w: number; fine?: boolean }

function kernelParts(m: DOMMatrix, cuts: boolean, cutW = 2.6): Part[] {
  const s = Math.hypot(m.a, m.b)
  const out: Part[] = [{ kind: 'fill', d: xf(KERNEL, m) }]
  if (cuts) out.push({ kind: 'cut', d: xf(CREASE, m), w: cutW * s }, { kind: 'cut', d: xf(GERM, m), w: cutW * s })
  return out
}

/** the ear: a top kernel and three alternating pairs, each with its awn */
function earParts(fit: DOMMatrix, awns: boolean): Part[] {
  const parts: Part[] = []
  const s = 0.23
  const kernels: [number, number, number][] = [[32, 8, 0]]
  for (const y of [17, 26.5, 36]) kernels.push([27.2, y, -30], [36.8, y, 30])
  for (const [cx, cy, r] of kernels) {
    const m = fit.multiply(place(cx, cy, r, s))
    parts.push(...kernelParts(m, false))
    if (awns) {
      // the awn runs on from the kernel's tip, along its own lean
      const a = (r * Math.PI) / 180
      const tipX = cx + 27 * s * Math.sin(a), tipY = cy - 27 * s * Math.cos(a)
      const len = r === 0 ? 7 : 8
      const end = { x: tipX + len * Math.sin(a), y: tipY - len * Math.cos(a) }
      const p0 = fit.transformPoint({ x: tipX, y: tipY })
      const p1 = fit.transformPoint(end)
      parts.push({ kind: 'line', d: `M${p0.x.toFixed(2)} ${p0.y.toFixed(2)}L${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`, w: 0.9 * Math.hypot(fit.a, fit.b), fine: true })
    }
  }
  return parts
}

export interface MarkDef {
  key: string
  name: string
  note: string
  parts: Part[]
  /** the end of the pointer, upright, in 64-unit space */
  tip: { x: number; y: number }
  /** labels for the construction drawing: text and the upright point it names */
  labels: [string, number, number][]
  anatomy: [string, string][]
}

const I = new DOMMatrix()

function stalk(): MarkDef {
  const ear = earParts(I, true)
  return {
    key: 'stalk',
    name: 'Stalk',
    note: 'one stalk, the whole pointer',
    parts: [...ear, { kind: 'line', d: 'M32 41C32.4 50 32.4 60 31.6 68', w: 2.4 }],
    tip: { x: 32, y: 1 },
    labels: [['awn', 33, 3], ['ear', 37, 22], ['stem', 33, 58]],
    anatomy: [
      ['ear', 'Seven kernels: one at the top and three pairs below, each pair leaning out by 30°.'],
      ['awns', 'A short whisker runs on from each kernel. They drop out below 24 px.'],
      ['stem', 'One line, a little bowed. It is the handle of the pointer.'],
      ['lean', '−32°. The top awn is the hotspot when the stalk is a cursor.'],
    ],
  }
}

function ear(): MarkDef {
  // the head alone, set larger in the square
  const fit = new DOMMatrix().translate(32, 32).scale(1.2).translate(-32, -21)
  return {
    key: 'ear',
    name: 'Ear',
    note: 'the head of the stalk, the end of the pointer',
    parts: [...earParts(fit, true), { kind: 'line', d: xf('M32 41L32 47', fit), w: 2.4 * 1.2 }],
    tip: fit.transformPoint({ x: 32, y: 1 }),
    labels: [['awn', 33, 4], ['kernel', 41, 30], ['neck', 33, 56]],
    anatomy: [
      ['ear', 'The head of the stalk on its own, set larger: the end of the pointer.'],
      ['kernels', 'Seven, in alternating pairs. Each is the grain mark, at a quarter size.'],
      ['awns', 'Short whiskers that keep the head from reading as a leaf.'],
      ['lean', '−32°. The top awn is the hotspot.'],
    ],
  }
}

function grain(): MarkDef {
  return {
    key: 'grain',
    name: 'Grain',
    note: 'a single kernel',
    parts: kernelParts(I, true),
    tip: { x: 32, y: 5 },
    labels: [['crease', 35, 30], ['body', 46, 40], ['germ', 27, 53]],
    anatomy: [
      ['body', 'One path on a 64-unit square. The tip is narrow and the foot is full, like a real kernel.'],
      ['crease', 'The cut down the belly runs a little right of centre. It is kept at 24 cells and above.'],
      ['germ', 'A short cut at the foot, where the grain wakes.'],
      ['lean', '−32°. The tip is the hotspot when the grain is a cursor.'],
    ],
  }
}

function awn(): MarkDef {
  const m = place(32, 39, 0, 0.78)
  return {
    key: 'awn',
    name: 'Awn',
    note: 'one grain with its whisker: a grain that points',
    parts: [...kernelParts(m, true), { kind: 'line', d: `M32 ${(39 - 27 * 0.78).toFixed(2)}L32 -2`, w: 1.6 }],
    tip: { x: 32, y: -2 },
    labels: [['awn', 33, 6], ['crease', 34, 38], ['germ', 28, 59]],
    anatomy: [
      ['awn', 'The whisker of a wheat grain, drawn as a straight line. It points.'],
      ['body', 'The grain mark at three-quarter size, set low so the awn has room.'],
      ['crease', 'Kept at 24 cells and above.'],
      ['lean', '−32°. The end of the awn is the hotspot.'],
    ],
  }
}

export const MARKS: MarkDef[] = [stalk(), ear(), grain(), awn()]

let current = MARKS[0]
export function setMark(key: string) {
  current = MARKS.find((m) => m.key === key) ?? MARKS[0]
}
export const mark = () => current

/** the hotspot once leaned, in 64-unit space */
export function tip(def = current, tilt = TILT) {
  return new DOMMatrix().translate(32, 32).rotate(tilt).translate(-32, -32).transformPoint(def.tip)
}

/* ---------- SVG ---------- */

function partsSVG(parts: Part[], ink: MarkInk, cutScale = 1): string {
  return parts
    .map((p) =>
      p.kind === 'fill'
        ? `<path d="${p.d}" fill="${ink.body}"/>`
        : p.kind === 'cut'
          ? `<path d="${p.d}" fill="none" stroke="${ink.cut}" stroke-width="${+(p.w * cutScale).toFixed(2)}" stroke-linecap="round"/>`
          : `<path d="${p.d}" fill="none" stroke="${ink.body}" stroke-width="${p.w}" stroke-linecap="round"/>`,
    )
    .join('')
}

/** the current mark as an SVG group on the 64-unit square */
export function markGroup(ink: MarkInk, tilt = 0, cutWidth = 2.6, def = current): string {
  const t = tilt ? ` transform="rotate(${tilt} 32 32)"` : ''
  return `<g${t}>${partsSVG(def.parts, ink, cutWidth / 2.6)}</g>`
}

/** the single kernel, whatever the current mark is (for sprouting and threshing) */
export function kernelGroup(ink: MarkInk, tilt = 0, cutWidth = 2.6): string {
  return markGroup(ink, tilt, cutWidth, MARKS[2])
}

export function markSVG(ink: MarkInk, opts: { tilt?: number; size?: number; bg?: string; pad?: number; def?: MarkDef } = {}): string {
  const pad = opts.pad ?? 0
  const s = 64 + pad * 2
  const size = opts.size ?? 256
  const bg = opts.bg ? `<rect x="${-pad}" y="${-pad}" width="${s}" height="${s}" rx="${s * 0.18}" fill="${opts.bg}"/>` : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${s} ${s}" width="${size}" height="${size}" overflow="visible">` +
    bg + markGroup(ink, opts.tilt ?? 0, 2.6, opts.def) + `</svg>`
  )
}

/* ---------- pixel cuts ---------- */

/** 0 empty, 1 body, 2 cut (crease), 3 outline (only when asked) */
export type Grid = number[][]

/*
 * The single grain is set by hand at 8 and 12 cells, because sampling loses its shape that small.
 * Everything else is sampled from the parts.
 */
const HAND: Record<number, string[]> = {
  8: ['.##.....', '.###....', '.####...', '..####..', '..#####.', '...####.', '....##..', '........'],
  12: [
    '..##........',
    '..###.......',
    '..####......',
    '..#####.....',
    '...#####....',
    '...######...',
    '....#####...',
    '....######..',
    '.....#####..',
    '.....#####..',
    '......###...',
    '............',
  ],
}

export function rasterise(n: number, tilt = TILT, withCrease = n >= 24, outline = false, def = current): Grid {
  const hand = def.key === 'grain' && tilt === TILT ? HAND[n] : undefined
  const g: Grid = hand ? hand.map((r) => [...r].map((ch) => (ch === '#' ? 1 : 0))) : sample(n, tilt, withCrease, def)
  if (!outline) return g
  const o = g.map((r) => r.slice())
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (g[y][x]) continue
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] > 0)
    if (near) o[y][x] = 3
  }
  return o
}

function sample(n: number, tilt: number, withCrease: boolean, def: MarkDef): Grid {
  const c = scratch()
  const m = new DOMMatrix().translate(32, 32).rotate(tilt).translate(-32, -32)
  const step = 64 / n
  const fills: Path2D[] = []
  const cuts: { p: Path2D; w: number }[] = []
  const lines: { p: Path2D; w: number }[] = []
  for (const part of def.parts) {
    const p = new Path2D()
    p.addPath(new Path2D(part.d), m)
    if (part.kind === 'fill') fills.push(p)
    else if (part.kind === 'cut') cuts.push({ p, w: Math.max(part.w, step * 0.9) })
    else if (!part.fine || n >= 24) lines.push({ p, w: Math.max(part.w, step) })
  }
  const g: Grid = []
  const k = 4
  for (let y = 0; y < n; y++) {
    const row: number[] = []
    for (let x = 0; x < n; x++) {
      // sixteen samples per cell; a cell is filled when half of them land on the mark
      let hits = 0, cut = 0
      for (let sy = 0; sy < k; sy++) for (let sx = 0; sx < k; sx++) {
        const px = (x + (sx + 0.5) / k) * step
        const py = (y + (sy + 0.5) / k) * step
        let on = fills.some((f) => c.isPointInPath(f, px, py))
        if (!on) on = lines.some((l) => ((c.lineWidth = l.w), c.isPointInStroke(l.p, px, py)))
        if (on) {
          hits++
          if (withCrease && cuts.some((q) => ((c.lineWidth = q.w), c.isPointInStroke(q.p, px, py)))) cut++
        }
      }
      // lines are thin by nature, so a cell they cross needs fewer hits
      row.push(hits >= 7 ? (cut >= 8 ? 2 : 1) : 0)
    }
    g.push(row)
  }
  return g
}

let ctx: CanvasRenderingContext2D | null = null
function scratch() {
  if (!ctx) {
    const el = document.createElement('canvas')
    el.width = el.height = 64
    ctx = el.getContext('2d')!
  }
  return ctx
}

export function pixelSVG(grid: Grid, colours: Record<number, string>, size = 256): string {
  const n = grid.length
  let rects = ''
  for (let y = 0; y < n; y++) {
    let x = 0
    while (x < n) {
      const v = grid[y][x]
      let run = 1
      while (x + run < n && grid[y][x + run] === v) run++
      if (v && colours[v]) rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${colours[v]}"/>`
      x += run
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges">` +
    rects + `</svg>`
  )
}

/** the page cursor: the current mark at 16 cells with a paper outline, drawn at 32px */
export function cursorSVG(body: string, edge: string): { svg: string; hot: [number, number] } {
  const grid = rasterise(16, TILT, false, true)
  const svg = pixelSVG(grid, { 1: body, 2: body, 3: edge }, 32)
  const t = tip()
  const tx = Math.round((t.x / 64) * 32)
  const ty = Math.round((t.y / 64) * 32)
  return { svg, hot: [Math.min(31, Math.max(0, tx - 1)), Math.min(31, Math.max(0, ty - 1))] }
}

export const dataURI = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
