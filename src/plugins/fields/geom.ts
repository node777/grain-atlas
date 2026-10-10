// Small geometry for the map: boxes, polylines, a hash grid. Points travel as flat arrays of
// x, y pairs, which keeps the big layouts compact and quick to copy into typed arrays.

import { hash } from './layout'

/** x0, y0, x1, y1 */
export type Box = [number, number, number, number]

export function boxOf(pts: ArrayLike<number>, pad = 0): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i], y = pts[i + 1]
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]
}

export const boxesMeet = (a: Box, b: Box, pad = 0) => a[0] - pad < b[2] && a[2] + pad > b[0] && a[1] - pad < b[3] && a[3] + pad > b[1]

/** The vertex of a polyline nearest a point. */
export function nearestOn(pts: ArrayLike<number>, x: number, y: number): [number, number] {
  let bd = Infinity, bx = x, by = y
  for (let i = 0; i < pts.length; i += 2) {
    const d = (pts[i] - x) ** 2 + (pts[i + 1] - y) ** 2
    if (d < bd) { bd = d; bx = pts[i]; by = pts[i + 1] }
  }
  return [bx, by]
}

/** Distance from a point to the segment a-b, and how far along it (0..1) the nearest point is. */
export function toSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): [number, number] {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0
  return [Math.hypot(x - ax - dx * t, y - ay - dy * t), t]
}

/** Even-odd test of a point against a closed polygon. */
export function insidePolygon(pts: ArrayLike<number>, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Midpoint displacement round a closed ring: a smooth outline becomes a surveyed shore. */
export function roughen(ring: Array<[number, number]>, seed: string, depth: number, amp: number): Float32Array {
  let cur: number[] = ring.flatMap(([x, y]) => [x, y])
  for (let d = 0; d < depth; d++) {
    const n = cur.length / 2
    const next: number[] = []
    for (let i = 0; i < n; i++) {
      const ax = cur[i * 2], ay = cur[i * 2 + 1]
      const j = (i + 1) % n
      const bx = cur[j * 2], by = cur[j * 2 + 1]
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1
      const off = (hash(`${seed}:${d}:${i}`) - 0.5) * 2 * amp * len
      next.push(ax, ay, (ax + bx) / 2 - (dy / len) * off, (ay + by) / 2 + (dx / len) * off)
    }
    cur = next
  }
  return Float32Array.from(cur)
}

/** A polyline with a value carried along it (a river's file count, say). */
export interface Course { pts: number[]; val: number[] }

/** Corner-cutting (Chaikin): a jagged course becomes a flowing curve. The ends stay put. */
export function smoothCourse(c: Course, rounds: number): Course {
  let { pts, val } = c
  for (let r = 0; r < rounds && pts.length >= 6; r++) {
    const n = pts.length / 2
    const op = [pts[0], pts[1]], ov = [val[0]]
    for (let i = 0; i < n - 1; i++) {
      const ax = pts[i * 2], ay = pts[i * 2 + 1], bx = pts[i * 2 + 2], by = pts[i * 2 + 3]
      op.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75)
      ov.push(val[i] * 0.75 + val[i + 1] * 0.25, val[i] * 0.25 + val[i + 1] * 0.75)
    }
    op.push(pts[pts.length - 2], pts[pts.length - 1])
    ov.push(val[n - 1])
    pts = op
    val = ov
  }
  return { pts, val }
}

/** Points every `gap` along a course, so it is even to draw and to test against. */
export function resampleCourse(c: Course, gap: number): Course {
  const { pts, val } = c
  const op = [pts[0], pts[1]], ov = [val[0]]
  let carry = 0
  for (let i = 1; i < pts.length / 2; i++) {
    const ax = pts[i * 2 - 2], ay = pts[i * 2 - 1], bx = pts[i * 2], by = pts[i * 2 + 1]
    const L = Math.hypot(bx - ax, by - ay)
    let t = gap - carry
    for (; t <= L; t += gap) {
      const u = t / L
      op.push(ax + (bx - ax) * u, ay + (by - ay) * u)
      ov.push(val[i - 1] + (val[i] - val[i - 1]) * u)
    }
    carry = L - (t - gap)
  }
  op.push(pts[pts.length - 2], pts[pts.length - 1])
  ov.push(val[val.length - 1])
  return { pts: op, val: ov }
}

/** The outline of a channel round a centreline of widths w (narrowed by `inset` each side):
 *  down the left bank, back up the right. Normals come from the neighbouring points, so the
 *  banks bend smoothly. */
export function channelOutline(pts: ArrayLike<number>, w: ArrayLike<number>, inset = 0): Float32Array {
  const n = pts.length / 2
  const out = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1)
    const dx = pts[b * 2] - pts[a * 2], dy = pts[b * 2 + 1] - pts[a * 2 + 1], l = Math.hypot(dx, dy) || 1
    const h = Math.max(0, w[i] / 2 - inset), nx = (-dy / l) * h, ny = (dx / l) * h
    out[i * 2] = pts[i * 2] + nx
    out[i * 2 + 1] = pts[i * 2 + 1] + ny
    const j = 2 * n - 1 - i
    out[j * 2] = pts[i * 2] - nx
    out[j * 2 + 1] = pts[i * 2 + 1] - ny
  }
  return out
}

/** A uniform hash grid of small integer ids. */
export class Grid {
  private m = new Map<number, number[]>()
  constructor(readonly cell: number) {}
  private key(i: number, j: number) { return (i + 32768) * 65536 + (j + 32768) }
  add(id: number, x0: number, y0: number, x1: number, y1: number) {
    const c = this.cell
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) {
      for (let j = Math.floor(y0 / c); j <= Math.floor(y1 / c); j++) {
        const k = this.key(i, j)
        const a = this.m.get(k)
        if (a) a.push(id); else this.m.set(k, [id])
      }
    }
  }
  /** Calls fn for each id in the cells over a box (an id spanning cells may come more than once). */
  each(x0: number, y0: number, x1: number, y1: number, fn: (id: number) => void) {
    const c = this.cell
    const i0 = Math.floor(x0 / c), i1 = Math.floor(x1 / c), j0 = Math.floor(y0 / c), j1 = Math.floor(y1 / c)
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const a = this.m.get(this.key(i, j))
        if (a) for (let q = 0; q < a.length; q++) fn(a[q])
      }
    }
  }
}
