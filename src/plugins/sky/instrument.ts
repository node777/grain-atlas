// The brass: the plate (tympan) engraved for the observer's latitude, the mater's limb with its
// hour and degree scales and its throne, the rule, and -- when you step inside -- the rings of an
// armillary sphere drawn as worked metal, the far side dimmer than the near.
//
// Everything here is drawn through the one projection. The plate and limb do not move while the
// rete turns (they are fixed to the observer), so drawSky renders them into cached layers.

import type { SkyMoment } from '@/astro/positions'
import { type Palette, rgba } from './palette'
import {
  type Frames, type Proj, type V3, type ViewRect, circleFit, circlePoints, cross, dot, fovForScale, hdVec, norm,
  project, strokeSphere,
} from './projection'

export interface Disc { x: number; y: number; R: number; rw: number; Ro: number }

/** What every layer needs to know about this frame. */
export interface Scene {
  p: Proj
  F: Frames
  sky: SkyMoment
  pal: Palette
  inst: number            // 0..1 how much brass is out
  blend: number           // 0 dome .. 1 astrolabe
  reteA: number           // the flat instrument's presence (falls away early as you step inside)
  arm: number             // the armillary rings' presence (they come in as you step inside)
  lat: number
  north: boolean
  pole: V3                // the visible celestial pole, horizontal frame
  disc: Disc | null       // the limb, while the astrolabe is (partly) out
  dpr: number
  cssNight: boolean       // the page behind already shows the night: no need to paint it
}

/** The limb sits a little beyond the far tropic so every graha stays on the plate. */
export const limbCodec = (eps: number) => 90 + eps + 5.5
const RIM = 0.105
export const THRONE = 0.15
const rimWidth = (R: number) => Math.max(18, Math.min(48, R * RIM))

/** The astrolabe's field and centre so the whole disc, rim and throne sit inside the view. */
export function astrolabeFit(view: ViewRect, eps: number, zoom = 1): { fov: number; centre: [number, number] } {
  const Ro = Math.max(60, Math.min(view.w / 2, view.h / (2 + THRONE)) * 0.95)
  let R = Ro / (1 + RIM)
  if (R * RIM < 18) R = Ro - 18
  else if (R * RIM > 48) R = Ro - 48
  const th = (limbCodec(eps) * Math.PI) / 180
  const scale = (R / (2 * Math.tan(th / 2))) * zoom
  const half = Math.min(view.w, view.h) / 2
  return { fov: fovForScale(half, scale), centre: [view.x + view.w / 2, view.y + view.h / 2 + (Ro * THRONE) / 2] }
}

export function discOf(p: Proj, pole: V3, eps: number): Disc | null {
  const f = circleFit(p, pole, limbCodec(eps))
  if (!f || f.r > 1e5) return null
  const rw = rimWidth(f.r)
  return { x: f.x, y: f.y, R: f.r, rw, Ro: f.r + rw }
}

const D = Math.PI / 180

/** Screen angle, around the disc centre, of the meridian hour angle H on the equator. */
function hourAngleOnScreen(sc: Scene, H: number): number {
  const s = project(sc.p, hdVec(H, 0, sc.lat), -0.999)
  const d = sc.disc!
  return s ? Math.atan2(s[1] - d.y, s[0] - d.x) : -Math.PI / 2
}

// ------------------------------------------------------------------ the plate and the night

