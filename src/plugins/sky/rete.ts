// The rete: everything that turns with the sky. The Milky Way, the fainter stars, the figures
// of a sky culture, the ecliptic band (sidereal rashis inside, the 27 nakshatras and their 108
// padas outside, a degree scale on the ecliptic itself), and -- in the astrolabe -- the brass
// openwork with flame pointers to the brightest named stars.
//
// In the astrolabe, with the camera on the pole, turning time only turns this whole layer about
// the pin; drawSky caches it and rotates the image while you drag.

import type { Catalog, CultureId } from './catalog'
import { rgba } from './palette'
import {
  type V3, circleFit, composite, eclVec, mul, project, strokeSphere,
} from './projection'
import { type Scene, brushed, ringAdd, ringFlush } from './instrument'

// ------------------------------------------------------------------ catalogue in typed arrays

export interface StarTable {
  n: number
  vx: Float64Array; vy: Float64Array; vz: Float64Array
  mag: Float32Array
  col: Uint8Array          // colour bucket, see STAR_COLS
  hip: Int32Array
  idx: Int32Array          // index into cat.stars
}

/** Warm star colours by B-V: the palette stays blue-free, hot stars read as pale linen. */
export const STAR_COLS = ['#f4f1ea', '#f6efdd', '#f6ead0', '#f3dcae', '#f1c98b', '#eaa772']
const colBucket = (ci: number) => (ci < 0 ? 0 : ci < 0.3 ? 1 : ci < 0.6 ? 2 : ci < 0.9 ? 3 : ci < 1.3 ? 4 : 5)

const tables = new WeakMap<Catalog, StarTable>()
/** The catalogue sorted by magnitude, brightest first, so every pass can stop at its limit. */
export function starTable(cat: Catalog): StarTable {
  let t = tables.get(cat)
  if (t) return t
  const order = cat.stars.map((_, i) => i).sort((a, b) => cat.stars[a].mag - cat.stars[b].mag)
  const n = order.length
  t = {
    n, vx: new Float64Array(n), vy: new Float64Array(n), vz: new Float64Array(n), mag: new Float32Array(n),
    col: new Uint8Array(n), hip: new Int32Array(n), idx: new Int32Array(n),
  }
  order.forEach((i, k) => {
    const s = cat.stars[i]
    t!.vx[k] = s.v[0]; t!.vy[k] = s.v[1]; t!.vz[k] = s.v[2]
    t!.mag[k] = s.mag; t!.col[k] = colBucket(s.ci); t!.hip[k] = s.hip; t!.idx[k] = i
  })
  tables.set(cat, t)
  return t
}

// The Milky Way: five contour levels (ol1 faintest .. ol5 brightest), each a set of rings filled
// even-odd. The faint band's rings wrap most of the sky, so they are projected whole (never
// dropped when part runs behind the camera) and the fill is inverted when the point behind the
// camera lies inside the band -- decided in a projection from the north galactic pole, which no
// level of the Milky Way reaches.
interface MilkyWay {
  levels: Array<{ n: number; r0: number; r1: number }>   // ring index range per level
  ringStart: Int32Array
  v: Float64Array
  pu: Float64Array; pw: Float64Array                      // the rings seen from the galactic pole
  basis: [V3, V3, V3]
}
const NGP: V3 = (() => { const a = (192.8595 * Math.PI) / 180, d = (27.1283 * Math.PI) / 180; return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)] })()
const mws = new WeakMap<Catalog, MilkyWay>()
function milkyWay(cat: Catalog): MilkyWay {
  let m = mws.get(cat)
  if (m) return m
  const levels: MilkyWay['levels'] = [], ringStart: number[] = [], vs: number[] = []
  for (const layer of cat.milkyway) {
    const n = parseInt(String(layer.level).replace(/\D/g, ''), 10) || 1
    const r0 = ringStart.length
    for (const poly of layer.polys) {
      for (const ring of poly) {
        ringStart.push(vs.length / 3)
        for (const [ra, dec] of ring) {
          const a = (ra * Math.PI) / 180, d = (dec * Math.PI) / 180
          vs.push(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d))
        }
      }
    }
    levels.push({ n, r0, r1: ringStart.length })
  }
  ringStart.push(vs.length / 3)
  const e1: V3 = (() => { const t: V3 = [-NGP[1], NGP[0], 0]; const l = Math.hypot(t[0], t[1]); return [t[0] / l, t[1] / l, 0] })()
  const e2: V3 = [NGP[1] * e1[2] - NGP[2] * e1[1], NGP[2] * e1[0] - NGP[0] * e1[2], NGP[0] * e1[1] - NGP[1] * e1[0]]
  const v = Float64Array.from(vs)
  const np = v.length / 3
  const pu = new Float64Array(np), pw = new Float64Array(np)
  for (let i = 0; i < np; i++) {
    const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2]
    const k = 1 / Math.max(1e-9, 1 - (x * NGP[0] + y * NGP[1] + z * NGP[2]))
    pu[i] = (x * e1[0] + y * e1[1] + z * e1[2]) * k
    pw[i] = (x * e2[0] + y * e2[1] + z * e2[2]) * k
  }
  m = { levels, ringStart: Int32Array.from(ringStart), v, pu, pw, basis: [NGP, e1, e2] }
  mws.set(cat, m)
  return m
}

