// The map view's land, worked out once per tree. It starts from the bubble layout (same regions,
// same rooms, same folders in the same places) and redraws what is inside them as an atlas would:
//
//   - each folder's loose files become a settlement on a street grid: pages are houses at the
//     core, scripts and foreign code are mills and workshops around them, grain's own code is
//     the farmland beyond, data stands as stones and media grows as trees at the edge;
//   - a folder of filename-stamped files (a run of dated logs) is a river town: the files line
//     both banks in time order and the river runs through them; a folder of such day-folders is
//     a basin, its days re-strung along one river that flows by time down to the sea;
//   - rivers rise at springs in the high ground, find their way downhill (steered by the same
//     height field the relief is drawn from), round the towns, and widen with every file they
//     have passed; other dated folders and the deep sub-folders of a river's room join it as
//     tributaries, and where water cannot reach the sea it pools in a lake;
//   - roads join each folder's settlement to its sub-folders' (the tree, walked as a road net);
//   - each region's coast is roughened, with a few islets offshore.
//
// Everything is derived from paths alone and hashed, so the same tree draws the same map, and a
// grown tree grows the map: new files extend their settlement, new folders found new ones.

import type { Entry } from '@/grain/repo'
import { hash, type Plot, type World, type RegionLand } from './layout'
import { Kind, kindOf, KIND_RANK, BUILT, DWELLING, TIER_SCALE } from './glyphs'

/** World size of one file's plot on the map. */
export const CELL = 8.6
const STAMPED = /^(?:\d{8}[-_.]\d{6}|\d{8}[-_])/

export interface River {
  pts: Float32Array            // x, y pairs, source to mouth
  cum: Float32Array            // files the water has passed at each point
  w: Float32Array              // width (world) at each point, from cum
  box: [number, number, number, number]
  name: string
  main: boolean                // a basin's river (or a tributary)
}

export interface Lake {
  pts: Float32Array            // the shoreline, closed
  islands: Float32Array[]
  box: [number, number, number, number]
  x: number
  y: number
  r: number
  name: string
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

/** A stroke of occupied ground. Soft ones (roads) only keep relief off their own line; hard ones
 *  (towns, rivers) also cap how big a peak may stand beside them. */
interface Capsule { ax: number; ay: number; bx: number; by: number; r: number; soft?: boolean }

/** A uniform hash grid of small integer ids. */
export class Grid {
  private m = new Map<number, number[]>()
  constructor(readonly cell: number) {}
  private key(i: number, j: number) { return (i + 32768) * 65536 + (j + 32768) }
  add(id: number, x0: number, y0: number, x1: number, y1: number) {
    const c = this.cell
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) {
      for (let j = Math.floor(y0 / c); j <= Math.floor(y1 / c); j++) {
        const k = this.key(i, j)
        let a = this.m.get(k)
        if (!a) { a = []; this.m.set(k, a) }
        a.push(id)
      }
    }
  }
  /** Calls fn for each id in the cells over a box (an id spanning cells may come more than once). */
  each(x0: number, y0: number, x1: number, y1: number, fn: (id: number) => void) {
    const c = this.cell
    const i0 = Math.floor(x0 / c), i1 = Math.floor(x1 / c), j0 = Math.floor(y0 / c), j1 = Math.floor(y1 / c)
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.m.get(this.key(i, j))
      if (a) for (let q = 0; q < a.length; q++) fn(a[q])
    }
  }
}

export interface Atlas {
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
  glyphPlot: Plot[]
  glyphs: Grid
  plots: Plot[]                        // every folder, parents before children
  height: Map<Plot, number>            // levels of folders beneath
  settlements: Settlement[]
  settleOf: Map<Plot, Settlement>
  rivers: River[]
  lakes: Lake[]
  roads: Float32Array[]
  roadBox: Array<[number, number, number, number]>
  capsules: Capsule[]
  zones: Grid                          // capsules, for keeping relief off towns, rivers and roads
  coastPts: Float32Array[]             // per land (world.regions order), roughened
  islets: Array<{ pts: Float32Array; box: [number, number, number, number]; land: number }>
  landBox: Array<[number, number, number, number]>
  index: Map<string, { x: number; y: number; r: number }>
  rose: { x: number; y: number }
  cartouche: { x: number; y: number }
  bounds: { x0: number; y0: number; x1: number; y1: number }
  world: World
}

// ---------------------------------------------------------------- helpers

const mx = (p: Plot) => p.mx ?? p.x
const my = (p: Plot) => p.my ?? p.y

function translate(p: Plot, dx: number, dy: number) {
  p.mx = mx(p) + dx; p.my = my(p) + dy
  p.mlx = (p.mlx ?? p.lx) + dx; p.mly = (p.mly ?? p.ly) + dy
  for (const c of p.children) translate(c, dx, dy)
}

function roughen(hull: Array<[number, number]>, seed: string, depth: number, amp: number): Float32Array {
  let cur: number[] = hull.flatMap(([x, y]) => [x, y])
  for (let d = 0; d < depth; d++) {
    const n = cur.length / 2
    const next: number[] = []
    for (let i = 0; i < n; i++) {
      const ax = cur[i * 2], ay = cur[i * 2 + 1]
      const j = (i + 1) % n
      const bx = cur[j * 2], by = cur[j * 2 + 1]
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1
      const off = (hash(`${seed}:${d}:${i}`) - 0.5) * 2 * amp * len
      next.push(ax, ay, (ax + bx) / 2 - (dy / len) * off, (ay + by) / 2 + (dx / len) * off)
    }
    cur = next
  }
  return Float32Array.from(cur)
}

function boxOf(pts: Float32Array, pad = 0): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i], y = pts[i + 1]
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]
}

function nearestOn(pts: Float32Array, x: number, y: number): [number, number] {
  let bd = Infinity, bx = x, by = y
  for (let i = 0; i < pts.length; i += 2) {
    const d = (pts[i] - x) ** 2 + (pts[i + 1] - y) ** 2
    if (d < bd) { bd = d; bx = pts[i]; by = pts[i + 1] }
  }
  return [bx, by]
}

function cubic(out: number[], ax: number, ay: number, b1x: number, b1y: number, b2x: number, b2y: number, cx: number, cy: number, n: number) {
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t
    out.push(
      u * u * u * ax + 3 * u * u * t * b1x + 3 * u * t * t * b2x + t * t * t * cx,
      u * u * u * ay + 3 * u * u * t * b1y + 3 * u * t * t * b2y + t * t * t * cy,
    )
  }
}

