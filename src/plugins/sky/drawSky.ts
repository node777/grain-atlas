// Painting the sky: one renderer, three cached layers and a light per-frame pass.
//
//   under  -- the night, the plate's engraving, the fixed rings      (cached: camera, size, latitude)
//   rete   -- Milky Way, faint stars, figures, ecliptic band, openwork (cached in the astrolabe and
//             turned about the pin while time is dragged; drawn directly otherwise)
//   over   -- the ground veil, the limb with its scales, the throne  (cached like `under`)
//
// Per frame only what moves is reprojected: the bright stars, the grahas, the Moon's phase, the
// rule, the band's lettering and the names. Nothing allocates per star.

import * as A from 'astronomy-engine'
import type { SkyMoment } from '@/astro/positions'
import type { Lens } from '@/core/settings'
import { NAKSHATRAS } from '@/astro/data/nakshatras'
import { RASHIS } from '@/astro/data/rashis'
import { type Catalog, type CultureId, starName } from './catalog'
import { type Frames, type Proj, type V3, composite, eclVec, mul, project } from './projection'
import { type Palette, palette, rgba } from './palette'
import { type Disc, type Scene, THRONE, claimCardinals, discOf, drawOver, drawRule, drawUnder, eraseOutside } from './instrument'
import {
  BAND, NAK, STAR_COLS, drawRete, figuresOf, limitMagFor, reteStars, ringStrength, starRadius, starTable,
} from './rete'

export interface SkyOptions {
  instrument: number      // 0..1, how much of the brass is visible
  astrolabe: number       // 0 dome .. 1 astrolabe (blend)
  culture: CultureId
  showFigures: boolean
  showMilkyWay: boolean
  lens: Lens
  lat: number
  lon: number
  selected?: { kind: 'star' | 'body'; id: number | string } | null
  /** the page behind the canvas is the night (the dome) rather than the table (the astrolabe) */
  cssNight: boolean
  /** the camera sits exactly on the pole and nothing is flying: the rete may be cached and turned */
  atPole: boolean
  /** nothing is moving: a turned rete cache may be redrawn crisp */
  settled: boolean
}

export type Pick = { kind: 'star' | 'body'; id: number | string } | null

const VS = '︎' // text presentation, never an emoji
const GLYPH: Record<string, string> = {
  sun: '☉', moon: '☽', mars: '♂', mercury: '☿', jupiter: '♃', venus: '♀', saturn: '♄', rahu: '☊', ketu: '☋',
  uranus: '♅', neptune: '♆', pluto: '♇',
}
const VEDIC: Record<string, string> = {
  sun: 'Surya', moon: 'Chandra', mars: 'Mangala', mercury: 'Budha', jupiter: 'Guru', venus: 'Shukra',
  saturn: 'Shani', rahu: 'Rahu', ketu: 'Ketu', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto',
}
const SYMBOL_FONT = '"DejaVu Sans", "Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols", "Noto Sans Symbols 2"'

// ---- label board: a cheap greedy de-overlap, reused every frame
const boxes: number[] = []
let nBox = 0
let rimX = 0, rimY = 0, rimIn = -1, rimOut = -1
function boardFree(x0: number, y0: number, x1: number, y1: number): boolean {
  if (rimOut > 0) {
    // no name beneath the brass rim, nor out on the table beyond it
    const fx = Math.max(Math.abs(x0 - rimX), Math.abs(x1 - rimX)), fy = Math.max(Math.abs(y0 - rimY), Math.abs(y1 - rimY))
    if (Math.hypot(fx, fy) > rimIn) return false
  }
  for (let i = 0, n = nBox * 4; i < n; i += 4) {
    if (x0 < boxes[i + 2] && x1 > boxes[i] && y0 < boxes[i + 3] && y1 > boxes[i + 1]) return false
  }
  return true
}
function boardAdd(x0: number, y0: number, x1: number, y1: number): void {
  const j = nBox++ * 4
  boxes[j] = x0; boxes[j + 1] = y0; boxes[j + 2] = x1; boxes[j + 3] = y1
}
function boardPlace(x0: number, y0: number, x1: number, y1: number): boolean {
  if (!boardFree(x0, y0, x1, y1)) return false
  boardAdd(x0, y0, x1, y1)
  return true
}

const widths = new Map<string, number>()
/** Width of a label in the current font, measured once. */
function tw(ctx: CanvasRenderingContext2D, text: string): number {
  const key = ctx.font + '\u0000' + text
  let w = widths.get(key)
  if (w === undefined) { w = ctx.measureText(text).width; widths.set(key, w) }
  return w
}

const HALO = 'rgba(15, 12, 10, 0.78)'
function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.strokeStyle = HALO
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.strokeText(text, x, y)
  ctx.fillText(text, x, y)
}

let yogaSet: Set<number> | null = null
const yogataraSet = () => (yogaSet ??= new Set(NAKSHATRAS.map((n) => n.yogatara.hip).filter(Boolean) as number[]))

interface Layer { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; key: string }
function layer(): Layer | null {
  if (typeof document === 'undefined') return null
  const cv = document.createElement('canvas')
  const ctx = cv.getContext('2d')
  return ctx ? { cv, ctx, key: '' } : null
}
function sizeLayer(l: Layer, w: number, h: number) {
  if (l.cv.width !== w) l.cv.width = w
  if (l.cv.height !== h) l.cv.height = h
}

interface Pending { x: number; y: number; text: string; mag: number; yoga: boolean }

export interface FrameStats { ms: number; reteCached: boolean; layersRebuilt: number }

