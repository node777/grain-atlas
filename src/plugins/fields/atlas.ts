// The map view's land, worked out once per tree. It starts from the bubble layout (same regions,
// same rooms, same folders in the same places) and redraws what is inside them as an atlas would:
// towns where the files are (towns.ts), rivers and lakes among them (water.ts), roads joining
// each folder's settlement to its sub-folders', and a surveyed coast with islets offshore.
//
// Everything is derived from paths alone and hashed, so the same tree draws the same map, and a
// grown tree grows the map: new files extend their settlement, new folders found new ones.

import type { Entry } from '@/grain/repo'
import { hash, type Plot, type World } from './layout'
import { CELL, plotX, plotY, type Terrain } from './terrain'
import { Grid, boxOf, roughen, type Box } from './geom'
import { layTowns, type Marks, type Settlement } from './towns'
import { makeWater, moveMarksOffWater, bridgesOf, WaterIndex, type Bridge, type Lake, type River } from './water'

export { CELL } from './terrain'
export type { Settlement } from './towns'
export type { River, Lake, Bridge } from './water'

/** A stroke of occupied ground. Soft ones (roads) only keep relief off their own line; hard ones
 *  (towns, rivers, lakes) also cap how big a peak may stand beside them. */
interface Capsule { ax: number; ay: number; bx: number; by: number; r: number; soft?: boolean }

export interface Atlas extends Marks, Terrain {
  glyphs: Grid                         // marks by position, for picking and for tiles
  plots: Plot[]                        // every folder, parents before children
  settlements: Settlement[]
  settleOf: Map<Plot, Settlement>
  rivers: River[]
  lakes: Lake[]
  bridges: Bridge[]
  roads: Float32Array[]
  roadBox: Box[]
  capsules: Capsule[]
  zones: Grid                          // capsules, for keeping relief off towns, water and roads
  coastPts: Float32Array[]             // per land (world.regions order), roughened
  islets: Array<{ pts: Float32Array; box: Box; land: number }>
  index: Map<string, { x: number; y: number; r: number }>
  rose: { x: number; y: number }
  cartouche: { x: number; y: number }
  bounds: { x0: number; y0: number; x1: number; y1: number }
  /** marks the water reached and the bank pass moved (for the tests and the curious) */
  movedOffWater: number
}

export function buildAtlas(world: World, entries: Map<string, Entry>): Atlas {
  const { plots, height, landOf } = surveyPlots(world)
  const coastPts = world.regions.map((land) => roughen(land.hull, land.region.id, 4, 0.15))
  const landBox = coastPts.map((p) => boxOf(p))
  const terrain: Terrain = { world, height, landBox }

  const linkLike = (path: string) => { const k = entries.get(path)?.kind; return k === 'link' || k === 'module' }
  const towns = layTowns(plots, linkLike, (p) => coastPts[landOf.get(p)!])
  const { rivers, lakes } = makeWater({ world, terrain, plots, landOf, coastPts, towns })
  const water = new WaterIndex(rivers, lakes)
  const movedOffWater = moveMarksOffWater(towns.marks, water)
  const roads = roadsOf(world, plots, towns.settleOf, new Set(towns.basins.map((b) => b.plot)))
  const marks = towns.marks

  const capsules: Capsule[] = [
    ...towns.settlements.map((s) => townCapsules(s, towns.riverTowns.get(s.plot)?.line)).flat(),
    ...rivers.flatMap((r) => alongLine(r.pts, (i) => r.w[i] * 0.5 + CELL * 0.5)),
    ...lakes.map((l) => ({ ax: l.x, ay: l.y, bx: l.x, by: l.y, r: l.r * 1.3 + CELL * 0.6 })),
    ...roads.flatMap((road) => alongLine(road, () => CELL * 0.55, true)),
  ]
  const zones = new Grid(40)
  capsules.forEach((c, i) => zones.add(i, Math.min(c.ax, c.bx) - c.r, Math.min(c.ay, c.by) - c.r, Math.max(c.ax, c.bx) + c.r, Math.max(c.ay, c.by) + c.r))
  const glyphs = new Grid(CELL * 4)
  for (let i = 0; i < marks.n; i++) glyphs.add(i, marks.gx[i], marks.gy[i], marks.gx[i], marks.gy[i])

  // folders where the atlas set them, files where their mark stands (for focus and journeys)
  const index = new Map<string, { x: number; y: number; r: number }>()
  for (const p of plots) index.set(p.path, { x: plotX(p), y: plotY(p), r: p.r })
  for (let i = 0; i < marks.n; i++) index.set(marks.path[i], { x: marks.gx[i], y: marks.gy[i], r: CELL * 0.5 * marks.scale[i] })

  return {
    ...marks, ...terrain, glyphs, plots, settlements: towns.settlements, settleOf: towns.settleOf,
    rivers, lakes, bridges: bridgesOf(roads, water), roads, roadBox: roads.map((r) => boxOf(r, CELL)),
    capsules, zones, coastPts, islets: isletsOf(world), index, ...openSea(world, landBox), movedOffWater,
  }
}