/** Background, the plate's engraving and the fixed rings: everything that does not turn. */
export function drawUnder(ctx: CanvasRenderingContext2D, sc: Scene) {
  const { p, pal, inst, blend } = sc
  const { w, h } = p
  // the night itself: warm, never navy
  // (in the dome the page behind the canvas is already this night, painted by CSS for free;
  // on the table it is painted here, in the disc only once the astrolabe is fully out)
  if (!sc.cssNight) {
    const g = ctx.createRadialGradient(p.cx, p.cy, 0, p.cx, p.cy, Math.max(w, h) * 0.8)
    g.addColorStop(0, '#1e1915')
    g.addColorStop(0.6, pal.sky)
    g.addColorStop(1, pal.skyDeep)
    ctx.fillStyle = g
    if (sc.reteA >= 1 && sc.disc) {
      ctx.beginPath(); ctx.arc(sc.disc.x, sc.disc.y, sc.disc.Ro, 0, Math.PI * 2); ctx.fill()
    } else ctx.fillRect(0, 0, w, h)
  }
  if (inst < 0.01) return

  const engr = sc.reteA                // engraved plate lines (astrolabe)
  const arm = sc.arm                   // armillary rings (dome)
  const zen: V3 = [0, 0, 1]
  const d = sc.disc

  // the tympan: a faint sheen of metal under the glass of night
  if (d && engr > 0.02) {
    const tg = ctx.createRadialGradient(d.x - d.R * 0.3, d.y - d.R * 0.35, d.R * 0.05, d.x, d.y, d.R)
    tg.addColorStop(0, rgba(pal.gold, 0.075 * engr))
    tg.addColorStop(0.55, rgba(pal.brass, 0.035 * engr))
    tg.addColorStop(1, rgba(pal.brassDim, 0.07 * engr))
    ctx.fillStyle = tg
    ctx.beginPath(); ctx.arc(d.x, d.y, d.R, 0, Math.PI * 2); ctx.fill()
  }

  ctx.save()
  // the plate ends at the limb: nothing engraved runs out onto the table
  if (d && sc.reteA >= 1) { ctx.beginPath(); ctx.arc(d.x, d.y, d.Ro, 0, Math.PI * 2); ctx.clip() }
  ctx.lineCap = 'round'
  // almucantars: every 10° firm, every 5° fine
  const almu = 0.2 + 0.15 * blend
  for (let alt = 5; alt < 90; alt += 5) {
    const major = alt % 10 === 0
    ctx.strokeStyle = rgba(pal.brass, (major ? 0.5 : 0.24) * almu * inst)
    ctx.lineWidth = major ? 0.8 : 0.55
    strokeSphere(ctx, p, circlePoints(zen, 90 - alt, 180))
  }
  // azimuths, horizon to zenith, every 10°; the prime vertical firmer
  for (let az = 0; az < 360; az += 10) {
    if (az % 180 === 0) continue
    const v: V3 = [Math.cos(az * D), -Math.sin(az * D), 0]
    const axis = norm(cross(v, zen))
    const pts = circlePoints(axis, 90, 180).filter((q) => q[2] >= -0.002 && dot(q, v) >= -0.01)
    ctx.strokeStyle = rgba(pal.brass, (az % 90 === 0 ? 0.42 : 0.16) * almu * inst)
    ctx.lineWidth = az % 90 === 0 ? 0.8 : 0.5
    strokeSphere(ctx, p, pts)
  }

  if (engr > 0.02) {
    // twilight: the almucantar 18° below the horizon, where night is full
    ctx.setLineDash([2, 4])
    ctx.strokeStyle = rgba(pal.brass, 0.35 * engr)
    ctx.lineWidth = 0.7
    strokeSphere(ctx, p, circlePoints(zen, 108, 200), -0.995)
    ctx.setLineDash([])
    drawUnequalHours(ctx, sc, engr)
  }

  // the tropics and the equator, circles about the pole (they do not turn with the rete)
  const eps = sc.sky.obliquity
  ctx.lineWidth = 0.8
  ctx.strokeStyle = rgba(pal.brass, 0.5 * engr)
  strokeSphere(ctx, p, circlePoints(sc.pole, 90 - eps, 240), -0.995)
  strokeSphere(ctx, p, circlePoints(sc.pole, 90 + eps, 240), -0.995)
  ctx.lineWidth = 1.1
  ctx.strokeStyle = rgba(pal.gold, 0.6 * engr)
  strokeSphere(ctx, p, circlePoints(sc.pole, 90, 240), -0.995)
  // the meridian line and the horizon, engraved
  ctx.lineWidth = 0.9
  ctx.strokeStyle = rgba(pal.brass, 0.55 * engr)
  strokeSphere(ctx, p, circlePoints([0, 1, 0], 90, 240), -0.995)
  ctx.lineWidth = 1.5
  ctx.strokeStyle = rgba(pal.madder, 0.85 * engr)
  strokeSphere(ctx, p, circlePoints(zen, 90, 240), -0.995)
  ctx.restore()

  // the rete's outer ring, on the far tropic: it turns, but a circle about the pole looks the same
  // at every turn, so it can live on the still layer
  if (d && engr > 0.02) {
    const f = circleFit(p, sc.pole, 90 + eps)
    if (f) {
      const bw = Math.max(3, d.rw * 0.2)
      metalAnnulus(ctx, pal, f.x, f.y, f.r, f.r + bw, engr * 0.95, true)
    }
  }

  // the armillary: meridian, horizon and equator as rings of metal
  if (arm > 0.02) {
    ringBegin()
    ringAdd(p, [0, 1, 0], 90, 1.3, arm * 0.9, 0)
    ringAdd(p, zen, 90, 1.5, arm, 2)
    ringAdd(p, sc.pole, 90, 1.4, arm, 1)
    ringAdd(p, sc.pole, 90 - eps, 0.55, arm * 0.6, 0)
    ringAdd(p, sc.pole, 90 + eps, 0.55, arm * 0.6, 0)
    ringFlush(ctx, pal)
  }
}