/** Is the point q inside a level's even-odd region (counted from the galactic pole)? */
function mwContains(mw: MilkyWay, lv: { r0: number; r1: number }, q: V3): boolean {
  const [n, e1, e2] = mw.basis
  const k = 1 / Math.max(1e-9, 1 - (q[0] * n[0] + q[1] * n[1] + q[2] * n[2]))
  const qu = (q[0] * e1[0] + q[1] * e1[1] + q[2] * e1[2]) * k, qw = (q[0] * e2[0] + q[1] * e2[1] + q[2] * e2[2]) * k
  let inside = false
  for (let r = lv.r0; r < lv.r1; r++) {
    const a = mw.ringStart[r], b = mw.ringStart[r + 1]
    for (let i = a, j = b - 1; i < b; j = i++) {
      const wi = mw.pw[i] - qw, wj = mw.pw[j] - qw
      if ((wi > 0) !== (wj > 0)) {
        const u = mw.pu[i] - qu + ((mw.pu[j] - mw.pu[i]) * (0 - wi)) / (wj - wi)
        if (u > 0) inside = !inside
      }
    }
  }
  return inside
}

interface Figures { lines: Float64Array[]; centres: Array<{ v: V3; name: string; n: number }> }
const figs = new WeakMap<Catalog, Map<string, Figures>>()
/** A culture's figures as polylines of unit vectors, with a centre to hang each name on. */
export function figuresOf(cat: Catalog, culture: CultureId): Figures {
  let byC = figs.get(cat)
  if (!byC) { byC = new Map(); figs.set(cat, byC) }
  let f = byC.get(culture)
  if (f) return f
  const lines: Float64Array[] = []
  const centres: Figures['centres'] = []
  for (const fig of cat.cultures[culture]?.constellations ?? []) {
    let sx = 0, sy = 0, sz = 0, n = 0
    for (const line of fig.lines) {
      const pts: number[] = []
      for (const hip of line) {
        const st = cat.byHip.get(hip)
        if (!st) { if (pts.length >= 6) lines.push(Float64Array.from(pts)); pts.length = 0; continue }
        pts.push(st.v[0], st.v[1], st.v[2])
        sx += st.v[0]; sy += st.v[1]; sz += st.v[2]; n++
      }
      if (pts.length >= 6) lines.push(Float64Array.from(pts))
    }
    if (n > 1) {
      const l = Math.hypot(sx, sy, sz) || 1
      centres.push({ v: [sx / l, sy / l, sz / l], name: fig.name, n })
    }
  }
  f = { lines, centres }
  byC.set(culture, f)
  return f
}

// ------------------------------------------------------------------ star drawing

