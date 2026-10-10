// Painting the map view. The still land is drawn into cached tiles (tilepaint.ts, through the
// tile cache in tiles.ts); what moves or answers the hand is drawn live over them each frame:
// the rhumb lines, rose and cartouche, the mist over unwalked rooms, planted seeds, the hover and
// the selection, the road of a journey, and the names.

import type { CanvasApi } from '@/ui/useCanvas'
import { journeyById } from '@/grain/quests'
import { prefersStill } from '@/core/settings'
import type { World } from './layout'
import { K, OX, OY, W, H, beginFrame, drawSeeds, drawPulse, drawRoad, type Geo, type Scene } from './draw'
import type { Atlas } from './atlas'
import { CELL, plotX, plotY } from './terrain'
import { DOTS_BELOW, KIND_INFO, inkFrom, markSize, type Ink, type Kind } from './glyphs'
import { TileCache, type TileFrame } from './tiles'
import { TilePainter } from './tilepaint'
import { drawCartouche, drawRhumbs, drawRose } from './ornaments'
import { drawMapNames } from './maplabels'
import type { FieldsPrefs } from './prefs'

/** The nearest file mark to a world point, when marks are big enough to aim at; -1 otherwise. */
export function pickGlyph(at: Atlas, wx: number, wy: number, k: number): number {
  if (CELL * k < DOTS_BELOW) return -1
  const reach = Math.max(CELL * 0.62, 7 / k), far = reach * 2.4
  let best = -1, bd = reach
  at.glyphs.each(wx - far, wy - far, wx + far, wy + far, (i) => {
    // a landmark is aimed at across its whole drawing
    const d = Math.hypot(at.gx[i] - wx, at.gy[i] - wy) / at.scale[i]
    if (d < bd) { bd = d; best = i }
  })
  return best
}

/** The key's words for a file's mark, for the hover note. */
export const markOf = (at: Atlas, i: number) => KIND_INFO[at.kind[i]]

export class MapRenderer {
  readonly tiles = new TileCache()
  private painter: TilePainter | null = null
  private atlas: Atlas | null = null
  private I: Ink = inkFrom({}, false)

  /** Point the renderer at a tree, a palette and settings; tiles are kept while these hold. */
  prepare(world: World, atlas: Atlas, C: Record<string, string>, stone: boolean, relief: boolean, dpr: number, key: string) {
    if (atlas !== this.atlas || !this.painter) { this.atlas = atlas; this.painter = new TilePainter(atlas, world) }
    this.I = inkFrom(C, stone)
    this.painter.configure(this.I, C, relief, dpr, `${key}|${stone}`)
    this.tiles.reset(`${key}|${stone}|${relief}|${dpr}`)
  }

  draw(ctx: CanvasRenderingContext2D, a: CanvasApi, world: World, geo: Geo, at: Atlas, sc: Scene, prefs: FieldsPrefs, hoverMark: number, stats: string) {
    beginFrame(ctx, a, world, sc)
    const C = sc.C, I = this.I
    if (prefs.sea) drawRhumbs(ctx, at.rose, C)
    const diag = (globalThis as { __fieldsTiles?: TileFrame[] }).__fieldsTiles
    this.tiles.log = Array.isArray(diag) ? diag : null
    if (this.tiles.draw(ctx, a.camera.current, a.size.current, at.bounds, this.painter!.paint, 4, prefersStill())) a.redraw()
    if (prefs.sea) {
      drawRose(ctx, at.rose, world.radius, C, I)
      drawCartouche(ctx, at.cartouche, world.radius, I, stats)
    }
    if (sc.mist !== false) this.drawMist(ctx, world, sc)
    drawSeeds(ctx, at.index, sc)
    if (sc.hovered && sc.pulse >= 0) drawPulse(ctx, plotX(sc.hovered), plotY(sc.hovered), sc.hovered.r, sc)
    if (sc.selected) {
      const p = sc.selected
      ctx.save()
      ctx.strokeStyle = C['--gold']
      ctx.lineWidth = 1.8
      ctx.setLineDash([6, 5])
      ctx.globalAlpha = 0.9
      ctx.beginPath(); ctx.arc(plotX(p) * K + OX, plotY(p) * K + OY, p.r * K + 2, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
    if (hoverMark >= 0) {
      const r = Math.max(5, markSize(at.kind[hoverMark] as Kind, CELL * K, at.scale[hoverMark]) * 0.62)
      ctx.save()
      ctx.strokeStyle = C['--gold']
      ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.arc(at.gx[hoverMark] * K + OX, at.gy[hoverMark] * K + OY, r, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
    const journey = sc.activeJourney ? journeyById(sc.activeJourney) : undefined
    if (journey) drawRoad(ctx, journey.stops, at.index, sc)
    if (prefs.names !== 'none') drawMapNames(ctx, world, geo, at, sc, prefs.names, hoverMark, I)
  }

  /** Mist over the unwalked rooms, as cloud only, each edge feathered so no circle shows. The
   *  cloud is soft, so it is painted at a quarter of the screen's resolution and laid over the
   *  map in one scaled copy: a sixteenth of the pixels to fill, every frame. */
  private mistCv: HTMLCanvasElement | null = null
  private mistPat: { src: HTMLCanvasElement; pat: CanvasPattern } | null = null
  private drawMist(ctx: CanvasRenderingContext2D, world: World, sc: Scene) {
    if (!sc.fog) return
    const Q = 4, near = Math.min(W, H)
    const rooms: Array<[number, number, number, number]> = []
    for (const room of world.regions.flatMap((land) => land.rooms)) {
      if (sc.discovered.has(room.path)) continue
      const x = plotX(room) * K + OX, y = plotY(room) * K + OY, R = room.r * K
      if (R < 3 || x + R * 1.1 < 0 || x - R * 1.1 > W || y + R * 1.1 < 0 || y - R * 1.1 > H) continue
      // the mist thins as you come close, and lifts by half where the hand is
      const thin = Math.min(1, Math.max(0, (1.5 * near - R) / (0.8 * near)))
      const peek = sc.hovered && (sc.hovered.path === room.path || sc.hovered.path.startsWith(room.path + '/')) ? 0.5 : 1
      const a = thin * peek * (sc.stone ? 0.6 : 0.5)
      if (a > 0.01) rooms.push([x, y, R, a])
    }
    if (!rooms.length) return
    const w = Math.ceil(W / Q), h = Math.ceil(H / Q)
    const cv = this.mistCv ?? (this.mistCv = document.createElement('canvas'))
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
    const g = cv.getContext('2d')!
    if (this.mistPat?.src !== sc.fog) this.mistPat = { src: sc.fog, pat: g.createPattern(sc.fog, 'repeat')! }
    const pat = this.mistPat.pat
    // the same stretch of cloud as at full size, fixed to the land so it travels with the map
    const t = (world.radius * 0.22 * K) / 256 / Q
    pat.setTransform(new DOMMatrix([t, 0, 0, t, OX / Q, OY / Q]))
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, w, h)
    g.fillStyle = pat
    const N = 6
    for (const [x, y, R, a] of rooms) {
      g.globalAlpha = (a / N) * 1.6
      for (let i = 0; i < N; i++) { g.beginPath(); g.arc(x / Q, y / Q, (R * (1.08 - i * 0.07)) / Q, 0, Math.PI * 2); g.fill() }
    }
    g.globalAlpha = 1
    ctx.save()
    ctx.imageSmoothingQuality = 'low'
    ctx.drawImage(cv, 0, 0, w * Q, h * Q)
    ctx.restore()
  }
}
