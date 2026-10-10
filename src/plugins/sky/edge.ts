// The instrument's thickness, drawn as real 3D surfaces: the mater's outer wall, the inner
// wall of the recess the plate sits in, and the throne's sides. Each facet is projected through
// the same perspective the browser applies to the layers, and lit by its own normal, so the
// metal brightens and darkens as the instrument turns to the lamp.
//
// This canvas lies flat behind the tilted layers. That is enough for correct occlusion: the
// outer wall only ever shows outside the limb's face, the near half of the inner wall falls
// under the plate (hidden, as it should be) and the far half shows through the recess.

import type { Disc } from './instrument'
import { THRONE } from './instrument'
import { type Palette, mix, rgba } from './palette'
import { type Depths, type Tilt, mapPoint } from './tilt'

const SEG = 120

/** The throne outline (frame: rises along -y from the rim), sampled from its curves. */
function throneOutline(Ro: number): Array<[number, number]> {
  const th = Ro * THRONE, w = Ro * 0.2
  const P = (x: number, y: number): [number, number] => [x * w, -Ro + y * th]
  const curves: Array<[[number, number], [number, number], [number, number], [number, number]]> = [
    [P(-1, 0.25), P(-0.9, -0.25), P(-0.55, -0.2), P(-0.42, -0.45)],
    [P(-0.42, -0.45), P(-0.3, -0.7), P(-0.12, -0.6), P(0, -0.82)],
    [P(0, -0.82), P(0.12, -0.6), P(0.3, -0.7), P(0.42, -0.45)],
    [P(0.42, -0.45), P(0.55, -0.2), P(0.9, -0.25), P(1, 0.25)],
  ]
  const out: Array<[number, number]> = []
  for (const [a, b, c, d] of curves) {
    for (let i = 0; i < 10; i++) {
      const t = i / 10, u = 1 - t
      out.push([
        u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
        u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
      ])
    }
  }
  return out
}

// the lamp at upper left in front, the viewer ahead (CSS axes: y down, z toward the viewer)
const LIGHT = (() => { const v = [-0.45, -0.6, 0.75]; const l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l) })()
const HALF = (() => { const v = [LIGHT[0], LIGHT[1], LIGHT[2] + 1]; const l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l) })()

/**
 * Draw the walls for a tilt. `m` maps pin-relative object points (x, y, z) to screen offsets
 * from the pin (the composed perspective and rotation); `rot` turns object normals to view.
 */
