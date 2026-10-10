// A cache of pre-drawn map tiles, so panning and zooming only copy pixels. Tiles are square
// pieces of the world drawn at power-of-two scales (levels). Which level is shown, which is
// built and which tiles may be dropped is decided in levels.ts; this file owns the canvases.
//
// Every frame shows exactly one complete level (plus, for a moment, the one it replaced fading
// out). A coarse overview of the whole world is drawn first and never dropped, so there is always
// a complete level to fall back on. Tiles are made a few per frame inside a time budget, nearest
// the middle of the view first, then a ring just beyond it so panning rarely uncovers a gap.
//
// Each tile is drawn with a margin of real map around it that is never shown: when a tile is
// scaled between levels, smoothing reads into the margin instead of into transparency, so tile
// edges never show as faint lines.

import type { Camera } from '@/ui/useCanvas'
import { targetLevel, shownLevel, buildLevel, LruStore } from './levels'

/** Draws one tile. `g` is untransformed at the tile canvas's top-left; world (x, y) lands at
 *  ((x - x0) * s, (y - y0) * s) device pixels. */
export type TileRender = (g: CanvasRenderingContext2D, x0: number, y0: number, s: number) => void

/** Shown size of a tile, in device pixels, and the hidden margin drawn around it. */
const TILE = 256
const TILE_MARGIN = 2
/** The size of a tile's canvas: what a renderer should cover. */
export const TILE_CANVAS = TILE + TILE_MARGIN * 2
const MARGIN = TILE_MARGIN, SIZE = TILE_CANVAS
const FADE_MS = 180
/** The fewest tiles kept; more when the screen needs them (a large high-density display). */
const MIN_CAPACITY = 360

type Box = { x0: number; y0: number; x1: number; y1: number }
type View = { w: number; h: number; dpr: number }
type Span = Array<[number, number]>

/** What a frame drew, for checking that levels never mix (read by tests through a debug hook). */
export interface TileFrame { target: number; shown: number; fading: number | null }

const keyOf = (z: number, tx: number, ty: number) => `${z}:${tx}:${ty}`

export class TileCache {
  private tiles = new LruStore<HTMLCanvasElement>()
  private spare: HTMLCanvasElement[] = []
  private key = ''
  private base = 0
  private target: number | null = null
  private shown: number | null = null
  private fade: { from: number; t0: number } | null = null
  /** A running estimate of one tile's cost, so a frame does not start a tile it cannot finish. */
  private cost = 3
  /** Set to an array to record each frame's levels (diagnostics only). */
  log: TileFrame[] | null = null

  /** Forget every tile when what they show has changed (tree, theme, settings, pixel ratio). */
  reset(key: string): void {
    if (key === this.key) return
    this.key = key
    this.recycle(this.tiles.clear())
    this.shown = null
    this.fade = null
  }

