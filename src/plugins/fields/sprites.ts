// Pre-drawn marks. A tile can hold a thousand peaks, trees and houses; drawing each as paths is
// the slow part of making a tile, so each mark is drawn once per size step and variant into a
// little canvas, and tiles copy it. Sizes are stepped geometrically (a few percent apart), so a
// copy is never scaled by more than that and stays crisp.

export interface Sprite { c: HTMLCanvasElement; ax: number; ay: number; w: number; h: number; size: number }

const STEP = Math.log(1.08)

/** The size step a size falls in, and that step's exact size. */
export function stepOf(size: number): [number, number] {
  const b = Math.round(Math.log(Math.max(0.5, size)) / STEP)
  return [b, Math.exp(b * STEP)]
}

export class Sprites {
  private m = new Map<string, Sprite>()
  private key = ''
  private dpr = 1

  /** Forget every sprite when the palette or pixel ratio changes. */
  reset(key: string, dpr: number): void {
    if (key === this.key) return
    this.key = key
    this.dpr = dpr
    this.m.clear()
  }

  /** The sprite for a key, painting it on first use. `paint` draws with the anchor at (0, 0) in
   *  css pixels; the sprite spans w x h css pixels with the anchor at (ax, ay). */
  get(key: string, size: number, w: number, h: number, ax: number, ay: number, paint: (g: CanvasRenderingContext2D) => void): Sprite {
    let s = this.m.get(key)
    if (s) return s
    const d = this.dpr
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.ceil(w * d))
    c.height = Math.max(1, Math.ceil(h * d))
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.setTransform(d, 0, 0, d, ax * d, ay * d)
    g.lineJoin = 'round'
    g.lineCap = 'round'
    paint(g)
    s = { c, ax, ay, w, h, size }
    this.m.set(key, s)
    return s
  }

  /** Copy a sprite so its anchor lands at (x, y), scaled from its step size to `size`. */
  static put(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number, size: number): void {
    const f = size / s.size
    g.drawImage(s.c, x - s.ax * f, y - s.ay * f, s.w * f, s.h * f)
  }
}
