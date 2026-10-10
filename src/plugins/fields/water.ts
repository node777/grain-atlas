// Rivers and lakes, worked out from the tree and the lie of the land.
//
//   - A basin's days lie along one main river: it rises at a spring in the high ground behind
//     the first day, runs through each day's river town in date order, and on to the sea, or to
//     a lake where the sea is out of reach.
//   - Other dated folders run as brooks of their own, joining the nearest main river or reaching
//     the sea or a lake; the deep sub-folders of a main river's room send down becks, a big one
//     from a tarn in its high ground.
//   - Width follows the files the water has passed, so a river widens downstream and below every
//     tributary.
//   - Water finds its way with A* over a fine grid: downhill is cheap, uphill dear, a little
//     noise gives it natural bends, and every town's footprint (plus a margin) is closed to it,
//     save the towns the river itself serves. So rivers go round towns, never through them.

import { hash, type Plot, type World } from './layout'
import { CELL, coastReach, elevAt, plotX, plotY, vnoise, type Terrain } from './terrain'
import { Grid, boxOf, channelOutline, insidePolygon, nearestOn, resampleCourse, roughen, smoothCourse, toSegment, type Box, type Course } from './geom'
import type { Marks, RiverTown, Settlement, Towns } from './towns'

export interface River {
  pts: Float32Array            // x, y pairs, source to mouth
  w: Float32Array              // width (world) at each point
  channel: Float32Array        // the water as one closed outline (left bank down, right bank up)
  box: Box
  name: string
  main: boolean                // a basin's river (or a tributary)
  land: number
}

export interface Lake {
  pts: Float32Array            // the shoreline, closed
  islands: Float32Array[]
  box: Box
  x: number
  y: number
  r: number
  name: string
}

export interface Bridge { x: number; y: number; angle: number; span: number }