const M = new Float64Array(9)
const MAXV = 12000
const sx = new Float32Array(MAXV), sy = new Float32Array(MAXV), sr = new Float32Array(MAXV)
const sb = new Uint8Array(MAXV)
const ALPHA_STEPS = [0.42, 0.62, 0.82, 1]

export const limitMagFor = (zoomK: number) => 3.2 + zoomK * 1.9
export const starRadius = (mag: number, limit: number, zoomK: number) => Math.max(0.5, (limit + 0.6 - mag) * 0.42 * Math.sqrt(zoomK))

/**
 * Stars from magnitude `from` (inclusive) to `to`, batched: one path per colour and brightness
 * step, no allocation per star. `clip` (a disc) skips stars outside it.
 */
export function drawStars(
  ctx: CanvasRenderingContext2D, sc: Scene, t: StarTable, from: number, to: number, zoomK: number,
  clip?: { x: number; y: number; r: number } | null,
) {
  const { p } = sc
  composite(p, sc.F.eqj, M)
  const limit = limitMagFor(zoomK)
  const top = Math.min(to, limit)
  const sk = Math.sqrt(zoomK)
  let nv = 0
  const w = p.w, h = p.h, s2 = p.scale * 2, cx = p.cx, cy = p.cy
  for (let i = 0; i < t.n; i++) {
    const mg = t.mag[i]
    if (mg > top) break
    if (mg < from) continue
    const x = t.vx[i], y = t.vy[i], z = t.vz[i]
    const Z = M[6] * x + M[7] * y + M[8] * z
    if (Z < -0.6) continue
    const f = s2 / (1 + Z)
    const X = cx + (M[0] * x + M[1] * y + M[2] * z) * f
    const Y = cy - (M[3] * x + M[4] * y + M[5] * z) * f
    if (X < -4 || X > w + 4 || Y < -4 || Y > h + 4) continue
    if (clip) { const dx = X - clip.x, dy = Y - clip.y; if (dx * dx + dy * dy > clip.r * clip.r) continue }
    const a = Math.min(1, 0.35 + (limit - mg) * 0.22)
    const step = a < 0.52 ? 0 : a < 0.72 ? 1 : a < 0.92 ? 2 : 3
    sx[nv] = X; sy[nv] = Y
    sr[nv] = Math.max(0.5, (limit + 0.6 - mg) * 0.42 * sk)
    sb[nv] = t.col[i] * 4 + step
    if (++nv >= MAXV) break
  }
  for (let b = 0; b < 24; b++) {
    let any = false
    for (let k = 0; k < nv; k++) {
      if (sb[k] !== b) continue
      if (!any) { ctx.beginPath(); any = true }
      const r = sr[k]
      if (r < 0.9) { ctx.rect(sx[k] - r, sy[k] - r, r * 2, r * 2); continue }
      ctx.moveTo(sx[k] + r, sy[k])
      ctx.arc(sx[k], sy[k], r, 0, Math.PI * 2)
    }
    if (any) { ctx.fillStyle = rgba(STAR_COLS[b >> 2], ALPHA_STEPS[b & 3]); ctx.fill() }
  }
}

// ------------------------------------------------------------------ the rete layer

export interface ReteOptions {
  culture: CultureId
  showFigures: boolean
  showMilkyWay: boolean
  signZero: number          // where Mesha (or Aries) begins, tropical degrees
  highlightNakshatra: number
  zoomK: number
  /** stars brighter than this are left for the per-frame pass */
  brightCut: number
  clip: { x: number; y: number; r: number } | null
}

export function drawRete(ctx: CanvasRenderingContext2D, sc: Scene, cat: Catalog, o: ReteOptions, crisp: boolean) {
  const { p, pal } = sc
  if (o.showMilkyWay) drawMilkyWay(ctx, sc, cat)
  if (o.showFigures) drawFigureLines(ctx, sc, figuresOf(cat, o.culture))
  drawStars(ctx, sc, starTable(cat), o.brightCut, 99, o.zoomK, o.clip)
  drawBand(ctx, sc, o)
  if (sc.arm > 0.02) {
    // the armillary's turning rings: the ecliptic and the two colures
    ringAdd(p, mul(sc.F.ect, [0, 0, 1]), 90, 1.3, sc.arm, 1)
    ringAdd(p, mul(sc.F.eqd, [0, 1, 0]), 90, 0.9, sc.arm * 0.8, 0)
    ringAdd(p, mul(sc.F.eqd, [1, 0, 0]), 90, 0.9, sc.arm * 0.8, 0)
    ringFlush(ctx, pal)
  }
  if (sc.reteA > 0.03) {
    drawFrame(ctx, sc, o)
    drawPointers(ctx, sc, cat, crisp)
  }
}

