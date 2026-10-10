// The map view's land, worked out once per tree. It starts from the bubble layout (same regions,
// same rooms, same folders in the same places) and redraws what is inside them as an atlas would:
//
//   - each folder's loose files become a settlement on a street grid: pages are houses at the
//     core, scripts and foreign code are mills and workshops around them, grain's own code is
//     the farmland beyond, data stands as stones and media grows as trees at the edge;
//   - a folder of filename-stamped files (a run of dated logs) is a river town: the files line
//     both banks in time order and the river runs through them; a folder of such day-folders is
//     a basin, its days re-strung along one river that flows by time down to the sea;
//   - roads join each folder's settlement to its sub-folders' (the tree, walked as a road net);
//   - each region's coast is roughened, with a few islets offshore.
//
// Everything is derived from paths alone and hashed, so the same tree draws the same map, and a
// grown tree grows the map: new files extend their settlement, new folders found new ones.

import type { Entry } from '@/grain/repo'
import { hash, type Plot, type World, type RegionLand } from './layout'
import { Kind, kindOf, KIND_RANK, BUILT } from './glyphs'

/** World size of one file's plot on the map. */
export const CELL = 8.6
const STAMPED = /^(?:\d{8}[-_.]\d{6}|\d{8}[-_])/

export interface River {
  pts: Float32Array            // x, y pairs
  w: Float32Array              // width (world) at each point
  box: [number, number, number, number]
  lake?: { x: number; y: number; rx: number; ry: number; a: number }
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
  path: string[]
  glyphPlot: Plot[]
  glyphs: Grid
  plots: Plot[]                        // every folder, parents before children
  height: Map<Plot, number>            // levels of folders beneath
  settlements: Settlement[]
  settleOf: Map<Plot, Settlement>
  rivers: River[]
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
    for (const f of files) if (f.k === Kind.House) houses++