interface Context {
  world: World
  terrain: Terrain
  plots: Plot[]
  landOf: Map<Plot, number>
  coastPts: Float32Array[]
  towns: Towns
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** A river's width where it has passed so many files. */
export const widthOf = (files: number) => CELL * Math.min(1.15, 0.09 + 0.065 * Math.sqrt(Math.max(0, files)))

export function makeWater(ctx: Context): { rivers: River[]; lakes: Lake[] } {
  const { world, terrain, plots, landOf, coastPts, towns } = ctx
  const ground = new Footprints(towns.settlements, towns.riverTowns)
  const router = new Router(terrain, ground)
  const lakes: Lake[] = []
  type Flow = Course & { name: string; main: boolean; land: number; basin?: Plot }
  const flows: Flow[] = []

  /** Carry a course from its last point to the sea, or to a lake where the sea is out of reach
   *  and there is a hollow with room for one. */
  const toMouth = (c: Course, land: number, own: Set<Plot>, key: string, lakeName: string) => {
    const [ex, ey] = last(c), files = c.val[c.val.length - 1]
    const L = world.regions[land]
    const [qx, qy] = nearestOn(coastPts[land], ex, ey)
    const r = CELL * (2.2 + Math.sqrt(files) * 0.2)
    const site = Math.hypot(qx - ex, qy - ey) < L.r * 0.4 ? null : poolOf(terrain, ground, ex, ey, qx - ex, qy - ey, r, key)
    if (!site) {
      const way = router.route(ex, ey, { x: qx, y: qy, reached: (x, y) => seaward(L, x, y) }, land, own, key)
      if (!way) return
      extend(c, way, files)
      // on out until it has crossed the drawn coast (roughened, it may lie beyond the hull)
      const [mx, my] = last(c), ol = Math.hypot(mx - L.x, my - L.y) || 1
      let d = CELL
      while (d < CELL * 40 && insidePolygon(coastPts[land], mx + ((mx - L.x) / ol) * d, my + ((my - L.y) / ol) * d)) d += CELL
      extend(c, [mx, my, mx + ((mx - L.x) / ol) * (d + CELL), my + ((my - L.y) / ol) * (d + CELL)], files)
      return
    }
    const lake = makeLake(site.x, site.y, site.r, Math.atan2(site.y - ey, site.x - ex), key + ':lake', lakeName)
    const [sx, sy] = nearestOn(lake.pts, ex, ey)
    const way = router.route(ex, ey, { x: sx, y: sy, reached: (x, y) => insidePolygon(lake.pts, x, y) }, land, own, key)
    if (!way) return
    lakes.push(lake)
    extend(c, way, files)
  }

  // the main rivers, one per basin
  for (const { plot: B, days } of towns.basins) {
    if (!days.length) continue
    const land = landOf.get(B)!
    const own = new Set<Plot>([B, ...days])
    const first = towns.riverTowns.get(days[0])!
    const spring = springOf(terrain, ground, first.line[0], first.line[1], first.flow, CELL * 4, CELL * 12, B.path + ':spring')
    const c = riseAt(router, spring, first.line, land, own, B.path)
    let files = 0, prev = days[0]
    for (const day of days) {
      const t = towns.riverTowns.get(day)!
      if (day !== days[0]) extend(c, dayToDay(router, ground, c, towns.riverTowns.get(prev)!.flow, t, land, own, day.path), files)
      prev = day
      extend(c, t.line, files, files + day.grains.length)
      files += day.grains.length
    }
    const title = cap(B.name === 'date' ? B.path.split('/').slice(-2, -1)[0] ?? B.name : B.name)
    toMouth(c, land, own, B.path + ':mouth', `L. ${title}`)
    flows.push({ ...c, name: `R. ${title}`, main: true, land, basin: B })
  }
  const mains = flows.slice()

  /** Join a tributary to the nearest main river of its land within reach, meeting it on open
   *  water outside its towns; the main river widens below the junction. */
  const join = (c: Course, land: number, own: Set<Plot>, files: number, key: string, reach: number): boolean => {
    const [ex, ey] = last(c)
    let best: { m: Flow; i: number } | null = null, bd = reach
    for (const m of mains) {
      if (m.land !== land) continue
      for (let i = 0; i < m.pts.length / 2; i++) {
        const d = Math.hypot(m.pts[i * 2] - ex, m.pts[i * 2 + 1] - ey)
        if (d < bd && !ground.closed(m.pts[i * 2], m.pts[i * 2 + 1], own)) { bd = d; best = { m, i } }
      }
    }
    if (!best) return false
    const { m, i } = best
    const onMain = (x: number, y: number) => Math.hypot(x - m.pts[i * 2], y - m.pts[i * 2 + 1]) < CELL * 0.8
    const way = router.route(ex, ey, { x: m.pts[i * 2], y: m.pts[i * 2 + 1], reached: onMain }, land, own, key)
    if (!way) return false
    extend(c, way, c.val[c.val.length - 1])
    for (let q = i; q < m.val.length; q++) m.val[q] += files
    return true
  }

  // brooks: dated folders outside a basin
  const inBasin = new Set(towns.basins.flatMap((b) => b.days))
  for (const [p, t] of towns.riverTowns) {
    if (inBasin.has(p)) continue
    const land = landOf.get(p)!
    const own = new Set([p])
    const spring = springOf(terrain, ground, t.line[0], t.line[1], t.flow, CELL * 3, CELL * 8, p.path + ':spring')
    const c = riseAt(router, spring, t.line, land, own, p.path)
    extend(c, t.line, 0, p.grains.length)
    if (!join(c, land, own, p.grains.length, p.path + ':join', Math.max(CELL * 30, world.regions[land].r * 0.45))) {
      toMouth(c, land, own, p.path + ':mouth', `${cap(p.name)} Mere`)
    }
    flows.push({ ...c, name: `${cap(p.name)} Brook`, main: false, land })
  }

  // becks: from the high ground of the biggest deep folders in a main river's room
  for (const m of mains) {
    const B = m.basin!
    for (const q of beckSources(plots, B, terrain, towns.riverTowns)) {
      const spring = highGround(terrain, ground, q)
      if (!spring) continue
      const files = Math.min(q.files, 120)
      const own = new Set([q])
      let start = spring, tarn: Lake | null = null
      const tr = CELL * (1.1 + Math.sqrt(files) * 0.09)
      if (q.files >= 40 && ground.clearance(spring[0], spring[1], own, tr * 2) > tr * 1.4 && (elevAt(terrain, spring[0], spring[1])?.clear ?? 0) > tr * 1.2) {
        tarn = makeLake(spring[0], spring[1], tr, hash(q.path + ':ta') * 6.28, q.path + ':tarn', `${cap(q.name)} Tarn`)
        start = nearestOn(tarn.pts, plotX(B), plotY(B))
      }
      const c: Course = { pts: [start[0], start[1]], val: [0] }
      if (!join(c, m.land, own, files, q.path + ':beck', B.r * 2.4)) continue
      c.val = c.val.map((_, i) => (files * i) / Math.max(1, c.val.length - 1))
      if (tarn) lakes.push(tarn)
      flows.push({ ...c, name: `${cap(q.name)} Beck`, main: false, land: m.land })
    }
  }

  const rivers = flows.map((f) => finishRiver(f, f.name, f.main, f.land))
  return { rivers, lakes }
}

/** A course that rises at a spring and runs down to the head of a town's stretch; it rises at
 *  the stretch itself when no way down can be found. */
function riseAt(router: Router, [sx, sy]: [number, number], line: number[], land: number, own: Set<Plot>, key: string): Course {
  const way = router.route(sx, sy, { x: line[0], y: line[1] }, land, own, key + ':head')
  if (!way) return { pts: [line[0], line[1]], val: [0] }
  const c: Course = { pts: [sx, sy], val: [0] }
  extend(c, way, 0)
  return c
}

/** From one day's stretch to the next: the smooth turn the basin's rows were laid out for (out
 *  along the one's flow, in along the other's) when its way is clear, else whatever way round
 *  the towns can be found, else straight across (the days lie close). */
function dayToDay(router: Router, ground: Footprints, c: Course, out: [number, number], next: RiverTown, land: number, own: Set<Plot>, key: string): number[] {
  const [ex, ey] = last(c), [sx, sy] = [next.line[0], next.line[1]]
  const k = Math.max(CELL * 2, Math.hypot(sx - ex, sy - ey) * 0.45)
  const turn = cubic(ex, ey, ex + out[0] * k, ey + out[1] * k, sx - next.flow[0] * k, sy - next.flow[1] * k, sx, sy, 16)
  let clear = true
  for (let i = 0; i < turn.length && clear; i += 2) clear = !ground.closed(turn[i], turn[i + 1], own)
  return clear ? turn : router.route(ex, ey, { x: sx, y: sy }, land, own, key) ?? [ex, ey, sx, sy]
}

/** Points along a cubic Bézier, from its start. */
function cubic(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t
    out.push(u * u * u * ax + 3 * u * u * t * bx + 3 * u * t * t * cx + t * t * t * dx, u * u * u * ay + 3 * u * u * t * by + 3 * u * t * t * cy + t * t * t * dy)
  }
  return out
}