/** Radius of a land's (unroughened) coast in the direction of a point: hulls are radial. */
export function coastReach(land: RegionLand, x: number, y: number): number {
  const n = land.hull.length
  let t = Math.atan2(y - land.y, x - land.x) / (Math.PI * 2)
  if (t < 0) t += 1
  const f = t * n, i = Math.floor(f) % n, j = (i + 1) % n, u = f - Math.floor(f)
  const a = land.hull[i], b = land.hull[j]
  const ra = Math.hypot(a[0] - land.x, a[1] - land.y), rb = Math.hypot(b[0] - land.x, b[1] - land.y)
  return ra + (rb - ra) * u
}

/** A cheap integer hash to 0..1 for lattice cells. */
export function ih(i: number, j: number, o: number): number {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(o | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise, 0..1, on a lattice of the given size. */
export function vnoise(x: number, y: number, size: number, o: number): number {
  const fx = x / size, fy = y / size
  const i = Math.floor(fx), j = Math.floor(fy)
  const u = fx - i, v = fy - j
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v)
  const a = ih(i, j, o), b = ih(i + 1, j, o), c = ih(i, j + 1, o), d = ih(i + 1, j + 1, o)
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv
}

/** What the height field needs: the world, how deep each folder runs, and each land's box. */
export interface Terrain { world: World; height: Map<Plot, number>; landBox: Array<[number, number, number, number]> }

/** How high a folder's open ground stands: folders beneath raise it, and so does sheer size. */
export function plotBase(T: Terrain, P: Plot): number {
  const height = T.height.get(P) ?? 0
  return height * 0.75 + Math.max(0, Math.log10(Math.max(1, P.files)) - 1.3) * 0.55 + (P.depth === 0 ? 0.1 : 0)
}

/** The height of the land at a point (0 lowland, 1 hills, 2 and up mountains), the clear ground
 *  around it before the next folder's rim, and which land it is on; null at sea or in the surf. */
export function elevAt(T: Terrain, x: number, y: number): { e: number; clear: number; li: number } | null {
  const world = T.world
  for (let li = 0; li < world.regions.length; li++) {
    const b = T.landBox[li]
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue
    const land = world.regions[li]
    const d = Math.hypot(x - land.x, y - land.y)
    const coast = coastReach(land, x, y) - 40 - d
    if (coast < 0) continue
    let P: Plot | undefined
    for (const room of land.rooms) if (Math.hypot(x - mx(room), y - my(room)) < room.r) { P = room; break }
    let clear = coast, e = 0
    if (!P) {
      // open country: foothills spill a little way out from a high room, woods beyond
      for (const room of land.rooms) {
        const out = Math.hypot(x - mx(room), y - my(room)) - room.r
        clear = Math.min(clear, out)
        const t = 1 - Math.min(1, Math.max(0, out / (room.r * 0.35 + 60)))
        e = Math.max(e, plotBase(T, room) * 0.4 * t * t * (3 - 2 * t))
      }
    } else {
      const room = P
      for (;;) {
        let next: Plot | undefined
        for (const c of P.children) if (Math.hypot(x - mx(c), y - my(c)) < c.r) { next = c; break }
        if (!next) break
        P = next
      }
      // the rim of a folder only halves its height, so no circle shows where it ends
      const rim = P.r - Math.hypot(x - mx(P), y - my(P))
      let inner = Infinity
      for (const c of P.children) inner = Math.min(inner, Math.hypot(x - mx(c), y - my(c)) - c.r)
      clear = Math.min(clear, inner)
      const ramp = CELL * 2.5 + P.r * 0.1
      const t = Math.max(0, Math.min(1, inner / ramp)), u = Math.max(0, Math.min(1, rim / (ramp * 2)))
      e = plotBase(T, P) * t * t * (3 - 2 * t) * (0.5 + 0.5 * u * u * (3 - 2 * u))
      if (P.depth > 0) e = Math.max(e, plotBase(T, room) * 0.5 * (1 - u))
    }
    // ranges and valleys: the height swells and falls across the land
    const sw = vnoise(x, y, 340, 9) * 0.7 + vnoise(x, y, 110, 10) * 0.3
    e *= 0.25 + 1.5 * sw * sw
    return { e, clear, li }
  }
  return null
}

/** Corner-cutting (Chaikin), twice: a traced course becomes a flowing curve; ends stay put. */
function smooth(pts: number[], rounds = 2): number[] {
  let cur = pts
  for (let r = 0; r < rounds; r++) {
    const n = cur.length / 2
    if (n < 3) return cur
    const out = [cur[0], cur[1]]
    for (let i = 0; i < n - 1; i++) {
      const ax = cur[i * 2], ay = cur[i * 2 + 1], bx = cur[i * 2 + 2], by = cur[i * 2 + 3]
      out.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75)
    }
    out.push(cur[cur.length - 2], cur[cur.length - 1])
    cur = out
  }
  return cur
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---------------------------------------------------------------- the build

export function buildAtlas(world: World, entries: Map<string, Entry>): Atlas {
  const plots: Plot[] = []
  const height = new Map<Plot, number>()
  const landOf = new Map<Plot, number>()
  const heightOf = (p: Plot): number => {
    let h = 0
    for (const c of p.children) h = Math.max(h, heightOf(c) + 1)
    height.set(p, h)
    return h
  }
  world.regions.forEach((land, li) => {
    const walk = (p: Plot) => {
      p.mx = p.x; p.my = p.y; p.mlx = p.lx; p.mly = p.ly
      plots.push(p); landOf.set(p, li)
      p.children.forEach(walk)
    }
    land.rooms.forEach((r) => { walk(r); heightOf(r) })
  })

  // coasts, roughened like a surveyed shore
  const coastPts = world.regions.map((land) => roughen(land.hull, land.region.id, 4, 0.15))
  const landBox = coastPts.map((p) => boxOf(p))

  const isRiver = (p: Plot) => {
    if (p.grains.length < 3) return false
    let s = 0
    for (const g of p.grains) if (STAMPED.test(g.name)) s++
    return s / p.grains.length >= 0.5
  }
  const riverPlots = new Set(plots.filter(isRiver))
  const flow = new Map<Plot, [number, number]>()           // a river town's downstream bearing
  const slot = new Map<Plot, number>()                     // and, in a basin, the length of its stretch
  const basins: Array<{ plot: Plot; order: Plot[] }> = []

  // basins: re-string their dated folders along a serpentine that walks toward the coast
  for (const B of plots) {
    const kids = B.children.filter((c) => riverPlots.has(c))
    if (kids.length < 3) continue
    const li = landOf.get(B)!
    const [qx, qy] = nearestOn(coastPts[li], mx(B), my(B))
    let ux = qx - mx(B), uy = qy - my(B)
    const ul = Math.hypot(ux, uy) || 1
    ux /= ul; uy /= ul
    const vx = -uy, vy = ux
    // the basin's own loose files (an index, a README) stand at the source as the first town
    const items: Array<Plot | null> = [...(B.lr > 0 && B.grains.length ? [null] : []), ...[...B.children].sort((a, b) => a.name.localeCompare(b.name))]
    const re = items.map((c) => Math.max(CELL * 1.6, (c ? c.r : B.lr) * 0.8))
    const Rb = B.r * 0.9
    const placed: Array<{ p: Plot | null; a: number; b: number; dir: number }> = []
    let a = -Rb, i = 0, dir = 1
    while (i < items.length) {
      let h = 2 * re[i]
      const ac = a + h / 2
      const chord = Math.max(Rb * 0.5, Math.sqrt(Math.max(0, Rb * Rb - ac * ac)))
      const row: number[] = []
      let used = 0
      while (i < items.length) {
        const w = 2 * re[i] * 1.04
        if (row.length && used + w > 2 * chord) break
        row.push(i); used += w; h = Math.max(h, 2 * re[i]); i++
      }
      let b = -used / 2
      for (const idx of row) {
        const w = 2 * re[idx] * 1.04
        placed.push({ p: items[idx], a: a + h / 2, b: (b + w / 2) * dir, dir })
        b += w
      }
      a += h + CELL * 0.6
      dir = -dir
    }
    const shift = (a - Rb) / 2       // centre the block on the basin
    for (const it of placed) {
      const nx = mx(B) + ux * (it.a - shift) + vx * it.b
      const ny = my(B) + uy * (it.a - shift) + vy * it.b
      if (!it.p) { B.mlx = nx; B.mly = ny; continue }
      translate(it.p, nx - mx(it.p), ny - my(it.p))
      flow.set(it.p, [vx * it.dir, vy * it.dir])
      slot.set(it.p, 2 * re[items.indexOf(it.p)] * 1.04)
    }
    basins.push({ plot: B, order: placed.map((q) => q.p).filter((p): p is Plot => !!p && riverPlots.has(p)) })
  }

  // ---- files
  let total = 0
  for (const p of plots) total += p.grains.length
  const gx = new Float32Array(total), gy = new Float32Array(total)
  const kind = new Uint8Array(total), seed = new Float32Array(total), rot = new Float32Array(total)
  const tier = new Uint8Array(total).fill(3), scale = new Float32Array(total).fill(1)
  const path: string[] = new Array(total)
  const glyphPlot: Plot[] = new Array(total)
  const settlements: Settlement[] = []
  const settleOf = new Map<Plot, Settlement>()
  const capsules: Capsule[] = []
  const riverLine = new Map<Plot, number[]>()              // centreline per river town
  let gi = 0

  for (const p of plots) {
    if (!p.grains.length) continue
    const files = p.grains.map((g) => {
      const e = entries.get(g.path)
      return { path: g.path, name: g.name, k: kindOf(g.path, e?.kind === 'link' || e?.kind === 'module') }
    })
    const cx = p.mlx!, cy = p.mly!, R = Math.max(p.lr, CELL * 1.5)
    let houses = 0
    for (const f of files) if (DWELLING[f.k]) houses++
    // a README's landmark is grander the nearer its folder stands to the root
    const ptier = p.path === '' ? 0 : p.depth === 0 ? 1 : p.depth === 1 ? 2 : 3

    if (riverPlots.has(p)) {
      // a river town: files in name (time) order down both banks
      files.sort((a, b) => a.name.localeCompare(b.name))
      const n = files.length
      const f = flow.get(p) ?? [Math.cos(p.furrow), Math.sin(p.furrow)]
      const ux = f[0], uy = f[1], vx = -uy, vy = ux
      // a day in a basin keeps to its own stretch, so the river never doubles back between days
      const L = Math.min(Math.max(R * 1.75, CELL * 4), (slot.get(p) ?? Infinity) * 0.92)
      // a gentle, irregular meander (two octaves of noise), kept inside the first row of houses
      const A = Math.min(R * 0.14, CELL * 0.45), ph = hash(p.path + ':m') * 50
      const M = 28
      const line: number[] = []
      const arc: number[] = [0]
      for (let s = 0; s <= M; s++) {
        const t = s / M
        // the meander fades at both ends so the river meets its neighbours head on
        const wig = (vnoise(t * 3 + ph, ph, 1, 21) - 0.5) * 2 + (vnoise(t * 8 + ph, ph, 1, 22) - 0.5) * 0.7
        const off = A * wig * Math.sin(Math.PI * t)
        line.push(cx + ux * (t - 0.5) * L + vx * off, cy + uy * (t - 0.5) * L + vy * off)
        if (s) arc.push(arc[s - 1] + Math.hypot(line[s * 2] - line[s * 2 - 2], line[s * 2 + 1] - line[s * 2 - 1]))
      }
      riverLine.set(p, line)
      const S = arc[M]
      const cap = Math.max(1, Math.floor(S / CELL))
      const rows = Math.max(1, Math.ceil(n / (2 * cap)))
      const stations = Math.ceil(n / (2 * rows))
      // banks are set off square to the river's general course, not its every wiggle, so rows
      // of houses stay parallel through the bends
      const at = (dist: number): [number, number, number, number] => {
        let s = 1
        while (s < M && arc[s] < dist) s++
        const u = (dist - arc[s - 1]) / Math.max(1e-6, arc[s] - arc[s - 1])
        const x = line[s * 2 - 2] + (line[s * 2] - line[s * 2 - 2]) * u
        const y = line[s * 2 - 1] + (line[s * 2 + 1] - line[s * 2 - 1]) * u
        return [x, y, vx, vy]
      }
      files.forEach((file, i) => {
        const st = Math.floor(i / (2 * rows)), q = i % (2 * rows)
        const side = q % 2 ? 1 : -1, row = Math.floor(q / 2)
        const [x, y, nx, ny] = at(((st + 0.5) / stations) * S)
        const off = side * (CELL * 0.95 + row * CELL)
        const h = hash(file.path)
        gx[gi] = x + nx * off + (h - 0.5) * CELL * 0.15
        gy[gi] = y + ny * off
        kind[gi] = file.k; seed[gi] = h; rot[gi] = Math.atan2(uy, ux); path[gi] = file.path; glyphPlot[gi] = p
        gi++
      })
      const depth = (rows + 0.6) * CELL
      for (let s = 0; s < M; s++) capsules.push({ ax: line[s * 2], ay: line[s * 2 + 1], bx: line[s * 2 + 2], by: line[s * 2 + 3], r: depth })
      const mid = at(S * 0.5)
      const st: Settlement = { plot: p, x: mid[0], y: mid[1], r: depth, n, houses, river: true }
      settlements.push(st); settleOf.set(p, st)
      continue
    }

    // a town on a street grid, filling outward from its middle along an irregular edge
    files.sort((a, b) => KIND_RANK[a.k] - KIND_RANK[b.k] || a.name.localeCompare(b.name))
    const th = p.furrow, c = Math.cos(th), s = Math.sin(th)
    const N = Math.ceil((1.7 * R) / CELL) + 2
    const ph1 = hash(p.path + ':1') * 6.283, ph2 = hash(p.path + ':2') * 6.283, ph3 = hash(p.path + ':3') * 6.283
    const streetI = Math.floor(hash(p.path + ':s') * 5)
    const cand: Array<{ x: number; y: number; key: number; street: boolean; h: number; d: number }> = []
    for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
      const lx = i * CELL, ly = j * CELL
      const d = Math.hypot(lx, ly)
      if (d > 1.7 * R) continue
      const ang = Math.atan2(ly, lx)
      const wob = 0.12 * Math.sin(3 * ang + ph1) + 0.08 * Math.sin(5 * ang + ph2) + 0.06 * Math.sin(2 * ang + ph3)
      const h = hash(`${p.path}#${i},${j}`)
      cand.push({
        x: cx + lx * c - ly * s, y: cy + lx * s + ly * c,
        key: d / (1 + wob) + (h - 0.5) * CELL * 1.1 * Math.min(1, files.length / 12),
        // streets cross the town's core; its outskirts are built plot to plot
        street: d < R * 0.6 && (((j % 3) + 3) % 3 === 2 || ((i + streetI) % 5 + 5) % 5 === 4),
        h, d,
      })
    }
    // keep within the folder's own ground, reaching further only if it is too small to hold them
    cand.sort((a, b) => a.d - b.d)
    // (half a plot in from the rim, as neighbouring folders' rims touch)
    const reach = Math.max(R - CELL * 0.5, cand[Math.min(cand.length - 1, Math.ceil(files.length * 1.2) + (files.some((f) => f.k === Kind.Landmark) ? 14 : 0))].d)
    for (let q = cand.length - 1; q >= 0 && cand[q].d > reach; q--) cand.pop()
    cand.sort((a, b) => a.key - b.key)
    const used = new Uint8Array(cand.length)
    let tp = 0, townKey = -Infinity
    let sx = 0, sy = 0, far = 0
    let anyp = 0
    for (const file of files) {
      let ci = -1
      if (BUILT[file.k]) {
        while (tp < cand.length && (used[tp] || cand[tp].street)) tp++
        ci = tp < cand.length ? tp : -1
        if (ci >= 0) townKey = cand[ci].key
      } else {
        for (let q = 0; q < cand.length; q++) {
          if (used[q] || (cand[q].street && cand[q].key <= townKey)) continue
          ci = q; break
        }
      }
      // out of the cells it would choose: the nearest free one of any sort
      if (ci < 0) {
        while (anyp < cand.length && used[anyp]) anyp++
        ci = Math.min(anyp, cand.length - 1)
      }
      used[ci] = 1
      const C = cand[ci]
      if (file.k === Kind.Landmark) {
        // the landmark keeps the plots around it clear, as a square keeps the houses back
        const clear = (TIER_SCALE[ptier] - 0.55) * CELL * 0.95
        for (let q = 0; q < cand.length; q++) if (!used[q] && Math.hypot(cand[q].x - C.x, cand[q].y - C.y) < clear) used[q] = 1
        tier[gi] = ptier; scale[gi] = TIER_SCALE[ptier]
      }
      const h = hash(file.path)
      const jit = BUILT[file.k] || file.k === Kind.Tree || file.k === Kind.Stone ? 0.14 : 0
      const x = C.x + (h - 0.5) * CELL * jit, y = C.y + (C.h - 0.5) * CELL * jit
      gx[gi] = x; gy[gi] = y; kind[gi] = file.k; seed[gi] = h; rot[gi] = th; path[gi] = file.path; glyphPlot[gi] = p
      sx += x; sy += y
      far = Math.max(far, Math.hypot(x - cx, y - cy))
      gi++
    }
    const n = files.length
    const r = far + CELL * 0.8
    capsules.push({ ax: cx, ay: cy, bx: cx, by: cy, r })
    const st: Settlement = { plot: p, x: sx / n, y: sy / n, r, n, houses, river: false }
    settlements.push(st); settleOf.set(p, st)
  }

  // ---- rivers and lakes
  const terrain: Terrain = { world, height, landBox }
  const E = (x: number, y: number) => elevAt(terrain, x, y)?.e ?? -0.5
  // the towns (and river towns) as they stand now: water finds its way round them
  const hard = new Grid(64)
  const townCaps = capsules.slice()
  townCaps.forEach((c, i) => hard.add(i, Math.min(c.ax, c.bx) - c.r, Math.min(c.ay, c.by) - c.r, Math.max(c.ax, c.bx) + c.r, Math.max(c.ay, c.by) + c.r))
  const clearAt = (x: number, y: number, reach = CELL * 3) => {
    let best = reach
    hard.each(x - reach, y - reach, x + reach, y + reach, (id) => {
      const c = townCaps[id]
      const dx = c.bx - c.ax, dy = c.by - c.ay, l2 = dx * dx + dy * dy
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - c.ax) * dx + (y - c.ay) * dy) / l2)) : 0
      best = Math.min(best, Math.hypot(x - (c.ax + dx * t), y - (c.ay + dy * t)) - c.r)
    })
    return best
  }

  /** A watercourse from a to b: it heads for b, but runs downhill where it can, swings round
   *  towns, carries its momentum and wanders in long irregular bends. */
  const trace = (ax: number, ay: number, bx: number, by: number, key: string, calm = 0): number[] => {
    const step = CELL * 1.1, hh = CELL * 2
    const direct = Math.hypot(bx - ax, by - ay)
    const wander = (pts: number[]) => {
      let L = 0
      for (let i = 2; i < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1])
      return L / Math.max(direct, CELL)
    }
    const again = (pts: number[]) => (calm < 2 && wander(pts) > 1.7 ? trace(ax, ay, bx, by, key + '~', calm + 1) : pts)
    const out = [ax, ay]
    let x = ax, y = ay, hx = 0, hy = 0
    const maxSteps = Math.ceil((Math.hypot(bx - ax, by - ay) / step) * 2.5) + 12
    const ph = hash(key) * 97
    for (let k = 0; k < maxSteps; k++) {
      const dx = bx - x, dy = by - y, d = Math.hypot(dx, dy)
      if (d < step * 1.3) { out.push(bx, by); return again(smooth(out)) }
      let vx = dx / d, vy = dy / d
      const pull = Math.min(1, d / (CELL * 10))
      const gx = E(x + hh, y) - E(x - hh, y), gy = E(x, y + hh) - E(x, y - hh), gl = Math.hypot(gx, gy)
      if (gl > 1e-4) { vx -= (gx / gl) * 0.7 * pull; vy -= (gy / gl) * 0.7 * pull }
      if (calm < 2 && k >= 3 && d > step * 4 && clearAt(x + vx * step * 1.5, y + vy * step * 1.5) < CELL * 0.8) {
        const cx = clearAt(x + hh, y) - clearAt(x - hh, y), cy = clearAt(x, y + hh) - clearAt(x, y - hh), cl = Math.hypot(cx, cy) || 1
        vx += (cx / cl) * 1.3; vy += (cy / cl) * 1.3
      }
      vx += hx * 0.8; vy += hy * 0.8
      const m = (vnoise(k * 0.18 + ph, ph, 1, 31) - 0.5) * (1.6 - calm * 0.6) * pull
      const c = Math.cos(m), sn = Math.sin(m)
      let nx = vx * c - vy * sn, ny = vx * sn + vy * c
      const nl = Math.hypot(nx, ny) || 1
      nx /= nl; ny /= nl
      hx = nx; hy = ny
      x += nx * step; y += ny * step
      out.push(x, y)
    }
    out.push(bx, by)
    return again(smooth(out))
  }

  /** Where a river rises: the highest open ground behind (upstream of) a point. */
  const springOf = (x: number, y: number, ux: number, uy: number, r0: number, r1: number, key: string): [number, number] => {
    let best: [number, number] = [x - ux * r0, y - uy * r0], be = -Infinity
    const back = Math.atan2(-uy, -ux)
    for (let i = 0; i < 20; i++) {
      const a = back + (hash(`${key}:a${i}`) - 0.5) * 2.4, r = r0 + hash(`${key}:r${i}`) * (r1 - r0)
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r
      const g = elevAt(terrain, px, py)
      if (!g || clearAt(px, py) < CELL * 0.6) continue
      if (g.e > be) { be = g.e; best = [px, py] }
    }
    return best
  }

  const lakes: Lake[] = []
  /** Where water pools: the lowest open ground ahead, with room for a lake of radius r. */
  const poolOf = (x: number, y: number, ux: number, uy: number, r: number, key: string): { x: number; y: number; r: number } => {
    let best = { x: x + ux * r * 2, y: y + uy * r * 2, r: r * 0.5 }, be = Infinity
    const ahead = Math.atan2(uy, ux)
    for (let i = 0; i < 24; i++) {
      const a = ahead + (hash(`${key}:p${i}`) - 0.5) * 2.2, dist = r * (1.8 + hash(`${key}:q${i}`) * 2.4)
      const px = x + Math.cos(a) * dist, py = y + Math.sin(a) * dist
      const g = elevAt(terrain, px, py)
      if (!g) continue
      const room = Math.min(clearAt(px, py, r * 2.5), g.clear)
      // the shore reaches about twice the radius at its longest lobe: keep all of it on land
      if (room < r) continue
      const score = g.e - Math.min(room, 2 * r) / r * 0.3
      if (score < be) { be = score; best = { x: px, y: py, r: Math.min(r, room * 0.5) } }
    }
    return best
  }

  /** An organic shoreline: an irregular lobed ring (noise around the angle, two or three broad
   *  lobes), set crosswise to the water coming in so a river meets its long side, with inlets
   *  bitten into it and an island or two when it is large. */
  const makeLake = (cx: number, cy: number, r: number, inflow: number, key: string, name: string): Lake => {
    const N = 64, ring: Array<[number, number]> = []
    const ph = hash(key + ':ph') * 40
    const lobes = 2 + Math.floor(hash(key + ':l') * 2)
    const f1 = hash(key + ':1') * 6.28, f2 = hash(key + ':2') * 6.28
    const inlets = Array.from({ length: 2 + Math.floor(hash(key + ':n') * 3) }, (_, i) => [hash(`${key}:i${i}`) * 6.28, 0.18 + hash(`${key}:d${i}`) * 0.22])
    const ang = inflow + Math.PI / 2 + (hash(key + ':a') - 0.5) * 0.8
    const ca = Math.cos(ang), sa = Math.sin(ang)
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2
      const nz = vnoise(Math.cos(t) * 2.2 + ph, Math.sin(t) * 2.2 + ph, 1, 41) - 0.5
      let rr = r * (1 + 0.22 * Math.sin(lobes * t + f1) + 0.1 * Math.sin((lobes + 2) * t + f2) + 0.45 * nz)
      for (const [a, dep] of inlets) {
        let dt = Math.abs(t - a) % (Math.PI * 2)
        if (dt > Math.PI) dt = Math.PI * 2 - dt
        rr *= 1 - dep * Math.exp(-((dt / 0.13) ** 2))
      }
      // small waters are rounder; big ones stretch out
      const st = Math.min(1, r / (CELL * 4))
      const lx = Math.cos(t) * rr * (1.1 + 0.25 * st), ly = Math.sin(t) * rr * (0.9 - 0.18 * st)
      ring.push([cx + lx * ca - ly * sa, cy + lx * sa + ly * ca])
    }
    const pts = roughen(ring, key, 2, 0.12)
    const islands: Float32Array[] = []
    const count = r > CELL * 4.5 ? 2 : r > CELL * 2.6 ? 1 : 0
    for (let k = 0; k < count; k++) {
      const a = hash(`${key}:ia${k}`) * 6.28, off = r * (0.15 + 0.25 * hash(`${key}:io${k}`)), ir = r * (0.1 + 0.07 * hash(`${key}:ir${k}`))
      const ix = cx + (Math.cos(a) * off * 1.2) * ca - (Math.sin(a) * off * 0.6) * sa, iy = cy + (Math.cos(a) * off * 1.2) * sa + (Math.sin(a) * off * 0.6) * ca
      const isl: Array<[number, number]> = []
      for (let q = 0; q < 9; q++) {
        const t = (q / 9) * Math.PI * 2, rr = ir * (0.7 + hash(`${key}:${k}:${q}`) * 0.6)
        isl.push([ix + Math.cos(t) * rr * 1.3, iy + Math.sin(t) * rr])
      }
      islands.push(roughen(isl, `${key}:isl${k}`, 2, 0.16))
    }
    const lake = { pts, islands, box: boxOf(pts), x: cx, y: cy, r: r * 1.15, name }
    lakes.push(lake)
    return lake
  }

  /** The nearest point of a lake's shore to a point, nudged a little way into the water. */
  const shoreOf = (lake: Lake, x: number, y: number): [number, number] => {
    const [qx, qy] = nearestOn(lake.pts, x, y)
    return [qx + (lake.x - qx) * 0.12, qy + (lake.y - qy) * 0.12]
  }

  const widthOf = (cum: number) => CELL * Math.min(1.15, 0.09 + 0.065 * Math.sqrt(Math.max(0, cum)))
  const course: Array<{ pts: number[]; cum: number[]; name: string; main: boolean; li: number; basin?: Plot }> = []
  const add = (c: { pts: number[]; cum: number[] }, seq: number[], c0: number, c1: number, skipFirst: boolean) => {
    const n = seq.length / 2
    for (let i = skipFirst ? 1 : 0; i < n; i++) {
      c.pts.push(seq[i * 2], seq[i * 2 + 1])
      c.cum.push(c0 + (c1 - c0) * (n > 1 ? i / (n - 1) : 1))
    }
  }
  /** Carry a river from its last point to the sea, or to a lake where the sea is out of reach. */
  const mouth = (c: { pts: number[]; cum: number[] }, li: number, ux: number, uy: number, key: string, lakeName: string) => {
    const ex = c.pts[c.pts.length - 2], ey = c.pts[c.pts.length - 1], cumEnd = c.cum[c.cum.length - 1]
    const [qx, qy] = nearestOn(coastPts[li], ex, ey)
    const land = world.regions[li]
    // the sea near enough: run down to it; otherwise the water pools inland
    if (Math.hypot(qx - ex, qy - ey) < land.r * 0.4) {
      const ox = qx - land.x, oy = qy - land.y, ol = Math.hypot(ox, oy) || 1
      add(c, trace(ex, ey, qx + (ox / ol) * CELL * 0.6, qy + (oy / ol) * CELL * 0.6, key), cumEnd, cumEnd, true)
      return
    }
    const r = CELL * (2.2 + Math.sqrt(cumEnd) * 0.2)
    const site = poolOf(ex, ey, ux, uy, r, key)
    const lake = makeLake(site.x, site.y, Math.max(CELL * 1.4, site.r), Math.atan2(site.y - ey, site.x - ex), key + ':lake', lakeName)
    const [sx, sy] = shoreOf(lake, ex, ey)
    add(c, trace(ex, ey, sx, sy, key), cumEnd, cumEnd, true)
  }

  // the basins' rivers: a spring in the high ground, then the days in date order, then the sea
  const inBasin = new Set<Plot>()
  for (const { plot: B, order } of basins) {
    if (!order.length) continue
    const c = { pts: [] as number[], cum: [] as number[] }
    let files = 0
    order.forEach((p, i) => {
      inBasin.add(p)
      const line = riverLine.get(p)!
      const [fx, fy] = flow.get(p)!
      if (i === 0) {
        const [qx, qy] = springOf(line[0], line[1], fx, fy, CELL * 4, CELL * 12, B.path + ':spring')
        add(c, trace(qx, qy, line[0], line[1], B.path + ':head'), 0, 0, false)
      } else {
        const ex = c.pts[c.pts.length - 2], ey = c.pts[c.pts.length - 1]
        const [dx, dy] = flow.get(order[i - 1])!
        const k = Math.max(CELL * 2, Math.hypot(line[0] - ex, line[1] - ey) * 0.45)
        const seq: number[] = [ex, ey]
        cubic(seq, ex, ey, ex + dx * k, ey + dy * k, line[0] - fx * k, line[1] - fy * k, line[0], line[1], 12)
        add(c, seq, files, files, true)
      }
      add(c, line, files, files + p.grains.length, true)
      files += p.grains.length
    })
    const li = landOf.get(B)!
    const last = order[order.length - 1]
    const [ux, uy] = flow.get(last)!
    const title = cap(B.name === 'date' ? B.path.split('/').slice(-2, -1)[0] ?? B.name : B.name)
    mouth(c, li, ux, uy, B.path + ':mouth', `L. ${title}`)
    course.push({ ...c, name: `R. ${title}`, main: true, li, basin: B })
  }
  const mains = course.slice()

  /** Join a tributary into the nearest main river of its land, if one is near; returns false
   *  when there is none to join. The main river widens below the junction. */
  const join = (c: { pts: number[]; cum: number[] }, li: number, files: number, key: string, reach: number, grow = 0): boolean => {
    const ex = c.pts[c.pts.length - 2], ey = c.pts[c.pts.length - 1]
    let bm = -1, bi = 0, bd = reach
    mains.forEach((m, mi) => {
      if (m.li !== li) return
      for (let i = 0; i < m.pts.length / 2; i++) {
        const d = Math.hypot(m.pts[i * 2] - ex, m.pts[i * 2 + 1] - ey)
        if (d < bd) { bd = d; bm = mi; bi = i }
      }
    })
    if (bm < 0) return false
    const m = mains[bm]
    const cumEnd = c.cum[c.cum.length - 1]
    add(c, trace(ex, ey, m.pts[bi * 2], m.pts[bi * 2 + 1], key), cumEnd, cumEnd + grow, true)
    for (let i = bi; i < m.cum.length; i++) m.cum[i] += files
    return true
  }

  // other dated folders: rivers of their own, rising nearby, joining a main river, the sea or a lake
  for (const [p, line] of riverLine) {
    if (inBasin.has(p)) continue
    const li = landOf.get(p)!
    const [fx, fy] = flow.get(p) ?? [Math.cos(p.furrow), Math.sin(p.furrow)]
    const c = { pts: [] as number[], cum: [] as number[] }
    const [qx, qy] = springOf(line[0], line[1], fx, fy, CELL * 3, CELL * 8, p.path + ':spring')
    add(c, trace(qx, qy, line[0], line[1], p.path + ':head'), 0, 0, false)
    add(c, line, 0, p.grains.length, true)
    const land = world.regions[li]
    const name = `${cap(p.name)} Brook`
    if (!join(c, li, p.grains.length, p.path + ':join', Math.max(CELL * 30, land.r * 0.45))) {
      const n = line.length
      const dx = line[n - 2] - line[n - 4], dy = line[n - 1] - line[n - 3], dl = Math.hypot(dx, dy) || 1
      mouth(c, li, dx / dl, dy / dl, p.path + ':mouth', `${cap(p.name)} Mere`)
    }
    course.push({ ...c, name, main: false, li })
  }

  // the deep sub-folders of a main river's room send down becks from their high ground
  for (const m of mains) {
    const B = m.basin
    if (!B) continue
    const top = B.path.split('/')[0]
    const room = plots.find((q) => q.path === top)
    if (!room) continue
    const cands = plots.filter((q) => (q.path === top || q.path.startsWith(top + '/')) && q !== B && !q.path.startsWith(B.path + '/') &&
      !B.path.startsWith(q.path + '/') && q !== room && !riverPlots.has(q) && (height.get(q) ?? 0) >= 1)
      .sort((a, b) => b.files - a.files).slice(0, 3)
    for (const q of cands) {
      let best: [number, number] | null = null, be = -Infinity
      for (let i = 0; i < 14; i++) {
        const a = hash(`${q.path}:sa${i}`) * 6.28, r = q.r * (0.3 + 0.55 * hash(`${q.path}:sr${i}`))
        const px = mx(q) + Math.cos(a) * r, py = my(q) + Math.sin(a) * r
        const g = elevAt(terrain, px, py)
        if (!g || clearAt(px, py) < CELL * 0.6) continue
        if (g.e > be) { be = g.e; best = [px, py] }
      }
      if (!best) continue
      const files = Math.min(q.files, 120)
      // a big folder's beck rises from a tarn in the high ground
      let start = best
      const tr = CELL * (1.1 + Math.sqrt(files) * 0.09)
      if (q.files >= 40 && clearAt(best[0], best[1], tr * 2) > tr * 1.4 && (elevAt(terrain, best[0], best[1])?.clear ?? 0) > tr * 1.2) {
        const lake = makeLake(best[0], best[1], tr, hash(q.path + ':ta') * 6.28, q.path + ':tarn', `${cap(q.name)} Tarn`)
        const [jx, jy] = [mx(m.basin!), my(m.basin!)]
        const [sx, sy] = nearestOn(lake.pts, jx, jy)
        start = [sx, sy]
      }
      const c = { pts: [start[0], start[1]] as number[], cum: [0] as number[] }
      if (join(c, m.li, files, q.path + ':beck', B.r * 2.4, files)) course.push({ ...c, name: `${cap(q.name)} Beck`, main: false, li: m.li })
      else if (start !== best) lakes.pop()
    }
  }

  /** Even spacing along a course (with the file count carried along), so it is cheap to draw
   *  and to keep relief off. */
  const resample = (pts: number[], cum: number[], gap: number): [number[], number[]] => {
    const op = [pts[0], pts[1]], oc = [cum[0]]
    let carry = 0
    for (let i = 1; i < pts.length / 2; i++) {
      const ax = pts[i * 2 - 2], ay = pts[i * 2 - 1], bx = pts[i * 2], by = pts[i * 2 + 1]
      const L = Math.hypot(bx - ax, by - ay)
      let t = gap - carry
      while (t <= L) {
        const u = t / L
        op.push(ax + (bx - ax) * u, ay + (by - ay) * u)
        oc.push(cum[i - 1] + (cum[i] - cum[i - 1]) * u)
        t += gap
      }
      carry = L - (t - gap)
    }
    op.push(pts[pts.length - 2], pts[pts.length - 1]); oc.push(cum[cum.length - 1])
    return [op, oc]
  }
  /** One gentle corner-cut over a whole course (file counts carried), to round off the joins
   *  between its traced stretches and its towns. */
  const soften = (pts: number[], cum: number[]): [number[], number[]] => {
    const n = pts.length / 2
    if (n < 3) return [pts, cum]
    const op = [pts[0], pts[1]], oc = [cum[0]]
    for (let i = 0; i < n - 1; i++) {
      const ax = pts[i * 2], ay = pts[i * 2 + 1], bx = pts[i * 2 + 2], by = pts[i * 2 + 3]
      op.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75)
      oc.push(cum[i] * 0.75 + cum[i + 1] * 0.25, cum[i] * 0.25 + cum[i + 1] * 0.75)
    }
    op.push(pts[pts.length - 2], pts[pts.length - 1]); oc.push(cum[n - 1])
    return [op, oc]
  }
  const rivers: River[] = course.map((c) => {
    const [sp, sc] = resample(c.pts, c.cum, CELL * 0.9)
    const [s1, c1] = soften(sp, sc)
    const [s2, c2] = soften(s1, c1)
    const [rp, rc] = resample(s2, c2, CELL * 0.55)
    const P = Float32Array.from(rp), cum = Float32Array.from(rc)
    const W = new Float32Array(cum.length)
    for (let i = 0; i < cum.length; i++) W[i] = widthOf(cum[i])
    for (let i = 0; i < W.length - 1; i++) capsules.push({ ax: P[i * 2], ay: P[i * 2 + 1], bx: P[i * 2 + 2], by: P[i * 2 + 3], r: W[i] * 0.5 + CELL * 0.5 })
    return { pts: P, cum, w: W, box: boxOf(P, CELL * 1.5), name: c.name, main: c.main }
  })
  for (const lk of lakes) capsules.push({ ax: lk.x, ay: lk.y, bx: lk.x, by: lk.y, r: lk.r * 1.3 + CELL * 0.6 })

  // ---- roads: each folder's settlement to its sub-folders', and each region's rooms together
  const roads: Float32Array[] = []
  const rep = (p: Plot): [number, number] => {
    const st = settleOf.get(p)
    return st && !st.river ? [st.x, st.y] : [mx(p), my(p)]
  }
  const mst = (nodes: Array<[number, number]>, seedKey: string) => {
    if (nodes.length < 2) return
    const n = nodes.length
    const inT = new Uint8Array(n), best = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1)
    best[0] = 0
    for (let it = 0; it < n; it++) {
      let u = -1
      for (let i = 0; i < n; i++) if (!inT[i] && (u < 0 || best[i] < best[u])) u = i
      inT[u] = 1
      if (from[u] >= 0) {
        const [ax, ay] = nodes[from[u]], [bx, by] = nodes[u]
        const len = Math.hypot(bx - ax, by - ay)
        if (len > CELL * 2) {
          const bend = (hash(`${seedKey}~${u}`) - 0.5) * 0.36 * len
          const nx = -(by - ay) / len, ny = (bx - ax) / len
          const cx = (ax + bx) / 2 + nx * bend, cy = (ay + by) / 2 + ny * bend
          const pts: number[] = [ax, ay]
          const m = Math.max(6, Math.min(24, Math.round(len / (CELL * 3))))
          for (let s = 1; s <= m; s++) {
            const t = s / m, v = 1 - t
            pts.push(v * v * ax + 2 * v * t * cx + t * t * bx, v * v * ay + 2 * v * t * cy + t * t * by)
          }
          const P = Float32Array.from(pts)
          roads.push(P)
          for (let s = 0; s < m; s++) capsules.push({ ax: P[s * 2], ay: P[s * 2 + 1], bx: P[s * 2 + 2], by: P[s * 2 + 3], r: CELL * 0.55, soft: true })
        }
      }
      for (let i = 0; i < n; i++) {
        if (inT[i]) continue
        const d = Math.hypot(nodes[i][0] - nodes[u][0], nodes[i][1] - nodes[u][1])
        if (d < best[i]) { best[i] = d; from[i] = u }
      }
    }
  }
  const basinSet = new Set(basins.map((b) => b.plot))
  for (const p of plots) {
    if (!p.children.length || basinSet.has(p)) continue
    mst([rep(p), ...p.children.map(rep)], p.path)
  }
  world.regions.forEach((land) => mst(land.rooms.map(rep), land.region.id))
  const roadBox = roads.map((r) => boxOf(r, CELL))

  // ---- islets off each coast
  const islets: Atlas['islets'] = []
  world.regions.forEach((land, li) => {
    const count = 2 + Math.floor(hash(land.region.id + ':isl') * 4)
    for (let i = 0; i < count; i++) {
      const hp = land.hull[Math.floor(hash(`${land.region.id}:ih${i}`) * land.hull.length)]
      const ox = hp[0] - land.x, oy = hp[1] - land.y, ol = Math.hypot(ox, oy) || 1
      const out = 34 + hash(`${land.region.id}:io${i}`) * 70
      const r = 5 + hash(`${land.region.id}:ir${i}`) * 15
      const x = hp[0] + (ox / ol) * out, y = hp[1] + (oy / ol) * out
      const clear = world.regions.every((o, oi) => oi === li || Math.hypot(x - o.x, y - o.y) > o.r * 1.15 + r + 40)
      if (!clear) continue
      const ring: Array<[number, number]> = []
      for (let s = 0; s < 9; s++) {
        const t = (s / 9) * Math.PI * 2
        const rr = r * (0.75 + hash(`${land.region.id}:${i}:${s}`) * 0.5)
        ring.push([x + Math.cos(t) * rr * 1.25, y + Math.sin(t) * rr])
      }
      const pts = roughen(ring, `${land.region.id}:isl${i}`, 2, 0.18)
      islets.push({ pts, box: boxOf(pts), land: li })
    }
  })

  // ---- index: folders where the atlas set them, files where their mark stands
  const index = new Map<string, { x: number; y: number; r: number }>()
  for (const p of plots) index.set(p.path, { x: mx(p), y: my(p), r: p.r })
  for (let i = 0; i < total; i++) index.set(path[i], { x: gx[i], y: gy[i], r: CELL * 0.5 * scale[i] })

  const glyphs = new Grid(CELL * 4)
  for (let i = 0; i < total; i++) glyphs.add(i, gx[i], gy[i], gx[i], gy[i])
  const zones = new Grid(64)
  capsules.forEach((c, i) => zones.add(i, Math.min(c.ax, c.bx) - c.r, Math.min(c.ay, c.by) - c.r, Math.max(c.ax, c.bx) + c.r, Math.max(c.ay, c.by) + c.r))

  // ---- bounds, and the two corners of open sea for the rose and the cartouche
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const b of landBox) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]) }
  const openness = (x: number, y: number) => Math.min(...world.regions.map((l) => Math.hypot(x - l.x, y - l.y) - l.r))
  const inset = Math.min(x1 - x0, y1 - y0) * 0.1
  const corner = (cands: Array<[number, number]>) => cands.reduce((b, c) => (openness(c[0], c[1]) > openness(b[0], b[1]) ? c : b))
  const [rx, ry] = corner([[x0 + inset, y1 - inset], [x1 - inset, y1 - inset]])
  const [tx, ty] = corner([[x0 + inset, y0 + inset], [x1 - inset, y0 + inset]])

  return {
    n: total, gx, gy, kind, seed, rot, tier, scale, path, glyphPlot, glyphs, plots, height, settlements, settleOf,
    rivers, lakes, roads, roadBox, capsules, zones, coastPts, islets, landBox, index,
    rose: { x: rx, y: ry }, cartouche: { x: tx, y: ty }, bounds: { x0, y0, x1, y1 }, world,
  }
}

/** Distance from a point to the nearest capsule edge (negative inside one), looked up near it. */
export function zoneClear(at: Atlas, x: number, y: number, reach: number): number {
  let best = reach
  at.zones.each(x - reach, y - reach, x + reach, y + reach, (id) => {
    const c = at.capsules[id]
    const dx = c.bx - c.ax, dy = c.by - c.ay
    const l2 = dx * dx + dy * dy
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - c.ax) * dx + (y - c.ay) * dy) / l2)) : 0
    const d = Math.hypot(x - (c.ax + dx * t), y - (c.ay + dy * t)) - c.r
    if (d < best && (!c.soft || d < 0)) best = d
  })
  return best
}
