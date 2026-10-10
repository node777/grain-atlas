// What goes into one map tile, back to front: water-lining out to sea, the land with its border
// band in the region's dye and its inked coast, roads, water, then relief and file marks together
// in one pass sorted by height on the page (so a peak's foot hides the road behind it and a house
// stands in front of the field above it), and town signs while files are only dots.
//
// Level of detail is by size on screen. A file plot narrower than a few pixels is a dot of its
// land-use tint; wider, each file is its simple mark; wider still, its full drawing. Relief is
// sampled on world-anchored jittered grids chosen by zoom, peaks and hills on wide ones and woods
// on finer ones, so what is there stays put while finer marks fill in as you come closer. Every
// mark is copied from a pre-drawn sprite.

import type { World } from './layout'
import { type Atlas, zoneClear } from './atlas'
import { CELL, coastReach, elevAt, ih, vnoise } from './terrain'
import { boxesMeet, type Box } from './geom'
import {
  Kind, KIND_COUNT, DOTS_BELOW, SIMPLE_BELOW, drawGlyph, hill, kindTint, markSize, mountain, tree, tuft, yardsAt, type Ink,
} from './glyphs'
import { Sprites, stepOf } from './sprites'
import { WaterPainter, pathOf } from './waterdraw'
import { TILE_CANVAS } from './tiles'

/** Water-lining: how many rings run out from a shore, and how far apart (css px). */
const RINGS = 5, RING_GAP = 3.3

/** One tile being painted: its context, world rectangle and scale, and the lands it touches. */
interface Tile {
  g: CanvasRenderingContext2D
  box: Box
  s: number                            // device pixels per world unit
  px: number                           // css pixels per world unit
  wpx: number                          // world units per css pixel
  lands: number[]
  islets: number[]
  inland: number                       // the one land the tile lies wholly inside, or -1
}

/** Something drawn in the back-to-front pass: a file mark, or a piece of relief. */
type Item =
  | { y: number; x: number; mark: number }
  | { y: number; x: number; relief: 'peak' | 'hill' | 'tree' | 'tuft'; size: number; h: number }

export class TilePainter {
  private coasts: Path2D[]
  private islets: Path2D[]
  /** each coast cut into short open runs, so a tile strokes only the shore near it */
  private shore: Array<Array<{ path: Path2D; pts: Float32Array; box: Box }>>
  private sprites = new Sprites()
  private water = new WaterPainter()

  constructor(private at: Atlas, private world: World) {
    this.coasts = at.coastPts.map(pathOf)
    this.islets = at.islets.map((i) => pathOf(i.pts))
    this.shore = at.coastPts.map((pts) => shoreRuns(pts))
  }

  private I!: Ink
  private C!: Record<string, string>
  private relief = true
  private dpr = 1

  /** The palette and settings tiles are painted with (the cache is reset when they change). */
  configure(I: Ink, C: Record<string, string>, relief: boolean, dpr: number, key: string) {
    this.I = I; this.C = C; this.relief = relief; this.dpr = dpr
    this.sprites.reset(key, dpr)
  }