/** The last point of a course. */
const last = (c: Course): [number, number] => [c.pts[c.pts.length - 2], c.pts[c.pts.length - 1]]

/** Append points to a course (the first is the course's own last point, so it is skipped), the
 *  file count running from v0 to v1 along them. */
function extend(c: Course, seq: ArrayLike<number>, v0: number, v1 = v0) {
  const n = seq.length / 2
  for (let i = 1; i < n; i++) {
    c.pts.push(seq[i * 2], seq[i * 2 + 1])
    c.val.push(v0 + ((v1 - v0) * i) / Math.max(1, n - 1))
  }
}

/** Smooth a course into a river: even spacing, rounded joins, a width at every point (tapering
 *  to nothing at the spring), and the water's outline as one closed shape. */
function finishRiver(c: Course, name: string, main: boolean, land: number): River {
  const even = resampleCourse(smoothCourse(resampleCourse(c, CELL * 0.9), 3), CELL * 0.55)
  const pts = Float32Array.from(even.pts)
  const n = pts.length / 2
  const w = new Float32Array(n)
  let run = 0
  for (let i = 0; i < n; i++) {
    if (i) run += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1])
    const t = Math.min(1, run / (CELL * 3))
    w[i] = widthOf(even.val[i]) * (0.25 + 0.75 * t * t * (3 - 2 * t))
  }
  return { pts, w, channel: channelOutline(pts, w), box: boxOf(pts, CELL * 1.5), name, main, land }
}

// ------------------------------------------------------------------ towns as obstacles

