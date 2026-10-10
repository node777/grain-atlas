// Where every file stands. Each folder's loose files become one settlement inside the folder's
// bubble:
//
//   - a town on a street grid, filling outward from its middle along an irregular edge: the
//     landmark (its README) at the heart, then houses, archives and trades, farmland beyond,
//     stones and trees at the edge;
//   - a river town, for a folder of filename-stamped files (a run of dated logs): the files line
//     both banks in time order along a stretch of river running through the folder;
//   - a basin, for a folder of three or more such day-folders: its days are re-strung in date
//     order along a serpentine that walks toward the coast, so one river can run through them.

import { hash, type Plot } from './layout'
import { Kind, kindOf, KIND_RANK, BUILT, DWELLING, TIER_SCALE, type Kind as KindT } from './glyphs'
import { CELL, plotX, plotY, vnoise } from './terrain'
import { nearestOn } from './geom'
import { widthOf } from './water'

const STAMPED = /^(?:\d{8}[-_.]\d{6}|\d{8}[-_])/

/** Every file's mark, in flat arrays (thirty thousand files stay cheap). */
export interface Marks {
  n: number
  gx: Float32Array
  gy: Float32Array
  kind: Uint8Array
  seed: Float32Array
  rot: Float32Array
  /** landmark tier (0 cathedral .. 3 chapel; 3 for everything else) and drawn size (1 = a plot) */
  tier: Uint8Array
  scale: Float32Array
  path: string[]
  plot: Plot[]
}

export interface Settlement {
  plot: Plot
  x: number                    // where its name goes
  y: number
  r: number                    // footprint radius (towns) or bank depth (river towns)
  n: number
  houses: number
  river: boolean
}

/** A river town's stretch of water: its centreline, and the way the water runs. */
export interface RiverTown { line: number[]; flow: [number, number] }

export interface Basin { plot: Plot; days: Plot[] }

export interface Towns {
  marks: Marks
  settlements: Settlement[]
  settleOf: Map<Plot, Settlement>
  riverTowns: Map<Plot, RiverTown>
  basins: Basin[]
}

interface File { path: string; name: string; k: KindT }

const isRiverTown = (p: Plot) => p.grains.length >= 3 && p.grains.filter((g) => STAMPED.test(g.name)).length / p.grains.length >= 0.5

export function layTowns(plots: Plot[], linkLike: (path: string) => boolean, coastOf: (p: Plot) => Float32Array): Towns {
  const riverPlots = new Set(plots.filter(isRiverTown))
  const flow = new Map<Plot, [number, number]>()
  const slot = new Map<Plot, number>()
  const upstream = new Map<Plot, number>()          // files a basin's river has passed before a day
  const basins: Basin[] = []
  for (const B of plots) {
    if (B.children.filter((c) => riverPlots.has(c)).length < 3) continue
    const days = stringBasin(B, coastOf(B), riverPlots, flow, slot)
    let passed = 0
    for (const d of days) { upstream.set(d, passed); passed += d.grains.length }
    basins.push({ plot: B, days })
  }

  const n = plots.reduce((s, p) => s + p.grains.length, 0)
  const marks: Marks = {
    n, gx: new Float32Array(n), gy: new Float32Array(n), kind: new Uint8Array(n), seed: new Float32Array(n),
    rot: new Float32Array(n), tier: new Uint8Array(n).fill(3), scale: new Float32Array(n).fill(1),
    path: new Array(n), plot: new Array(n),
  }
  const settlements: Settlement[] = []
  const settleOf = new Map<Plot, Settlement>()
  const riverTowns = new Map<Plot, RiverTown>()
  let next = 0
  const place = (p: Plot, f: File, x: number, y: number, rot: number): number => {
    const i = next++
    marks.gx[i] = x; marks.gy[i] = y; marks.kind[i] = f.k; marks.seed[i] = hash(f.path); marks.rot[i] = rot
    marks.path[i] = f.path; marks.plot[i] = p
    return i
  }
  for (const p of plots) {
    if (!p.grains.length) continue
    const files: File[] = p.grains.map((g) => ({ path: g.path, name: g.name, k: kindOf(g.path, linkLike(g.path)) }))
    const houses = files.filter((f) => DWELLING[f.k]).length
    const st = riverPlots.has(p)
      ? riverTown(p, files, flow.get(p), slot.get(p), upstream.get(p) ?? 0, place, riverTowns)
      : streetTown(p, files, place, marks)
    const s: Settlement = { plot: p, n: files.length, houses, ...st }
    settlements.push(s)
    settleOf.set(p, s)
  }
  return { marks, settlements, settleOf, riverTowns, basins }
}

/** Move a plot (and everything in it) on the map. */
function translate(p: Plot, dx: number, dy: number) {
  p.mx = plotX(p) + dx; p.my = plotY(p) + dy
  p.mlx = (p.mlx ?? p.lx) + dx; p.mly = (p.mly ?? p.ly) + dy
  for (const c of p.children) translate(c, dx, dy)
}

/** Re-string a basin's folders in name (date) order, row by row across a serpentine that walks
 *  from the basin toward its coast; each day's water runs along its row, turning each row. */
