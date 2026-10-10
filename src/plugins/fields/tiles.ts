// A cache of pre-drawn map tiles, so panning and zooming only copy pixels. Tiles are square
// pieces of the world drawn at power-of-two scales (levels). The level the zoom asks for is the
// target; the level on screen is always one complete set: the nearest level whose every visible
// tile is already drawn. While the target's tiles are being made (a few per frame, inside a time
// budget, a level at a time from the finest complete one upward, nearest the middle first) the
// complete level stays up, scaled; each newly whole level takes over everywhere at once, with a
// short crossfade. Levels are never
// mixed on screen. A coarse level of the whole world is drawn first and kept for good, so there
// is always a complete level to show; a ring of tiles just beyond the view is made ahead, so
// panning rarely uncovers a gap. Least recently used tiles are let go once the cache is full.

import type { Camera } from '@/ui/useCanvas'

/** Draws one tile. `g` is untransformed at the tile's top-left; world (x, y) lands at
 *  ((x - x0) * s, (y - y0) * s) device pixels. */
export type TileRender = (g: CanvasRenderingContext2D, x0: number, y0: number, s: number) => void

export const TILE = 256
const FADE_MS = 180

type Box = { x0: number; y0: number; x1: number; y1: number }
type View = { w: number; h: number; dpr: number }

/** What a frame drew, for checking that levels never mix (read by tests through a debug hook). */
export interface TileFrame { target: number; shown: number; fading: number | null; levels: number[] }

export class TileCache {
  private tiles = new Map<string, HTMLCanvasElement>()
  private base = new Map<string, HTMLCanvasElement>()     // the overview level, never evicted
  private baseZ = 0
  private pool: HTMLCanvasElement[] = []
  private key = ''
  private z: number | null = null
  private shown: number | null = null
  private fade: { from: number; t0: number } | null = null
  /** Set to an array to record each frame's levels (diagnostics only). */
  log: TileFrame[] | null = null
  constructor(private max = 360) {}

  /** Forget every tile when what they show has changed (tree, theme, settings, pixel ratio). */
  reset(key: string): void {
    if (key === this.key) return
    this.key = key
    for (const c of this.tiles.values()) this.release(c)
    for (const c of this.base.values()) this.release(c)
    this.tiles.clear()
    this.base.clear()
    this.shown = null
    this.fade = null
  }

  private release(c: HTMLCanvasElement) { if (this.pool.length < 64) this.pool.push(c) }

