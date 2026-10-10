// Painting the map view. The still land is drawn into cached tiles: water-lined coasts, a
// hand-coloured border band in each region's dye, roads, rivers, and then relief and settlements
// together in one back-to-front pass, so a peak's foot hides the road behind it and a house
// stands in front of the field above it. What moves or answers the hand is drawn live over the
// tiles each frame: rhumb lines, the rose and the cartouche, mist, seeds, the hover and the names.
//
// Level of detail is by size on screen. A file plot narrower than a few pixels is a dot of its
// land-use tint and each settlement wears a town sign; wider, each file is its simple mark; wider
// still, its full drawing. Relief is sampled on world-anchored jittered grids chosen by zoom,
// peaks and hills on wide ones and woods on finer ones, so what is there stays put while finer
// marks fill in as you come closer. Every mark is copied from a pre-drawn sprite (sprites.ts).

import type { CanvasApi } from '@/ui/useCanvas'
import { journeyById } from '@/grain/quests'
import type { Plot, World } from './layout'
import {
  K, OX, OY, W, H, board, fogPattern, beginFrame, drawSeeds, drawPulse, drawRoad, regionTitle, type Geo, type Scene,
} from './draw'
import { textWidth, fontAt } from './labels'
import { type Atlas, CELL, coastReach, zoneClear } from './atlas'
import { Kind, type Ink, drawGlyph, kindTint, mountain, hill, tree, tuft, KIND_INFO } from './glyphs'
import { TileCache, TILE } from './tiles'
import { Sprites, stepOf } from './sprites'
import type { FieldsPrefs } from './prefs'

const mx = (p: Plot) => p.mx ?? p.x
const my = (p: Plot) => p.my ?? p.y

/** Files are drawn no bigger than this, as a map symbol keeps its size however close you look. */
const GLYPH_MAX = 46
/** Below this many pixels per file plot, files are land-use dots and settlements get signs. */
const DOTS_BELOW = 2.4
/** Below this, a mark is a simple shape; above, its full drawing. */
const SIMPLE_BELOW = 6.5

export function inkFrom(C: Record<string, string>, stone: boolean): Ink {
  return {
    ink: C['--ink'], land: stone ? C['--surface-2'] : C['--surface'], sea: C['--page'],
    roof: C['--madder'], roof2: C['--annatto'], wheat: C['--weld'], green: C['--sage'],
    stone: C['--ink-3'], dim: C['--ink-3'], shade: stone ? C['--ink'] : C['--page'], night: !stone,
  }
}