/** Every folder in map order, how many levels of folders lie beneath each, and its land; and
 *  each plot's map position reset to its bubble position (the towns move a few). */
function surveyPlots(world: World) {
  const plots: Plot[] = []
  const height = new Map<Plot, number>()
  const landOf = new Map<Plot, number>()
  const walk = (p: Plot, li: number): number => {
    p.mx = p.x; p.my = p.y; p.mlx = p.lx; p.mly = p.ly
    plots.push(p)
    landOf.set(p, li)
    let h = 0
    for (const c of p.children) h = Math.max(h, walk(c, li) + 1)
    height.set(p, h)
    return h
  }
  world.regions.forEach((land, li) => land.rooms.forEach((r) => walk(r, li)))
  return { plots, height, landOf }
}

/** Capsules along a polyline, one per segment. */
function alongLine(pts: ArrayLike<number>, r: (i: number) => number, soft = false): Capsule[] {
  const out: Capsule[] = []
  for (let i = 0; i + 3 < pts.length; i += 2) out.push({ ax: pts[i], ay: pts[i + 1], bx: pts[i + 2], by: pts[i + 3], r: r(i / 2), soft })
  return out
}

/** A street town's ground is a disc; a river town's a band along its stretch. */
function townCapsules(s: Settlement, line?: number[]): Capsule[] {
  if (line) return alongLine(line, () => s.r)
  const x = s.plot.mlx!, y = s.plot.mly!
  return [{ ax: x, ay: y, bx: x, by: y, r: s.r }]
}

/** Roads: each folder's settlement joined to its sub-folders' (the tree, walked as a road net),
 *  and each region's rooms joined together, by the shortest network, in gentle curves. */
function roadsOf(world: World, plots: Plot[], settleOf: Map<Plot, Settlement>, basins: Set<Plot>): Float32Array[] {
  const roads: Float32Array[] = []
  const at = (p: Plot): [number, number] => {
    const st = settleOf.get(p)
    return st && !st.river ? [st.x, st.y] : [plotX(p), plotY(p)]
  }
  for (const p of plots) if (p.children.length && !basins.has(p)) roads.push(...network([at(p), ...p.children.map(at)], p.path))
  world.regions.forEach((land) => roads.push(...network(land.rooms.map(at), land.region.id)))
  return roads
}

/** The minimum spanning tree of some points (Prim), each edge a slightly bent curve. */
function network(nodes: Array<[number, number]>, seedKey: string): Float32Array[] {
  const n = nodes.length, out: Float32Array[] = []
  if (n < 2) return out
  const inTree = new Uint8Array(n), best = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1)
  best[0] = 0
  for (let it = 0; it < n; it++) {
    let u = -1
    for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i
    inTree[u] = 1
    if (from[u] >= 0) {
      const edge = bentEdge(nodes[from[u]], nodes[u], hash(`${seedKey}~${u}`))
      if (edge) out.push(edge)
    }
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(nodes[i][0] - nodes[u][0], nodes[i][1] - nodes[u][1])
      if (!inTree[i] && d < best[i]) { best[i] = d; from[i] = u }
    }
  }
  return out
}

