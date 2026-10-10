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

/** The full transform (pin-relative) of a layer at depth z, as the browser composes it. */
export function planeMatrix(t: Tilt, P: number, z: number): DOMMatrix {
  return new DOMMatrix(`perspective(${P}px) rotateX(${t.ax}deg) rotateY(${t.ay}deg) ${layerTransform(z, P)}`)
}

/**
 * Where a screen point (relative to the pin) falls on a layer's own plane (relative to the
 * pin): the inverse of the layer's homography. Used to turn the rete and to pick stars on a
 * tilted instrument.
 */
export function toPlane(m: DOMMatrix, x: number, y: number): [number, number] {
  // (X, Y, 0, 1) -> (m11 X + m21 Y + m41, m12 X + m22 Y + m42, ., m14 X + m24 Y + m44)
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