function drawMilkyWay(ctx: CanvasRenderingContext2D, sc: Scene, cat: Catalog) {
  const mw = milkyWay(cat)
  const { p, pal } = sc
  composite(p, sc.F.eqj, M)
  const s2 = p.scale * 2, cx = p.cx, cy = p.cy
  const far = 2e4
  // the point behind the camera, in catalogue coordinates
  const back: V3 = [-M[6], -M[7], -M[8]]
  // the Milky Way ends where the stars do (60° short of the antipode), not ballooning beyond
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, s2 * Math.tan(Math.acos(-0.6) / 2), 0, Math.PI * 2)
  ctx.clip()
  for (const lv of mw.levels) {
    ctx.beginPath()
    for (let r = lv.r0; r < lv.r1; r++) {
      const a = mw.ringStart[r], b = mw.ringStart[r + 1]
      for (let j = a; j < b; j++) {
        const x = mw.v[j * 3], y = mw.v[j * 3 + 1], z = mw.v[j * 3 + 2]
        const Z = M[6] * x + M[7] * y + M[8] * z
        const f = s2 / Math.max(1e-4, 1 + Z)
        let X = (M[0] * x + M[1] * y + M[2] * z) * f, Y = (M[3] * x + M[4] * y + M[5] * z) * f
        const r2 = X * X + Y * Y
        if (r2 > far * far) { const k = far / Math.sqrt(r2); X *= k; Y *= k }
        if (j === a) ctx.moveTo(cx + X, cy - Y); else ctx.lineTo(cx + X, cy - Y)
      }
      ctx.closePath()
    }
    // the region holds the point at infinity: fill its complement
    if (mwContains(mw, lv, back)) ctx.rect(-far, -far, far * 2 + p.w, far * 2 + p.h)
    ctx.fillStyle = rgba(pal.star, 0.028 + lv.n * 0.009)
    ctx.fill('evenodd')
  }
  ctx.restore()
}

function drawFigureLines(ctx: CanvasRenderingContext2D, sc: Scene, f: Figures) {
  const { p, pal } = sc
  composite(p, sc.F.eqj, M)
  const s2 = p.scale * 2, cx = p.cx, cy = p.cy, jump = p.w * 0.6
  ctx.save()
  ctx.strokeStyle = rgba(pal.gold, 0.4)
  ctx.lineWidth = 1
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const line of f.lines) {
    let pen = false, lx = 0, ly = 0
    for (let j = 0; j < line.length; j += 3) {
      const x = line[j], y = line[j + 1], z = line[j + 2]
      const Z = M[6] * x + M[7] * y + M[8] * z
      if (Z < -0.4) { pen = false; continue }
      const q = s2 / (1 + Z)
      const X = cx + (M[0] * x + M[1] * y + M[2] * z) * q, Y = cy - (M[3] * x + M[4] * y + M[5] * z) * q
      if (pen && Math.abs(X - lx) + Math.abs(Y - ly) > jump) pen = false
      if (pen) ctx.lineTo(X, Y); else ctx.moveTo(X, Y)
      pen = true; lx = X; ly = Y
    }
  }
  ctx.stroke()
  ctx.restore()
}

// ------------------------------------------------------------------ the ecliptic band

export const NAK = 360 / 27
export const BAND = { nakIn: -1.5, nakOut: -8.4, degOut: 1.7, signOut: 8.6 }
const tmpV: V3 = [0, 0, 0]
const eclPt = (sc: Scene, lon: number, lat: number): [number, number] | null => {
  const v = eclVec(lon, lat)
  const m = sc.F.ect
  tmpV[0] = m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2]
  tmpV[1] = m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2]
  tmpV[2] = m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  return project(sc.p, tmpV, -0.5)
}