  private make(render: TileRender, z: number, tx: number, ty: number): HTMLCanvasElement {
    const c = this.pool.pop() ?? document.createElement('canvas')
    if (c.width !== TILE) { c.width = TILE; c.height = TILE }
    // a CPU-backed canvas, read back one pixel once drawn: canvases record their drawing and
    // only paint it when first shown, which would land a tile's real cost on some later frame
    // instead of inside this one's budget
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, TILE, TILE)
    g.save()
    const tw = TILE / Math.pow(2, z)
    render(g, tx * tw, ty * tw, Math.pow(2, z))
    g.restore()
    g.getImageData(0, 0, 1, 1)
    return c
  }

  private get(z: number, tx: number, ty: number): HTMLCanvasElement | undefined {
    return z === this.baseZ ? this.base.get(`${tx}:${ty}`) : this.tiles.get(`${z}:${tx}:${ty}`)
  }

  /** The tiles of a level that cover a world rectangle. */
  private span(z: number, x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
    const tw = TILE / Math.pow(2, z)
    const out: Array<[number, number]> = []
    for (let tx = Math.floor(x0 / tw); tx <= Math.floor(x1 / tw); tx++) for (let ty = Math.floor(y0 / tw); ty <= Math.floor(y1 / tw); ty++) out.push([tx, ty])
    return out
  }

  private complete(z: number, list: Array<[number, number]>): boolean {
    for (const [tx, ty] of list) if (!this.get(z, tx, ty)) return false
    return true
  }

  /** Draw the view. `world` bounds the land (for the overview level). Returns true while more
   *  frames are needed (tiles still coming, or a crossfade under way). */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, view: View, world: Box, render: TileRender, budgetMs: number, still: boolean): boolean {
    const { w, h, dpr } = view
    const t0 = performance.now()
    // the target level: just finer than the screen (never blown up more than a tenth), held
    // while zooming out until it is nearly twice too fine
    const ideal = Math.log2(cam.k * dpr)
    if (this.z === null || ideal - this.z > 0.15 || ideal - this.z < -0.9) this.z = Math.ceil(ideal - 0.15)
    const zt = this.z
    const spanW = Math.max(world.x1 - world.x0, world.y1 - world.y0)
    const zb = Math.min(zt, Math.floor(Math.log2((TILE * 2) / spanW)))
    if (zb !== this.baseZ) { for (const c of this.base.values()) this.release(c); this.base.clear(); this.baseZ = zb }
    const vx0 = cam.x - w / 2 / cam.k, vy0 = cam.y - h / 2 / cam.k
    const vx1 = cam.x + w / 2 / cam.k, vy1 = cam.y + h / 2 / cam.k
    const budget = () => performance.now() - t0 < budgetMs

    // 1. the overview, whole, before anything else (it is small, and it is the last resort)
    for (const [tx, ty] of this.span(zb, world.x0, world.y0, world.x1, world.y1)) {
      const k = `${tx}:${ty}`
      if (!this.base.has(k) && budget()) this.base.set(k, this.make(render, zb, tx, ty))
    }

    // 2. build toward the target a level at a time: the first incomplete level above the finest
    //    complete one, so a long zoom sharpens step by step (each step a quarter of the work of
    //    the next) rather than waiting on a blur. Middle first; then a ring beyond the view.
    const visOf = (z: number) => this.span(z, vx0, vy0, vx1, vy1)
    let floor = zb
    for (let z = zt; z > zb; z--) if (this.complete(z, visOf(z))) { floor = z; break }
    let zbuild = zt
    if (floor < zt) for (let z = floor + 1; z <= zt; z++) if (!this.complete(z, visOf(z))) { zbuild = z; break }
    const tw = TILE / Math.pow(2, zbuild)
    const vis = visOf(zbuild)
    const mx = (vx0 + vx1) / 2 / tw, my = (vy0 + vy1) / 2 / tw
    const byNear = (a: [number, number], b: [number, number]) => ((a[0] + 0.5 - mx) ** 2 + (a[1] + 0.5 - my) ** 2) - ((b[0] + 0.5 - mx) ** 2 + (b[1] + 0.5 - my) ** 2)
    vis.sort(byNear)
    let gaps = 0
    for (const [tx, ty] of vis) {
      if (zbuild === zb) { if (!this.base.has(`${tx}:${ty}`)) gaps++; continue }
      const key = `${zbuild}:${tx}:${ty}`
      const cv = this.tiles.get(key)
      if (cv) { this.tiles.delete(key); this.tiles.set(key, cv); continue }
      if (budget()) this.tiles.set(key, this.make(render, zbuild, tx, ty))
      else gaps++
    }
    if (!gaps && zbuild === zt && zt !== zb) {
      const ring = this.span(zt, vx0 - tw, vy0 - tw, vx1 + tw, vy1 + tw).filter(([tx, ty]) => !this.tiles.has(`${zt}:${tx}:${ty}`)).sort(byNear)
      for (const [tx, ty] of ring) { if (!budget()) { gaps++; break } this.tiles.set(`${zt}:${tx}:${ty}`, this.make(render, zt, tx, ty)) }
    }

    // 3. which complete level to show: the target if whole; else a finer one already whole (it
    //    only shrinks, so stays crisp); else the finest whole level below; at worst the overview
    let show = zb
    for (const z of [zt, zt + 1, zt + 2]) if (z > zb && this.complete(z, visOf(z))) { show = z; break }
    if (show === zb) for (let z = zt - 1; z > zb; z--) if (this.complete(z, visOf(z))) { show = z; break }
    if (this.shown !== null && show !== this.shown && !still && this.complete(this.shown, visOf(this.shown))) this.fade = { from: this.shown, t0 }
    this.shown = show

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.paint(ctx, cam, view, show, visOf(show), 1)
    let fading: number | null = null
    if (this.fade) {
      const u = (t0 - this.fade.t0) / FADE_MS
      const list = visOf(this.fade.from)
      if (u >= 1 || this.fade.from === show || !this.complete(this.fade.from, list)) this.fade = null
      else { fading = this.fade.from; this.paint(ctx, cam, view, this.fade.from, list, 1 - u * u * (3 - 2 * u)) }
    }
    ctx.restore()
    if (this.log) this.log.push({ target: zt, shown: show, fading, levels: fading === null ? [show] : [show, fading] })

    while (this.tiles.size > this.max) {
      const first = this.tiles.keys().next().value as string
      this.release(this.tiles.get(first)!)
      this.tiles.delete(first)
    }
    return gaps > 0 || show !== zt || this.fade !== null
  }

  private paint(ctx: CanvasRenderingContext2D, cam: Camera, view: View, z: number, list: Array<[number, number]>, alpha: number) {
    const { w, h, dpr } = view
    const tw = TILE / Math.pow(2, z)
    const vx0 = cam.x - w / 2 / cam.k, vy0 = cam.y - h / 2 / cam.k
    const vx1 = cam.x + w / 2 / cam.k, vy1 = cam.y + h / 2 / cam.k
    const dev = (wx: number, wy: number): [number, number] => [Math.round(((wx - cam.x) * cam.k + w / 2) * dpr), Math.round(((wy - cam.y) * cam.k + h / 2) * dpr)]
    const f = TILE / tw
    ctx.globalAlpha = alpha
    for (const [tx, ty] of list) {
      const cv = this.get(z, tx, ty)
      if (!cv) continue
      // only the part on screen, so a coarse tile blown up never asks for a vast image
      const sx0 = Math.max(tx * tw, vx0), sy0 = Math.max(ty * tw, vy0)
      const sx1 = Math.min((tx + 1) * tw, vx1), sy1 = Math.min((ty + 1) * tw, vy1)
      if (sx1 <= sx0 || sy1 <= sy0) continue
      const [d0, e0] = dev(sx0, sy0), [d1, e1] = dev(sx1, sy1)
      if (d1 <= d0 || e1 <= e0) continue
      ctx.drawImage(cv, (sx0 - tx * tw) * f, (sy0 - ty * tw) * f, (sx1 - sx0) * f, (sy1 - sy0) * f, d0, e0, d1 - d0, e1 - e0)
    }
    ctx.globalAlpha = 1
  }
}
