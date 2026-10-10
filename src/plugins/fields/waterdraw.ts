// Drawing water into a map tile, in the old manner: ink banks, the water itself in the paper's
// colour, a fine line just inside the banks of a wide river, ripple lines round a lake's shore,
// and bridges where roads cross.
//
// Each river is one closed channel, filled once, never a run of stroked pieces: overlapping
// round-capped strokes were what showed as faint seams and rounded tips. Every bank in reach is
// drawn before any water, so where a tributary meets its river, or a river its lake, the water
// paints over the banks and the two open into one another.

import type { Bridge, Lake, River } from './water'
import type { Ink } from './glyphs'
import { CELL } from './terrain'
import { boxesMeet, channelOutline, type Box } from './geom'

/** A bank's width on screen, in css pixels. */
const BANK = 1.0
/** Rivers wider than this on screen (css px) get a fine line inside each bank. */
const WIDE = 7

export interface WaterView {
  g: CanvasRenderingContext2D          // set to world coordinates
  box: Box                             // the tile's world rectangle
  px: number                           // css pixels per world unit
  land: Path2D                         // the land in the tile: water is clipped to it
}

export class WaterPainter {
  private paths = new WeakMap<object, Path2D>()

  draw(v: WaterView, rivers: River[], lakes: Lake[], bridges: Bridge[], I: Ink) {
    const { g, box, px } = v
    const wpx = 1 / px
    const rv = rivers.filter((r) => boxesMeet(r.box, box, 3 * wpx))
    const lk = lakes.filter((l) => boxesMeet(l.box, box, 12 * wpx))
    if (!rv.length && !lk.length) return
    g.save()
    g.clip(v.land)
    g.lineJoin = 'round'
    g.strokeStyle = I.ink
    g.lineWidth = BANK * 2 * wpx             // half of it shows: the water covers the inner half
    for (const r of rv) g.stroke(this.closed(r.channel))
    for (const l of lk) g.stroke(this.closed(l.pts))
    g.fillStyle = I.sea
    for (const r of rv) g.fill(this.closed(r.channel))
    for (const l of lk) g.fill(this.closed(l.pts))
    for (const r of rv) this.innerLine(g, r, px, I)
    for (const l of lk) this.shoreRipples(g, l, px, I)
    g.restore()
    if (CELL * px > 1.5) for (const b of bridges) if (boxesMeet([b.x, b.y, b.x, b.y], box, b.span)) drawBridge(g, b, wpx, I)
  }

  /** Where a river is wide on screen, a fine ink line just inside each bank: the stretch drawn
   *  as a slightly narrower channel in faint ink, then a narrower one again in water. */
  private innerLine(g: CanvasRenderingContext2D, r: River, px: number, I: Ink) {
    const n = r.pts.length / 2
    let a = -1
    for (let i = 0; i <= n; i++) {
      const wide = i < n && r.w[i] * px >= WIDE
      if (wide && a < 0) a = i
      if (wide || a < 0) continue
      if (i - a >= 2) {
        const pts = r.pts.subarray(a * 2, i * 2), w = r.w.subarray(a, i)
        g.globalAlpha = 0.3
        g.fillStyle = I.ink
        g.fill(pathOf(channelOutline(pts, w, 2.4 / px)))
        g.globalAlpha = 1
        g.fillStyle = I.sea
        g.fill(pathOf(channelOutline(pts, w, 3.6 / px)))
      }
      a = -1
    }
  }

  /** A lake's water-lining: fine ripples following the shore inward; then its islands. */
  private shoreRipples(g: CanvasRenderingContext2D, l: Lake, px: number, I: Ink) {
    const wpx = 1 / px
    const rings = Math.min(4, Math.floor((l.r * px) / 7))
    g.strokeStyle = I.ink
    g.lineWidth = 0.7 * wpx
    for (let q = 1; q <= rings; q++) {
      const d = q * 2.8 * wpx
      g.globalAlpha = 0.42 * (1 - (q - 1) / (rings + 1))
      g.beginPath()
      for (let i = 0; i < l.pts.length; i += 2) {
        const dx = l.pts[i] - l.x, dy = l.pts[i + 1] - l.y
        const f = Math.max(0, 1 - d / (Math.hypot(dx, dy) || 1))
        if (i) g.lineTo(l.x + dx * f, l.y + dy * f); else g.moveTo(l.x + dx * f, l.y + dy * f)
      }
      g.closePath()
      g.stroke()
    }
    g.globalAlpha = 1
    g.lineWidth = wpx
    for (const isl of l.islands) {
      const p = this.closed(isl)
      g.fillStyle = I.land
      g.fill(p)
      g.stroke(p)
    }
  }

  private closed(pts: Float32Array): Path2D {
    let p = this.paths.get(pts)
    if (!p) { p = pathOf(pts); this.paths.set(pts, p) }
    return p
  }
}

/** A bridge: a deck across the water with a parapet line each side, splayed at the ends. */
function drawBridge(g: CanvasRenderingContext2D, b: Bridge, wpx: number, I: Ink) {
  const half = b.span / 2, deck = Math.max(2.4 * wpx, CELL * 0.3) / 2, splay = deck * 0.9
  g.save()
  g.translate(b.x, b.y)
  g.rotate(b.angle)
  g.fillStyle = I.land
  g.fillRect(-half, -deck, half * 2, deck * 2)
  g.strokeStyle = I.ink
  g.lineWidth = 0.9 * wpx
  g.lineCap = 'round'
  g.beginPath()
  for (const side of [-1, 1]) {
    g.moveTo(-half - splay, side * (deck + splay))
    g.lineTo(-half, side * deck)
    g.lineTo(half, side * deck)
    g.lineTo(half + splay, side * (deck + splay))
  }
  g.stroke()
  g.restore()
}

export function pathOf(pts: ArrayLike<number>): Path2D {
  const p = new Path2D()
  for (let i = 0; i < pts.length; i += 2) (i ? p.lineTo(pts[i], pts[i + 1]) : p.moveTo(pts[i], pts[i + 1]))
  p.closePath()
  return p
}