  readonly paint = (g: CanvasRenderingContext2D, x0: number, y0: number, s: number) => {
    const at = this.at, px = s / this.dpr, wpx = 1 / px
    const span = TILE_CANVAS / s
    const box: Box = [x0, y0, x0 + span, y0 + span]
    const seaPad = (RINGS * RING_GAP + 3) * wpx
    const lands = at.landBox.map((b, i) => (boxesMeet(b, box, seaPad) ? i : -1)).filter((i) => i >= 0)
    const islets = at.islets.map((il, i) => (boxesMeet(il.box, box, seaPad) ? i : -1)).filter((i) => i >= 0)
    const t: Tile = { g, box, s, px, wpx, lands, islets, inland: lands.length === 1 && this.whollyInland(lands[0], box, wpx) ? lands[0] : -1 }
    g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s)
    g.lineJoin = 'round'
    g.lineCap = 'round'
    if (t.inland < 0) this.shoreLines(t)
    this.land(t)
    if (!lands.length) return
    this.roads(t)
    const land = new Path2D()
    for (const li of lands) land.addPath(this.coasts[li])
    this.water.draw({ g, box, px, land }, at.rivers, at.lakes, at.bridges, this.I)
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)    // from here on in css pixels, tile-local
    const cellPx = CELL * px
    if (cellPx < DOTS_BELOW) this.landUse(t)
    this.drawItems(t, [...(cellPx < DOTS_BELOW ? [] : this.markItems(t)), ...(this.relief ? this.reliefItems(t) : [])])
    if (cellPx < 3.2) this.townSigns(t)
  }

  /** A tile wholly inland skips the shore work. The coast runs round its land's middle, so a tile
   *  whose corners and centre all lie well inside it lies wholly inside. */
  private whollyInland(li: number, [x0, y0, x1, y1]: Box, wpx: number): boolean {
    const land = this.world.regions[li], pad = Math.max(48, 34 * wpx)
    return [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2]]
      .every(([x, y]) => Math.hypot(x - land.x, y - land.y) <= coastReach(land, x, y) - pad)
  }

  /** Water-lining: rings that follow the shore out to sea, each fainter than the one inside it.
   *  Each ring is the shore pushed straight outward from its land's middle (an islet's, its
   *  own): thin strokes only, and no knots where the shore turns sharply. */
  private shoreLines(t: Tile) {
    const { g, box, px, wpx } = t, I = this.I, at = this.at
    const rings: Array<{ pts: Float32Array; cx: number; cy: number; closed: boolean; count: number }> = []
    for (const li of t.lands) {
      const L = this.world.regions[li]
      for (const run of this.shore[li]) if (boxesMeet(run.box, box, (RINGS * RING_GAP + 3) * wpx)) rings.push({ pts: run.pts, cx: L.x, cy: L.y, closed: false, count: RINGS })
    }
    for (const i of t.islets) {
      const b = at.islets[i].box
      // a small islet gets as many rings as it is wide, so it never sits in a dark halo
      rings.push({ pts: at.islets[i].pts, cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, closed: true, count: Math.max(1, Math.min(RINGS, Math.floor(((b[2] - b[0]) * px) / 5))) })
    }
    g.strokeStyle = I.ink
    g.lineWidth = 0.9 * wpx
    for (let r = 1; r <= RINGS; r++) {
      const d = r * RING_GAP * wpx
      g.globalAlpha = 0.1 + 0.42 * (1 - (r - 1) / RINGS)
      g.beginPath()
      for (const ring of rings) {
        if (r > ring.count) continue
        const P = ring.pts
        for (let q = 0; q < P.length; q += 2) {
          const dx = P[q] - ring.cx, dy = P[q + 1] - ring.cy, l = Math.hypot(dx, dy) || 1
          if (q) g.lineTo(P[q] + (dx / l) * d, P[q + 1] + (dy / l) * d); else g.moveTo(P[q] + (dx / l) * d, P[q + 1] + (dy / l) * d)
        }
        if (ring.closed) g.closePath()
      }
      g.stroke()
    }
    g.globalAlpha = 1
  }

  /** The land, its border band in the region's dye, the coast in ink; and the islets. */
  private land(t: Tile) {
    const { g, box, wpx } = t, I = this.I
    g.fillStyle = I.land
    if (t.inland >= 0) g.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1])
    for (const li of t.lands) {
      if (li === t.inland) continue
      const coast = this.coasts[li]
      g.fillStyle = I.land
      g.fill(coast)
      const runs = this.shore[li].filter((run) => boxesMeet(run.box, box, 9 * wpx))
      if (!runs.length) continue
      g.save()
      g.clip(coast)
      g.strokeStyle = this.C[`--el-${this.world.regions[li].region.element}`]
      g.globalAlpha = 0.17
      g.lineWidth = 14 * wpx
      for (const run of runs) g.stroke(run.path)
      g.restore()
      g.strokeStyle = I.ink
      g.globalAlpha = 0.9
      g.lineWidth = 1.3 * wpx
      for (const run of runs) g.stroke(run.path)
      g.globalAlpha = 1
    }
    for (const i of t.islets) {
      g.fillStyle = I.land
      g.fill(this.islets[i])
      g.strokeStyle = I.ink
      g.lineWidth = 1.1 * wpx
      g.stroke(this.islets[i])
    }
  }

  /** Roads: a dashed ink line, fainter when far. */
  private roads(t: Tile) {
    const { g, box, wpx } = t, at = this.at, cellPx = CELL * t.px
    g.strokeStyle = this.I.ink
    g.lineWidth = Math.max(0.6, Math.min(1.4, cellPx * 0.11)) * wpx
    g.globalAlpha = 0.5 * Math.max(0.35, Math.min(1, (cellPx - 0.5) / 2))
    g.setLineDash([4.5 * wpx, 3 * wpx])
    g.beginPath()
    at.roads.forEach((r, i) => {
      if (!boxesMeet(at.roadBox[i], box)) return
      g.moveTo(r[0], r[1])
      for (let q = 2; q < r.length; q += 2) g.lineTo(r[q], r[q + 1])
    })
    g.stroke()
    g.setLineDash([])
    g.globalAlpha = 1
  }

  /** Tile-local css position of a world point. */
  private local(t: Tile, x: number, y: number): [number, number] {
    return [(x - t.box[0]) * t.px, (y - t.box[1]) * t.px]
  }

  private marksNear(t: Tile, fn: (i: number) => void) {
    const m = CELL * 2, [x0, y0, x1, y1] = t.box
    this.at.glyphs.each(x0 - m, y0 - m, x1 + m, y1 + m, fn)
  }

  /** Far out: one dot per file in its land-use tint, grouped so each colour is set once. */
  private landUse(t: Tile) {
    const { g } = t, at = this.at, cellPx = CELL * t.px
    const d = Math.max(0.9, cellPx * 0.92)
    const byKind: number[][] = Array.from({ length: KIND_COUNT }, () => [])
    this.marksNear(t, (i) => byKind[at.kind[i]].push(i))
    byKind.forEach((list, k) => {
      g.fillStyle = kindTint(k as Kind, this.I)
      g.globalAlpha = k === Kind.Field ? 0.7 : 0.9
      for (const i of list) {
        const [x, y] = this.local(t, at.gx[i], at.gy[i])
        g.fillRect(x - d / 2, y - d / 2, d, d)
      }
    })
    g.globalAlpha = 1
  }

  private markItems(t: Tile): Item[] {
    const out: Item[] = []
    this.marksNear(t, (i) => {
      const [x, y] = this.local(t, this.at.gx[i], this.at.gy[i])
      out.push({ x, y, mark: i })
    })
    return out
  }

  /** Relief on wide grids (peaks and hills), woods and meadow on finer ones, each grid anchored to
   *  the world so its marks never move as you zoom. */
  private reliefItems(t: Tile): Item[] {
    const out: Item[] = []
    const { px, box: [x0, y0, x1, y1] } = t
    for (const pass of ['heights', 'cover'] as const) {
      const lo = pass === 'heights' ? 26 : 14, salt = pass === 'heights' ? 0 : 50
      const oMin = Math.ceil(Math.log2(lo / px)), oMax = Math.floor(Math.log2((lo * 4) / px) - 1e-9)
      for (let o = oMin; o <= oMax; o++) {
        const S = 2 ** o, fine = o === oMin
        for (let i = Math.floor((x0 - S) / S); i <= Math.floor((x1 + S) / S); i++) {
          for (let j = Math.floor((y0 - S) / S); j <= Math.floor((y1 + S) / S); j++) {
            const wx = (i + 0.12 + 0.76 * ih(i, j, o + salt)) * S, wy = (j + 0.12 + 0.76 * ih(j, i, o + 77 + salt)) * S
            const gr = this.ground(wx, wy, S * 0.65)
            if (!gr) continue
            const h = ih(i + 31, j - 17, o + salt)
            const piece = pass === 'heights' ? heightAt(gr, S, h) : coverAt(gr, S, h, fine, wx, wy)
            if (!piece) continue
            const [x, y] = this.local(t, wx, wy)
            out.push({ x, y, relief: piece.relief, size: piece.size * px, h })
          }
        }
      }
    }
    return out
  }

  /** The ground at a world point: its height and clear room around, or null where nothing may be
   *  drawn (sea, surf, settlements, water, roads). */
  private ground(x: number, y: number, reach: number): { e: number; clear: number } | null {
    const g = elevAt(this.at, x, y)
    if (!g) return null
    const z = zoneClear(this.at, x, y, Math.min(160, reach))
    return z < 0 ? null : { e: g.e, clear: Math.min(g.clear, z) }
  }

  private drawItems(t: Tile, items: Item[]) {
    const { g } = t, I = this.I, at = this.at, SP = this.sprites, dpr = this.dpr
    const cellPx = CELL * t.px, yards = yardsAt(cellPx)
    const ink = (q: CanvasRenderingContext2D) => { q.lineWidth = 0.9; q.strokeStyle = I.ink }
    items.sort((a, b) => a.y - b.y)
    for (const it of items) {
      g.globalAlpha = 1
      if ('relief' in it) { this.drawRelief(g, it, ink); continue }
      const i = it.mark, k = at.kind[i] as Kind, sc = at.scale[i], h = at.seed[i]
      if (cellPx < SIMPLE_BELOW) { simple(g, k, it.x, it.y, cellPx * sc, h, I); continue }
      if (k === Kind.Field) {
        // a parcel, drawn square and turned to its settlement's street grid
        const [b, q] = stepOf(cellPx), v = Math.floor(h * 8)
        const sp = SP.get(`f${b}:${v}`, q, q * 1.2 + 4, q * 1.2 + 4, q * 0.6 + 2, q * 0.6 + 2, (c) => { ink(c); drawGlyph(c, k, 0, 0, q, (v + 0.5) / 8, 0, I) })
        const cos = Math.cos(at.rot[i]), sin = Math.sin(at.rot[i])
        g.setTransform(dpr * cos, dpr * sin, -dpr * sin, dpr * cos, dpr * it.x, dpr * it.y)
        Sprites.put(g, sp, 0, 0, cellPx)
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        continue
      }
      if (yards) yard(g, it.x, it.y, cellPx, at.rot[i], h, I)
      const size = markSize(k, cellPx, sc), tier = at.tier[i], v = Math.floor(h * 4)
      const [b, q] = stepOf(size)
      // a landmark gets more room round its sprite: spires and banners rise above the plot
      const room = sc !== 1 ? 1.3 : 1.6, pad = sc !== 1 ? 4 : 3
      const sp = SP.get(`${k}:${tier}:${b}:${v}`, q, q * room + pad * 2, q * room + pad * 2, q * room / 2 + pad, q * (sc !== 1 ? 0.95 : 0.85) + pad,
        (c) => { ink(c); drawGlyph(c, k, 0, 0, q, (v + 0.5) / 4, 0, I, tier) })
      Sprites.put(g, sp, it.x, it.y, size)
    }
    g.globalAlpha = 1
  }

  private drawRelief(g: CanvasRenderingContext2D, it: Extract<Item, { relief: string }>, ink: (c: CanvasRenderingContext2D) => void) {
    const I = this.I, SP = this.sprites, [b, q] = stepOf(it.size)
    if (it.relief === 'peak') {
      const v = Math.floor(it.h * 6)
      Sprites.put(g, SP.get(`m${b}:${v}`, q, q * 2 + 6, q * 1.55 + 5, q + 3, q * 1.55 + 3, (c) => { ink(c); mountain(c, 0, 0, q, (v + 0.5) / 6, I, 1) }), it.x, it.y, it.size)
    } else if (it.relief === 'hill') {
      const v = Math.floor(it.h * 4)
      Sprites.put(g, SP.get(`h${b}:${v}`, q, q * 2 + 6, q * 0.9 + 5, q + 3, q * 0.9 + 3, (c) => { ink(c); hill(c, 0, 0, q, (v + 0.5) / 4, I) }), it.x, it.y, it.size)
    } else if (it.relief === 'tree') {
      Sprites.put(g, SP.get(`t${b}`, q, q * 2 + 6, q * 2.4 + 6, q + 3, q + 3, (c) => { ink(c); tree(c, 0, 0, q, I) }), it.x, it.y, it.size)
    } else {
      g.globalAlpha = 0.5
      Sprites.put(g, SP.get(`u${b}`, q, q + 6, q * 0.75 + 5, q * 0.5 + 3, q * 0.75 + 3, (c) => { ink(c); tuft(c, 0, 0, q) }), it.x, it.y, it.size)
    }
  }

  /** Town signs, while files are only dots. */
  private townSigns(t: Tile) {
    const lim = TILE_CANVAS / this.dpr + 12
    for (const st of this.at.settlements) {
      if (st.n < 6) continue
      const [x, y] = this.local(t, st.x, st.y)
      if (x > -12 && x < lim && y > -12 && y < lim) townSign(t.g, x, y, st.n, st.houses, this.I)
    }
  }
}