/** Unequal (planetary) hours below the horizon: each night-arc of a day-circle cut into twelve. */
function drawUnequalHours(ctx: CanvasRenderingContext2D, sc: Scene, a: number) {
  const { p, pal, lat } = sc
  const eps = sc.sky.obliquity
  const t = Math.tan(lat * D)
  ctx.save()
  ctx.strokeStyle = rgba(pal.brass, 0.3 * a)
  ctx.lineWidth = 0.6
  const sgn = sc.north ? 1 : -1
  for (let k = 1; k < 12; k++) {
    const pts: V3[] = []
    for (let i = 0; i <= 40; i++) {
      const dec = -eps + (2 * eps * i) / 40
      const c = -t * Math.tan(dec * D)
      if (c <= -1 || c >= 1) continue
      const H0 = Math.acos(c) / D
      pts.push(hdVec(H0 + (k * (360 - 2 * H0)) / 12, dec, lat))
    }
    strokeSphere(ctx, p, pts, -0.995)
  }
  // their numbers, inside the far tropic
  const d = sc.disc
  if (d && d.rw > 22) {
    ctx.fillStyle = rgba(pal.gold, 0.55 * a)
    ctx.font = `${Math.round(Math.min(11, d.rw * 0.3))}px Vollkorn, Georgia, serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const dec = -sgn * (eps - 2.2)
    const c = -t * Math.tan(dec * D)
    if (c > -1 && c < 1) {
      const H0 = Math.acos(c) / D
      for (let k = 1; k <= 12; k++) {
        const s = project(p, hdVec(H0 + ((k - 0.5) * (360 - 2 * H0)) / 12, dec, lat), -0.99)
        if (s) ctx.fillText(String(k), s[0], s[1])
      }
    }
  }
  ctx.restore()
}

// ------------------------------------------------------------------ metal

/** A flat brass ring between two radii: brushed with a conic sheen, bevelled at both edges. */
export function metalAnnulus(
  ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r0: number, r1: number, a: number, light = false,
) {
  ctx.save()
  ctx.globalAlpha = a
  const path = new Path2D()
  path.arc(x, y, r1, 0, Math.PI * 2)
  path.arc(x, y, r0, 0, Math.PI * 2, true)
  ctx.fillStyle = brushed(ctx, pal, x, y, light)
  ctx.fill(path, 'evenodd')
  // radial shading: the outer lip catches light, the inner falls into shadow
  const rg = ctx.createRadialGradient(x, y, r0, x, y, r1)
  rg.addColorStop(0, 'rgba(20, 12, 4, 0.35)')
  rg.addColorStop(0.18, 'rgba(20, 12, 4, 0)')
  rg.addColorStop(0.82, 'rgba(255, 240, 200, 0)')
  rg.addColorStop(1, 'rgba(255, 240, 200, 0.16)')
  ctx.fillStyle = rg
  ctx.fill(path, 'evenodd')
  ctx.lineWidth = 0.8
  ctx.strokeStyle = 'rgba(25, 16, 6, 0.75)'
  ctx.beginPath(); ctx.arc(x, y, r0, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = rgba(pal.goldPale, 0.55)
  ctx.beginPath(); ctx.arc(x, y, r1 - 0.4, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}

/** Brushed brass: a conic gradient whose bright sectors sit where a lamp at upper left would glint. */
export function brushed(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, light = false): CanvasGradient | string {
  const [hi, gold, brass, dark] = pal.metal
  if (typeof ctx.createConicGradient !== 'function') return brass
  const cg = ctx.createConicGradient(-Math.PI * 0.75, x, y)
  const stops: Array<[number, string]> = light
    ? [[0, hi], [0.1, gold], [0.25, brass], [0.42, gold], [0.5, hi], [0.6, gold], [0.75, brass], [0.9, gold], [1, hi]]
    : [[0, gold], [0.12, brass], [0.25, dark], [0.38, brass], [0.5, gold], [0.62, brass], [0.75, dark], [0.88, brass], [1, gold]]
  for (const [o, c] of stops) cg.addColorStop(o, c)
  return cg
}

// ------------------------------------------------------------------ what lies over the rete

/**
 * The ground veil, the dusk glow, and (in the astrolabe) the mater: limb, scales and throne.
 * Outside the disc the layer is cut away, so the table -- the page -- shows around the instrument.
 */
export function drawOver(ctx: CanvasRenderingContext2D, sc: Scene) {
  const { p, reteA } = sc
  drawGround(ctx, sc)
  const d = sc.disc
  if (d && reteA > 0.01) {
    // cut the night away outside the rim, as far as the instrument is out
    eraseOutside(ctx, d, reteA, p)
    // the disc's shadow on the table
    const sh = ctx.createRadialGradient(d.x + d.Ro * 0.02, d.y + d.Ro * 0.035, d.Ro * 0.97, d.x + d.Ro * 0.02, d.y + d.Ro * 0.035, d.Ro * 1.09)
    sh.addColorStop(0, `rgba(10, 6, 2, ${0.45 * reteA})`)
    sh.addColorStop(1, 'rgba(10, 6, 2, 0)')
    ctx.fillStyle = sh
    ctx.beginPath()
    ctx.rect(0, 0, p.w, p.h)
    ctx.arc(d.x, d.y, d.Ro - 1, 0, Math.PI * 2, true)
    ctx.fill('evenodd')
    drawThrone(ctx, sc, reteA)
    drawLimb(ctx, sc, reteA)
  }
  drawCardinals(ctx, sc)
}

export function eraseOutside(ctx: CanvasRenderingContext2D, d: Disc, a: number, p: Proj) {
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, a)})`
  ctx.beginPath()
  ctx.rect(-2, -2, p.w + 4, p.h + 4)
  ctx.arc(d.x, d.y, d.Ro - 0.5, 0, Math.PI * 2, true)
  ctx.fill('evenodd')
  ctx.restore()
}

function drawGround(ctx: CanvasRenderingContext2D, sc: Scene) {
  const { p, blend, pal } = sc
  const zen: V3 = [0, 0, 1]
  const alpha = 0.5 * (1 - blend) + 0.26 * blend
  const glow = Math.max(0, 1 - blend * 1.6)
  const f = circleFit(p, zen, 90)
  ctx.save()
  ctx.fillStyle = rgba('#140f0b', alpha)
  ctx.beginPath()
  if (!f) {
    // the horizon is a straight line: shade the half-plane holding the nadir
    const A = project(p, [1, 0, 0], -0.995) ?? project(p, [0, 1, 0], -0.995)
    const B = project(p, [-1, 0, 0], -0.995) ?? project(p, [0, -1, 0], -0.995)
    if (!A || !B) { ctx.restore(); return }
    const ux = B[0] - A[0], uy = B[1] - A[1], ul = Math.hypot(ux, uy) || 1
    const nx = -uy / ul, ny = ux / ul
    const zs = project(p, [0, 0, 1], -0.999)
    const side = zs ? -Math.sign((zs[0] - A[0]) * nx + (zs[1] - A[1]) * ny) || 1 : 1
    const L = Math.max(p.w, p.h) * 4
    ctx.moveTo(A[0] - (ux / ul) * L, A[1] - (uy / ul) * L)
    ctx.lineTo(A[0] + (ux / ul) * L, A[1] + (uy / ul) * L)
    ctx.lineTo(A[0] + (ux / ul) * L + side * nx * L, A[1] + (uy / ul) * L + side * ny * L)
    ctx.lineTo(A[0] - (ux / ul) * L + side * nx * L, A[1] - (uy / ul) * L + side * ny * L)
    ctx.fill()
    ctx.restore()
    return
  }
  const zs = project(p, zen, -0.999)
  const zenInside = zs ? Math.hypot(zs[0] - f.x, zs[1] - f.y) < f.r : false
  if (zenInside) { ctx.rect(-10, -10, p.w + 20, p.h + 20); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2, true) } else ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
  ctx.fill('evenodd')
  if (glow > 0.01) {
    // a warm haze lying along the horizon, as dusk light holds low in the air
    const band = Math.min(p.w, p.h) * 0.22, under = 10
    const inner = zenInside ? Math.max(0, f.r - band) : Math.max(0, f.r - under)
    const outer = zenInside ? f.r + under : f.r + band
    const at = (r: number) => Math.max(0, Math.min(1, (r - inner) / (outer - inner)))
    const rg = ctx.createRadialGradient(f.x, f.y, inner, f.x, f.y, outer)
    const peak = rgba(pal.annatto, 0.2 * glow), soft = rgba(pal.madder, 0.07 * glow)
    if (zenInside) {
      rg.addColorStop(0, rgba(pal.madder, 0)); rg.addColorStop(at(f.r - band * 0.45), soft)
      rg.addColorStop(at(f.r), peak); rg.addColorStop(1, rgba(pal.annatto, 0))
    } else {
      rg.addColorStop(0, rgba(pal.annatto, 0)); rg.addColorStop(at(f.r), peak)
      rg.addColorStop(at(f.r + band * 0.45), soft); rg.addColorStop(1, rgba(pal.madder, 0))
    }
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.arc(f.x, f.y, outer, 0, Math.PI * 2)
    ctx.arc(f.x, f.y, inner, 0, Math.PI * 2, true)
    ctx.fill('evenodd')
  }
  ctx.restore()
}

