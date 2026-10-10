// Label placement for the map: a cheap greedy board. Labels are offered in priority order;
// each takes the first of its candidate spots that touches nothing already placed, or stays
// hidden. A coarse grid keeps the overlap test near-constant, and the board is reused every
// frame so a redraw allocates almost nothing.

const CELL = 64

export class LabelBoard {
  private cols = 0
  private rows = 0
  private cells: number[][] = []
  private box: number[] = []          // x0, y0, x1, y1 per placed rect
  private n = 0

  reset(w: number, h: number): void {
    const cols = Math.max(1, Math.ceil(w / CELL) + 1), rows = Math.max(1, Math.ceil(h / CELL) + 1)
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols
      this.rows = rows
      this.cells = Array.from({ length: cols * rows }, () => [])
    } else {
      for (const c of this.cells) c.length = 0
    }
    this.n = 0
  }

  private range(x0: number, y0: number, x1: number, y1: number): [number, number, number, number] | null {
    const c0 = Math.max(0, Math.floor(x0 / CELL)), c1 = Math.min(this.cols - 1, Math.floor(x1 / CELL))
    const r0 = Math.max(0, Math.floor(y0 / CELL)), r1 = Math.min(this.rows - 1, Math.floor(y1 / CELL))
    if (c0 > c1 || r0 > r1) return null
    return [c0, c1, r0, r1]
  }

  fits(x0: number, y0: number, x1: number, y1: number): boolean {
    const rg = this.range(x0, y0, x1, y1)
    if (!rg) return true            // fully off the board: nothing to collide with
    const b = this.box
    for (let r = rg[2]; r <= rg[3]; r++) {
      for (let c = rg[0]; c <= rg[1]; c++) {
        const cell = this.cells[r * this.cols + c]
        for (let i = 0; i < cell.length; i++) {
          const j = cell[i] * 4
          if (x0 < b[j + 2] && x1 > b[j] && y0 < b[j + 3] && y1 > b[j + 1]) return false
        }
      }
    }
    return true
  }

  add(x0: number, y0: number, x1: number, y1: number): void {
    const id = this.n++
    const j = id * 4
    this.box[j] = x0; this.box[j + 1] = y0; this.box[j + 2] = x1; this.box[j + 3] = y1
    const rg = this.range(x0, y0, x1, y1)
    if (!rg) return
    for (let r = rg[2]; r <= rg[3]; r++) for (let c = rg[0]; c <= rg[1]; c++) this.cells[r * this.cols + c].push(id)
  }

  place(x0: number, y0: number, x1: number, y1: number): boolean {
    if (!this.fits(x0, y0, x1, y1)) return false
    this.add(x0, y0, x1, y1)
    return true
  }
}

// Text widths, measured once at 100px per font face and scaled, so zooming (which changes every
// label's size continuously) never re-measures.
const widths = new Map<string, number>()
let watching = false

export function textWidth(ctx: CanvasRenderingContext2D, face: string, text: string, size: number): number {
  if (!watching && typeof document !== 'undefined' && document.fonts) {
    watching = true
    // a width measured before the web font arrived is the fallback's width: forget them all
    document.fonts.addEventListener('loadingdone', () => widths.clear())
  }
  const key = face + '\u0000' + text
  let w = widths.get(key)
  if (w === undefined) {
    const prev = ctx.font
    ctx.font = face.replace('{s}', '100px')
    w = ctx.measureText(text).width
    ctx.font = prev
    widths.set(key, w)
  }
  return (w * size) / 100
}

/** A font string for a face template such as `600 {s} "Public Sans", sans-serif`. */
export const fontAt = (face: string, size: number) => face.replace('{s}', `${size.toFixed(1)}px`)