/** Peaks where the land is high, hills where it rises; sized to the room around them. */
function heightAt(gr: { e: number; clear: number }, S: number, h: number) {
  if (gr.e >= 1.2) {
    const size = Math.min(S * 0.46 * (0.8 + 0.4 * Math.min(1, (gr.e - 1.2) / 1.6)) * (0.85 + 0.3 * h), gr.clear * 1.15)
    return size < S * 0.22 ? null : { relief: 'peak' as const, size }
  }
  if (gr.e >= 0.55) {
    const size = Math.min(S * 0.36, gr.clear * 1.1)
    return size < S * 0.16 ? null : { relief: 'hill' as const, size }
  }
  return null
}

/** Woods (by a slow noise) and the odd grass tuft in the open, below the peaks. The fine grid
 *  fills the woods; the coarse one adds an odd big tree. */
function coverAt(gr: { e: number; clear: number }, S: number, h: number, fine: boolean, x: number, y: number) {
  if (gr.e >= 1.2) return null
  const nz = vnoise(x, y, 150, 5) * 0.75 + vnoise(x, y, 47, 6) * 0.25
  if (nz > (gr.e >= 0.55 ? 0.68 : 0.58) && (fine || h < 0.22)) {
    const size = S * (fine ? 0.27 + 0.1 * h : 0.2 + 0.06 * h)
    return gr.clear < size * 0.9 ? null : { relief: 'tree' as const, size }
  }
  return fine && nz < 0.34 && h < 0.15 ? { relief: 'tuft' as const, size: S * 0.26 } : null
}