/** Strength of the zodiac drawing: it fades with the brass but never quite leaves. */
export const ringStrength = (inst: number) => Math.max(0.3, inst)

function cellPath(ctx: CanvasRenderingContext2D, sc: Scene, l0: number, l1: number, b0: number, b1: number, steps: number): boolean {
  const pts: Array<[number, number]> = []
  for (let s = 0; s <= steps; s++) { const q = eclPt(sc, l0 + ((l1 - l0) * s) / steps, b0); if (!q) return false; pts.push(q) }
  for (let s = steps; s >= 0; s--) { const q = eclPt(sc, l0 + ((l1 - l0) * s) / steps, b1); if (!q) return false; pts.push(q) }
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1])
  ctx.closePath()
  return true
}

function drawBand(ctx: CanvasRenderingContext2D, sc: Scene, o: ReteOptions) {
  const { p, pal, inst, reteA } = sc
  const ring = ringStrength(inst)
  const ay = sc.sky.ayanamsa
  ctx.save()
  // the brass of the band itself, while the astrolabe is out
  if (reteA > 0.02) {
    const ep = mul(sc.F.ect, [0, 0, 1])
    const fit = circleFit(p, ep, 90)
    ctx.beginPath()
    for (let i = 0; i < 12; i++) cellPath(ctx, sc, i * 30, i * 30 + 30, BAND.nakOut, BAND.signOut, 10)
    ctx.globalAlpha = 0.62 * reteA
    ctx.fillStyle = fit ? brushed(ctx, pal, fit.x, fit.y) : pal.brass
    ctx.fill()
    ctx.globalAlpha = 0.5 * reteA
    ctx.fillStyle = 'rgba(24, 16, 8, 1)'
    ctx.fill()
    ctx.globalAlpha = 1
  }
  // nakshatra cells, alternately tinted, the Moon's lodge lit
  for (let i = 0; i < 27; i++) {
    const a = i * NAK + ay
    ctx.beginPath()
    if (!cellPath(ctx, sc, a, a + NAK, BAND.nakIn, BAND.nakOut, 6)) continue
    const lit = o.highlightNakshatra === i
    ctx.fillStyle = lit ? rgba(pal.gold, 0.32 + 0.1 * reteA) : i % 2 ? rgba(pal.brass, 0.08 * ring) : rgba(pal.elder, 0.075 * ring)
    ctx.fill()
  }
  // sign cells, faintly alternating
  for (let i = 0; i < 12; i++) {
    if (i % 2) continue
    ctx.beginPath()
    if (cellPath(ctx, sc, o.signZero + i * 30, o.signZero + i * 30 + 30, BAND.degOut, BAND.signOut, 8)) {
      ctx.fillStyle = rgba(pal.gold, 0.06 * ring)
      ctx.fill()
    }
  }
  // edges: the band's rims and the ecliptic itself
  const edge = (lat: number, col: string, a: number, lw: number) => {
    const pts: V3[] = []
    for (let l = 0; l <= 360; l += 2) pts.push(mul(sc.F.ect, eclVec(l, lat)))
    ctx.strokeStyle = rgba(col, a)
    ctx.lineWidth = lw
    strokeSphere(ctx, p, pts, -0.5)
  }
  edge(BAND.nakOut, pal.brassDim, 0.7 * ring, 0.9)
  edge(BAND.nakIn, pal.brassDim, 0.6 * ring, 0.7)
  edge(BAND.degOut, pal.brassDim, 0.55 * ring, 0.7)
  edge(BAND.signOut, pal.brassDim, 0.6 * ring, 0.9)
  edge(0, pal.gold, 0.55 * ring + 0.2, 1.4)

  // divisions: nakshatra boundaries and the sign boundaries, cut across the band
  ctx.beginPath()
  for (let i = 0; i < 27; i++) {
    const a = i * NAK + ay
    const q0 = eclPt(sc, a, BAND.nakIn), q1 = eclPt(sc, a, BAND.nakOut)
    if (q0 && q1) { ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]) }
  }
  for (let i = 0; i < 12; i++) {
    const a = o.signZero + i * 30
    const q0 = eclPt(sc, a, 0), q1 = eclPt(sc, a, BAND.signOut)
    if (q0 && q1) { ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]) }
  }
  ctx.strokeStyle = rgba(pal.gold, 0.7 * ring)
  ctx.lineWidth = 0.9
  ctx.stroke()
  // pada ticks (four to a nakshatra) and the degree scale on the ecliptic
  const pxDeg = bandPxPerDeg(sc)
  ctx.beginPath()
  for (let k = 0; k < 108; k++) {
    if (k % 4 === 0) continue
    const a = ay + k * (NAK / 4)
    const q0 = eclPt(sc, a, BAND.nakIn), q1 = eclPt(sc, a, BAND.nakIn - 1.1)
    if (q0 && q1) { ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]) }
  }
  const stepDeg = pxDeg > 3.2 ? 1 : 5
  for (let dg = 0; dg < 360; dg += stepDeg) {
    const len = dg % 10 === 0 ? BAND.degOut : dg % 5 === 0 ? BAND.degOut * 0.62 : BAND.degOut * 0.35
    const q0 = eclPt(sc, o.signZero + dg, 0), q1 = eclPt(sc, o.signZero + dg, len)
    if (q0 && q1) { ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]) }
  }
  ctx.strokeStyle = rgba(pal.goldPale, 0.55 * ring)
  ctx.lineWidth = 0.6
  ctx.stroke()
  ctx.restore()
}