export class SkyRenderer {
  private under = layer()
  private over = layer()
  private rete = layer()
  private reteAngle = 0         // the screen angle of the equinox when the rete cache was drawn
  private reteDate = 0
  private fontsGen = 0
  private haloSprites: HTMLCanvasElement[] = []
  private moonKey = ''
  private moonV: V3 = [0, 0, 1]
  // last frame, for picking
  private last: { p: Proj; F: Frames; cat: Catalog; zoomK: number; disc: Disc | null; reteA: number } | null = null
  private bodyXY: Array<{ x: number; y: number; id: string }> = []
  private nBodies = 0
  private pendingStars: Pending[] = []
  private pendingFigures: Array<{ x: number; y: number; text: string; n: number }> = []
  private ls = 1
  private band: number[] = []          // band labels: x, y, half-width, half-height
  private nBand = 0
  private cachedBand: number[] = []
  private nCached = 0
  stats: FrameStats = { ms: 0, reteCached: false, layersRebuilt: 0 }

  /** Fonts arrived or the theme changed: every cached layer and measured width is stale. */
  invalidate() { this.fontsGen++; widths.clear(); if (this.under) this.under.key = ''; if (this.over) this.over.key = ''; if (this.rete) this.rete.key = '' }

  draw(ctx: CanvasRenderingContext2D, p: Proj, F: Frames, cat: Catalog, sky: SkyMoment, o: SkyOptions, dpr: number) {
    const t0 = performance.now()
    let rebuilt = 0
    const pal = palette()
    const inst = o.instrument
    const blend = o.astrolabe
    const north = o.lat >= 0
    const pole = mul(F.eqd, [0, 0, north ? 1 : -1])
    // the flat brass falls away early as you step inside; the rings rise as it goes
    const flat = inst * Math.pow(Math.max(0, Math.min(1, (blend - 0.35) / 0.65)), 1.6)
    const arm = inst * Math.pow(Math.max(0, Math.min(1, (0.75 - blend) / 0.75)), 1.2)
    const disc = flat > 0.005 ? discOf(p, pole, sky.obliquity) : null
    const sc: Scene = { p, F, sky, pal, inst, blend, reteA: flat, arm, lat: o.lat, north, pole, disc, dpr, cssNight: o.cssNight }
    const zoomK = Math.max(0.75, Math.min(2.6, 70 / Math.max(20, fovOf(p))))
    const W = Math.round(p.w * dpr), H = Math.round(p.h * dpr)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    // measurement scripts may collect frame times here (window.__skyProf = {})
    const PROF = (globalThis as { __skyProf?: Record<string, number[]> }).__skyProf

    // ---- the still layers. While the camera moves they are drawn straight onto the canvas (a
    // cache would be stale next frame); once it rests they are cached, cropped to the disc when
    // the astrolabe is fully out, so turning the rete costs three small copies.
    const camKey = [W, H, dpr, p.cx.toFixed(2), p.cy.toFixed(2), p.scale.toFixed(4), p.fwd.map((x) => x.toFixed(6)).join(','),
      inst.toFixed(3), blend.toFixed(4), o.lat.toFixed(4), pal.mode, sky.obliquity.toFixed(3), o.cssNight, this.fontsGen].join('|')
    const full = sc.reteA < 1 || !disc
    const ub = full ? null : pixelBox(disc!.x, disc!.y, disc!.Ro + 2, disc!.Ro + 2, disc!.Ro + 2, dpr, W, H)
    const ob = full ? null : pixelBox(disc!.x, disc!.y, disc!.Ro * 1.1, disc!.Ro * (1.05 + THRONE + 0.12), disc!.Ro * 1.12, dpr, W, H)
    const layered = !!(this.under && this.over) && (this.under.key === camKey || o.settled)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (layered && this.under) {
      if (this.under.key !== camKey) {
        renderLayer(this.under, W, H, dpr, (c) => drawUnder(c, sc))
        this.under.key = camKey
        rebuilt++
      }
      blit(ctx, this.under.cv, ub, W, H, dpr)
    } else {
      if (this.under) this.under.key = ''
      drawUnder(ctx, sc)
    }

    // ---- the rete
    const ay = sky.ayanamsa
    const moon = sky.bodies.find((b) => b.id === 'moon')!
    const highlight = Math.floor((((moon.sidereal % 360) + 360) % 360) / NAK)
    const signZero = o.lens === 'jyotish' ? ay : 0
    const brightCut = 2.0
    const ro = { western: o.lens !== 'jyotish', culture: o.culture, showFigures: o.showFigures, showMilkyWay: o.showMilkyWay, signZero, highlightNakshatra: highlight, zoomK, brightCut, clip: null as null | { x: number; y: number; r: number } }
    const cacheRete = !!(this.rete && disc && o.atPole && blend >= 1 && inst >= 1)
    this.stats.reteCached = cacheRete
    let turn = 0
    this.nBand = 0
    if (cacheRete && this.rete && disc) {
      const eq = project(p, mul(F.eqd, [1, 0, 0]), -0.999)
      const angNow = eq ? Math.atan2(eq[1] - disc.y, eq[0] - disc.x) : 0
      // the layer sits on whole device pixels, so an unturned copy is a straight copy
      const ox = Math.floor((disc.x - disc.R - 2) * dpr), oy = Math.floor((disc.y - disc.R - 2) * dpr)
      const side = Math.ceil((disc.R + 2) * 2 * dpr) + 2
      const key = [W, H, dpr, disc.x.toFixed(2), disc.y.toFixed(2), p.scale.toFixed(4), o.culture, o.showFigures, o.showMilkyWay,
        signZero.toFixed(3), highlight, ro.western, pal.mode, this.fontsGen].join('|')
      // redrawn when settled (crisp, lettering upright) and, mid-turn, whenever the lettering has
      // turned far enough to start reading upside down
      const turned = Math.abs(angDiff(angNow, this.reteAngle))
      const stale = this.rete.key !== key || Math.abs(sky.date.getTime() - this.reteDate) > 10 * 86400000 ||
        (o.settled && turned > 1e-5) || turned > 1.0
      if (stale) {
        sizeLayer(this.rete, side, side)
        const c = this.rete.ctx
        c.setTransform(1, 0, 0, 1, 0, 0)
        c.clearRect(0, 0, side, side)
        c.setTransform(dpr, 0, 0, dpr, -ox, -oy)
        c.save()
        c.beginPath(); c.arc(disc.x, disc.y, disc.R, 0, Math.PI * 2); c.clip()
        drawRete(c, sc, cat, { ...ro, clip: { x: disc.x, y: disc.y, r: disc.R } }, true)
        // the band's lettering is engraved on the rete and turns with it
        this.nCached = 0
        this.drawBandText(c, sc, ro)
        this.nCached = this.nBand
        this.cachedBand.length = 0
        for (let i = 0; i < this.nBand * 4; i++) this.cachedBand.push(this.band[i])
        c.restore()
        this.rete.key = key
        this.reteAngle = angNow
        this.reteDate = sky.date.getTime()
        rebuilt++
      }
      turn = angDiff(angNow, this.reteAngle)
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      if (Math.abs(turn) < 1e-6) {
        ctx.drawImage(this.rete.cv, ox, oy)
      } else {
        const cx = disc.x * dpr, cy = disc.y * dpr
        ctx.translate(cx, cy)
        ctx.rotate(turn)
        ctx.imageSmoothingQuality = 'low'
        ctx.drawImage(this.rete.cv, ox - cx, oy - cy)
      }
      ctx.restore()
      // the engraved names' places, turned with the rete
      const c = Math.cos(turn), sn = Math.sin(turn)
      this.nBand = this.nCached
      for (let i = 0; i < this.nCached; i++) {
        const x = this.cachedBand[i * 4] - disc.x, y = this.cachedBand[i * 4 + 1] - disc.y
        this.band[i * 4] = disc.x + x * c - y * sn
        this.band[i * 4 + 1] = disc.y + x * sn + y * c
        this.band[i * 4 + 2] = this.cachedBand[i * 4 + 2]
        this.band[i * 4 + 3] = this.cachedBand[i * 4 + 3]
      }
    } else {
      drawRete(ctx, sc, cat, ro, false)
      this.drawBandText(ctx, sc, ro)
    }

    // ---- bright stars, the yogataras' rings, the grahas
    const discClip = disc && sc.reteA > 0.5 ? { x: disc.x, y: disc.y, r: disc.R } : null
    this.pendingStars.length = 0
    this.pendingFigures.length = 0
    // a small astrolabe (a phone) gets smaller names and fewer of them
    this.ls = disc && sc.reteA > 0.5 ? Math.max(0.78, Math.min(1, disc.R / 300)) : 1
    this.drawBright(ctx, sc, cat, zoomK, brightCut, discClip)
    this.drawYogataras(ctx, sc, cat, o, discClip)
    const glabels = this.drawBodies(ctx, sc, o, zoomK, discClip)

    // ---- the mater over the rete, and the table around it
    if (layered && this.over) {
      if (this.over.key !== camKey) {
        renderLayer(this.over, W, H, dpr, (c) => drawOver(c, sc))
        this.over.key = camKey
        rebuilt++
      }
      // cut the night away outside the rim, as far as the instrument is out (when it is fully
      // out, nothing was drawn there to cut)
      if (disc && full && sc.reteA > 0.01) eraseOutside(ctx, disc, sc.reteA, p)
      blit(ctx, this.over.cv, ob, W, H, dpr)
    } else {
      if (this.over) this.over.key = ''
      drawOver(ctx, sc) // erases outside the rim itself
    }

    // ---- names: the board
    nBox = 0
    rimOut = -1
    if (disc && sc.reteA > 0.3) { rimX = disc.x; rimY = disc.y; rimIn = disc.R - 2; rimOut = disc.Ro + 4 }
    for (let i = 0; i < this.nBand; i++) {
      const x = this.band[i * 4], y = this.band[i * 4 + 1], hw = this.band[i * 4 + 2], hh = this.band[i * 4 + 3]
      boardAdd(x - hw, y - hh, x + hw, y + hh)
    }
    claimCardinals(p, boardAdd)
    for (let i = 0; i < this.nBodies; i++) {
      const b = this.bodyXY[i]
      boardAdd(b.x - 5, b.y - 5, b.x + 5, b.y + 5)
    }
    this.drawLagna(ctx, sc)
    if (sc.reteA > 0.02) {
      const sun = sky.bodies.find((b) => b.id === 'sun')!
      drawRule(ctx, sc, mul(F.ect, eclVec(sun.tropical, 0)))
    }
    this.drawLabels(ctx, sc, cat, o, glabels, zoomK)
    this.drawSelected(ctx, sc, cat, o)

    this.last = { p, F, cat, zoomK, disc, reteA: sc.reteA }
    this.stats.ms = performance.now() - t0
    if (PROF) (PROF.total ??= []).push(this.stats.ms)
    this.stats.layersRebuilt = rebuilt
  }