/** A coast cut into open runs of forty points, each with its box. */
function shoreRuns(pts: Float32Array) {
  const n = pts.length / 2, RUN = 40
  const out: Array<{ path: Path2D; pts: Float32Array; box: Box }> = []
  for (let a = 0; a < n; a += RUN) {
    const run: number[] = []
    for (let q = a; q <= Math.min(n, a + RUN); q++) run.push(pts[(q % n) * 2], pts[(q % n) * 2 + 1])
    const path = new Path2D()
    for (let i = 0; i < run.length; i += 2) (i ? path.lineTo(run[i], run[i + 1]) : path.moveTo(run[i], run[i + 1]))
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let i = 0; i < run.length; i += 2) { x0 = Math.min(x0, run[i]); x1 = Math.max(x1, run[i]); y0 = Math.min(y0, run[i + 1]); y1 = Math.max(y1, run[i + 1]) }
    out.push({ path, pts: Float32Array.from(run), box: [x0, y0, x1, y1] })
  }
  return out
}

/** A mark too small for its drawing: a little block in its tint, outlined. */
function simple(g: CanvasRenderingContext2D, k: Kind, x: number, y: number, s: number, h: number, I: Ink) {
  const d = s * (k === Kind.Field ? 0.98 : 0.56)
  g.fillStyle = kindTint(k, I)
  if (k === Kind.Tree) {
    g.globalAlpha = 0.8
    g.beginPath(); g.arc(x, y, d * 0.55, 0, Math.PI * 2); g.fill()
  } else if (k === Kind.Field) {
    // farmland reads as a patchwork of tones, not a grid
    g.fillStyle = h < 0.62 ? I.wheat : I.green
    g.globalAlpha = 0.14 + h * 0.36
    g.fillRect(x - d / 2, y - d / 2, d, d)
  } else {
    g.globalAlpha = 0.95
    g.fillRect(x - d / 2, y - d / 2, d, d)
    g.globalAlpha = 0.7
    g.lineWidth = 0.6
    g.strokeStyle = I.ink
    g.strokeRect(x - d / 2, y - d / 2, d, d)
  }
  g.globalAlpha = 1
}