/** Pixels per degree along the band, at its widest-shown point (for choosing scale density). */
export function bandPxPerDeg(sc: Scene): number {
  const a = eclPt(sc, 90, 0), b = eclPt(sc, 91, 0)
  const c = eclPt(sc, 270, 0), d = eclPt(sc, 271, 0)
  const m1 = a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0
  const m2 = c && d ? Math.hypot(c[0] - d[0], c[1] - d[1]) : 0
  return Math.min(m1 || m2, m2 || m1)
}

// ------------------------------------------------------------------ the rete's openwork

/** The equinoctial bar, through the pin from the outer ring to the band on either side. */
function drawFrame(ctx: CanvasRenderingContext2D, sc: Scene, o: ReteOptions) {
  const { p, pal, reteA, sky } = sc
  const d = sc.disc
  if (!d) return
  const eps = sky.obliquity
  const sgn = sc.north ? 1 : -1
  const wpx = Math.max(2.5, d.rw * 0.13)
  const strut = (ra: number, dec0: number, dec1: number) => {
    const a = (ra * Math.PI) / 180
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= 16; i++) {
      const dec = ((dec0 + ((dec1 - dec0) * i) / 16) * Math.PI) / 180
      const v = mul(sc.F.eqd, [Math.cos(dec) * Math.cos(a), Math.cos(dec) * Math.sin(a), Math.sin(dec)])
      const q = project(p, v, -0.99)
      if (q) pts.push(q)
    }
    return pts
  }
  // the band crosses the equinoctial colure at about ±(band half-width) in declination
  const parts = [
    strut(0, -sgn * eps, -sgn * 9.4), strut(180, -sgn * eps, -sgn * 9.4),
    strut(0, sgn * 9.5, sgn * 88), strut(180, sgn * 9.5, sgn * 88),
  ]
  ctx.save()
  ctx.globalAlpha = reteA
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const pass of [0, 1, 2]) {
    for (const pts of parts) {
      if (pts.length < 2) continue
      ctx.beginPath()
      const dx = pass === 0 ? 1.4 : pass === 2 ? -wpx * 0.2 : 0, dy = pass === 0 ? 2.2 : pass === 2 ? -wpx * 0.2 : 0
      ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy)
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0] + dx, pts[k][1] + dy)
      ctx.lineWidth = pass === 0 ? wpx + 1 : pass === 1 ? wpx : Math.max(0.6, wpx * 0.3)
      ctx.strokeStyle = pass === 0 ? 'rgba(8, 5, 2, 0.4)' : pass === 1 ? pal.metal[2] : rgba(pal.goldPale, 0.55)
      ctx.stroke()
    }
  }
  ctx.restore()
  void o
}