/** The ground towns stand on, as shapes water must keep out of: a disc round each street town,
 *  and a band along each river town's stretch, each with a margin. */
class Footprints {
  private grid = new Grid(CELL * 4)
  private shapes: Array<{ plot: Plot; pts: number[]; r: number }>
  constructor(settlements: Settlement[], riverTowns: Map<Plot, RiverTown>) {
    this.shapes = settlements.map((s) => ({
      plot: s.plot,
      pts: s.river ? riverTowns.get(s.plot)!.line : [s.plot.mlx!, s.plot.mly!],
      r: s.r + CELL * 0.35,
    }))
    this.shapes.forEach((sh, i) => {
      const b = boxOf(sh.pts, sh.r)
      this.grid.add(i, b[0], b[1], b[2], b[3])
    })
  }
  /** The towns whose footprint covers a point. */
  covering(x: number, y: number): Plot[] {
    const out: Plot[] = []
    this.grid.each(x, y, x, y, (i) => {
      const sh = this.shapes[i], p = sh.pts
      let d = Infinity
      if (p.length === 2) d = Math.hypot(x - p[0], y - p[1])
      else for (let q = 0; q + 3 < p.length && d >= sh.r; q += 2) d = Math.min(d, toSegment(x, y, p[q], p[q + 1], p[q + 2], p[q + 3])[0])
      if (d < sh.r && !out.includes(sh.plot)) out.push(sh.plot)
    })
    return out
  }
  /** How far a point stands outside every footprint but those in `own` (negative inside one). */
  clearance(x: number, y: number, own: Set<Plot>, reach = CELL * 3): number {
    let best = reach
    this.grid.each(x - reach, y - reach, x + reach, y + reach, (i) => {
      const sh = this.shapes[i]
      if (own.has(sh.plot)) return
      const p = sh.pts
      let d = Infinity
      if (p.length === 2) d = Math.hypot(x - p[0], y - p[1])
      else for (let q = 0; q + 3 < p.length; q += 2) d = Math.min(d, toSegment(x, y, p[q], p[q + 1], p[q + 2], p[q + 3])[0])
      best = Math.min(best, d - sh.r)
    })
    return best
  }
  closed(x: number, y: number, own: Set<Plot>) { return this.clearance(x, y, own, CELL) < 0 }
}

// ------------------------------------------------------------------ finding the way

/** Out at sea, a little past a land's (unroughened) coast. */
const seaward = (L: World['regions'][number], x: number, y: number) => Math.hypot(x - L.x, y - L.y) > coastReach(L, x, y) + CELL * 0.5

interface Goal { x: number; y: number; reached?: (x: number, y: number) => boolean }

/** A* over a grid three quarters of a plot fine. Steps cost their length, more uphill, a little more on high ground
 *  and by a slow noise (which gives the bends); towns not the river's own are closed, and so is
 *  the sea unless the sea is where it is going. */
class Router {
  private static G = CELL * 0.75
  private elev = new Map<number, number>()
  private cover = new Map<number, Plot[]>()
  constructor(private T: Terrain, private ground: Footprints) {}

