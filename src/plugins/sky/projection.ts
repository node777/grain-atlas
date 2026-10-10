// One projection for every sky view: stereographic, centred on wherever the camera looks.
//
// Everything is carried into the observer's horizontal frame (x north, y west, z zenith, as
// astronomy-engine defines HOR). The astrolabe is simply this camera aimed at the celestial pole
// with a very wide field -- stereographic projection from the opposite pole is exactly how a
// planispheric astrolabe's plate and rete are drawn -- and the dome is the camera aimed at the
// horizon. Moving between them is a slerp of the camera, so the two are one instrument.

import * as A from 'astronomy-engine'

export type V3 = [number, number, number]
export type M3 = number[][]   // row-major 3x3

export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
export const mul = (m: M3, v: V3): V3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
]
export const mmul = (a: M3, b: M3): M3 => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]))

/**
 * Matrix taking J2000 equatorial unit vectors (catalogue RA/Dec) to the horizontal frame at a
 * time and place. astronomy-engine's rotation matrices are column-major arrays (rot[i][j] maps
 * component i to j), so we transpose into our row-major form.
 */
const rowMajor = (r: A.RotationMatrix): M3 => {
  const m = r.rot
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ]
}

export interface Frames {
  eqj: M3                 // J2000 equatorial (catalogue) -> horizontal
  eqd: M3                 // true equator of date -> horizontal
  ect: M3                 // true ecliptic of date -> horizontal
}

export function framesAt(date: Date, lat: number, lon: number): Frames {
  const obs = new A.Observer(lat, lon, 0)
  const eqdHor = A.Rotation_EQD_HOR(date, obs)
  return {
    eqj: rowMajor(A.CombineRotation(A.Rotation_EQJ_EQD(date), eqdHor)),
    eqd: rowMajor(eqdHor),
    ect: rowMajor(A.CombineRotation(A.Rotation_ECT_EQD(date), eqdHor)),
  }
}

/** Unit vector for an ecliptic-of-date longitude/latitude, in degrees. */
export function eclVec(lonDeg: number, latDeg = 0): V3 {
  const l = (lonDeg * Math.PI) / 180, b = (latDeg * Math.PI) / 180
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)]
}

/** Horizontal unit vector from altitude/azimuth (azimuth from north, through east). */
export function horVec(altDeg: number, azDeg: number): V3 {
  const a = (altDeg * Math.PI) / 180, z = (azDeg * Math.PI) / 180
  // HOR frame: x north, y west, z up; east is -y
  return [Math.cos(a) * Math.cos(z), -Math.cos(a) * Math.sin(z), Math.sin(a)]
}

export interface Cam {
  fwd: V3
  up: V3
  fov: number             // degrees across the shorter screen side
}

export interface Proj {
  w: number
  h: number
  cx: number
  cy: number
  scale: number
  right: V3
  up: V3
  fwd: V3
}

/** The part of the canvas the sky is framed in (the rest may sit under a panel). */
export interface ViewRect { x: number; y: number; w: number; h: number }

export function makeProj(cam: Cam, w: number, h: number, view?: ViewRect, centre?: [number, number]): Proj {
  const fwd = norm(cam.fwd)
  let right = cross(fwd, cam.up)
  if (Math.hypot(...right) < 1e-6) right = cross(fwd, [0, 0, 1])
  right = norm(right)
  const up = norm(cross(right, fwd))
  const v = view ?? { x: 0, y: 0, w, h }
  const half = Math.min(v.w, v.h) / 2
  const scale = half / (2 * Math.tan(((cam.fov / 2) * Math.PI) / 180 / 2))
  const c = centre ?? [v.x + v.w / 2, v.y + v.h / 2]
  return { w, h, cx: c[0], cy: c[1], scale, right, up, fwd }
}

/** The field (degrees across the view's shorter side) that gives a projection scale. */
export const fovForScale = (half: number, scale: number) => (4 * Math.atan(half / (2 * scale)) * 180) / Math.PI

/**
 * Rows of [right; up; fwd] x M, so a vector in M's source frame goes straight to camera space
 * with nine multiplies: the hot loops (stars, Milky Way) use this instead of mul + project.
 */
export function composite(p: Proj, m: M3, out: Float64Array): Float64Array {
  const rows = [p.right, p.up, p.fwd]
  for (let r = 0; r < 3; r++) {
    const b = rows[r]
    for (let j = 0; j < 3; j++) out[r * 3 + j] = b[0] * m[0][j] + b[1] * m[1][j] + b[2] * m[2][j]
  }
  return out
}