  /** Draw the view. `world` bounds the land, for the overview. Returns true while more frames
   *  are needed: tiles still to make, or a crossfade under way. */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, view: View, world: Box, render: TileRender, budgetMs: number, still: boolean): boolean {
    const t0 = performance.now()
    const viewBox = boxOfView(cam, view)
    const visible = (z: number) => spanOf(z, viewBox)
    const complete = (z: number) => visible(z).every(([tx, ty]) => this.tiles.has(keyOf(z, tx, ty)))

    const target = this.target = targetLevel(Math.log2(cam.k * view.dpr), this.target)
    const base = Math.min(target, overviewLevel(world))
    if (base !== this.base) { this.base = base; this.shown = null }

    // make tiles: the whole overview first (it is small, and the last resort), then the build
    // level's visible tiles, then a ring around the target once it is whole
    let made = 0
    const room = () => {
      const spent = performance.now() - t0
      // the first tile of a frame may always start, or a run of heavy tiles would never be made
      return made === 0 || spent + this.cost <= budgetMs
    }
    const ensure = (z: number, span: Span): number => {
      let missing = 0
      for (const [tx, ty] of span) {
        const k = keyOf(z, tx, ty)
        if (this.tiles.use(k)) continue
        if (room()) { this.tiles.set(k, this.make(render, z, tx, ty)); made++ } else missing++
      }
      return missing
    }
    let missing = ensure(base, spanOf(base, world))
    const shownBefore = this.shown ?? base
    const build = buildLevel(target, shownBefore, complete)
    missing += ensure(build, nearestFirst(visible(build)))
    if (build === target && !missing) missing += ensure(target, nearestFirst(spanOf(target, grow(viewBox, TILE / 2 ** target))))

    // show one complete level; fade out the one it replaces
    const shown = shownLevel(target, this.shown, base, complete)
    if (this.shown !== null && shown !== this.shown && !still && complete(this.shown)) this.fade = { from: this.shown, t0 }
    this.shown = shown
    if (this.fade && (t0 - this.fade.t0 >= FADE_MS || this.fade.from === shown || !complete(this.fade.from))) this.fade = null

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.paint(ctx, cam, view, viewBox, shown, 1)
    if (this.fade) {
      const u = (t0 - this.fade.t0) / FADE_MS
      this.paint(ctx, cam, view, viewBox, this.fade.from, 1 - u * u * (3 - 2 * u))
    }
    ctx.restore()
    this.log?.push({ target, shown, fading: this.fade?.from ?? null })

    // let go of what the view no longer needs: never the overview, nor the tiles in view of the
    // shown, building or fading levels, nor the target's (with its ring)
    const keep = new Set<string>()
    const hold = (z: number, span: Span) => { for (const [tx, ty] of span) keep.add(keyOf(z, tx, ty)) }
    hold(base, spanOf(base, world))
    hold(target, spanOf(target, grow(viewBox, TILE / 2 ** target)))
    for (const z of [shown, build, this.fade?.from]) if (z !== undefined) hold(z, visible(z))
    this.recycle(this.tiles.evict(Math.max(MIN_CAPACITY, keep.size * 1.25), (k) => keep.has(k)))
    return missing > 0 || shown !== target || this.fade !== null
  }

  private make(render: TileRender, z: number, tx: number, ty: number): HTMLCanvasElement {
    const t0 = performance.now()
    const c = this.spare.pop() ?? document.createElement('canvas')
    if (c.width !== SIZE) { c.width = SIZE; c.height = SIZE }
    // a CPU-backed canvas, read back one pixel once drawn: canvases record their drawing and
    // only paint it when first shown, which would land a tile's real cost on some later frame
    // instead of inside this one's budget
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, SIZE, SIZE)
    g.save()
    const s = 2 ** z, tw = TILE / s
    render(g, tx * tw - MARGIN / s, ty * tw - MARGIN / s, s)
    g.restore()
    g.getImageData(0, 0, 1, 1)
    this.cost = this.cost * 0.8 + (performance.now() - t0) * 0.2
    return c
  }

  private recycle(list: HTMLCanvasElement[]) {
    for (const c of list) if (this.spare.length < 64) this.spare.push(c)
  }

  /** Copy a level's visible tiles to the screen: only the part of each tile on screen, so a
   *  coarse tile blown up never asks for a vast image, and never its hidden margin. */
  private paint(ctx: CanvasRenderingContext2D, cam: Camera, view: View, vb: Box, z: number, alpha: number) {
    const tw = TILE / 2 ** z, f = TILE / tw
    const dev = (wx: number, wy: number): [number, number] =>
      [Math.round(((wx - cam.x) * cam.k + view.w / 2) * view.dpr), Math.round(((wy - cam.y) * cam.k + view.h / 2) * view.dpr)]
    ctx.globalAlpha = alpha
    for (const [tx, ty] of spanOf(z, vb)) {
      const cv = this.tiles.peek(keyOf(z, tx, ty))
      if (!cv) continue
      const sx0 = Math.max(tx * tw, vb.x0), sy0 = Math.max(ty * tw, vb.y0)
      const sx1 = Math.min((tx + 1) * tw, vb.x1), sy1 = Math.min((ty + 1) * tw, vb.y1)
      const [d0, e0] = dev(sx0, sy0), [d1, e1] = dev(sx1, sy1)
      if (d1 <= d0 || e1 <= e0) continue
      ctx.drawImage(cv, MARGIN + (sx0 - tx * tw) * f, MARGIN + (sy0 - ty * tw) * f, (sx1 - sx0) * f, (sy1 - sy0) * f, d0, e0, d1 - d0, e1 - e0)
    }
    ctx.globalAlpha = 1
  }
}

/** The world rectangle on screen. */
function boxOfView(cam: Camera, view: View): Box {
  const hw = view.w / 2 / cam.k, hh = view.h / 2 / cam.k
  return { x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh }
}

const grow = (b: Box, d: number): Box => ({ x0: b.x0 - d, y0: b.y0 - d, x1: b.x1 + d, y1: b.y1 + d })

/** The coarsest level worth drawing: the whole world in about two tiles across. */
function overviewLevel(world: Box): number {
  return Math.floor(Math.log2((TILE * 2) / Math.max(world.x1 - world.x0, world.y1 - world.y0)))
}

/** The tiles of a level that cover a world rectangle. */
function spanOf(z: number, b: Box): Span {
  const tw = TILE / 2 ** z
  const out: Span = []
  for (let tx = Math.floor(b.x0 / tw); tx <= Math.floor(b.x1 / tw); tx++) {
    for (let ty = Math.floor(b.y0 / tw); ty <= Math.floor(b.y1 / tw); ty++) out.push([tx, ty])
  }
  return out
}

/** Tiles ordered from the middle of their span outward, so the centre of the view sharpens first. */
function nearestFirst(span: Span): Span {
  if (!span.length) return span
  let cx = 0, cy = 0
  for (const [tx, ty] of span) { cx += tx; cy += ty }
  cx /= span.length; cy /= span.length
  return span.sort((a, b) => (a[0] - cx) ** 2 + (a[1] - cy) ** 2 - (b[0] - cx) ** 2 - (b[1] - cy) ** 2)
}