  // ------------------------------------------------------------ stars

  private sprite(col: number): HTMLCanvasElement {
    let s = this.haloSprites[col]
    if (!s) {
      s = document.createElement('canvas')
      s.width = s.height = 64
      const c = s.getContext('2d')!
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32)
      g.addColorStop(0, rgba(STAR_COLS[col], 0.5))
      g.addColorStop(0.25, rgba(STAR_COLS[col], 0.16))
      g.addColorStop(1, rgba(STAR_COLS[col], 0))
      c.fillStyle = g
      c.fillRect(0, 0, 64, 64)
      this.haloSprites[col] = s
    }
    return s
  }

  private drawBright(ctx: CanvasRenderingContext2D, sc: Scene, cat: Catalog, zoomK: number, cut: number, clip: { x: number; y: number; r: number } | null) {
    const t = starTable(cat)
    const { p } = sc
    const M = MB
    composite(p, sc.F.eqj, M)
    const limit = limitMagFor(zoomK)
    const s2 = p.scale * 2
    const yoga = yogataraSet()
    for (let i = 0; i < t.n; i++) {
      const mg = t.mag[i]
      if (mg >= cut || mg > limit) break
      const x = t.vx[i], y = t.vy[i], z = t.vz[i]
      const Z = M[6] * x + M[7] * y + M[8] * z
      if (Z < -0.6) continue
      const f = s2 / (1 + Z)
      const X = p.cx + (M[0] * x + M[1] * y + M[2] * z) * f
      const Y = p.cy - (M[3] * x + M[4] * y + M[5] * z) * f
      if (X < -10 || X > p.w + 10 || Y < -10 || Y > p.h + 10) continue
      if (clip) { const dx = X - clip.x, dy = Y - clip.y; if (dx * dx + dy * dy > clip.r * clip.r) continue }
      const r = starRadius(mg, limit, zoomK) * (mg < 1.6 ? 1.12 : 1)
      const a = Math.min(1, 0.4 + (limit - mg) * 0.22)
      const col = t.col[i]
      if (mg < 1.6) {
        const R = r * 6
        ctx.globalAlpha = a * 0.9
        ctx.drawImage(this.sprite(col), X - R, Y - R, R * 2, R * 2)
      }
      ctx.globalAlpha = 1
      if (mg < 0.6) {
        // a faint four-point glint on the brightest few
        const L = r * 4.2
        ctx.strokeStyle = rgba(STAR_COLS[col], 0.28 * a)
        ctx.lineWidth = 0.7
        ctx.beginPath()
        ctx.moveTo(X - L, Y); ctx.lineTo(X + L, Y)
        ctx.moveTo(X, Y - L); ctx.lineTo(X, Y + L)
        ctx.stroke()
      }
      ctx.fillStyle = rgba(STAR_COLS[col], a)
      ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill()
      const hip = t.hip[i]
      if (mg <= 1.3 + zoomK * 0.8 - (1 - this.ls) * 6 && !yoga.has(hip)) {
        const nm = starName(cat, hip)
        if (nm) this.pendingStars.push({ x: X, y: Y, text: nm, mag: mg, yoga: false })
      }
    }
    ctx.globalAlpha = 1
  }

  private drawYogataras(ctx: CanvasRenderingContext2D, sc: Scene, cat: Catalog, o: SkyOptions, clip: { x: number; y: number; r: number } | null) {
    if (o.instrument <= 0.2) return
    const { p, pal } = sc
    ctx.save()
    ctx.strokeStyle = rgba(pal.gold, 0.72)
    ctx.lineWidth = 1
    for (const hip of yogataraSet()) {
      const st = cat.byHip.get(hip)
      if (!st) continue
      const s = project(p, mul(sc.F.eqj, st.v), -0.6)
      if (!s || s[0] < 0 || s[0] > p.w || s[1] < 0 || s[1] > p.h) continue
      if (clip && Math.hypot(s[0] - clip.x, s[1] - clip.y) > clip.r) continue
      ctx.beginPath(); ctx.arc(s[0], s[1], 5.5, 0, Math.PI * 2); ctx.stroke()
      const nm = this.ls > 0.92 ? starName(cat, hip) : undefined
      if (nm) this.pendingStars.push({ x: s[0], y: s[1], text: nm, mag: st.mag, yoga: true })
    }
    ctx.restore()
  }

  // ------------------------------------------------------------ the grahas

  private topoMoon(sc: Scene, o: SkyOptions): V3 {
    const key = `${sc.sky.date.getTime()}|${o.lat}|${o.lon}`
    if (key !== this.moonKey) {
      // the Moon as seen from this place (parallax up to a degree), true equator of date
      const eq = A.Equator(A.Body.Moon, sc.sky.date, new A.Observer(o.lat, o.lon, 0), true, true)
      const ra = eq.ra * 15 * (Math.PI / 180), dec = eq.dec * (Math.PI / 180)
      this.moonV = mul(sc.F.eqd, [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)])
      this.moonKey = key
    }
    return this.moonV
  }

  private drawBodies(ctx: CanvasRenderingContext2D, sc: Scene, o: SkyOptions, zoomK: number, clip: { x: number; y: number; r: number } | null) {
    const { p, pal, sky, F } = sc
    const glabels: Array<{ x: number; y: number; r: number; text: string; sel: boolean; col: string; minor: boolean }> = []
    this.nBodies = 0
    const sunB = sky.bodies.find((b) => b.id === 'sun')!
    const sunV = mul(F.ect, eclVec(sunB.tropical, sunB.latitude))
    const sk = Math.sqrt(zoomK)
    const colOf: Record<string, string> = {
      sun: pal.gold, moon: pal.goldPale, mars: pal.madder, mercury: pal.sage, jupiter: pal.weld, venus: pal.goldPale,
      saturn: pal.elder, rahu: pal.madder, ketu: pal.madder, uranus: pal.star, neptune: pal.star, pluto: pal.star,
    }
    // draw far to near so the luminaries sit on top
    for (const b of sky.bodies) {
      const v = b.id === 'moon' ? this.topoMoon(sc, o) : mul(F.ect, eclVec(b.tropical, b.latitude))
      const s = project(p, v, -0.6)
      if (!s) continue
      if (clip && Math.hypot(s[0] - clip.x, s[1] - clip.y) > clip.r) continue
      const slot = this.bodyXY[this.nBodies] ?? (this.bodyXY[this.nBodies] = { x: 0, y: 0, id: '' })
      slot.x = s[0]; slot.y = s[1]; slot.id = b.id
      this.nBodies++
      const isSel = o.selected?.kind === 'body' && o.selected.id === b.id
      const pxRad = (p.scale * 2) / (1 + (v[0] * p.fwd[0] + v[1] * p.fwd[1] + v[2] * p.fwd[2]))
      const trueR = 0.00465 * pxRad      // the luminaries' real half-degree, once zoomed close
      const minor = b.id === 'uranus' || b.id === 'neptune' || b.id === 'pluto'
      let br: number
      if (b.id === 'sun') {
        br = Math.max(6.5 * sk, trueR)
        const g = ctx.createRadialGradient(s[0], s[1], br * 0.6, s[0], s[1], br * 4.5)
        g.addColorStop(0, rgba(pal.starWarm, 0.5))
        g.addColorStop(0.35, rgba(pal.annatto, 0.14))
        g.addColorStop(1, rgba(pal.annatto, 0))
        ctx.fillStyle = g
        ctx.fillRect(s[0] - br * 4.5, s[1] - br * 4.5, br * 9, br * 9)
        // rays, as an engraver draws the Sun
        ctx.strokeStyle = rgba(pal.gold, 0.7)
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let k = 0; k < 12; k++) {
          const a = (k * Math.PI) / 6
          const r1 = br * (k % 2 ? 1.6 : 2.05)
          ctx.moveTo(s[0] + Math.cos(a) * br * 1.2, s[1] + Math.sin(a) * br * 1.2)
          ctx.lineTo(s[0] + Math.cos(a) * r1, s[1] + Math.sin(a) * r1)
        }
        ctx.stroke()
        const dg = ctx.createRadialGradient(s[0] - br * 0.3, s[1] - br * 0.3, 0, s[0], s[1], br)
        dg.addColorStop(0, pal.goldPale)
        dg.addColorStop(0.6, pal.gold)
        dg.addColorStop(1, pal.brass)
        ctx.fillStyle = dg
        ctx.beginPath(); ctx.arc(s[0], s[1], br, 0, Math.PI * 2); ctx.fill()
      } else if (b.id === 'moon') {
        br = Math.max(6.5 * sk, trueR)
        drawMoon(ctx, p, pal, s[0], s[1], br, v, sunV)
      } else if (b.id === 'rahu' || b.id === 'ketu') {
        // the nodes are points, not lights: a hollow ring with the node's bar
        br = 3.2
        ctx.strokeStyle = rgba(pal.madder, 0.95)
        ctx.lineWidth = 1.3
        ctx.beginPath(); ctx.arc(s[0], s[1], br, 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(s[0] - br - 2.5, s[1]); ctx.lineTo(s[0] + br + 2.5, s[1]); ctx.stroke()
      } else {
        br = minor ? 2 : 3.4
        const col = colOf[b.id] ?? pal.star
        const g = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], br * 3.2)
        g.addColorStop(0, rgba(col, minor ? 0.2 : 0.38))
        g.addColorStop(1, rgba(col, 0))
        ctx.fillStyle = g
        ctx.fillRect(s[0] - br * 3.2, s[1] - br * 3.2, br * 6.4, br * 6.4)
        ctx.fillStyle = rgba(col, minor ? 0.75 : 1)
        ctx.beginPath(); ctx.arc(s[0], s[1], br, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = 'rgba(20, 12, 4, 0.6)'
        ctx.lineWidth = 0.6
        ctx.stroke()
      }
      if (isSel) {
        ctx.strokeStyle = pal.star
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(s[0], s[1], br + 6, 0, Math.PI * 2); ctx.stroke()
      }
      glabels.push({
        x: s[0], y: s[1], r: br, sel: isSel, col: colOf[b.id] ?? pal.star, minor,
        text: `${GLYPH[b.id] ?? ''}${VS} ${VEDIC[b.id] ?? b.id}${b.retrograde && b.id !== 'rahu' && b.id !== 'ketu' ? ' ℞' : ''}`,
      })
    }
    return glabels
  }

  // ------------------------------------------------------------ band lettering and the lagna

  private drawBandText(ctx: CanvasRenderingContext2D, sc: Scene, ro: { signZero: number; highlightNakshatra: number; western: boolean }) {
    const { pal, sky, reteA, inst } = sc
    const ring = ringStrength(inst)
    const ay = sky.ayanamsa
    const engraved = reteA > 0.5
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // the 27 nakshatras along the outer tier
    const nakMid = (BAND.nakIn + BAND.nakOut) / 2, nakW = BAND.nakIn - BAND.nakOut
    for (let i = 0; i < 27; i++) {
      const lon = ay + (i + 0.5) * NAK
      const g = this.along(sc, lon, nakMid)
      if (!g) continue
      const tier = nakW * g.pxDeg
      if (tier < 8) continue
      const lit = ro.highlightNakshatra === i
      const name = NAKSHATRAS[i]?.name ?? String(i + 1)
      let fs = Math.min(lit ? 14 : 13, tier * 0.5)
      ctx.font = `${lit ? 600 : 400} ${fs.toFixed(1)}px Vollkorn, Georgia, serif`
      const room = NAK * g.pxDeg * 0.94
      const wd = tw(ctx, name)
      if (wd > room) { fs = (fs * room) / wd; if (fs < 7) continue; ctx.font = `${lit ? 600 : 400} ${fs.toFixed(1)}px Vollkorn, Georgia, serif` }
      const face = lit ? pal.star : rgba(pal.goldPale, (engraved ? 0.9 : 0.72) * ring)
      this.textAt(ctx, name, g, face, engraved)
    }
    // the twelve signs on the inner tier: glyph and name
    const sMid = (BAND.degOut + BAND.signOut) / 2, sW = BAND.signOut - BAND.degOut
    for (let i = 0; i < 12; i++) {
      const g = this.along(sc, ro.signZero + i * 30 + 15, sMid)
      if (!g) continue
      const tier = sW * g.pxDeg
      if (tier < 8) continue
      const r = RASHIS[i]
      const nm = ro.western ? (r?.western ?? '') : (r?.name ?? '')
      const fs = Math.min(13.5, tier * 0.52)
      ctx.font = `italic ${fs.toFixed(1)}px Vollkorn, Georgia, serif`
      const txt = nm
      const wName = tw(ctx, txt)
      ctx.font = `${(fs * 1.15).toFixed(1)}px ${SYMBOL_FONT}`
      const glyph = (r?.glyph ?? '') + VS
      const wG = tw(ctx, glyph)
      const gap = fs * 0.45
      const total = wG + gap + wName
      const face = rgba(pal.gold, (engraved ? 1 : 0.85) * ring)
      ctx.save()
      ctx.translate(g.x, g.y)
      ctx.rotate(g.rot)
      ctx.textAlign = 'left'
      if (engraved) { ctx.fillStyle = 'rgba(20, 12, 4, 0.8)'; ctx.fillText(glyph, -total / 2, 0.8) }
      ctx.fillStyle = face
      ctx.fillText(glyph, -total / 2, 0)
      ctx.font = `italic ${fs.toFixed(1)}px Vollkorn, Georgia, serif`
      if (engraved) { ctx.fillStyle = 'rgba(20, 12, 4, 0.8)'; ctx.fillText(txt, -total / 2 + wG + gap, 0.8) }
      ctx.fillStyle = rgba(pal.goldPale, (engraved ? 0.92 : 0.75) * ring)
      ctx.fillText(txt, -total / 2 + wG + gap, 0)
      ctx.restore()
      this.boxRot(g, total, fs * 1.3)
    }
    ctx.restore()
  }

  /** Position, reading angle and local scale along the ecliptic band. */
  private along(sc: Scene, lon: number, lat: number): { x: number; y: number; rot: number; pxDeg: number } | null {
    const a = project(sc.p, mul(sc.F.ect, eclVec(lon - 0.6, lat)), -0.5)
    const b = project(sc.p, mul(sc.F.ect, eclVec(lon + 0.6, lat)), -0.5)
    if (!a || !b) return null
    const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2
    if (x < -40 || x > sc.p.w + 40 || y < -40 || y > sc.p.h + 40) return null
    let rot = Math.atan2(b[1] - a[1], b[0] - a[0])
    if (Math.cos(rot) < 0) rot += Math.PI
    return { x, y, rot, pxDeg: Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.2 }
  }

  private textAt(ctx: CanvasRenderingContext2D, text: string, g: { x: number; y: number; rot: number }, face: string, engraved: boolean) {
    ctx.save()
    ctx.translate(g.x, g.y)
    ctx.rotate(g.rot)
    if (engraved) { ctx.fillStyle = 'rgba(20, 12, 4, 0.8)'; ctx.fillText(text, 0, 0.8) }
    else { ctx.strokeStyle = HALO; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.strokeText(text, 0, 0) }
    ctx.fillStyle = face
    ctx.fillText(text, 0, 0)
    ctx.restore()
    this.boxRot(g, tw(ctx, text), 14)
  }

  /** Record a band label's place (centre and half-size) for the board. */
  private boxRot(g: { x: number; y: number; rot: number }, w: number, h: number) {
    const c = Math.abs(Math.cos(g.rot)), s = Math.abs(Math.sin(g.rot))
    const j = this.nBand++ * 4
    this.band[j] = g.x; this.band[j + 1] = g.y
    this.band[j + 2] = (w * c + h * s) / 2; this.band[j + 3] = (w * s + h * c) / 2
  }

  /** The lagna: where the ecliptic is rising over the eastern horizon right now. */
  private drawLagna(ctx: CanvasRenderingContext2D, sc: Scene) {
    const { p, pal, sky } = sc
    const s = project(p, mul(sc.F.ect, eclVec(sky.ascendant.tropical, 0)), -0.6)
    if (!s || s[0] < 0 || s[0] > p.w || s[1] < 0 || s[1] > p.h) return
    const r = 5
    ctx.save()
    ctx.fillStyle = rgba(pal.madder, 0.95)
    ctx.strokeStyle = 'rgba(20, 12, 4, 0.8)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(s[0], s[1] - r); ctx.lineTo(s[0] + r, s[1]); ctx.lineTo(s[0], s[1] + r); ctx.lineTo(s[0] - r, s[1]); ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.font = 'italic 600 12.5px Vollkorn, Georgia, serif'
    ctx.textBaseline = 'middle'
    const text = 'Lagna'
    const wd = tw(ctx, text)
    for (const [dx, dy, al] of [[8, -10, 'left'], [-8, -10, 'right'], [8, 11, 'left'], [-8, 11, 'right']] as const) {
      const x0 = al === 'left' ? s[0] + dx : s[0] + dx - wd
      if (!boardPlace(x0 - 2, s[1] + dy - 8, x0 + wd + 2, s[1] + dy + 8)) continue
      ctx.textAlign = 'left'
      ctx.fillStyle = rgba(pal.madder, 1)
      haloText(ctx, text, x0, s[1] + dy)
      break
    }
    boardAdd(s[0] - r, s[1] - r, s[0] + r, s[1] + r)
    ctx.restore()
  }

  // ------------------------------------------------------------ names

  private drawLabels(
    ctx: CanvasRenderingContext2D, sc: Scene, cat: Catalog, o: SkyOptions,
    glabels: Array<{ x: number; y: number; r: number; text: string; sel: boolean; col: string; minor: boolean }>, zoomK: number,
  ) {
    const { p, pal } = sc
    // the pointers' bodies are brass the names should not sit on
    if (sc.reteA > 0.04 && sc.disc) {
      const c = project(p, sc.pole, -0.999)
      if (c) for (const i of reteStars(cat)) {
        const s = project(p, mul(sc.F.eqj, cat.stars[i].v), -0.6)
        if (!s) continue
        const ux = c[0] - s[0], uy = c[1] - s[1], L = Math.hypot(ux, uy) || 1
        const k = Math.max(14, Math.min(26, sc.disc.R * 0.055))
        const ex = s[0] + (ux / L) * k, ey = s[1] + (uy / L) * k
        boardAdd(Math.min(s[0], ex) - 3, Math.min(s[1], ey) - 3, Math.max(s[0], ex) + 3, Math.max(s[1], ey) + 3)
      }
    }
    ctx.save()
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    for (const g of glabels) {
      const ls = this.ls
      ctx.font = g.minor ? `${(11.5 * ls).toFixed(1)}px "Public Sans", ${SYMBOL_FONT}, sans-serif` : `600 ${(13 * ls).toFixed(1)}px "Public Sans", ${SYMBOL_FONT}, sans-serif`
      placeGraha(ctx, g, pal)
    }
    if (o.showFigures && zoomK > 0.9) {
      const f = figuresOf(cat, o.culture)
      for (const c of f.centres) {
        const s = project(p, mul(sc.F.eqj, c.v), -0.4)
        if (s && s[0] > 0 && s[0] < p.w && s[1] > 0 && s[1] < p.h) this.pendingFigures.push({ x: s[0], y: s[1], text: c.name, n: c.n })
      }
    }
    ctx.font = `${(11.5 * this.ls).toFixed(1)}px "Public Sans", sans-serif`
    const ps = this.pendingStars
    ps.sort((a, b) => Number(b.yoga) - Number(a.yoga) || a.mag - b.mag)
    for (const d of ps) {
      const wdt = tw(ctx, d.text)
      for (let c = 0; c < 4; c++) {
        const right = c === 0 || c === 2
        const up = c < 2
        const x0 = right ? d.x + 6 : d.x - 6 - wdt
        const yc = up ? d.y - 9 : d.y + 9
        if (!boardPlace(x0 - 1, yc - 7, x0 + wdt + 1, yc + 7)) continue
        ctx.fillStyle = d.yoga ? rgba(pal.gold, 0.95) : rgba(pal.star, 0.72)
        haloText(ctx, d.text, x0, yc)
        break
      }
    }
    ctx.font = 'italic 12px Vollkorn, Georgia, serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = rgba(pal.gold, 0.72)
    const pf = this.pendingFigures
    pf.sort((a, b) => b.n - a.n)
    for (const f of pf) {
      const wdt = tw(ctx, f.text)
      for (const dy of FIG_DY) {
        const yc = f.y + dy
        if (!boardPlace(f.x - wdt / 2 - 2, yc - 7, f.x + wdt / 2 + 2, yc + 7)) continue
        haloText(ctx, f.text, f.x, yc)
        break
      }
    }
    ctx.restore()
  }

  private drawSelected(ctx: CanvasRenderingContext2D, sc: Scene, cat: Catalog, o: SkyOptions) {
    if (o.selected?.kind !== 'star') return
    const id = o.selected.id as number
    const st = id > 0 ? cat.byHip.get(id) : cat.stars[-id - 1]
    if (!st) return
    const s = project(sc.p, mul(sc.F.eqj, st.v), -0.6)
    if (!s) return
    ctx.save()
    ctx.strokeStyle = sc.pal.star
    ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.arc(s[0], s[1], 11, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath()
    for (let k = 0; k < 4; k++) {
      const r = (k * Math.PI) / 2
      ctx.moveTo(s[0] + Math.cos(r) * 14, s[1] + Math.sin(r) * 14)
      ctx.lineTo(s[0] + Math.cos(r) * 20, s[1] + Math.sin(r) * 20)
    }
    ctx.stroke()
    ctx.restore()
  }

  // ------------------------------------------------------------ picking

  /** What lies under a screen point in the last frame drawn: a graha first, then a star. */
  pick(x: number, y: number): Pick {
    let best: Pick = null
    let bd = 14
    for (let i = 0; i < this.nBodies; i++) {
      const b = this.bodyXY[i]
      const d = Math.hypot(b.x - x, b.y - y)
      if (d < bd) { bd = d; best = { kind: 'body', id: b.id } }
    }
    if (best || !this.last) return best
    const { p, F, cat, zoomK, disc, reteA } = this.last
    if (disc && reteA > 0.5 && Math.hypot(x - disc.x, y - disc.y) > disc.R) return null
    const t = starTable(cat)
    composite(p, F.eqj, MB)
    const M = MB, limit = limitMagFor(zoomK), s2 = p.scale * 2
    let bi = -1
    for (let i = 0; i < t.n && t.mag[i] <= limit; i++) {
      const vx = t.vx[i], vy = t.vy[i], vz = t.vz[i]
      const Z = M[6] * vx + M[7] * vy + M[8] * vz
      if (Z < -0.6) continue
      const f = s2 / (1 + Z)
      const X = p.cx + (M[0] * vx + M[1] * vy + M[2] * vz) * f, Y = p.cy - (M[3] * vx + M[4] * vy + M[5] * vz) * f
      const d = Math.hypot(X - x, Y - y)
      if (d < bd) { bd = d; bi = i }
    }
    if (bi < 0) return null
    return { kind: 'star', id: t.hip[bi] || -t.idx[bi] - 1 }
  }

  /** The disc of the astrolabe in the last frame (for turning the rete about its pin). */
  get disc(): Disc | null { return this.last?.disc ?? null }
}

