// The astrolabe as an object: the layers of the instrument sit at different depths inside one
// CSS perspective, and the whole is tilted with compositor transforms only (the canvases are
// not redrawn while you tilt). Each layer is scaled so that, face-on, perspective leaves it
// exactly where it was drawn: the face-on reading is the flat drawing, pixel for pixel.

export interface Tilt { ax: number; ay: number }   // CSS rotateX / rotateY, degrees

/** A three-quarter view: the top leans away and the right edge comes forward. */
export const REST_3D: Tilt = { ax: 27, ay: -13 }
export const FACE_ON: Tilt = { ax: 0, ay: 0 }
export const TILT_LIMIT = { axMin: -12, axMax: 58, ay: 48 }

export const isFlat = (t: Tilt) => Math.abs(t.ax) < 0.02 && Math.abs(t.ay) < 0.02
export const lerpTilt = (a: Tilt, b: Tilt, e: number): Tilt => ({ ax: a.ax + (b.ax - a.ax) * e, ay: a.ay + (b.ay - a.ay) * e })
export const scaleTilt = (t: Tilt, k: number): Tilt => ({ ax: t.ax * k, ay: t.ay * k })
export const clampTilt = (t: Tilt): Tilt => ({
  ax: Math.max(TILT_LIMIT.axMin, Math.min(TILT_LIMIT.axMax, t.ax)),
  ay: Math.max(-TILT_LIMIT.ay, Math.min(TILT_LIMIT.ay, t.ay)),
})

/**
 * Depths (CSS px, toward the viewer positive) of the instrument's parts for a disc of outer
 * radius Ro: the mater's back, the plate sunk in it, the rete lying on the plate, the limb's
 * face, and the rule on top.
 */
export interface Depths { P: number; T: number; back: number; plate: number; rete: number; limb: number; top: number }
export function depths(Ro: number): Depths {
  const T = Math.max(10, Ro * 0.085)
  return { P: Math.max(1000, Ro * 4.2), T, back: -T, plate: -0.55 * T, rete: -0.42 * T, limb: 0, top: 0.4 * T }
}

/** A layer at depth z, scaled to cancel perspective when face-on. */
export const layerTransform = (z: number, P: number) => `translateZ(${z.toFixed(2)}px) scale(${((P - z) / P).toFixed(6)})`

/**
 * Map a homogeneous point (x, y, z, w), pin-relative, through what the browser composes for a
 * layer: perspective(P) rotateX(ax) rotateY(ay) translateZ(z0) scale(s) (CSS conventions: y
 * down, z toward the viewer). Returns (x', y', w'); the screen offset is (x'/w', y'/w').
 */
export function mapPoint(t: Tilt, P: number, z0: number, s: number, x: number, y: number, z: number, w: number): [number, number, number] {
  const a = (t.ax * Math.PI) / 180, b = (t.ay * Math.PI) / 180
  // scale, then lift to depth
  let X = x * s, Y = y * s, Z = z + z0 * w
  // rotateY, then rotateX
  const X1 = Math.cos(b) * X + Math.sin(b) * Z, Z1 = -Math.sin(b) * X + Math.cos(b) * Z
  X = X1; Z = Z1
  const Y2 = Math.cos(a) * Y - Math.sin(a) * Z, Z2 = Math.sin(a) * Y + Math.cos(a) * Z
  Y = Y2; Z = Z2
  // perspective
  return [X, Y, w - Z / P]
}

/** A layer's plane-to-screen homography (pin-relative), in DOMMatrix's field names. */
export interface Homography { m11: number; m12: number; m14: number; m21: number; m22: number; m24: number; m41: number; m42: number; m44: number }
export function planeMatrix(t: Tilt, P: number, z: number): Homography {
  const s = (P - z) / P
  const c1 = mapPoint(t, P, z, s, 1, 0, 0, 0), c2 = mapPoint(t, P, z, s, 0, 1, 0, 0), c4 = mapPoint(t, P, z, s, 0, 0, 0, 1)
  return { m11: c1[0], m12: c1[1], m14: c1[2], m21: c2[0], m22: c2[1], m24: c2[2], m41: c4[0], m42: c4[1], m44: c4[2] }
}

/** Screen offset (pin-relative) of a point on a layer's plane: the forward map. */
export function fromPlane(m: Homography, X: number, Y: number): [number, number] {
  const w = m.m14 * X + m.m24 * Y + m.m44
  return [(m.m11 * X + m.m21 * Y + m.m41) / w, (m.m12 * X + m.m22 * Y + m.m42) / w]
}

/**
 * Where a screen point (relative to the pin) falls on a layer's own plane (relative to the
 * pin): the inverse of the layer's homography. Used to turn the rete and to pick stars on a
 * tilted instrument.
 */
export function toPlane(m: Homography, x: number, y: number): [number, number] {
  // (X, Y, 1) -> (m11 X + m21 Y + m41, m12 X + m22 Y + m42, m14 X + m24 Y + m44)
  const a = m.m11 - m.m14 * x, b = m.m21 - m.m24 * x, c = x * m.m44 - m.m41
  const d = m.m12 - m.m14 * y, e = m.m22 - m.m24 * y, f = y * m.m44 - m.m42
  const det = a * e - b * d
  if (Math.abs(det) < 1e-12) return [x, y]
  return [(c * e - b * f) / det, (a * f - c * d) / det]
}

/** The face's normal after the tilt (CSS axes: x right, y down, z toward the viewer). */
export function normalOf(t: Tilt): [number, number, number] {
  const a = (t.ax * Math.PI) / 180, b = (t.ay * Math.PI) / 180
  return [Math.sin(b), -Math.sin(a) * Math.cos(b), Math.cos(a) * Math.cos(b)]
}

// a lamp at upper left, in front; the viewer straight ahead
const L = (() => { const v = [-0.45, -0.6, 0.75]; const l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l) })()
const H = (() => { const v = [L[0], L[1], L[2] + 1]; const l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l) })()

/**
 * The metal's response to the tilt: `glare` (0..1) how squarely the face mirrors the lamp,
 * `angle` the screen direction of the highlight across the face, and `dx, dy` how far the
 * reflected lamp sits from the centre (in units of the disc's radius).
 */
export function lighting(t: Tilt): { glare: number; angle: number; dx: number; dy: number } {
  const n = normalOf(t)
  const d = Math.max(0, n[0] * H[0] + n[1] * H[1] + n[2] * H[2])
  const dx = (H[0] - n[0]) * 2.2, dy = (H[1] - n[1]) * 2.2
  return { glare: Math.pow(d, 36), angle: Math.atan2(dy, dx), dx, dy }
}