/** Horizontal unit vector for an hour angle H (west positive) and declination, at latitude lat. */
export function hdVec(hDeg: number, decDeg: number, latDeg: number): V3 {
  const H = (hDeg * Math.PI) / 180, d = (decDeg * Math.PI) / 180, f = (latDeg * Math.PI) / 180
  return [
    Math.cos(f) * Math.sin(d) - Math.sin(f) * Math.cos(d) * Math.cos(H),
    Math.cos(d) * Math.sin(H),
    Math.sin(f) * Math.sin(d) + Math.cos(f) * Math.cos(d) * Math.cos(H),
  ]
}

/** Local magnification of the projection at a point: pixels per radian of sky. */
export const pxPerRad = (p: Proj, v: V3) => (p.scale * 2) / (1 + dot(v, p.fwd))

/**
 * The screen circle a small circle of the sphere projects to (stereographic projection keeps
 * circles circles), fitted through three of its points; null when it is a line or runs behind.
 */
export function circleFit(p: Proj, axis: V3, radiusDeg: number): { x: number; y: number; r: number } | null {
  const pts = circlePoints(axis, radiusDeg, 3)
  const a = project(p, pts[0], -0.995), b = project(p, pts[1], -0.995), c = project(p, pts[2], -0.995)
  if (!a || !b || !c) return null
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
  if (Math.abs(d) < 1e-6) return null
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2
  const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d
  const y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d
  const r = Math.hypot(a[0] - x, a[1] - y)
  return isFinite(r) && r < 1e6 ? { x, y, r } : null
}

/** Screen point for a unit vector, or null when it falls too far behind the camera. */
export function project(p: Proj, v: V3, limit = -0.92): [number, number] | null {
  const z = dot(v, p.fwd)
  if (z < limit) return null
  const x = dot(v, p.right), y = dot(v, p.up)
  const f = p.scale * 2 / (1 + z)
  return [p.cx + x * f, p.cy - y * f]
}

/** Inverse: the unit vector under a screen point. */
export function unproject(p: Proj, sx: number, sy: number): V3 {
  const X = (sx - p.cx) / (p.scale * 2), Y = -(sy - p.cy) / (p.scale * 2)
  const r2 = X * X + Y * Y
  const z = (1 - r2) / (1 + r2)
  const k = 1 + z
  const x = X * k, y = Y * k
  return norm([
    p.right[0] * x + p.up[0] * y + p.fwd[0] * z,
    p.right[1] * x + p.up[1] * y + p.fwd[1] * z,
    p.right[2] * x + p.up[2] * y + p.fwd[2] * z,
  ])
}

/** Spherical interpolation between two unit vectors. */
export function slerp(a: V3, b: V3, t: number): V3 {
  const d = Math.max(-1, Math.min(1, dot(a, b)))
  const th = Math.acos(d)
  if (th < 1e-5) return a
  const s = Math.sin(th)
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s
  return norm([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb])
}

/** Points along a small circle: all v with dot(v, axis) = cos(radius). */
export function circlePoints(axis: V3, radiusDeg: number, n = 180): V3[] {
  const ax = norm(axis)
  const t = Math.abs(ax[2]) < 0.9 ? cross(ax, [0, 0, 1]) : cross(ax, [1, 0, 0])
  const u = norm(t), w = cross(ax, u)
  const r = (radiusDeg * Math.PI) / 180
  const c = Math.cos(r), s = Math.sin(r)
  const out: V3[] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    out.push([ax[0] * c + (u[0] * Math.cos(a) + w[0] * Math.sin(a)) * s, ax[1] * c + (u[1] * Math.cos(a) + w[1] * Math.sin(a)) * s, ax[2] * c + (u[2] * Math.cos(a) + w[2] * Math.sin(a)) * s])
  }
  return out
}

/** Stroke a polyline of unit vectors, breaking where it leaves the visible hemisphere-ish. */
export function strokeSphere(ctx: CanvasRenderingContext2D, p: Proj, pts: V3[], limit = -0.85): void {
  let pen = false
  let last: [number, number] | null = null
  ctx.beginPath()
  for (const v of pts) {
    const s = project(p, v, limit)
    if (!s) { pen = false; last = null; continue }
    if (last && Math.hypot(s[0] - last[0], s[1] - last[1]) > Math.max(p.w, p.h)) pen = false
    if (pen) ctx.lineTo(s[0], s[1])
    else ctx.moveTo(s[0], s[1])
    pen = true
    last = s
  }
  ctx.stroke()
}