function stringBasin(B: Plot, coast: Float32Array, riverPlots: Set<Plot>, flow: Map<Plot, [number, number]>, slot: Map<Plot, number>): Plot[] {
  const [qx, qy] = nearestOn(coast, plotX(B), plotY(B))
  const ul = Math.hypot(qx - plotX(B), qy - plotY(B)) || 1
  const ux = (qx - plotX(B)) / ul, uy = (qy - plotY(B)) / ul, vx = -uy, vy = ux
  // the basin's own loose files (an index, a README) stand at the source as the first town
  const items: Array<Plot | null> = [...(B.lr > 0 && B.grains.length ? [null] : []), ...[...B.children].sort((a, b) => a.name.localeCompare(b.name))]
  const reach = items.map((c) => Math.max(CELL * 1.6, (c ? c.r : B.lr) * 0.8))
  const Rb = B.r * 0.9
  const placed: Array<{ p: Plot | null; a: number; b: number; dir: number; w: number }> = []
  let a = -Rb, i = 0, dir = 1
  while (i < items.length) {
    let h = 2 * reach[i]
    const chord = Math.max(Rb * 0.5, Math.sqrt(Math.max(0, Rb * Rb - (a + h / 2) ** 2)))
    const row: number[] = []
    let used = 0
    for (; i < items.length; i++) {
      const w = 2 * reach[i] * 1.04
      if (row.length && used + w > 2 * chord) break
      row.push(i); used += w; h = Math.max(h, 2 * reach[i])
    }
    let b = -used / 2
    for (const idx of row) {
      const w = 2 * reach[idx] * 1.04
      placed.push({ p: items[idx], a: a + h / 2, b: (b + w / 2) * dir, dir, w })
      b += w
    }
    a += h + CELL * 0.6
    dir = -dir
  }
  const shift = (a - Rb) / 2                    // centre the block on the basin
  for (const it of placed) {
    const nx = plotX(B) + ux * (it.a - shift) + vx * it.b
    const ny = plotY(B) + uy * (it.a - shift) + vy * it.b
    if (!it.p) { B.mlx = nx; B.mly = ny; continue }
    translate(it.p, nx - plotX(it.p), ny - plotY(it.p))
    flow.set(it.p, [vx * it.dir, vy * it.dir])
    slot.set(it.p, it.w)
  }
  return placed.map((q) => q.p).filter((p): p is Plot => !!p && riverPlots.has(p))
}

type Place = (p: Plot, f: File, x: number, y: number, rot: number) => number

/** A stretch of river through the folder, the files in name (time) order down both banks. */
function riverTown(p: Plot, files: File[], flowDir: [number, number] | undefined, slot: number | undefined, upstream: number, place: Place, out: Map<Plot, RiverTown>) {
  files.sort((a, b) => a.name.localeCompare(b.name))
  const cx = p.mlx!, cy = p.mly!, R = Math.max(p.lr, CELL * 1.5)
  const [ux, uy] = flowDir ?? [Math.cos(p.furrow), Math.sin(p.furrow)]
  const vx = -uy, vy = ux
  // a day in a basin keeps to its own stretch, so the river never doubles back between days
  const L = Math.min(Math.max(R * 1.75, CELL * 4), (slot ?? Infinity) * 0.92)
  // a gentle, irregular meander (two octaves of noise) that fades at both ends, so the river
  // meets its neighbours head on
  const A = Math.min(R * 0.14, CELL * 0.45), ph = hash(p.path + ':m') * 50
  const M = 28
  const line: number[] = []
  const arc = [0]
  for (let s = 0; s <= M; s++) {
    const t = s / M
    const wig = (vnoise(t * 3 + ph, ph, 1, 21) - 0.5) * 2 + (vnoise(t * 8 + ph, ph, 1, 22) - 0.5) * 0.7
    const off = A * wig * Math.sin(Math.PI * t)
    line.push(cx + ux * (t - 0.5) * L + vx * off, cy + uy * (t - 0.5) * L + vy * off)
    if (s) arc.push(arc[s - 1] + Math.hypot(line[s * 2] - line[s * 2 - 2], line[s * 2 + 1] - line[s * 2 - 1]))
  }
  out.set(p, { line, flow: [ux, uy] })
  const S = arc[M]
  const rows = Math.max(1, Math.ceil(files.length / (2 * Math.max(1, Math.floor(S / CELL)))))
  const stations = Math.ceil(files.length / (2 * rows))
  const along = (dist: number): [number, number] => {
    let s = 1
    while (s < M && arc[s] < dist) s++
    const u = (dist - arc[s - 1]) / Math.max(1e-6, arc[s] - arc[s - 1])
    return [line[s * 2 - 2] + (line[s * 2] - line[s * 2 - 2]) * u, line[s * 2 - 1] + (line[s * 2 + 1] - line[s * 2 - 1]) * u]
  }
  // the front row stands clear of the water as wide as the river will be by the town's end
  // (with the meander), set off square to the river's general course so rows stay parallel
  const front = Math.max(CELL * 0.95, widthOf(upstream + files.length) / 2 + A + CELL * 0.5)
  files.forEach((f, i) => {
    const st = Math.floor(i / (2 * rows)), q = i % (2 * rows)
    const off = (q % 2 ? 1 : -1) * (front + Math.floor(q / 2) * CELL)
    const [x, y] = along(((st + 0.5) / stations) * S)
    place(p, f, x + vx * off + (hash(f.path) - 0.5) * CELL * 0.15, y + vy * off, Math.atan2(uy, ux))
  })
  const [mx, my] = along(S / 2)
  return { x: mx, y: my, r: front + (rows - 0.4) * CELL, river: true }
}