  /** A course from (ax, ay) to the goal, or null when there is no way within reason (the search
   *  may spread over an area a few times the straight distance, no more). */
  route(ax: number, ay: number, goal: Goal, land: number, own: Set<Plot>, key: string): number[] | null {
    const G = Router.G
    const si = Math.round(ax / G), sj = Math.round(ay / G)
    const gi = Math.round(goal.x / G), gj = Math.round(goal.y / G)
    const reached = goal.reached ?? ((x: number, y: number) => Math.hypot(x - goal.x, y - goal.y) < G * 1.2)
    const L = this.T.world.regions[land]
    const ph = hash(key) * 1000
    const id = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768)
    const near = (i: number, j: number, ti: number, tj: number) => Math.abs(i - ti) <= 2 && Math.abs(j - tj) <= 2
    const closed = (k: number, x: number, y: number) => {
      let c = this.cover.get(k)
      if (c === undefined) { c = this.ground.covering(x, y); this.cover.set(k, c) }
      return c.some((p) => !own.has(p))
    }
    const open = new Heap()
    const cost = new Map<number, number>(), from = new Map<number, number>()
    cost.set(id(si, sj), 0)
    open.push(0, si, sj)
    const span = Math.hypot(goal.x - ax, goal.y - ay) / G + 8
    const limit = Math.min(12000, span * span * 1.5)
    for (let n = 0; n < limit && open.size; n++) {
      const [ci, cj] = open.pop()
      const ck = id(ci, cj), cc = cost.get(ck)!
      const x = ci * G, y = cj * G
      if (n > 0 && reached(x, y)) return this.trace(from, ck, ax, ay, goal, reached(goal.x, goal.y))
      const ce = this.height(ci, cj)
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue
          const ni = ci + di, nj = cj + dj, nx = ni * G, ny = nj * G
          const nk = id(ni, nj)
          // the river may always leave its source and enter its goal
          const free = near(ni, nj, si, sj) || near(ni, nj, gi, gj)
          if (!free && closed(nk, nx, ny)) continue
          if (seaward(L, nx, ny) && !reached(nx, ny)) continue
          const ne = this.height(ni, nj)
          const step = Math.hypot(di, dj) * G * (1 + 3 * Math.max(0, ne - ce) + 0.5 * ne + 1.4 * vnoise(nx + ph, ny, CELL * 6, 61))
          const nc = cc + step
          if (nc >= (cost.get(nk) ?? Infinity)) continue
          cost.set(nk, nc)
          from.set(nk, ck)
          open.push(nc + Math.hypot(nx - goal.x, ny - goal.y) * 1.8, ni, nj)
        }
      }
    }
    return null
  }

  /** Walk back from the cell reached to the start; end on the goal itself when it lies inside
   *  what counts as reached (a point goal), or on the cell reached (the sea, a lake, a river). */
  private trace(from: Map<number, number>, end: number, ax: number, ay: number, goal: Goal, onGoal: boolean): number[] {
    const G = Router.G
    const out: number[] = []
    for (let k: number | undefined = end; k !== undefined; k = from.get(k)) {
      out.push((Math.floor(k / 65536) - 32768) * G, ((k % 65536) - 32768) * G)
    }
    const pts: number[] = [ax, ay]
    for (let q = out.length - 4; q >= 0; q -= 2) pts.push(out[q], out[q + 1])
    if (onGoal) pts.push(goal.x, goal.y)
    return pts
  }

  private height(i: number, j: number): number {
    const k = (i + 32768) * 65536 + (j + 32768)
    let e = this.elev.get(k)
    if (e === undefined) {
      e = elevAt(this.T, i * Router.G, j * Router.G)?.e ?? 0
      this.elev.set(k, e)
    }
    return e
  }
}

/** A binary min-heap of grid cells by priority. */
class Heap {
  private p: number[] = []
  private c: number[] = []
  get size() { return this.p.length }
  push(pri: number, i: number, j: number) {
    let n = this.p.length
    this.p.push(pri); this.c.push(i, j)
    while (n > 0) {
      const up = (n - 1) >> 1
      if (this.p[up] <= this.p[n]) break
      this.swap(n, up)
      n = up
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.c[0], this.c[1]]
    const lastP = this.p.pop()!, lj = this.c.pop()!, li = this.c.pop()!
    if (this.p.length) {
      this.p[0] = lastP; this.c[0] = li; this.c[1] = lj
      for (let n = 0; ;) {
        const l = n * 2 + 1, r = l + 1
        let m = n
        if (l < this.p.length && this.p[l] < this.p[m]) m = l
        if (r < this.p.length && this.p[r] < this.p[m]) m = r
        if (m === n) break
        this.swap(n, m)
        n = m
      }
    }
    return top
  }
  private swap(a: number, b: number) {
    [this.p[a], this.p[b]] = [this.p[b], this.p[a]]
    ;[this.c[a * 2], this.c[b * 2]] = [this.c[b * 2], this.c[a * 2]]
    ;[this.c[a * 2 + 1], this.c[b * 2 + 1]] = [this.c[b * 2 + 1], this.c[a * 2 + 1]]
  }
}

// ------------------------------------------------------------------ springs, pools and lakes

