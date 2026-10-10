// A cache of pre-drawn map tiles, so panning and zooming only copy pixels. Tiles are square
// pieces of the world drawn at power-of-two scales: a frame picks a level near the screen's,
// draws the tiles it already holds, renders a few missing ones inside a time budget (nearest
// the middle first), and lets a stand-in show through for the rest until they come. The
// stand-in is one coarse level of the whole world, drawn first and kept for good, with the
// next level up (or down, when zooming out) laid over it where the cache still has it.
// Least recently used tiles are let go once the cache is full.

import type { Camera } from '@/ui/useCanvas'

/** Draws one tile. `g` is untransformed at the tile's top-left; world (x, y) lands at
 *  ((x - x0) * s, (y - y0) * s) device pixels. */
export type TileRender = (g: CanvasRenderingContext2D, x0: number, y0: number, s: number) => void

export const TILE = 256

type Box = { x0: number; y0: number; x1: number; y1: number }

export class TileCache {
  private tiles = new Map<string, HTMLCanvasElement>()
  private base = new Map<string, HTMLCanvasElement>()     // the overview level, never evicted
  private pool: HTMLCanvasElement[] = []
  private key = ''
  private z: number | null = null
  constructor(private max = 300) {}

  /** Forget every tile when what they show has changed (tree, theme, settings, pixel ratio). */
  reset(key: string): void {
    if (key === this.key) return
    this.key = key
    for (const c of this.tiles.values()) this.release(c)
    for (const c of this.base.values()) this.release(c)
    this.tiles.clear()
    this.base.clear()
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

  /** Draw the view. `world` bounds the land (for the overview level). Returns how many tiles
   *  are still missing; the caller redraws until none are. */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, view: { w: number; h: number; dpr: number }, world: Box, render: TileRender, budgetMs: number): number {
    const { w, h, dpr } = view
    const t0 = performance.now()
    // the level: just finer than the screen (never blown up more than a tenth), held while
    // zooming out until it is nearly twice too fine
    const ideal = Math.log2(cam.k * dpr)
    if (this.z === null || ideal - this.z > 0.15 || ideal - this.z < -0.9) this.z = Math.ceil(ideal - 0.15)
    const z = this.z
    const span = Math.max(world.x1 - world.x0, world.y1 - world.y0)
    const zb = Math.min(z - 1, Math.floor(Math.log2((TILE * 2) / span)))
    const dev = (wx: number, wy: number): [number, number] => [Math.round(((wx - cam.x) * cam.k + w / 2) * dpr), Math.round(((wy - cam.y) * cam.k + h / 2) * dpr)]
    const vx0 = cam.x - w / 2 / cam.k, vy0 = cam.y - h / 2 / cam.k
    const vx1 = cam.x + w / 2 / cam.k, vy1 = cam.y + h / 2 / cam.k

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    // the overview: render what is missing of it first (it is small), then draw what shows
    const bw = TILE / Math.pow(2, zb)
    const over = () => {
      for (let tx = Math.floor(vx0 / bw); tx <= Math.floor(vx1 / bw); tx++) {
        for (let ty = Math.floor(vy0 / bw); ty <= Math.floor(vy1 / bw); ty++) {
          const cv = this.base.get(`${tx}:${ty}`)
          if (!cv) continue
          // only the part on screen, so a deep zoom never asks for a vast scaled image
          const sx0 = Math.max(tx * bw, vx0), sy0 = Math.max(ty * bw, vy0)
          const sx1 = Math.min((tx + 1) * bw, vx1), sy1 = Math.min((ty + 1) * bw, vy1)
          if (sx1 <= sx0 || sy1 <= sy0) continue
          const f = TILE / bw
          const [d0, e0] = dev(sx0, sy0), [d1, e1] = dev(sx1, sy1)
          ctx.drawImage(cv, (sx0 - tx * bw) * f, (sy0 - ty * bw) * f, (sx1 - sx0) * f, (sy1 - sy0) * f, d0, e0, d1 - d0, e1 - e0)
        }
      }
    }
    let baseMissing = 0
    for (let tx = Math.floor(world.x0 / bw); tx <= Math.floor(world.x1 / bw); tx++) {
      for (let ty = Math.floor(world.y0 / bw); ty <= Math.floor(world.y1 / bw); ty++) {
        const k = `${tx}:${ty}`
        if (this.base.has(k)) continue
        if (performance.now() - t0 < budgetMs) this.base.set(k, this.make(render, zb, tx, ty))
        else baseMissing++
      }
    }

    const tw = TILE / Math.pow(2, z)
    const tx0 = Math.floor(vx0 / tw), tx1 = Math.floor(vx1 / tw)
    const ty0 = Math.floor(vy0 / tw), ty1 = Math.floor(vy1 / tw)
    const mx = (tx0 + tx1) / 2, my = (ty0 + ty1) / 2
    const order: Array<[number, number, number]> = []
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) order.push([tx, ty, (tx - mx) ** 2 + (ty - my) ** 2])
    order.sort((a, b) => a[2] - b[2])

    // first pass: what we hold or can render now; note the gaps
    const have: Array<[HTMLCanvasElement, number, number, number, number]> = []
    const gaps: Array<[number, number]> = []
    for (const [tx, ty] of order) {
      const key = `${z}:${tx}:${ty}`
      let cv = this.tiles.get(key)
      if (cv) { this.tiles.delete(key); this.tiles.set(key, cv) }
      else if (performance.now() - t0 < budgetMs) { cv = this.make(render, z, tx, ty); this.tiles.set(key, cv) }
      if (!cv) { gaps.push([tx, ty]); continue }
      const [x0, y0] = dev(tx * tw, ty * tw), [x1, y1] = dev((tx + 1) * tw, (ty + 1) * tw)
      have.push([cv, x0, y0, x1 - x0, y1 - y0])
    }

    // stand-ins under the gaps: the overview everywhere, then the neighbouring levels if held
    if (gaps.length) {
      over()
      for (const [tx, ty] of gaps) {
        const par = this.tiles.get(`${z - 1}:${tx >> 1}:${ty >> 1}`)
        const [x0, y0] = dev(tx * tw, ty * tw), [x1, y1] = dev((tx + 1) * tw, (ty + 1) * tw)
        if (par) {
          const sub = TILE / 2
          ctx.drawImage(par, (tx & 1) * sub, (ty & 1) * sub, sub, sub, x0, y0, x1 - x0, y1 - y0)
          continue
        }
        for (let q = 0; q < 4; q++) {
          const cx = tx * 2 + (q & 1), cy = ty * 2 + (q >> 1)
          const kid = this.tiles.get(`${z + 1}:${cx}:${cy}`)
          if (!kid) continue
          const [a0, b0] = dev(cx * tw / 2, cy * tw / 2), [a1, b1] = dev((cx + 1) * tw / 2, (cy + 1) * tw / 2)
          ctx.drawImage(kid, a0, b0, a1 - a0, b1 - b0)
        }
      }
    }
    for (const [cv, x, y, dw, dh] of have) ctx.drawImage(cv, x, y, dw, dh)
    ctx.restore()

    while (this.tiles.size > this.max) {
      const first = this.tiles.keys().next().value as string
      this.release(this.tiles.get(first)!)
      this.tiles.delete(first)
    }
    return gaps.length + baseMissing
  }
}