function bentEdge([ax, ay]: [number, number], [bx, by]: [number, number], h: number): Float32Array | null {
  const len = Math.hypot(bx - ax, by - ay)
  if (len <= CELL * 2) return null
  const bend = (h - 0.5) * 0.36 * len
  const cx = (ax + bx) / 2 - ((by - ay) / len) * bend, cy = (ay + by) / 2 + ((bx - ax) / len) * bend
  const m = Math.max(6, Math.min(24, Math.round(len / (CELL * 3))))
  const pts: number[] = [ax, ay]
  for (let s = 1; s <= m; s++) {
    const t = s / m, v = 1 - t
    pts.push(v * v * ax + 2 * v * t * cx + t * t * bx, v * v * ay + 2 * v * t * cy + t * t * by)
  }
  return Float32Array.from(pts)
}

/** A few islets off each coast, where they would not crowd a neighbour. */
function isletsOf(world: World): Atlas['islets'] {
  const out: Atlas['islets'] = []
  world.regions.forEach((land, li) => {
    const id = land.region.id
    const count = 2 + Math.floor(hash(id + ':isl') * 4)
    for (let i = 0; i < count; i++) {
      const hp = land.hull[Math.floor(hash(`${id}:ih${i}`) * land.hull.length)]
      const ox = hp[0] - land.x, oy = hp[1] - land.y, ol = Math.hypot(ox, oy) || 1
      const out0 = 34 + hash(`${id}:io${i}`) * 70, r = 5 + hash(`${id}:ir${i}`) * 15
      const x = hp[0] + (ox / ol) * out0, y = hp[1] + (oy / ol) * out0
      if (!world.regions.every((o, oi) => oi === li || Math.hypot(x - o.x, y - o.y) > o.r * 1.15 + r + 40)) continue
      const ring: Array<[number, number]> = []
      for (let s = 0; s < 9; s++) {
        const t = (s / 9) * Math.PI * 2, rr = r * (0.75 + hash(`${id}:${i}:${s}`) * 0.5)
        ring.push([x + Math.cos(t) * rr * 1.25, y + Math.sin(t) * rr])
      }
      const pts = roughen(ring, `${id}:isl${i}`, 2, 0.18)
      out.push({ pts, box: boxOf(pts), land: li })
    }
  })
  return out
}

/** The map's bounds, and the two corners of open sea for the rose and the cartouche. */
function openSea(world: World, landBox: Box[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const b of landBox) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]) }
  const openness = (x: number, y: number) => Math.min(...world.regions.map((l) => Math.hypot(x - l.x, y - l.y) - l.r))
  const inset = Math.min(x1 - x0, y1 - y0) * 0.1
  const openest = (cands: Array<[number, number]>) => cands.reduce((b, c) => (openness(c[0], c[1]) > openness(b[0], b[1]) ? c : b))
  const [rx, ry] = openest([[x0 + inset, y1 - inset], [x1 - inset, y1 - inset]])
  const [tx, ty] = openest([[x0 + inset, y0 + inset], [x1 - inset, y0 + inset]])
  return { rose: { x: rx, y: ry }, cartouche: { x: tx, y: ty }, bounds: { x0, y0, x1, y1 } }
}

/** Distance from a point to the nearest capsule edge (negative inside one), looked up near it. */
export function zoneClear(at: Atlas, x: number, y: number, reach: number): number {
  let best = reach
  at.zones.each(x - reach, y - reach, x + reach, y + reach, (id) => {
    if (best < 0) return
    const c = at.capsules[id]
    // cheap reject: the capsule's box is further off than the best so far
    if (Math.min(c.ax, c.bx) - c.r - x > best || x - Math.max(c.ax, c.bx) - c.r > best ||
      Math.min(c.ay, c.by) - c.r - y > best || y - Math.max(c.ay, c.by) - c.r > best) return
    const dx = c.bx - c.ax, dy = c.by - c.ay
    const l2 = dx * dx + dy * dy
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - c.ax) * dx + (y - c.ay) * dy) / l2)) : 0
    const d = Math.hypot(x - (c.ax + dx * t), y - (c.ay + dy * t)) - c.r
    if (d < best && (!c.soft || d < 0)) best = d
  })
  return best
}