/** Where a river rises: the highest open ground behind (upstream of) a point. */
function springOf(T: Terrain, ground: Footprints, x: number, y: number, [ux, uy]: [number, number], r0: number, r1: number, key: string): [number, number] {
  let best: [number, number] = [x - ux * r0, y - uy * r0], be = -Infinity
  const back = Math.atan2(-uy, -ux), none = new Set<Plot>()
  for (let i = 0; i < 20; i++) {
    const a = back + (hash(`${key}:a${i}`) - 0.5) * 2.4, r = r0 + hash(`${key}:r${i}`) * (r1 - r0)
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r
    const g = elevAt(T, px, py)
    if (!g || ground.clearance(px, py, none) < CELL * 0.6) continue
    if (g.e > be) { be = g.e; best = [px, py] }
  }
  return best
}

/** The highest open point inside a folder: where its beck rises. */
function highGround(T: Terrain, ground: Footprints, q: Plot): [number, number] | null {
  let best: [number, number] | null = null, be = -Infinity
  const none = new Set<Plot>()
  for (let i = 0; i < 14; i++) {
    const a = hash(`${q.path}:sa${i}`) * 6.28, r = q.r * (0.3 + 0.55 * hash(`${q.path}:sr${i}`))
    const px = plotX(q) + Math.cos(a) * r, py = plotY(q) + Math.sin(a) * r
    const g = elevAt(T, px, py)
    if (!g || ground.clearance(px, py, none) < CELL * 0.6) continue
    if (g.e > be) { be = g.e; best = [px, py] }
  }
  return best
}

/** The deep folders of a basin's room (outside the basin, and not dated folders themselves)
 *  that send becks down to its river: the three biggest. */
function beckSources(plots: Plot[], B: Plot, T: Terrain, riverTowns: Map<Plot, RiverTown>): Plot[] {
  const top = B.path.split('/')[0]
  return plots.filter((q) => q.path.startsWith(top + '/') && q !== B && !q.path.startsWith(B.path + '/') &&
    !B.path.startsWith(q.path + '/') && !riverTowns.has(q) && (T.height.get(q) ?? 0) >= 1)
    .sort((a, b) => b.files - a.files).slice(0, 3)
}

/** Where water pools: the lowest open ground ahead with room for a lake of radius r (its shore
 *  reaches about twice that at its longest lobe), or null when there is none. */
function poolOf(T: Terrain, ground: Footprints, x: number, y: number, ux: number, uy: number, r: number, key: string): { x: number; y: number; r: number } | null {
  let best: { x: number; y: number; r: number } | null = null, be = Infinity
  const ahead = Math.atan2(uy, ux), none = new Set<Plot>()
  for (let i = 0; i < 24; i++) {
    const a = ahead + (hash(`${key}:p${i}`) - 0.5) * 2.2, dist = r * (1.8 + hash(`${key}:q${i}`) * 2.4)
    const px = x + Math.cos(a) * dist, py = y + Math.sin(a) * dist
    const g = elevAt(T, px, py)
    if (!g) continue
    const room = Math.min(ground.clearance(px, py, none, r * 2.5), g.clear)
    if (room < Math.max(r * 0.75, CELL * 3)) continue
    const score = g.e - (Math.min(room, 2 * r) / r) * 0.3
    if (score < be) { be = score; best = { x: px, y: py, r: Math.min(r, room * 0.5) } }
  }
  return best
}

/** An organic shoreline: an irregular lobed ring, set crosswise to the water coming in so a
 *  river meets its long side, with inlets bitten into it and an island or two when it is large. */
