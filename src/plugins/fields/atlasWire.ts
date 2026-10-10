// The atlas, packed to cross from the worker that builds it to the page that draws it.
//
// An atlas points into its world: plots, the settlements' plots, every mark's plot, the heights
// by plot, the world itself. Those references cannot cross a thread, and the page has its own
// world anyway, so plots travel as their paths and are tied back to the page's own plots on
// arrival, along with the map positions the build gave them. Everything else is plain data
// (numbers, typed arrays, maps) that a structured clone carries as it is, except the two spatial
// grids, which arrive as bare objects and get their methods back.

import type { Atlas } from './atlas'
import type { Plot, World } from './layout'
import { Grid } from './geom'

type Linked = 'world' | 'plots' | 'settlements' | 'settleOf' | 'height' | 'plot'

export interface AtlasWire {
  rest: Omit<Atlas, Linked>
  /** plot paths, in the atlas's plot order; every plot reference below is an index into these */
  plots: string[]
  /** per plot: mx, my, mlx, mly (where the map sets it and its loose disc) */
  places: Float64Array
  height: Int32Array
  settlements: Array<Omit<Atlas['settlements'][number], 'plot'> & { plot: number }>
  /** [plot, settlement] pairs */
  settleOf: Int32Array
  /** per mark: its plot */
  markPlot: Int32Array
}

export function packAtlas(at: Atlas): AtlasWire {
  const { world: _world, plots, settlements, settleOf, height, plot, ...rest } = at
  const index = new Map<Plot, number>(plots.map((p, i) => [p, i]))
  const places = new Float64Array(plots.length * 4)
  plots.forEach((p, i) => places.set([p.mx ?? p.x, p.my ?? p.y, p.mlx ?? p.lx, p.mly ?? p.ly], i * 4))
  const settled = new Map(settlements.map((s, i) => [s, i]))
  return {
    rest,
    plots: plots.map((p) => p.path),
    places,
    height: Int32Array.from(plots, (p) => height.get(p) ?? 0),
    settlements: settlements.map((s) => ({ ...s, plot: index.get(s.plot)! })),
    settleOf: Int32Array.from([...settleOf].flatMap(([p, s]) => [index.get(p)!, settled.get(s)!])),
    markPlot: Int32Array.from(plot, (p) => index.get(p)!),
  }
}

/** Tie a packed atlas to the page's own world. Returns null if the world is not the one it was
 *  built from (a plot path it does not know), so a stale build is never drawn. */
export function unpackAtlas(wire: AtlasWire, world: World): Atlas | null {
  const byPath = new Map<string, Plot>()
  const walk = (p: Plot) => { byPath.set(p.path, p); p.children.forEach(walk) }
  world.regions.forEach((land) => land.rooms.forEach(walk))
  const plots: Plot[] = []
  for (const path of wire.plots) {
    const p = byPath.get(path)
    if (!p) return null
    plots.push(p)
  }
  plots.forEach((p, i) => { [p.mx, p.my, p.mlx, p.mly] = wire.places.subarray(i * 4, i * 4 + 4) })
  const settlements = wire.settlements.map((s) => ({ ...s, plot: plots[s.plot] }))
  const settleOf = new Map<Plot, Atlas['settlements'][number]>()
  for (let i = 0; i < wire.settleOf.length; i += 2) settleOf.set(plots[wire.settleOf[i]], settlements[wire.settleOf[i + 1]])
  const { rest } = wire
  Object.setPrototypeOf(rest.glyphs, Grid.prototype)
  Object.setPrototypeOf(rest.zones, Grid.prototype)
  return {
    ...rest,
    world,
    plots,
    settlements,
    settleOf,
    height: new Map(plots.map((p, i) => [p, wire.height[i]])),
    plot: Array.from(wire.markPlot, (i) => plots[i]),
  }
}