/** Close in, each building stands in its own yard: a hedged plot along the street grid. */
function yard(g: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, h: number, I: Ink) {
  const half = s * 0.44
  g.save()
  g.translate(x, y)
  g.rotate(rot)
  g.beginPath()
  g.roundRect(-half, -half, half * 2, half * 2, s * 0.06)
  g.fillStyle = h < 0.5 ? I.green : I.wheat
  g.globalAlpha = 0.07
  g.fill()
  g.globalAlpha = 0.35
  g.setLineDash([1.5, 3])
  g.lineWidth = 1.1
  g.strokeStyle = I.ink
  g.stroke()
  g.restore()
}

/** A settlement's sign at a distance: a ring for a hamlet, a dotted core for a town, a walled
 *  double ring for a city. */
function townSign(g: CanvasRenderingContext2D, x: number, y: number, n: number, houses: number, I: Ink) {
  const r = Math.min(6.5, 1.8 + Math.log2(n) * 0.55)
  g.lineWidth = 1
  g.strokeStyle = I.ink
  if (n >= 150) {
    g.beginPath(); g.arc(x, y, r + 2.2, 0, Math.PI * 2)
    g.fillStyle = I.land; g.fill(); g.stroke()
    g.fillStyle = I.ink
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      g.fillRect(x + Math.cos(a) * (r + 2.2) - 1.2, y + Math.sin(a) * (r + 2.2) - 1.2, 2.4, 2.4)
    }
  }
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2)
  g.fillStyle = I.land; g.fill(); g.stroke()
  if (houses >= 6 || n >= 24) {
    g.beginPath(); g.arc(x, y, r * 0.5, 0, Math.PI * 2)
    g.fillStyle = houses >= 6 ? I.roof : I.roof2; g.fill()
  }
}