// the brightest named stars carry a pointer on the rete, as on a real astrolabe
const retePicks = new WeakMap<Catalog, number[]>()
export function reteStars(cat: Catalog): number[] {
  let hit = retePicks.get(cat)
  if (!hit) {
    hit = cat.stars.map((st, i) => ({ st, i }))
      .filter((x) => x.st.hip && cat.names[x.st.hip]?.[0])
      .sort((a, b) => a.st.mag - b.st.mag)
      .slice(0, 22)
      .map((x) => x.i)
    retePicks.set(cat, hit)
  }
  return hit
}

/** Flame-shaped pointers: each tip touches its star, each tail reaches back toward the pin. */
function drawPointers(ctx: CanvasRenderingContext2D, sc: Scene, cat: Catalog, crisp: boolean) {
  const { p, pal, reteA } = sc
  const d = sc.disc
  const c = project(p, sc.pole, -0.999)
  if (!c) return
  const L = d ? Math.max(14, Math.min(26, d.R * 0.055)) : 18
  ctx.save()
  ctx.lineJoin = 'round'
  for (const i of reteStars(cat)) {
    const st = cat.stars[i]
    const s = project(p, mul(sc.F.eqj, st.v), -0.6)
    if (!s || s[0] < -20 || s[0] > p.w + 20 || s[1] < -20 || s[1] > p.h + 20) continue
    if (d && Math.hypot(s[0] - d.x, s[1] - d.y) > d.R - 2) continue
    let ux = c[0] - s[0], uy = c[1] - s[1]
    const L0 = Math.hypot(ux, uy)
    if (L0 < 40) continue
    ux /= L0; uy /= L0
    const px = -uy, py = ux
    const k = L / 18
    const X = (t: number, q: number) => s[0] + ux * L * t + px * q * k
    const Y = (t: number, q: number) => s[1] + uy * L * t + py * q * k
    const path = new Path2D()
    path.moveTo(X(0.12, 0), Y(0.12, 0))
    path.bezierCurveTo(X(0.36, 0.9), Y(0.36, 0.9), X(0.48, 3.3), Y(0.48, 3.3), X(0.7, 3.1), Y(0.7, 3.1))
    path.bezierCurveTo(X(0.9, 2.9), Y(0.9, 2.9), X(1.02, 1.1), Y(1.02, 1.1), X(0.96, -0.5), Y(0.96, -0.5))
    path.bezierCurveTo(X(0.9, -2.5), Y(0.9, -2.5), X(0.64, -2.9), Y(0.64, -2.9), X(0.52, -2.1), Y(0.52, -2.1))
    path.bezierCurveTo(X(0.4, -1.3), Y(0.4, -1.3), X(0.3, -0.5), Y(0.3, -0.5), X(0.12, 0), Y(0.12, 0))
    ctx.globalAlpha = reteA
    if (crisp) {
      ctx.save(); ctx.translate(1.2, 1.8); ctx.fillStyle = 'rgba(8, 5, 2, 0.4)'; ctx.fill(path); ctx.restore()
    }
    ctx.fillStyle = pal.metal[2]
    ctx.fill(path)
    ctx.strokeStyle = rgba(pal.goldPale, 0.75)
    ctx.lineWidth = 0.7
    ctx.stroke(path)
    // a thread of tracery tying the pointer back into the rete
    ctx.globalAlpha = reteA * 0.45
    ctx.beginPath()
    ctx.moveTo(X(0.98, 0), Y(0.98, 0))
    ctx.quadraticCurveTo(X(1.35, 1.6), Y(1.35, 1.6), X(1.8, 0), Y(1.8, 0))
    ctx.stroke()
  }
  ctx.restore()
}