/** A town on a street grid at the folder's loose-file disc, filling from its middle outward. */
function streetTown(p: Plot, files: File[], place: Place, marks: Marks) {
  files.sort((a, b) => KIND_RANK[a.k] - KIND_RANK[b.k] || a.name.localeCompare(b.name))
  const cx = p.mlx!, cy = p.mly!
  const lots = townLots(p, files)
  const used = new Uint8Array(lots.length)
  // a README's landmark is grander the nearer its folder stands to the root
  const tier = p.path === '' ? 0 : p.depth === 0 ? 1 : p.depth === 1 ? 2 : 3
  let core = 0, coreKey = -Infinity, any = 0
  let sx = 0, sy = 0, far = 0
  for (const f of files) {
    let li = -1
    if (BUILT[f.k]) {
      // buildings take the next lot off the street, from the middle out
      while (core < lots.length && (used[core] || lots[core].street)) core++
      if (core < lots.length) { li = core; coreKey = lots[core].key }
    } else {
      // the ground between: the first free lot, streets inside the built core excepted
      li = lots.findIndex((l, q) => !used[q] && !(l.street && l.key <= coreKey))
    }
    if (li < 0) {
      while (any < lots.length && used[any]) any++
      li = Math.min(any, lots.length - 1)
    }
    used[li] = 1
    const lot = lots[li]
    if (f.k === Kind.Landmark) {
      // the landmark keeps the lots around it clear, as a square keeps the houses back
      const clear = (TIER_SCALE[tier] - 0.55) * CELL * 0.95
      lots.forEach((l, q) => { if (!used[q] && Math.hypot(l.x - lot.x, l.y - lot.y) < clear) used[q] = 1 })
    }
    const h = hash(f.path)
    const jit = BUILT[f.k] || f.k === Kind.Tree || f.k === Kind.Stone ? 0.14 : 0
    const x = lot.x + (h - 0.5) * CELL * jit, y = lot.y + (lot.h - 0.5) * CELL * jit
    const i = place(p, f, x, y, p.furrow)
    if (f.k === Kind.Landmark) { marks.tier[i] = tier; marks.scale[i] = TIER_SCALE[tier] }
    sx += x; sy += y
    far = Math.max(far, Math.hypot(x - cx, y - cy))
  }
  return { x: sx / files.length, y: sy / files.length, r: far + CELL * 0.8, river: false }
}

interface Lot { x: number; y: number; key: number; street: boolean; h: number; d: number }

/** The lots of a town: a grid turned to the folder's bearing, ranked from the middle along an
 *  irregular edge, with streets crossing the core. Kept within the folder's own ground (half a
 *  plot in from its rim, as neighbouring rims touch) unless it is too small to hold its files. */
function townLots(p: Plot, files: File[]): Lot[] {
  const cx = p.mlx!, cy = p.mly!, R = Math.max(p.lr, CELL * 1.5)
  const c = Math.cos(p.furrow), s = Math.sin(p.furrow)
  const N = Math.ceil((1.7 * R) / CELL) + 2
  const ph1 = hash(p.path + ':1') * 6.283, ph2 = hash(p.path + ':2') * 6.283, ph3 = hash(p.path + ':3') * 6.283
  const streetI = Math.floor(hash(p.path + ':s') * 5)
  const lots: Lot[] = []
  for (let i = -N; i <= N; i++) {
    for (let j = -N; j <= N; j++) {
      const lx = i * CELL, ly = j * CELL, d = Math.hypot(lx, ly)
      if (d > 1.7 * R) continue
      const ang = Math.atan2(ly, lx)
      const wob = 0.12 * Math.sin(3 * ang + ph1) + 0.08 * Math.sin(5 * ang + ph2) + 0.06 * Math.sin(2 * ang + ph3)
      const h = hash(`${p.path}#${i},${j}`)
      lots.push({
        x: cx + lx * c - ly * s, y: cy + lx * s + ly * c,
        key: d / (1 + wob) + (h - 0.5) * CELL * 1.1 * Math.min(1, files.length / 12),
        street: d < R * 0.6 && (((j % 3) + 3) % 3 === 2 || (((i + streetI) % 5) + 5) % 5 === 4),
        h, d,
      })
    }
  }
  lots.sort((a, b) => a.d - b.d)
  const need = Math.ceil(files.length * 1.2) + (files.some((f) => f.k === Kind.Landmark) ? 14 : 0)
  const reach = Math.max(R - CELL * 0.5, lots[Math.min(lots.length - 1, need)].d)
  return lots.filter((l) => l.d <= reach).sort((a, b) => a.key - b.key)
}