function makeLake(cx: number, cy: number, r: number, inflow: number, key: string, name: string): Lake {
  const N = 64, ring: Array<[number, number]> = []
  const ph = hash(key + ':ph') * 40
  const lobes = 2 + Math.floor(hash(key + ':l') * 2)
  const f1 = hash(key + ':1') * 6.28, f2 = hash(key + ':2') * 6.28
  const inlets = Array.from({ length: 2 + Math.floor(hash(key + ':n') * 3) }, (_, i) => [hash(`${key}:i${i}`) * 6.28, 0.18 + hash(`${key}:d${i}`) * 0.22])
  const ang = inflow + Math.PI / 2 + (hash(key + ':a') - 0.5) * 0.8
  const ca = Math.cos(ang), sa = Math.sin(ang)
  const stretch = Math.min(1, r / (CELL * 4))           // small waters are rounder; big ones stretch out
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2
    const nz = vnoise(Math.cos(t) * 2.2 + ph, Math.sin(t) * 2.2 + ph, 1, 41) - 0.5
    let rr = r * (1 + 0.22 * Math.sin(lobes * t + f1) + 0.1 * Math.sin((lobes + 2) * t + f2) + 0.45 * nz)
    for (const [a, depth] of inlets) {
      let dt = Math.abs(t - a) % (Math.PI * 2)
      if (dt > Math.PI) dt = Math.PI * 2 - dt
      rr *= 1 - depth * Math.exp(-((dt / 0.13) ** 2))
    }
    const lx = Math.cos(t) * rr * (1.1 + 0.25 * stretch), ly = Math.sin(t) * rr * (0.9 - 0.18 * stretch)
    ring.push([cx + lx * ca - ly * sa, cy + lx * sa + ly * ca])
  }
  const pts = roughen(ring, key, 2, 0.12)
  const islands: Float32Array[] = []
  const count = r > CELL * 4.5 ? 2 : r > CELL * 2.6 ? 1 : 0
  for (let k = 0; k < count; k++) {
    const a = hash(`${key}:ia${k}`) * 6.28, off = r * (0.15 + 0.25 * hash(`${key}:io${k}`)), ir = r * (0.1 + 0.07 * hash(`${key}:ir${k}`))
    const ox = Math.cos(a) * off * 1.2, oy = Math.sin(a) * off * 0.6
    const ix = cx + ox * ca - oy * sa, iy = cy + ox * sa + oy * ca
    const isl: Array<[number, number]> = []
    for (let q = 0; q < 9; q++) {
      const t = (q / 9) * Math.PI * 2, rr = ir * (0.7 + hash(`${key}:${k}:${q}`) * 0.6)
      isl.push([ix + Math.cos(t) * rr * 1.3, iy + Math.sin(t) * rr])
    }
    islands.push(roughen(isl, `${key}:isl${k}`, 2, 0.16))
  }
  return { pts, islands, box: boxOf(pts), x: cx, y: cy, r: r * 1.15, name }
}

// ------------------------------------------------------------------ banks and bridges

/** How far a mark's drawing reaches from its centre, as a share of a plot. */
const REACH = 0.45

/** The water, indexed by where it lies: every river segment and lake in a hash grid. */
export class WaterIndex {
  private grid = new Grid(CELL * 3)
  private segs: Array<[River, number]> = []
  constructor(readonly rivers: River[], readonly lakes: Lake[]) {
    for (const r of rivers) {
      for (let q = 0; q + 1 < r.pts.length / 2; q++) {
        const h = Math.max(r.w[q], r.w[q + 1]) / 2
        const x0 = Math.min(r.pts[q * 2], r.pts[q * 2 + 2]) - h, x1 = Math.max(r.pts[q * 2], r.pts[q * 2 + 2]) + h
        const y0 = Math.min(r.pts[q * 2 + 1], r.pts[q * 2 + 3]) - h, y1 = Math.max(r.pts[q * 2 + 1], r.pts[q * 2 + 3]) + h
        this.grid.add(this.segs.push([r, q]) - 1, x0, y0, x1, y1)
      }
    }
  }

  /** Whether water lies within `reach` of a point: if so, the way out of it (a unit vector). */
  at(x: number, y: number, reach: number): [number, number] | null {
    let out: [number, number] | null = null
    this.grid.each(x - reach, y - reach, x + reach, y + reach, (id) => {
      if (out) return
      const [r, q] = this.segs[id], P = r.pts
      const [d, t] = toSegment(x, y, P[q * 2], P[q * 2 + 1], P[q * 2 + 2], P[q * 2 + 3])
      if (d >= r.w[q] / 2 + reach) return
      const sx = P[q * 2] + (P[q * 2 + 2] - P[q * 2]) * t, sy = P[q * 2 + 1] + (P[q * 2 + 3] - P[q * 2 + 1]) * t
      const l = Math.hypot(x - sx, y - sy)
      const tl = Math.hypot(P[q * 2 + 2] - P[q * 2], P[q * 2 + 3] - P[q * 2 + 1]) || 1
      out = l > 1e-6 ? [(x - sx) / l, (y - sy) / l] : [-(P[q * 2 + 3] - P[q * 2 + 1]) / tl, (P[q * 2 + 2] - P[q * 2]) / tl]
    })
    if (out) return out
    for (const l of this.lakes) {
      if (x < l.box[0] - reach || x > l.box[2] + reach || y < l.box[1] - reach || y > l.box[3] + reach) continue
      const [qx, qy] = nearestOn(l.pts, x, y)
      if (insidePolygon(l.pts, x, y) || Math.hypot(x - qx, y - qy) < reach) {
        const dl = Math.hypot(x - l.x, y - l.y) || 1
        return [(x - l.x) / dl, (y - l.y) / dl]
      }
    }
    return null
  }

