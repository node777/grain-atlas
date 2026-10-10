// The lie of the land: one height field, read by the relief drawing and by the rivers alike, so
// water always runs where the hills say it should. Height grows with how deep a folder's tree
// runs and how many files it holds, softened at folder rims and swelled into ranges by noise.

import type { Plot, RegionLand, World } from './layout'
import type { Box } from './geom'

/** World size of one file's plot on the map. */
export const CELL = 8.6

/** Where the map sets a plot (the atlas moves a few; the rest keep their bubble positions). */
export const plotX = (p: Plot) => p.mx ?? p.x
export const plotY = (p: Plot) => p.my ?? p.y

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

/** What the height field needs: the world, how deep each folder runs, and each land's box. */
export interface Terrain { world: World; height: Map<Plot, number>; landBox: Box[] }

/** How high a folder's open ground stands: folders beneath raise it, and so does sheer size. */
function plotBase(T: Terrain, P: Plot): number {
  const height = T.height.get(P) ?? 0
  return height * 0.75 + Math.max(0, Math.log10(Math.max(1, P.files)) - 1.3) * 0.55 + (P.depth === 0 ? 0.1 : 0)
}

const smoothstep = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))

/** The height of the land at a point (0 lowland, 1 hills, 2 and up mountains), the clear ground
 *  around it before the next folder's rim, and which land it is on; null at sea or in the surf. */
export function elevAt(T: Terrain, x: number, y: number): { e: number; clear: number; li: number } | null {
  const world = T.world
  for (let li = 0; li < world.regions.length; li++) {
    const b = T.landBox[li]
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue
    const land = world.regions[li]
    const coast = coastReach(land, x, y) - 40 - Math.hypot(x - land.x, y - land.y)
    if (coast < 0) continue
    const room = land.rooms.find((r) => Math.hypot(x - plotX(r), y - plotY(r)) < r.r)
    const { e, clear } = room ? insideRoom(T, room, x, y) : openCountry(T, land, x, y)
    // ranges and valleys: the height swells and falls across the land
    const sw = vnoise(x, y, 340, 9) * 0.7 + vnoise(x, y, 110, 10) * 0.3
    return { e: e * (0.25 + 1.5 * sw * sw), clear: Math.min(clear, coast), li }
  }
  return null
}

/** Between rooms: foothills spill a little way out from a high room; lowland beyond. */
function openCountry(T: Terrain, land: RegionLand, x: number, y: number) {
  let e = 0, clear = Infinity
  for (const room of land.rooms) {
    const out = Math.hypot(x - plotX(room), y - plotY(room)) - room.r
    clear = Math.min(clear, out)
    e = Math.max(e, plotBase(T, room) * 0.4 * smoothstep(1 - clamp01(out / (room.r * 0.35 + 60))))
  }
  return { e, clear }
}

/** Within a room: the height of the deepest folder holding the point, falling away toward its
 *  sub-folders and only halving at its own rim, so no circle shows where a folder ends. */
function insideRoom(T: Terrain, room: Plot, x: number, y: number) {
  let P = room
  for (let next = P.children.find((c) => inPlot(c, x, y)); next; next = P.children.find((c) => inPlot(c, x, y))) P = next
  const rim = P.r - Math.hypot(x - plotX(P), y - plotY(P))
  let inner = Infinity
  for (const c of P.children) inner = Math.min(inner, Math.hypot(x - plotX(c), y - plotY(c)) - c.r)
  const ramp = CELL * 2.5 + P.r * 0.1
  const u = clamp01(rim / (ramp * 2))
  let e = plotBase(T, P) * smoothstep(clamp01(inner / ramp)) * (0.5 + 0.5 * smoothstep(u))
  if (P !== room) e = Math.max(e, plotBase(T, room) * 0.5 * (1 - u))
  return { e, clear: inner }
}

const inPlot = (p: Plot, x: number, y: number) => Math.hypot(x - plotX(p), y - plotY(p)) < p.r