export function drawEdge(
  ctx: CanvasRenderingContext2D, d: Disc, D: Depths, t: Tilt, pal: Palette, alpha: number, ox: number, oy: number,
) {
  const px = d.x - ox, py = d.y - oy
  const proj = (x: number, y: number, z: number): [number, number] => {
    const q = mapPoint(t, D.P, 0, 1, x, y, z, 1)
    return [px + q[0] / q[2], py + q[1] / q[2]]
  }
  const ca = Math.cos((t.ax * Math.PI) / 180), sa = Math.sin((t.ax * Math.PI) / 180)
  const cb = Math.cos((t.ay * Math.PI) / 180), sb = Math.sin((t.ay * Math.PI) / 180)
  const shade = (nx: number, ny: number, nz: number, base: [string, string, string, string], ao: number) => {
    // the normal in view space: rotateY, then rotateX
    const x1 = cb * nx + sb * nz, z1 = -sb * nx + cb * nz
    const vx = x1, vy = ca * ny - sa * z1, vz = sa * ny + ca * z1
    const lam = Math.max(0, vx * LIGHT[0] + vy * LIGHT[1] + vz * LIGHT[2])
    const spec = Math.pow(Math.max(0, vx * HALF[0] + vy * HALF[1] + vz * HALF[2]), 28)
    const k = 0.25 + 0.75 * lam
    const col = k > 0.8 ? mix(base[1], base[0], (k - 0.8) / 0.2) : k > 0.5 ? mix(base[2], base[1], (k - 0.5) / 0.3) : mix(base[3], base[2], k / 0.5)
    return { col: mix(col, '#140c04', ao), spec }
  }
  const metal = pal.metal
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineJoin = 'round'
  // a facet faces the viewer when its projected corners wind the right way round on screen
  const facing = (a: [number, number], b: [number, number], c: [number, number]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0
  const quad = (a: [number, number], b: [number, number], c: [number, number], e: [number, number], fill: string, spec: number) => {
    ctx.beginPath()
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(e[0], e[1]); ctx.closePath()
    ctx.fillStyle = fill
    ctx.strokeStyle = fill
    ctx.lineWidth = 0.8 // seal the seams between facets
    ctx.fill(); ctx.stroke()
    if (spec > 0.02) { ctx.fillStyle = rgba(pal.goldPale, Math.min(0.7, spec)); ctx.fill() }
  }
  // the mater's outer wall, back to the limb's face, with a groove of shadow near the back
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1)
    const A = proj(d.Ro * c0, d.Ro * s0, D.limb - 0.5), B = proj(d.Ro * c1, d.Ro * s1, D.limb - 0.5)
    const C = proj(d.Ro * c1, d.Ro * s1, D.back), E = proj(d.Ro * c0, d.Ro * s0, D.back)
    if (!facing(A, B, C)) continue
    const am = (a0 + a1) / 2
    const { col, spec } = shade(Math.cos(am), Math.sin(am), 0, metal, 0.1)
    quad(A, B, C, E, col, spec)
    // the back edge of the wall falls a little darker, a lip toward the face catches light
    const mid1 = proj(d.Ro * c1, d.Ro * s1, D.back + (D.limb - D.back) * 0.18), mid0 = proj(d.Ro * c0, d.Ro * s0, D.back + (D.limb - D.back) * 0.18)
    quad(mid0, mid1, C, E, rgba('#140c04', 0.35), 0)
    const lip1 = proj(d.Ro * c1, d.Ro * s1, D.limb - (D.limb - D.back) * 0.12), lip0 = proj(d.Ro * c0, d.Ro * s0, D.limb - (D.limb - D.back) * 0.12)
    quad(A, B, lip1, lip0, rgba(pal.goldPale, 0.18 + spec * 0.4), 0)
  }
  // the recess's inner wall, from the plate up to the limb (inward normals)
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1)
    const A = proj(d.R * c1, d.R * s1, D.limb - 0.5), B = proj(d.R * c0, d.R * s0, D.limb - 0.5)
    const C = proj(d.R * c0, d.R * s0, D.plate), E = proj(d.R * c1, d.R * s1, D.plate)
    if (!facing(A, B, C)) continue
    const am = (a0 + a1) / 2
    const { col } = shade(-Math.cos(am), -Math.sin(am), 0, metal, 0.35)
    quad(A, B, C, E, col, 0)
  }
  // the throne's sides
  const out = throneOutline(d.Ro)
  for (let i = 0; i < out.length - 1; i++) {
    const [x0, y0] = out[i], [x1, y1] = out[i + 1]
    const A = proj(x0, y0, D.limb - 0.5), B = proj(x1, y1, D.limb - 0.5), C = proj(x1, y1, D.back), E = proj(x0, y0, D.back)
    if (!facing(A, B, C)) continue
    const nx = y1 - y0, ny = -(x1 - x0), nl = Math.hypot(nx, ny) || 1
    const { col, spec } = shade(nx / nl, ny / nl, 0, metal, 0.12)
    quad(A, B, C, E, col, spec)
  }
  // the shackle ring's thickness: a short tube
  const th = d.Ro * THRONE, ry = -d.Ro - th * 1.04, rr = th * 0.2, lw = Math.max(1.6, th * 0.09)
  for (let k = 0; k <= 4; k++) {
    const z = D.back * 0.35 + (D.limb - 0.5 - D.back * 0.35) * (k / 4)
    ctx.strokeStyle = mix(metal[2], '#140c04', 0.45 - k * 0.08)
    ctx.lineWidth = lw
    ctx.beginPath()
    for (let j = 0; j <= 20; j++) {
      const a = (j / 20) * Math.PI * 2
      const q = proj(Math.cos(a) * rr, ry + Math.sin(a) * rr, z)
      if (j === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1])
    }
    ctx.stroke()
  }
  ctx.restore()
}