  /** Where a polyline crosses a river's centreline: the point, the river's heading, its width. */
  crossings(line: ArrayLike<number>, fn: (x: number, y: number, heading: number, width: number) => void) {
    for (let a = 0; a + 3 < line.length; a += 2) {
      const ax = line[a], ay = line[a + 1], bx = line[a + 2], by = line[a + 3]
      const seen = new Set<number>()
      this.grid.each(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), (id) => {
        if (seen.has(id)) return
        seen.add(id)
        const [r, q] = this.segs[id], P = r.pts
        const hit = crossing(ax, ay, bx, by, P[q * 2], P[q * 2 + 1], P[q * 2 + 2], P[q * 2 + 3])
        if (hit) fn(hit[0], hit[1], Math.atan2(P[q * 2 + 3] - P[q * 2 + 1], P[q * 2 + 2] - P[q * 2]), r.w[q])
      })
    }
  }
}

/** Move any file mark the water has reached out onto the bank: square to the river from its
 *  nearest point, or straight out of a lake, to the first spot clear of water and of other
 *  marks. Returns how many moved. The river towns' houses are set for a modest river; where
 *  the water has grown wide they step back a little, as a real waterfront would. */
export function moveMarksOffWater(marks: Marks, water: WaterIndex): number {
  const grid = new Grid(CELL * 2)
  for (let i = 0; i < marks.n; i++) grid.add(i, marks.gx[i], marks.gy[i], marks.gx[i], marks.gy[i])
  const crowded = (x: number, y: number, self: number) => {
    let hit = false
    grid.each(x - CELL, y - CELL, x + CELL, y + CELL, (j) => {
      if (j !== self && Math.hypot(marks.gx[j] - x, marks.gy[j] - y) < CELL * 0.8) hit = true
    })
    return hit
  }
  let moved = 0
  for (let i = 0; i < marks.n; i++) {
    const reach = CELL * REACH * marks.scale[i]
    const x = marks.gx[i], y = marks.gy[i]
    const away = water.at(x, y, reach)
    if (!away) continue
    const [dx, dy] = away
    for (let step = 1; step <= 60; step++) {
      const d = step * CELL * 0.25
      // out from the water first; failing that, slanting along the bank either way
      const tries: Array<[number, number]> = [[x + dx * d, y + dy * d], [x + (dx - dy * 0.7) * d, y + (dy + dx * 0.7) * d], [x + (dx + dy * 0.7) * d, y + (dy - dx * 0.7) * d]]
      const spot = tries.find(([tx, ty]) => !water.at(tx, ty, reach) && !crowded(tx, ty, i))
      if (!spot) continue
      marks.gx[i] = spot[0]; marks.gy[i] = spot[1]
      moved++
      break
    }
  }
  return moved
}

/** A bridge wherever a road crosses a river: centred on the crossing, square to the water. */
export function bridgesOf(roads: Float32Array[], water: WaterIndex): Bridge[] {
  const out: Bridge[] = []
  for (const road of roads) {
    water.crossings(road, (x, y, heading, width) => {
      if (out.some((b) => Math.hypot(b.x - x, b.y - y) < CELL * 1.5)) return
      out.push({ x, y, angle: heading + Math.PI / 2, span: width + CELL * 0.5 })
    })
  }
  return out
}

/** Where segments a-b and c-d cross, if they do. */
function crossing(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): [number, number] | null {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy
  const den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-9) return null
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [ax + rx * t, ay + ry * t] : null
}