    if (riverPlots.has(p)) {
      // a river town: files in name (time) order down both banks
      files.sort((a, b) => a.name.localeCompare(b.name))
      const n = files.length
      const f = flow.get(p) ?? [Math.cos(p.furrow), Math.sin(p.furrow)]
      const ux = f[0], uy = f[1], vx = -uy, vy = ux
      // a day in a basin keeps to its own stretch, so the river never doubles back between days
      const L = Math.min(Math.max(R * 1.75, CELL * 4), (slot.get(p) ?? Infinity) * 0.92)
      const A = R * 0.14, ph = hash(p.path + ':m') * Math.PI * 2, fq = hash(p.path + ':f') > 0.5 ? 1.5 : 1
      const M = 28
      const line: number[] = []
      const arc: number[] = [0]
      for (let s = 0; s <= M; s++) {
        const t = s / M
        // the meander fades at both ends so the river meets its neighbours head on
        const off = A * Math.sin(Math.PI * 2 * fq * t + ph) * Math.sin(Math.PI * t)
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
    const reach = Math.max(R - CELL * 0.5, cand[Math.min(cand.length - 1, Math.ceil(files.length * 1.2))].d)
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
        ci = anyp
      }
      used[ci] = 1
      const C = cand[ci]
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

  // ---- rivers
  const rivers: River[] = []
  const inBasin = new Set<Plot>()
  const finish = (pts: number[], w0: number, w1: number, lake?: River['lake']) => {
    const P = Float32Array.from(pts)
    const n = P.length / 2
    const arc = new Float32Array(n)
    for (let i = 1; i < n; i++) arc[i] = arc[i - 1] + Math.hypot(P[i * 2] - P[i * 2 - 2], P[i * 2 + 1] - P[i * 2 - 1])
    const W = new Float32Array(n)
    for (let i = 0; i < n; i++) W[i] = w0 + (w1 - w0) * Math.sqrt(arc[i] / (arc[n - 1] || 1))
    for (let i = 0; i < n - 1; i++) {
      capsules.push({ ax: P[i * 2], ay: P[i * 2 + 1], bx: P[i * 2 + 2], by: P[i * 2 + 3], r: W[i] * 0.5 + CELL * 0.5 })
    }
    const box = boxOf(P, w1)
    if (lake) {
      box[0] = Math.min(box[0], lake.x - lake.rx); box[1] = Math.min(box[1], lake.y - lake.rx)
      box[2] = Math.max(box[2], lake.x + lake.rx); box[3] = Math.max(box[3], lake.y + lake.rx)
      capsules.push({ ax: lake.x, ay: lake.y, bx: lake.x, by: lake.y, r: lake.rx + CELL * 0.6 })
    }
    rivers.push({ pts: P, w: W, box, lake })
  }
  for (const { plot: B, order } of basins) {
    const pts: number[] = []
    let files = 0
    order.forEach((p, i) => {
      inBasin.add(p)
      files += p.grains.length
      const line = riverLine.get(p)!
      if (i === 0) pts.push(...line)
      else {
        const ex = pts[pts.length - 2], ey = pts[pts.length - 1]
        const [dx, dy] = flow.get(order[i - 1])!
        const [fx, fy] = flow.get(p)!
        const sx = line[0], sy = line[1]
        const k = Math.max(CELL * 2, Math.hypot(sx - ex, sy - ey) * 0.45)
        cubic(pts, ex, ey, ex + dx * k, ey + dy * k, sx - fx * k, sy - fy * k, sx, sy, 12)
        pts.push(...line.slice(2))
      }
    })
    if (pts.length < 4) continue
    const li = landOf.get(B)!
    const ex = pts[pts.length - 2], ey = pts[pts.length - 1]
    const [qx, qy] = nearestOn(coastPts[li], ex, ey)
    const dist = Math.hypot(qx - ex, qy - ey)
    const [dx, dy] = flow.get(order[order.length - 1])!
    const w1 = CELL * Math.min(1.1, 0.35 + Math.sqrt(files) * 0.025)
    if (dist < world.regions[li].r * 0.9) {
      // out to sea, swinging round to meet the shore square on
      const ox = qx - world.regions[li].x, oy = qy - world.regions[li].y, ol = Math.hypot(ox, oy) || 1
      const k = dist * 0.4
      cubic(pts, ex, ey, ex + dx * k, ey + dy * k, qx - (ox / ol) * k, qy - (oy / ol) * k, qx + (ox / ol) * CELL * 0.4, qy + (oy / ol) * CELL * 0.4, 24)
      finish(pts, CELL * 0.14, w1)
    } else {
      const rx = CELL * 2 + Math.sqrt(files) * CELL * 0.12
      finish(pts, CELL * 0.14, w1, { x: ex + dx * rx * 0.8, y: ey + dy * rx * 0.8, rx, ry: rx * 0.58, a: Math.atan2(dy, dx) })
    }
  }
  for (const [p, line] of riverLine) {
    if (inBasin.has(p)) continue
    const n = line.length
    const dx = line[n - 2] - line[n - 4], dy = line[n - 1] - line[n - 3], dl = Math.hypot(dx, dy) || 1
    const rx = CELL * 1.4 + Math.sqrt(p.grains.length) * CELL * 0.1
    finish(line, CELL * 0.12, CELL * 0.4, {
      x: line[n - 2] + (dx / dl) * rx * 0.85, y: line[n - 1] + (dy / dl) * rx * 0.85, rx, ry: rx * 0.6, a: Math.atan2(dy, dx),
    })
  }

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
  for (let i = 0; i < total; i++) index.set(path[i], { x: gx[i], y: gy[i], r: CELL * 0.5 })

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
    n: total, gx, gy, kind, seed, rot, path, glyphPlot, glyphs, plots, height, settlements, settleOf,
    rivers, roads, roadBox, capsules, zones, coastPts, islets, landBox, index,
    rose: { x: rx, y: ry }, cartouche: { x: tx, y: ty }, bounds: { x0, y0, x1, y1 },
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