/** Engrave text with a cut shadow and a bright face. */
function cut(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, face: string, depth = 0.8) {
  ctx.fillStyle = 'rgba(28, 18, 6, 0.75)'
  ctx.fillText(text, x, y + depth)
  ctx.fillStyle = face
  ctx.fillText(text, x, y)
}

const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']

function drawLimb(ctx: CanvasRenderingContext2D, sc: Scene, a: number) {
  const d = sc.disc!
  const { pal } = sc
  const { x, y, R, rw } = d
  ctx.save()
  ctx.globalAlpha = a
  metalAnnulus(ctx, pal, x, y, R, R + rw, 1)
  // engraved grooves, each a dark cut with a bright lip
  const groove = (r: number, lw: number, bright: number) => {
    ctx.lineWidth = lw
    ctx.strokeStyle = 'rgba(28, 18, 6, 0.7)'
    ctx.beginPath(); ctx.arc(x, y + 0.6, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = rgba(pal.goldPale, bright)
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  }
  const rHourOut = R + rw * 0.66, rDegIn = R + rw * 0.7, rDegOut = R + rw * 0.92
  groove(R + 1, 1, 0.7)
  groove(rHourOut, 0.6, 0.45)
  groove(rDegIn, 0.6, 0.45)
  groove(rDegOut, 0.7, 0.55)

  // hour scale: 24 hours from the meridian, XII at noon above, ticks each quarter hour; the hours
  // are laid where the hour angle really falls, so the rule through the Sun reads solar time
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const fs = Math.max(8, Math.min(15, rw * 0.36))
  ctx.font = `600 ${fs.toFixed(1)}px Vollkorn, Georgia, serif`
  ctx.strokeStyle = rgba(pal.goldPale, 0.85)
  for (let q = 0; q < 96; q++) {
    const ang = hourAngleOnScreen(sc, q * 3.75)
    const major = q % 4 === 0
    const L = major ? rw * 0.16 : q % 2 === 0 ? rw * 0.1 : rw * 0.06
    const c = Math.cos(ang), s = Math.sin(ang)
    ctx.lineWidth = major ? 1.1 : 0.6
    ctx.beginPath()
    ctx.moveTo(x + c * (R + 1.5), y + s * (R + 1.5))
    ctx.lineTo(x + c * (R + 1.5 + L), y + s * (R + 1.5 + L))
    ctx.stroke()
    if (major) {
      const hr = q / 4
      const rr = R + rw * 0.42
      const lx = x + c * rr, ly = y + s * rr
      // numerals run around the rim, upright to a reader walking round it
      const up = Math.atan2(s, c)
      const rot = Math.sin(up) > 0.05 ? up - Math.PI / 2 : up + Math.PI / 2
      ctx.translate(lx, ly)
      ctx.rotate(rot)
      cut(ctx, ROMAN[hr % 12], 0, 0, pal.goldPale)
      ctx.rotate(-rot)
      ctx.translate(-lx, -ly)
    }
  }
  // degree scale: a tick every degree, longer each 5° and 10°, numbered each 30°
  ctx.strokeStyle = rgba(pal.goldPale, 0.6)
  ctx.beginPath()
  const minor = R > 220
  for (let deg = 0; deg < 360; deg += minor ? 1 : 5) {
    const ang = hourAngleOnScreen(sc, deg)
    const L = deg % 10 === 0 ? rDegOut - rDegIn : deg % 5 === 0 ? (rDegOut - rDegIn) * 0.6 : (rDegOut - rDegIn) * 0.3
    const c = Math.cos(ang), s = Math.sin(ang)
    ctx.moveTo(x + c * rDegOut, y + s * rDegOut)
    ctx.lineTo(x + c * (rDegOut - L), y + s * (rDegOut - L))
  }
  ctx.lineWidth = 0.55
  ctx.stroke()
  if (rw > 30) {
    ctx.font = `${Math.min(9.5, rw * 0.2).toFixed(1)}px "Public Sans", sans-serif`
    for (let deg = 30; deg < 360; deg += 30) {
      const ang = hourAngleOnScreen(sc, deg + 2.4)
      const rr = (rHourOut + rDegIn) / 2 + rw * 0.13
      const c = Math.cos(ang), s = Math.sin(ang)
      ctx.translate(x + c * rr, y + s * rr)
      const rot = s > 0.05 ? ang - Math.PI / 2 : ang + Math.PI / 2
      ctx.rotate(rot)
      cut(ctx, String(deg), 0, 0, rgba(pal.goldPale, 0.75), 0.6)
      ctx.rotate(-rot)
      ctx.translate(-(x + c * rr), -(y + s * rr))
    }
  }
  ctx.restore()
}

/** The throne (kursi) at the noon line, with its shackle and ring. */
function drawThrone(ctx: CanvasRenderingContext2D, sc: Scene, a: number) {
  const d = sc.disc!
  const { pal } = sc
  const ang = hourAngleOnScreen(sc, 0)
  const th = d.Ro * THRONE
  ctx.save()
  ctx.globalAlpha = a
  ctx.translate(d.x, d.y)
  ctx.rotate(ang + Math.PI / 2)
  // in this frame the throne rises along -y from the rim at y = -Ro
  const Ro = d.Ro
  const wide = Ro * 0.2
  const path = new Path2D()
  path.moveTo(-wide, -Ro + th * 0.25)
  path.bezierCurveTo(-wide * 0.9, -Ro - th * 0.25, -wide * 0.55, -Ro - th * 0.2, -wide * 0.42, -Ro - th * 0.45)
  path.bezierCurveTo(-wide * 0.3, -Ro - th * 0.7, -wide * 0.12, -Ro - th * 0.6, 0, -Ro - th * 0.82)
  path.bezierCurveTo(wide * 0.12, -Ro - th * 0.6, wide * 0.3, -Ro - th * 0.7, wide * 0.42, -Ro - th * 0.45)
  path.bezierCurveTo(wide * 0.55, -Ro - th * 0.2, wide * 0.9, -Ro - th * 0.25, wide, -Ro + th * 0.25)
  path.closePath()
  // shadow on the table, then the metal
  ctx.save()
  ctx.translate(Ro * 0.012, Ro * 0.02)
  ctx.fillStyle = 'rgba(10, 6, 2, 0.35)'
  ctx.fill(path)
  ctx.restore()
  const lg = ctx.createLinearGradient(-wide, -Ro - th, wide, -Ro)
  lg.addColorStop(0, pal.metal[0]); lg.addColorStop(0.45, pal.metal[2]); lg.addColorStop(1, pal.metal[3])
  ctx.fillStyle = lg
  ctx.fill(path)
  ctx.lineWidth = 0.8
  ctx.strokeStyle = 'rgba(28, 18, 6, 0.7)'
  ctx.stroke(path)
  // pierced trefoil
  ctx.fillStyle = 'rgba(28, 18, 6, 0.75)'
  for (const [px, py, r] of [[0, -Ro - th * 0.42, th * 0.11], [-wide * 0.42, -Ro - th * 0.12, th * 0.075], [wide * 0.42, -Ro - th * 0.12, th * 0.075]]) {
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill()
  }
  ctx.strokeStyle = rgba(pal.goldPale, 0.45)
  ctx.lineWidth = 0.6
  ctx.beginPath(); ctx.arc(0, -Ro - th * 0.42, th * 0.11 + 1.2, 0, Math.PI * 2); ctx.stroke()
  // shackle and ring
  const ry = -Ro - th * 0.82 - th * 0.22
  ctx.lineWidth = Math.max(1.6, th * 0.09)
  ctx.strokeStyle = 'rgba(10, 6, 2, 0.35)'
  ctx.beginPath(); ctx.arc(1.2, ry + 1.8, th * 0.2, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = pal.metal[1]
  ctx.beginPath(); ctx.arc(0, ry, th * 0.2, 0, Math.PI * 2); ctx.stroke()
  ctx.lineWidth = Math.max(0.6, th * 0.03)
  ctx.strokeStyle = rgba(pal.goldPale, 0.7)
  ctx.beginPath(); ctx.arc(0, ry, th * 0.2, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke()
  ctx.restore()
}

// ------------------------------------------------------------------ the rule

/** The rule, counterchanged so one fiducial edge runs through the pin, laid through the Sun. */
export function drawRule(ctx: CanvasRenderingContext2D, sc: Scene, sun: V3) {
  const d = sc.disc
  if (!d || sc.reteA < 0.02) return
  const s = project(sc.p, sun, -0.999)
  if (!s) return
  const { pal } = sc
  const ang = Math.atan2(s[1] - d.y, s[0] - d.x)
  const L = d.R + d.rw * 0.64
  const wb = Math.max(3.5, Math.min(6.5, d.R * 0.022))
  const tip = wb * 5
  const shape = new Path2D()
  // the half toward the Sun keeps its body on one side of the edge, the far half on the other
  shape.moveTo(0, 0)
  shape.lineTo(L, 0)
  shape.lineTo(L - tip, -wb)
  shape.lineTo(wb * 2.2, -wb)
  shape.lineTo(wb * 2.2, 0)
  shape.lineTo(-wb * 2.2, 0)
  shape.lineTo(-wb * 2.2, wb)
  shape.lineTo(-L + tip, wb)
  shape.lineTo(-L, 0)
  shape.closePath()
  ctx.save()
  ctx.globalAlpha = sc.reteA
  ctx.translate(d.x, d.y)
  ctx.rotate(ang)
  ctx.save()
  // a cast shadow, offset away from the lamp
  ctx.rotate(-ang)
  ctx.translate(2.2, 3.2)
  ctx.rotate(ang)
  ctx.fillStyle = 'rgba(8, 5, 2, 0.4)'
  ctx.fill(shape)
  ctx.restore()
  const lg = ctx.createLinearGradient(0, -wb, 0, wb)
  lg.addColorStop(0, pal.metal[0]); lg.addColorStop(0.5, pal.metal[2]); lg.addColorStop(1, pal.metal[1])
  ctx.fillStyle = lg
  ctx.fill(shape)
  ctx.lineWidth = 0.7
  ctx.strokeStyle = 'rgba(28, 18, 6, 0.75)'
  ctx.stroke(shape)
  // the fiducial edge, bright
  ctx.strokeStyle = rgba(pal.goldPale, 0.95)
  ctx.lineWidth = 0.8
  ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.stroke()
  // the hub, the pin and the horse
  const hub = wb * 2.4
  const hg = ctx.createRadialGradient(-hub * 0.3, -hub * 0.3, 0, 0, 0, hub)
  hg.addColorStop(0, pal.metal[0]); hg.addColorStop(0.7, pal.metal[2]); hg.addColorStop(1, pal.metal[3])
  ctx.fillStyle = hg
  ctx.beginPath(); ctx.arc(0, 0, hub, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(28, 18, 6, 0.7)'
  ctx.beginPath(); ctx.arc(0, 0, hub, 0, Math.PI * 2); ctx.stroke()
  ctx.rotate(-ang)
  ctx.fillStyle = pal.metal[3]
  ctx.fillRect(-hub * 0.9, -wb * 0.45, hub * 1.8, wb * 0.9)
  ctx.fillStyle = rgba(pal.goldPale, 0.5)
  ctx.fillRect(-hub * 0.9, -wb * 0.45, hub * 1.8, 0.8)
  ctx.fillStyle = pal.metal[1]
  ctx.beginPath(); ctx.arc(0, 0, wb * 0.75, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

// ------------------------------------------------------------------ cardinal points

const CARDINALS: Array<[string, number]> = [['N', 0], ['E', 90], ['S', 180], ['W', 270]]
const cardinalXY = new Float64Array(8)
const cardinalOn = [false, false, false, false]

function cardinals(p: Proj) {
  for (let i = 0; i < 4; i++) {
    const a = CARDINALS[i][1] * D
    const s = project(p, [Math.cos(a), -Math.sin(a), -0.035], -0.8)
    cardinalOn[i] = !!s && s[0] > 0 && s[0] < p.w && s[1] > 0 && s[1] < p.h
    if (s) { cardinalXY[i * 2] = s[0]; cardinalXY[i * 2 + 1] = s[1] }
  }
}

/** Reserve the cardinal letters' places on the label board. */
export function claimCardinals(p: Proj, add: (x0: number, y0: number, x1: number, y1: number) => void) {
  cardinals(p)
  for (let i = 0; i < 4; i++) if (cardinalOn[i]) add(cardinalXY[i * 2] - 8, cardinalXY[i * 2 + 1] - 9, cardinalXY[i * 2] + 8, cardinalXY[i * 2 + 1] + 9)
}

function drawCardinals(ctx: CanvasRenderingContext2D, sc: Scene) {
  cardinals(sc.p)
  ctx.save()
  ctx.font = '600 13px "Public Sans", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const a = 0.55 + 0.4 * sc.inst
  for (let i = 0; i < 4; i++) {
    if (!cardinalOn[i]) continue
    const x = cardinalXY[i * 2], y = cardinalXY[i * 2 + 1]
    ctx.fillStyle = 'rgba(15, 10, 6, 0.7)'
    ctx.fillText(CARDINALS[i][0], x, y + 1)
    ctx.fillStyle = rgba(sc.pal.madder, a)
    ctx.fillText(CARDINALS[i][0], x, y)
  }
  ctx.restore()
}

// ------------------------------------------------------------------ armillary rings

// Rings are cut into short chunks, each with its own depth, so the far side can be drawn first
// and dimmer, and the near side last and brighter, wherever rings cross. All storage is pooled.
const CH = 6
const MAXC = 900
const cz = new Float32Array(MAXC)
const cw = new Float32Array(MAXC)
const ca = new Float32Array(MAXC)
const cc = new Uint8Array(MAXC)
const cn = new Uint8Array(MAXC)
const cxy = new Float32Array(MAXC * (CH + 1) * 2)
const corder = new Uint16Array(MAXC)
let nc = 0

export function ringBegin() { nc = 0 }

/**
 * Queue a ring (small circle of `radiusDeg` about `axis`) `widthDeg` wide. Colour slots:
 * 0 brass, 1 gold, 2 madder (the horizon), 3 elder.
 */
export function ringAdd(p: Proj, axis: V3, radiusDeg: number, widthDeg: number, alpha: number, col: number, nSeg = 144) {
  const ax = norm(axis)
  const t0 = Math.abs(ax[2]) < 0.9 ? cross(ax, [0, 0, 1]) : cross(ax, [1, 0, 0])
  const u = norm(t0), w = cross(ax, u)
  const r = radiusDeg * D, c0 = Math.cos(r), s0 = Math.sin(r)
  const f = p.fwd
  const wRad = widthDeg * D
  let k = 0, zsum = 0
  const flush = () => {
    if (k >= 2 && nc < MAXC) {
      const zm = zsum / k
      cz[nc] = zm
      const depth = (zm + 1) / 2
      cw[nc] = Math.max(0.8, Math.min(16, wRad * p.scale * Math.sqrt(2 / (1 + zm)) * (0.45 + 0.55 * depth)))
      ca[nc] = alpha * (0.22 + 0.78 * depth * depth)
      cc[nc] = col
      cn[nc] = k
      nc++
    }
    k = 0; zsum = 0
  }
  for (let i = 0; i <= nSeg; i++) {
    const a = (i / nSeg) * Math.PI * 2, ca_ = Math.cos(a), sa = Math.sin(a)
    const vx = ax[0] * c0 + (u[0] * ca_ + w[0] * sa) * s0
    const vy = ax[1] * c0 + (u[1] * ca_ + w[1] * sa) * s0
    const vz = ax[2] * c0 + (u[2] * ca_ + w[2] * sa) * s0
    const z = vx * f[0] + vy * f[1] + vz * f[2]
    if (z < -0.8) { flush(); continue }
    const X = vx * p.right[0] + vy * p.right[1] + vz * p.right[2]
    const Y = vx * p.up[0] + vy * p.up[1] + vz * p.up[2]
    const m = (p.scale * 2) / (1 + z)
    const base = nc * (CH + 1) * 2
    cxy[base + k * 2] = p.cx + X * m
    cxy[base + k * 2 + 1] = p.cy - Y * m
    zsum += z
    k++
    if (k === CH + 1) {
      flush()
      // the next chunk starts where this one ended
      if (nc < MAXC) {
        const nb = nc * (CH + 1) * 2, pb = (nc - 1) * (CH + 1) * 2 + CH * 2
        cxy[nb] = cxy[pb]; cxy[nb + 1] = cxy[pb + 1]
        zsum = z; k = 1
      }
    }
  }
  flush()
}

export function ringFlush(ctx: CanvasRenderingContext2D, pal: Palette) {
  if (!nc) return
  for (let i = 0; i < nc; i++) corder[i] = i
  corder.subarray(0, nc).sort((a, b) => cz[a] - cz[b])
  const cols = [pal.brass, pal.gold, pal.madder, pal.elder]
  ctx.save()
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'round'
  for (let o = 0; o < nc; o++) {
    const i = corder[o]
    const n = cn[i], base = i * (CH + 1) * 2, wpx = cw[i], a = ca[i]
    const trace = (dx: number, dy: number) => {
      ctx.beginPath()
      ctx.moveTo(cxy[base] + dx, cxy[base + 1] + dy)
      for (let k = 1; k < n; k++) ctx.lineTo(cxy[base + k * 2] + dx, cxy[base + k * 2 + 1] + dy)
      ctx.stroke()
    }
    ctx.lineWidth = wpx + 1.6
    ctx.strokeStyle = rgba('#140c04', 0.6 * a)
    trace(0.7, 1.1)
    ctx.lineWidth = wpx
    ctx.strokeStyle = rgba(cols[cc[i]], a)
    trace(0, 0)
    if (wpx > 2.4) {
      // a groove down the middle and a lit edge toward the lamp
      ctx.lineWidth = Math.max(0.5, wpx * 0.14)
      ctx.strokeStyle = rgba('#2a1a08', 0.45 * a)
      trace(wpx * 0.08, wpx * 0.1)
      const hl = wpx * 0.26
      ctx.lineWidth = Math.max(0.5, wpx * 0.22)
      ctx.strokeStyle = rgba(pal.goldPale, 0.6 * a)
      trace(-hl, -hl)
    } else if (wpx > 1.4) {
      ctx.lineWidth = 0.6
      ctx.strokeStyle = rgba(pal.goldPale, 0.45 * a)
      trace(-wpx * 0.25, -wpx * 0.25)
    }
  }
  ctx.restore()
  nc = 0
}