const MB = new Float64Array(9)

/** A layer's box in device pixels (left/right/bottom extents and a taller top for the throne). */
function pixelBox(x: number, y: number, side: number, top: number, bottom: number, dpr: number, W: number, H: number) {
  const x0 = Math.max(0, Math.floor((x - side) * dpr)), x1 = Math.min(W, Math.ceil((x + side) * dpr))
  const y0 = Math.max(0, Math.floor((y - top) * dpr)), y1 = Math.min(H, Math.ceil((y + bottom) * dpr))
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

function renderLayer(l: Layer, W: number, H: number, dpr: number, paint: (c: CanvasRenderingContext2D) => void) {
  sizeLayer(l, W, H)
  const c = l.ctx
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.clearRect(0, 0, W, H)
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  paint(c)
}

/** Copy a full-canvas layer, or only its box, pixel for pixel. */
function blit(ctx: CanvasRenderingContext2D, cv: HTMLCanvasElement, b: { x: number; y: number; w: number; h: number } | null, W: number, H: number, dpr: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  if (b) ctx.drawImage(cv, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h)
  else ctx.drawImage(cv, 0, 0, W, H)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
const FIG_DY = [14, -12, 0, 26]
const GRAHA_ANGLES = [0, -0.55, 0.55, Math.PI, Math.PI + 0.55, Math.PI - 0.55, -Math.PI / 2, Math.PI / 2]
const GRAHA_STEPS = [0, 14, 28, 46]

const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d }

/** A graha's name: beside it when there is room, otherwise led out along a fine line. */
function placeGraha(ctx: CanvasRenderingContext2D, g: { x: number; y: number; r: number; text: string; sel: boolean; col: string; minor: boolean }, pal: Palette) {
  const wdt = tw(ctx, g.text), hh = 16
  let bx = g.x + g.r + 5, by = g.y, step = 0, found = false
  for (const dd of GRAHA_STEPS) {
    for (const a of GRAHA_ANGLES) {
      const d = g.r + 5 + dd
      const ax = g.x + Math.cos(a) * d, ay = g.y + Math.sin(a) * d
      const c = Math.cos(a)
      const x0 = Math.abs(c) < 0.2 ? ax - wdt / 2 : c > 0 ? ax : ax - wdt
      const yc = Math.abs(c) < 0.2 ? ay + Math.sign(Math.sin(a)) * hh * 0.5 : ay
      if (x0 < 2 || x0 + wdt > ctx.canvas.clientWidth - 2) continue
      if (boardFree(x0 - 2, yc - hh / 2, x0 + wdt + 2, yc + hh / 2)) { bx = x0; by = yc; step = dd; found = true; break }
    }
    if (found) break
  }
  if (!found && g.minor) return
  if (!found && rimOut > 0) {
    // crowded at the edge of the plate: lead the name inward, toward the pin
    const dx = rimX - g.x, dy = rimY - g.y, d = Math.hypot(dx, dy) || 1
    const ax = g.x + (dx / d) * (g.r + 30), ay = g.y + (dy / d) * (g.r + 30)
    bx = dx > 0 ? ax : ax - wdt; by = ay; step = 30
  }
  boardAdd(bx - 2, by - hh / 2, bx + wdt + 2, by + hh / 2)
  if (step > 0) {
    const nx = Math.max(bx, Math.min(bx + wdt, g.x)), ny = Math.max(by - hh / 2 + 2, Math.min(by + hh / 2 - 2, g.y))
    const dx = nx - g.x, dy = ny - g.y, d = Math.hypot(dx, dy) || 1
    ctx.strokeStyle = rgba(pal.gold, 0.6)
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(g.x + (dx / d) * (g.r + 2), g.y + (dy / d) * (g.r + 2))
    ctx.lineTo(nx - (dx / d) * 2, ny - (dy / d) * 2)
    ctx.stroke()
  }
  ctx.fillStyle = g.sel ? pal.star : g.minor ? rgba(pal.star, 0.6) : rgba(g.col === pal.goldPale ? pal.gold : g.col, 0.98)
  haloText(ctx, g.text, bx, by)
}

function fovOf(p: Proj): number {
  // the field across the view's shorter side; the projection carries only its scale
  const half = Math.min(p.w, p.h) / 2
  return (Math.atan(half / (2 * p.scale)) * 4 * 180) / Math.PI
}

/**
 * The Moon with its true phase: the lit limb turned toward the Sun along the great circle
 * between them, the terminator an ellipse, the dark side holding a little earthshine.
 */
function drawMoon(ctx: CanvasRenderingContext2D, p: Proj, pal: Palette, x: number, y: number, r: number, moon: V3, sun: V3) {
  const cosE = Math.max(-1, Math.min(1, moon[0] * sun[0] + moon[1] * sun[1] + moon[2] * sun[2]))
  // the direction toward the Sun, on the screen
  const tx = sun[0] - moon[0] * cosE, ty = sun[1] - moon[1] * cosE, tz = sun[2] - moon[2] * cosE
  const tl = Math.hypot(tx, ty, tz) || 1
  const k = 0.01 / tl
  const q = project(p, [moon[0] + tx * k, moon[1] + ty * k, moon[2] + tz * k], -0.95)
  const rot = q ? Math.atan2(q[1] - y, q[0] - x) : 0
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  // glow
  const gl = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 3)
  gl.addColorStop(0, rgba(pal.goldPale, 0.12 * (1 - cosE) * 0.5 + 0.03))
  gl.addColorStop(1, rgba(pal.goldPale, 0))
  ctx.fillStyle = gl
  ctx.fillRect(-r * 3, -r * 3, r * 6, r * 6)
  // the dark disc, with earthshine
  ctx.fillStyle = 'rgba(52, 42, 32, 0.96)'
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
  // the lit part: the Sun-ward half, plus or minus the terminator's half-ellipse
  const ex = Math.abs(cosE) * r
  const lg = ctx.createRadialGradient(r * 0.25, -r * 0.1, 0, 0, 0, r)
  lg.addColorStop(0, '#fbf3e1')
  lg.addColorStop(1, pal.star)
  ctx.fillStyle = lg
  ctx.beginPath()
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false)
  // crescent (elongation under 90°): the terminator bows toward the Sun; gibbous: away from it
  ctx.ellipse(0, 0, Math.max(0.01, ex), r, 0, Math.PI / 2, -Math.PI / 2, cosE > 0)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = rgba(pal.brass, 0.85)
  ctx.lineWidth = 0.8
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}