/** A cheap integer hash to 0..1 for lattice cells. */
function ih(i: number, j: number, o: number): number {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(o | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise, 0..1, on a lattice of the given size. */
function vnoise(x: number, y: number, size: number, o: number): number {
  const fx = x / size, fy = y / size
  const i = Math.floor(fx), j = Math.floor(fy)
  const u = fx - i, v = fy - j
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v)
  const a = ih(i, j, o), b = ih(i + 1, j, o), c = ih(i, j + 1, o), d = ih(i + 1, j + 1, o)
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv
}

function pathOf(pts: Float32Array): Path2D {
  const p = new Path2D()
  for (let i = 0; i < pts.length; i += 2) (i ? p.lineTo(pts[i], pts[i + 1]) : p.moveTo(pts[i], pts[i + 1]))
  p.closePath()
  return p
}

interface Item { y: number; x: number; t: number; m: number; h: number; r: number }

/** The nearest file mark to a world point, when marks are big enough to aim at; -1 otherwise. */
export function pickGlyph(at: Atlas, wx: number, wy: number, k: number): number {
  if (CELL * k < DOTS_BELOW) return -1
  const reach = Math.max(CELL * 0.62, 7 / k)
  let best = -1, bd = reach
  at.glyphs.each(wx - reach, wy - reach, wx + reach, wy + reach, (i) => {
    const d = Math.hypot(at.gx[i] - wx, at.gy[i] - wy)
    if (d < bd) { bd = d; best = i }
  })
  return best
}

export class MapRenderer {
  readonly tiles = new TileCache(320)
  private atlas: Atlas | null = null
  private world: World | null = null
  private coasts: Path2D[] = []
  private islets: Path2D[] = []
  /** each coast cut into short open runs, so a tile strokes only the shore near it */
  private shore: Array<Array<{ p: Path2D; pts: Float32Array; box: [number, number, number, number] }>> = []
  private sprites = new Sprites()
  private I: Ink = inkFrom({}, false)
  private C: Record<string, string> = {}
  private relief = true
  private dpr = 1

  /** Point the renderer at a tree, a palette and settings; tiles are kept while these hold. */
  prepare(world: World, atlas: Atlas, C: Record<string, string>, stone: boolean, relief: boolean, dpr: number, key: string) {
    if (atlas !== this.atlas) {
      this.coasts = atlas.coastPts.map(pathOf)
      this.islets = atlas.islets.map((i) => pathOf(i.pts))
      this.shore = atlas.coastPts.map((pts) => {
        const n = pts.length / 2, RUN = 40
        const out: Array<{ p: Path2D; pts: Float32Array; box: [number, number, number, number] }> = []
        for (let a = 0; a < n; a += RUN) {
          const p = new Path2D()
          const run: number[] = []
          let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity
          for (let q = a; q <= Math.min(n, a + RUN); q++) {
            const i = (q % n) * 2, x = pts[i], y = pts[i + 1]
            if (q === a) p.moveTo(x, y); else p.lineTo(x, y)
            run.push(x, y)
            bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y)
          }
          out.push({ p, pts: Float32Array.from(run), box: [bx0, by0, bx1, by1] })
        }
        return out
      })
    }
    this.atlas = atlas; this.world = world
    this.C = C; this.I = inkFrom(C, stone); this.relief = relief; this.dpr = dpr
    this.tiles.reset(`${key}|${stone}|${relief}|${dpr}`)
    this.sprites.reset(`${key}|${stone}`, dpr)
  }

  // ------------------------------------------------------------ relief

  /** How high a folder's open ground stands: folders beneath raise it, and so does sheer size. */
  private base(P: Plot): number {
    const height = this.atlas!.height.get(P) ?? 0
    return height * 0.75 + Math.max(0, Math.log10(Math.max(1, P.files)) - 1.3) * 0.55 + (P.depth === 0 ? 0.1 : 0)
  }

  private room(P: Plot, rooms: Plot[]): Plot {
    const top = P.path.includes('/') ? P.path.slice(0, P.path.indexOf('/')) : P.path
    return rooms.find((r) => r.path === top) ?? P
  }

  /** What the ground is like at a world point: elevation and clear room around, or null where
   *  nothing may be drawn (sea, surf, settlements, rivers, roads). */
  private ground(x: number, y: number, reach: number): { e: number; clear: number } | null {
    const at = this.atlas!, world = this.world!
    for (let li = 0; li < world.regions.length; li++) {
      const b = at.landBox[li]
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
          e = Math.max(e, this.base(room) * 0.4 * t * t * (3 - 2 * t))
        }
      } else {
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
        e = this.base(P) * t * t * (3 - 2 * t) * (0.5 + 0.5 * u * u * (3 - 2 * u))
        if (P.depth > 0) e = Math.max(e, this.base(this.room(P, land.rooms)) * 0.5 * (1 - u))
      }
      // ranges and valleys: the height swells and falls across the land
      const sw = vnoise(x, y, 340, 9) * 0.7 + vnoise(x, y, 110, 10) * 0.3
      e *= 0.25 + 1.5 * sw * sw
      const z = zoneClear(at, x, y, Math.min(240, reach))
      if (z < 0) return null
      return { e, clear: Math.min(clear, z) }
    }
    return null
  }

  // ------------------------------------------------------------ tiles

  readonly renderTile = (g: CanvasRenderingContext2D, x0: number, y0: number, s: number) => {
    const at = this.atlas!, world = this.world!, I = this.I, C = this.C, dpr = this.dpr
    const px = s / dpr
    const wpx = 1 / px
    const span = TILE / s
    const x1 = x0 + span, y1 = y0 + span
    const GAP = 3.3, NW = 5
    const seaPad = (NW * GAP + 3) * wpx
    const hit = (b: number[], m: number) => b[0] - m < x1 && b[2] + m > x0 && b[1] - m < y1 && b[3] + m > y0
    const lands: number[] = []
    at.landBox.forEach((b, i) => { if (hit(b, seaPad)) lands.push(i) })
    // a tile wholly inland skips the shore work: no water-lining, no coast, no border band
    const inland = (li: number) => {
      const land = world.regions[li]
      const pad = Math.max(48, 34 * wpx)
      for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2]]) {
        if (Math.hypot(cx - land.x, cy - land.y) > coastReach(land, cx, cy) - pad) return false
      }
      // the coast is radial about the land's middle, so a tile that does not hold the middle
      // and has all its corners well inside is wholly inside
      return true
    }
    const deep = lands.length === 1 && inland(lands[0]) ? lands[0] : -1
    const isl: number[] = []
    at.islets.forEach((il, i) => { if (hit(il.box, seaPad)) isl.push(i) })
    g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s)
    g.lineJoin = 'round'
    g.lineCap = 'round'

    // water-lining: rings that follow the shore out to sea, each fainter than the one outside it.
    // Coasts run round their land's middle, so each ring is the shore pushed straight outward
    // from that middle: thin strokes only, and no knots where the shore turns sharply.
    if (deep < 0) {
      const rings: Array<[Float32Array, number, number, boolean]> = []        // points, centre, closed
      for (const li of lands) for (const run of this.shore[li]) if (hit(run.box, seaPad)) rings.push([run.pts, world.regions[li].x, world.regions[li].y, false])
      const isleRings: number[] = []
      for (const i of isl) {
        const b = at.islets[i].box
        // a small islet gets as many rings as it is wide, so it never sits in a dark halo
        isleRings.push(Math.max(1, Math.min(NW, Math.floor(((b[2] - b[0]) * px) / 5))))
        rings.push([at.islets[i].pts, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, true])
      }
      g.strokeStyle = I.ink
      g.lineWidth = 0.9 * wpx
      for (let r = 1; r <= NW; r++) {
        const d = r * GAP * wpx
        g.globalAlpha = 0.1 + 0.42 * (1 - (r - 1) / NW)
        g.beginPath()
        let isle = 0
        for (const [P, cx, cy, closed] of rings) {
          if (closed && r > isleRings[isle++]) continue
          for (let q = 0; q < P.length; q += 2) {
            const dx = P[q] - cx, dy = P[q + 1] - cy, l = Math.hypot(dx, dy) || 1
            const x = P[q] + (dx / l) * d, y = P[q + 1] + (dy / l) * d
            if (q) g.lineTo(x, y); else g.moveTo(x, y)
          }
          if (closed) g.closePath()
        }
        g.stroke()
      }
      g.globalAlpha = 1
    }

    // land, its border band in the region's dye, and the coast in ink
    if (deep >= 0) {
      g.fillStyle = I.land
      g.fillRect(x0, y0, span, span)
    }
    for (const li of lands) {
      if (li === deep) continue
      const path = this.coasts[li]
      g.fillStyle = I.land
      g.fill(path)
      const runs = this.shore[li].filter((run) => hit(run.box, 9 * wpx))
      if (!runs.length) continue
      g.save()
      g.clip(path)
      g.strokeStyle = C[`--el-${world.regions[li].region.element}`]
      g.globalAlpha = 0.17
      g.lineWidth = 14 * wpx
      for (const run of runs) g.stroke(run.p)
      g.restore()
      g.strokeStyle = I.ink
      g.globalAlpha = 0.9
      g.lineWidth = 1.3 * wpx
      for (const run of runs) g.stroke(run.p)
      g.globalAlpha = 1
    }
    for (const i of isl) {
      g.fillStyle = I.land
      g.fill(this.islets[i])
      g.strokeStyle = I.ink
      g.lineWidth = 1.1 * wpx
      g.stroke(this.islets[i])
    }
    if (!lands.length) return

    const cellPx = CELL * px

    // roads: a dashed ink line, fainter when far
    g.strokeStyle = I.ink
    g.lineWidth = Math.max(0.6, Math.min(1.4, cellPx * 0.11)) * wpx
    g.globalAlpha = 0.5 * Math.max(0.35, Math.min(1, (cellPx - 0.5) / 2))
    g.setLineDash([4.5 * wpx, 3 * wpx])
    g.beginPath()
    at.roads.forEach((r, i) => {
      if (!hit(at.roadBox[i], 0)) return
      g.moveTo(r[0], r[1])
      for (let q = 2; q < r.length; q += 2) g.lineTo(r[q], r[q + 1])
    })
    g.stroke()
    g.setLineDash([])
    g.globalAlpha = 1

    // rivers: double ink banks with water between once they are wide enough, else one ink line
    for (const rv of at.rivers) {
      if (!hit(rv.box, 3 * wpx)) continue
      const P = rv.pts, Wd = rv.w, n = P.length / 2
      g.strokeStyle = I.ink
      for (let i = 0; i < n - 1; i++) {
        const wv = Wd[i] * px
        g.globalAlpha = wv < 1.6 ? 0.75 : 0.9
        g.lineWidth = wv < 1.6 ? Math.max(0.7, wv) * wpx : Wd[i] + 2.2 * wpx
        g.beginPath(); g.moveTo(P[i * 2], P[i * 2 + 1]); g.lineTo(P[i * 2 + 2], P[i * 2 + 3]); g.stroke()
      }
      g.globalAlpha = 1
      g.strokeStyle = I.sea
      for (let i = 0; i < n - 1; i++) {
        if (Wd[i] * px < 1.6) continue
        g.lineWidth = Wd[i]
        g.beginPath(); g.moveTo(P[i * 2], P[i * 2 + 1]); g.lineTo(P[i * 2 + 2], P[i * 2 + 3]); g.stroke()
      }
      const lk = rv.lake
      if (lk) {
        g.beginPath(); g.ellipse(lk.x, lk.y, lk.rx, lk.ry, lk.a, 0, Math.PI * 2)
        g.fillStyle = I.sea; g.fill()
        g.strokeStyle = I.ink; g.lineWidth = 1.1 * wpx; g.stroke()
        if (lk.ry * px > 9) {
          g.beginPath(); g.ellipse(lk.x, lk.y, lk.rx - 3 * wpx, lk.ry - 3 * wpx, lk.a, 0, Math.PI * 2)
          g.globalAlpha = 0.35; g.lineWidth = 0.8 * wpx; g.stroke(); g.globalAlpha = 1
        }
      }
    }

    // from here on in css pixels, tile-local
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    const X = (x: number) => (x - x0) * px, Y = (y: number) => (y - y0) * px
    const items: Item[] = []
    const m = CELL * 1.4

    if (cellPx < DOTS_BELOW) {
      // land use: one dot per file, in its tint
      const d = Math.max(0.9, cellPx * 0.92)
      const byKind: number[][] = [[], [], [], [], [], [], [], []]
      at.glyphs.each(x0 - m, y0 - m, x1 + m, y1 + m, (i) => byKind[at.kind[i]].push(i))
      byKind.forEach((list, k) => {
        if (!list.length) return
        g.fillStyle = kindTint(k as Kind, I)
        g.globalAlpha = k === Kind.Field ? 0.7 : 0.9
        for (const i of list) g.fillRect(X(at.gx[i]) - d / 2, Y(at.gy[i]) - d / 2, d, d)
      })
      g.globalAlpha = 1
    } else {
      at.glyphs.each(x0 - m, y0 - m, x1 + m, y1 + m, (i) => {
        items.push({ y: Y(at.gy[i]), x: X(at.gx[i]), t: 100 + at.kind[i], m: 0, h: at.seed[i], r: at.rot[i] })
      })
    }

    if (this.relief) {
      // relief on wide grids (peaks and hills), woods and meadow on finer ones
      for (const pass of [0, 1]) {
        const lo = pass === 0 ? 26 : 14, hi = lo * 4
        const oMin = Math.ceil(Math.log2(lo / px)), oMax = Math.floor(Math.log2(hi / px) - 1e-9)
        for (let o = oMin; o <= oMax; o++) {
          const S = Math.pow(2, o), fine = o === oMin
          const i0 = Math.floor((x0 - S) / S), i1 = Math.floor((x1 + S) / S)
          const j0 = Math.floor((y0 - S) / S), j1 = Math.floor((y1 + S) / S)
          for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
            const h1 = ih(i, j, o + pass * 50), h2 = ih(j, i, o + 77 + pass * 50)
            const wx = (i + 0.12 + 0.76 * h1) * S, wy = (j + 0.12 + 0.76 * h2) * S
            const gr = this.ground(wx, wy, S * 1.2)
            if (!gr) continue
            const h3 = ih(i + 31, j - 17, o + pass * 50)
            if (pass === 0) {
              if (gr.e >= 1.2) {
                let mw = S * 0.46 * (0.8 + 0.4 * Math.min(1, (gr.e - 1.2) / 1.6)) * (0.85 + 0.3 * h3)
                mw = Math.min(mw, gr.clear * 1.15)
                if (mw < S * 0.22) continue
                items.push({ y: Y(wy), x: X(wx), t: 1, m: mw * px, h: h3, r: 0 })
              } else if (gr.e >= 0.55) {
                const mw = Math.min(S * 0.36, gr.clear * 1.1)
                if (mw < S * 0.16) continue
                items.push({ y: Y(wy), x: X(wx), t: 2, m: mw * px, h: h3, r: 0 })
              }
              continue
            }
            if (gr.e >= 1.2) continue
            const nz = vnoise(wx, wy, 150, 5) * 0.75 + vnoise(wx, wy, 47, 6) * 0.25
            // woods: the fine grid fills them, the coarse one adds an odd big tree
            if (nz > (gr.e >= 0.55 ? 0.68 : 0.58) && (fine || h3 < 0.22)) {
              const rr = S * (fine ? 0.27 + 0.1 * h3 : 0.2 + 0.06 * h3)
              if (gr.clear < rr * 0.9) continue
              items.push({ y: Y(wy), x: X(wx), t: 3, m: rr * px, h: h3, r: 0 })
            } else if (fine && nz < 0.34 && h3 < 0.15) {
              items.push({ y: Y(wy), x: X(wx), t: 4, m: S * 0.26 * px, h: h3, r: 0 })
            }
          }
        }
      }
    }

    items.sort((a, b) => a.y - b.y)
    // symbols keep near their size however close you come; fields are ground and fill their plot
    const gs = cellPx <= GLYPH_MAX ? cellPx : GLYPH_MAX + (cellPx - GLYPH_MAX) * 0.25
    const yards = cellPx > GLYPH_MAX * 1.15
    const SP = this.sprites
    const ink = (q: CanvasRenderingContext2D) => { q.lineWidth = 0.9; q.strokeStyle = I.ink }
    const [gb, gq] = stepOf(gs)
    const [fb, fq] = stepOf(cellPx)
    for (const it of items) {
      g.globalAlpha = 1
      if (it.t >= 100) {
        const k = (it.t - 100) as Kind
        if (cellPx < SIMPLE_BELOW) { g.lineWidth = 0.9; g.strokeStyle = I.ink; simple(g, k, it.x, it.y, cellPx, it.h, I); continue }
        if (k === Kind.Field) {
          // a parcel, drawn square and turned to its settlement's street grid
          const v = Math.floor(it.h * 8), hq = (v + 0.5) / 8
          const sp = SP.get(`f${fb}:${v}`, fq, fq * 1.2 + 4, fq * 1.2 + 4, fq * 0.6 + 2, fq * 0.6 + 2,
            (q) => { ink(q); drawGlyph(q, k, 0, 0, fq, hq, 0, I) })
          const c = Math.cos(it.r), sn = Math.sin(it.r)
          g.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * it.x, dpr * it.y)
          Sprites.put(g, sp, 0, 0, cellPx)
          g.setTransform(dpr, 0, 0, dpr, 0, 0)
          continue
        }
        if (yards) { g.lineWidth = 0.9; g.strokeStyle = I.ink; yard(g, it.x, it.y, cellPx, it.r, it.h, I) }
        const v = Math.floor(it.h * 4), hq = (v + 0.5) / 4
        const sp = SP.get(`g${k}:${gb}:${v}`, gq, gq * 1.6 + 6, gq * 1.6 + 6, gq * 0.8 + 3, gq * 0.85 + 3,
          (q) => { ink(q); drawGlyph(q, k, 0, 0, gq, hq, 0, I) })
        Sprites.put(g, sp, it.x, it.y, gs)
        continue
      }
      const [b, mq] = stepOf(it.m)
      if (it.t === 1) {
        const v = Math.floor(it.h * 6), hq = (v + 0.5) / 6
        Sprites.put(g, SP.get(`m${b}:${v}`, mq, mq * 2 + 6, mq * 1.55 + 5, mq + 3, mq * 1.55 + 3,
          (q) => { ink(q); mountain(q, 0, 0, mq, hq, I, 1) }), it.x, it.y, it.m)
      } else if (it.t === 2) {
        const v = Math.floor(it.h * 4), hq = (v + 0.5) / 4
        Sprites.put(g, SP.get(`h${b}:${v}`, mq, mq * 2 + 6, mq * 0.9 + 5, mq + 3, mq * 0.9 + 3,
          (q) => { ink(q); hill(q, 0, 0, mq, hq, I) }), it.x, it.y, it.m)
      } else if (it.t === 3) {
        Sprites.put(g, SP.get(`t${b}`, mq, mq * 2 + 6, mq * 2.4 + 6, mq + 3, mq + 3,
          (q) => { ink(q); tree(q, 0, 0, mq, I) }), it.x, it.y, it.m)
      } else {
        g.globalAlpha = 0.5
        Sprites.put(g, SP.get(`u${b}`, mq, mq + 6, mq * 0.75 + 5, mq * 0.5 + 3, mq * 0.75 + 3,
          (q) => { ink(q); tuft(q, 0, 0, mq) }), it.x, it.y, it.m)
      }
    }
    g.globalAlpha = 1

    // town signs, while files are only dots
    if (cellPx < 3.2) {
      for (const st of at.settlements) {
        if (st.n < 6) continue
        const sx = X(st.x), sy = Y(st.y)
        if (sx < -12 || sx > TILE / dpr + 12 || sy < -12 || sy > TILE / dpr + 12) continue
        townSign(g, sx, sy, st.n, st.houses, I)
      }
    }
  }

  // ------------------------------------------------------------ the frame

  draw(ctx: CanvasRenderingContext2D, a: CanvasApi, world: World, geo: Geo, at: Atlas, sc: Scene, prefs: FieldsPrefs, hoverGlyph: number, stats: string) {
    beginFrame(ctx, a, world, sc)
    const C = sc.C, I = this.I
    if (prefs.sea) this.rhumbs(ctx, at, C)
    const missing = this.tiles.draw(ctx, a.camera.current, a.size.current, at.bounds, this.renderTile, 6)
    if (missing) a.redraw()
    if (prefs.sea) {
      this.rose(ctx, at, world, C, I)
      this.cartouche(ctx, at, world, I, stats)
    }
    if (sc.mist !== false) for (const land of world.regions) for (const room of land.rooms) this.mist(ctx, room, sc)
    drawSeeds(ctx, at.index, sc)
    if (sc.hovered && sc.pulse >= 0) drawPulse(ctx, mx(sc.hovered), my(sc.hovered), sc.hovered.r, sc)
    if (sc.selected) {
      const p = sc.selected
      ctx.save()
      ctx.strokeStyle = C['--gold']
      ctx.lineWidth = 1.8
      ctx.setLineDash([6, 5])
      ctx.globalAlpha = 0.9
      ctx.beginPath(); ctx.arc(mx(p) * K + OX, my(p) * K + OY, p.r * K + 2, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
    if (hoverGlyph >= 0) {
      const x = at.gx[hoverGlyph] * K + OX, y = at.gy[hoverGlyph] * K + OY
      const cp = CELL * K
      const r = Math.max(5, (at.kind[hoverGlyph] === Kind.Field ? cp : cp <= GLYPH_MAX ? cp : GLYPH_MAX + (cp - GLYPH_MAX) * 0.25) * 0.62)
      ctx.save()
      ctx.strokeStyle = C['--gold']
      ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
    const j = sc.activeJourney ? journeyById(sc.activeJourney) : undefined
    if (j) drawRoad(ctx, j.stops, at.index, sc)
    if (prefs.names !== 'none') this.names(ctx, world, geo, at, sc, prefs, hoverGlyph)
  }

  /** Mist over an unwalked room, as cloud only, its edge feathered so no circle shows. */
  private mist(ctx: CanvasRenderingContext2D, room: Plot, sc: Scene) {
    const pat = fogPattern
    if (!pat || sc.discovered.has(room.path)) return
    const x = mx(room) * K + OX, y = my(room) * K + OY, R = room.r * K
    if (R < 3 || x + R < 0 || x - R > W || y + R < 0 || y - R > H) return
    const near = Math.min(W, H)
    const thin = Math.min(1, Math.max(0, (1.5 * near - R) / (0.8 * near)))
    const peek = sc.hovered && (sc.hovered.path === room.path || sc.hovered.path.startsWith(room.path + '/')) ? 0.5 : 1
    const a = thin * peek * (sc.stone ? 0.6 : 0.5)
    if (a <= 0.01) return
    ctx.save()
    ctx.fillStyle = pat
    const N = 6
    for (let i = 0; i < N; i++) {
      ctx.globalAlpha = a / N * 1.6
      ctx.beginPath(); ctx.arc(x, y, R * (1.08 - i * 0.07), 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  private rhumbs(ctx: CanvasRenderingContext2D, at: Atlas, C: Record<string, string>) {
    // a portolan's wind lines from the rose: the eight winds in ink, half-winds in sage, quarters in madder
    const x = at.rose.x * K + OX, y = at.rose.y * K + OY
    const L = Math.hypot(W, H) + Math.hypot(x - W / 2, y - H / 2)
    ctx.save()
    ctx.lineWidth = 0.7
    const tones = [C['--ink'], C['--madder'], C['--sage'], C['--madder']]
    for (let tone = 0; tone < 4; tone++) {
      ctx.strokeStyle = tones[tone]
      ctx.globalAlpha = tone === 0 ? 0.2 : 0.22
      ctx.beginPath()
      for (let i = tone; i < 32; i += 4) {
        const t = (i / 32) * Math.PI * 2
        ctx.moveTo(x, y)
        ctx.lineTo(x + Math.cos(t) * L, y + Math.sin(t) * L)
      }
      ctx.stroke()
    }
    ctx.restore()
  }

  private rose(ctx: CanvasRenderingContext2D, at: Atlas, world: World, C: Record<string, string>, I: Ink) {
    const R = Math.max(Math.min(34, W * 0.06), Math.min(92, world.radius * 0.055 * K))
    const x = at.rose.x * K + OX, y = at.rose.y * K + OY
    if (x < -R || x > W + R || y < -R - 20 || y > H + R) return
    board.add(x - R - 4, y - R - 22, x + R + 4, y + R + 4)
    ctx.save()
    ctx.translate(x, y)
    ctx.lineJoin = 'miter'
    ctx.fillStyle = I.land
    ctx.strokeStyle = I.ink
    ctx.globalAlpha = 0.92
    ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(0, 0, R * 0.78, 0, Math.PI * 2); ctx.stroke()
    // degree ticks between the rings
    ctx.beginPath()
    for (let i = 0; i < 64; i++) {
      const t = (i / 64) * Math.PI * 2, r0 = i % 2 ? R * 0.81 : R * 0.79
      ctx.moveTo(Math.cos(t) * r0, Math.sin(t) * r0); ctx.lineTo(Math.cos(t) * R * 0.86, Math.sin(t) * R * 0.86)
    }
    ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1
    const point = (ang: number, len: number, wid: number, dark: string) => {
      const c = Math.cos(ang), s = Math.sin(ang)
      const tipX = c * len, tipY = s * len
      const lx = -s * wid, ly = c * wid
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tipX, tipY); ctx.lineTo(lx, ly); ctx.closePath()
      ctx.fillStyle = dark; ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tipX, tipY); ctx.lineTo(-lx, -ly); ctx.closePath()
      ctx.fillStyle = I.land; ctx.fill(); ctx.stroke()
    }
    ctx.lineWidth = 0.8
    for (let i = 0; i < 8; i++) point(((i + 0.5) / 8) * Math.PI * 2 - Math.PI / 2, R * 0.5, R * 0.06, I.dim)
    for (let i = 0; i < 4; i++) point(((i + 0.5) / 4) * Math.PI * 2 - Math.PI / 2, R * 0.68, R * 0.1, I.ink)
    for (let i = 0; i < 4; i++) point((i / 4) * Math.PI * 2 - Math.PI / 2, i === 0 ? R : R * 0.92, R * 0.13, i === 0 ? C['--madder'] : I.ink)
    ctx.beginPath(); ctx.arc(0, 0, R * 0.07, 0, Math.PI * 2)
    ctx.fillStyle = C['--gold']; ctx.fill(); ctx.stroke()
    ctx.font = fontAt('600 {s} Vollkorn, Georgia, serif', Math.max(12, R * 0.24))
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = I.ink
    ctx.fillText('N', 0, -R - 4)
    ctx.restore()
  }

  private cartouche(ctx: CanvasRenderingContext2D, at: Atlas, world: World, I: Ink, stats: string) {
    const w = Math.max(Math.min(170, W * 0.3), Math.min(300, world.radius * 0.16 * K)), h = w * 0.42
    const cx = at.cartouche.x * K + OX, cy = at.cartouche.y * K + OY
    const x = cx - w / 2, y = cy - h / 2
    if (x > W || x + w < 0 || y > H || y + h < 0) return
    board.add(x - 14, y - 6, x + w + 14, y + h + 6)
    ctx.save()
    ctx.lineWidth = 1
    ctx.strokeStyle = I.ink
    ctx.fillStyle = I.land
    // the scroll: a framed card with its ends rolled under
    const roll = h * 0.22
    for (const side of [-1, 1]) {
      const ex = side < 0 ? x : x + w
      ctx.beginPath()
      ctx.ellipse(ex + side * roll * 0.2, y + h / 2, roll * 0.7, h * 0.5, 0, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(ex + side * roll * 0.2, y + h / 2, roll * 0.3, h * 0.22, 0, 0, Math.PI * 2)
      ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1
    }
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.roundRect(x + 4, y + 4, w - 8, h - 8, 3)
    ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = I.ink
    const big = h * 0.3
    spaced(ctx, 'GRAIN', cx, y + h * 0.43, fontAt('600 {s} Vollkorn, Georgia, serif', big), big * 0.32)
    ctx.font = fontAt('italic {s} Vollkorn, Georgia, serif', h * 0.15)
    ctx.fillText('the fields, set down as an atlas', cx, y + h * 0.66)
    ctx.font = fontAt('400 {s} Vollkorn, Georgia, serif', h * 0.11)
    ctx.globalAlpha = 0.75
    ctx.fillText(stats, cx, y + h * 0.84)
    ctx.font = fontAt('italic {s} Vollkorn, Georgia, serif', h * 0.085)
    ctx.globalAlpha = 0.5
    ctx.fillText('surveyed by DJINN', cx, y + h + h * 0.16)
    ctx.restore()
  }

  private names(ctx: CanvasRenderingContext2D, world: World, geo: Geo, at: Atlas, sc: Scene, prefs: FieldsPrefs, hoverGlyph: number) {
    const C = sc.C, I = this.I
    for (const li of geo.titleOrder) regionTitle(ctx, world.regions[li], C)
    const halo = I.land
    // provinces (the rooms), set in spaced capitals across their ground
    const rooms: Plot[] = []
    for (const land of world.regions) for (const room of land.rooms) {
      const R = room.r * K
      if (R < 34) continue
      const x = mx(room) * K + OX, y = my(room) * K + OY
      if (x + R < 0 || x - R > W || y + R < 0 || y - R > H) continue
      rooms.push(room)
    }
    rooms.sort((a, b) => b.r - a.r)
    for (const room of rooms) {
      const R = room.r * K
      const size = Math.max(10, Math.min(24, R * 0.075))
      const text = (room.path ? room.name : 'the threshold').toUpperCase()
      const face = '500 {s} Vollkorn, Georgia, serif'
      const track = size * 0.32
      let tw = -track
      for (const ch of text) tw += textWidth(ctx, face, ch, size) + track
      const x = mx(room) * K + OX, y = my(room) * K + OY
      for (const dy of [0, -R * 0.45, R * 0.45]) {
        const yy = y + dy
        if (!board.place(x - tw / 2 - 4, yy - size * 0.75, x + tw / 2 + 4, yy + size * 0.35)) continue
        ctx.save()
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.strokeStyle = halo
        ctx.lineWidth = 3.5
        ctx.globalAlpha = 0.85
        spaced(ctx, text, x, yy, fontAt(face, size), track, true)
        ctx.globalAlpha = 0.78
        ctx.fillStyle = I.ink
        spaced(ctx, text, x, yy, fontAt(face, size), track)
        ctx.restore()
        break
      }
    }
    // settlements, biggest first, beside their footprint
    const cellPx = CELL * K
    const towns = at.settlements.filter((st) => {
      if (st.plot.depth === 0 && !st.plot.children.length) return false     // a room that is one town: its province name says it
      const x = st.x * K + OX, y = st.y * K + OY, r = st.r * K
      if (x + r < -60 || x - r > W + 60 || y + r < -20 || y - r > H + 20) return false
      return r > 9 || (st.n >= 40 && r > 3.5)
    }).sort((a, b) => b.n - a.n)
    const face = '400 {s} Vollkorn, Georgia, serif'
    const faceI = 'italic {s} Vollkorn, Georgia, serif'
    for (const st of towns) {
      const x = st.x * K + OX, y = st.y * K + OY, r = Math.max(5, st.r * K)
      const size = Math.max(10.5, Math.min(17, 9 + Math.log2(st.n + 1) * 1.1))
      const f = st.river ? faceI : face
      const tw = textWidth(ctx, f, st.plot.name, size)
      const hot = sc.hovered === st.plot
      const spots: Array<[number, number]> = st.river
        ? [[x - tw / 2, y - r - size * 0.4], [x - tw / 2, y + r + size * 0.9]]
        : [[x + r * 0.75 + 5, y + size * 0.32], [x - r * 0.75 - 5 - tw, y + size * 0.32], [x - tw / 2, y + r + size], [x - tw / 2, y - r - size * 0.35]]
      for (const [lx, ly] of spots) {
        if (lx + tw < 0 || lx > W || ly < 0 || ly > H) continue
        if (!board.place(lx - 3, ly - size * 0.85, lx + tw + 3, ly + size * 0.3)) continue
        ctx.font = fontAt(f, size)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        ctx.strokeStyle = halo
        ctx.lineWidth = 3.2
        ctx.globalAlpha = 0.9
        ctx.strokeText(st.plot.name, lx, ly)
        ctx.globalAlpha = 1
        ctx.fillStyle = hot ? C['--gold'] : I.ink
        ctx.fillText(st.plot.name, lx, ly)
        break
      }
    }
    // single files, once their marks are big enough to name
    if (prefs.names !== 'all' || cellPx < 21) return
    const x0 = (0 - OX) / K, y0 = (0 - OY) / K, x1 = (W - OX) / K, y1 = (H - OY) / K
    const list: number[] = []
    at.glyphs.each(x0, y0, x1, y1, (i) => list.push(i))
    if (hoverGlyph >= 0) list.unshift(hoverGlyph)
    if (list.length > 2500) return
    const gfaceSize = Math.min(13, 9.5 + (cellPx - 21) * 0.06)
    const gface = 'italic {s} Vollkorn, Georgia, serif'
    const gs = cellPx <= GLYPH_MAX ? cellPx : GLYPH_MAX + (cellPx - GLYPH_MAX) * 0.25
    for (let q = 0; q < list.length; q++) {
      const i = list[q]
      if (q > 0 && i === hoverGlyph) continue
      const x = at.gx[i] * K + OX, y = at.gy[i] * K + OY
      if (x < -40 || x > W + 40 || y < 0 || y > H) continue
      const p = at.path[i]
      const name = p.slice(p.lastIndexOf('/') + 1)
      const short = name.length > 30 ? name.slice(0, 29) + '…' : name
      const tw = textWidth(ctx, gface, short, gfaceSize)
      const hot = i === hoverGlyph
      const gw = at.kind[i] === Kind.Field ? cellPx : gs
      for (const [lx, ly] of [[x + gw * 0.45 + 3, y + gfaceSize * 0.35], [x - gw * 0.45 - 3 - tw, y + gfaceSize * 0.35], [x - tw / 2, y + gw * 0.5 + gfaceSize]] as const) {
        // a little air around each name, so a crowded street is named sparingly
        if (!board.place(lx - 6, ly - gfaceSize * 1.2, lx + tw + 6, ly + gfaceSize * 0.6)) continue
        ctx.font = fontAt(gface, gfaceSize)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        ctx.strokeStyle = halo
        ctx.lineWidth = 3
        ctx.globalAlpha = 0.9
        ctx.strokeText(short, lx, ly)
        ctx.globalAlpha = 1
        ctx.fillStyle = hot ? C['--gold'] : C['--ink-2']
        ctx.fillText(short, lx, ly)
        break
      }
    }
  }
}

/** Letter-spaced text centred on x, set one character at a time (canvas has no tracking). */
function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, track: number, stroke = false) {
  ctx.font = font
  let total = -track
  const ws: number[] = []
  for (const ch of text) { const w = ctx.measureText(ch).width; ws.push(w); total += w + track }
  let at = x - total / 2
  const align = ctx.textAlign
  ctx.textAlign = 'left'
  let i = 0
  for (const ch of text) {
    if (stroke) ctx.strokeText(ch, at, y); else ctx.fillText(ch, at, y)
    at += ws[i++] + track
  }
  ctx.textAlign = align
}

/** A mark too small for its drawing: a little block in its tint, outlined. */
function simple(g: CanvasRenderingContext2D, k: Kind, x: number, y: number, s: number, h: number, I: Ink) {
  const d = s * (k === Kind.Field ? 0.98 : 0.56)
  g.fillStyle = kindTint(k, I)
  if (k === Kind.Tree) {
    g.beginPath(); g.arc(x, y, d * 0.55, 0, Math.PI * 2); g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1
    return
  }
  if (k === Kind.Field) {
    // farmland reads as a patchwork of tones, not a grid
    g.fillStyle = h < 0.62 ? I.wheat : I.green
    g.globalAlpha = 0.14 + h * 0.36
    g.fillRect(x - d / 2, y - d / 2, d, d)
    g.globalAlpha = 1
    return
  }
  g.globalAlpha = 0.95
  g.fillRect(x - d / 2, y - d / 2, d, d)
  g.globalAlpha = 0.7
  g.lineWidth = 0.6
  g.strokeRect(x - d / 2, y - d / 2, d, d)
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
  g.stroke()
  g.restore()
}

/** A settlement's sign at a distance: a ring for a hamlet, a dotted ring for a town, a walled
 *  double ring for a city. */
function townSign(g: CanvasRenderingContext2D, x: number, y: number, n: number, houses: number, I: Ink) {
  const r = Math.min(6.5, 1.8 + Math.log2(n) * 0.55)
  g.lineWidth = 1
  g.strokeStyle = I.ink
  if (n >= 150) {
    g.beginPath(); g.arc(x, y, r + 2.2, 0, Math.PI * 2)
    g.fillStyle = I.land; g.fill(); g.stroke()
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * Math.PI * 2
      g.fillStyle = I.ink
      g.fillRect(x + Math.cos(t) * (r + 2.2) - 1.2, y + Math.sin(t) * (r + 2.2) - 1.2, 2.4, 2.4)
    }
  }
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2)
  g.fillStyle = I.land; g.fill(); g.stroke()
  if (houses >= 6 || n >= 24) {
    g.beginPath(); g.arc(x, y, r * 0.5, 0, Math.PI * 2)
    g.fillStyle = houses >= 6 ? I.roof : I.roof2; g.fill()
  }
}

/** The key's words for a file's mark, for the hover note. */
export const markOf = (at: Atlas, i: number) => KIND_INFO[at.kind[i]]
