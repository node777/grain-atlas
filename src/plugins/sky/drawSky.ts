// Painting the sky: milky way, the instrument's circles, the zodiac and nakshatra rings, the
// figures of a sky culture, the stars, and the nine grahas -- all through one projection.

import type { SkyMoment } from '@/astro/positions'
import { type Catalog, type CultureId, starColor, starName, unit } from './catalog'
import {
  type Frames, type Proj, type V3, circlePoints, eclVec, mul, project, strokeSphere, cross, norm, dot,
} from './projection'
import { NAKSHATRAS } from '@/astro/data/nakshatras'
import { RASHIS } from '@/astro/data/rashis'
import type { Lens } from '@/core/settings'

export interface SkyOptions {
  instrument: number      // 0..1, how much of the brass is visible
  astrolabe: number       // 0 dome .. 1 astrolabe (blend)
  culture: CultureId
  showFigures: boolean
  showMilkyWay: boolean
  lens: Lens
  lat: number
  selected?: { kind: 'star' | 'body'; id: number | string } | null
  highlightNakshatra?: number
  t: number               // animation clock (ms)
  twinkle: boolean
}

export interface Drawn {
  stars: Array<{ x: number; y: number; hip: number; mag: number; i: number }>
  bodies: Array<{ x: number; y: number; id: string }>
}

const GLYPH: Record<string, string> = {
  sun: '☉', moon: '☽', mars: '♂', mercury: '☿', jupiter: '♃', venus: '♀', saturn: '♄', rahu: '☊', ketu: '☋',
  uranus: '♅', neptune: '♆', pluto: '♇',
}
const VEDIC: Record<string, string> = {
  sun: 'Surya', moon: 'Chandra', mars: 'Mangala', mercury: 'Budha', jupiter: 'Guru', venus: 'Shukra',
  saturn: 'Shani', rahu: 'Rahu', ketu: 'Ketu', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto',
}

const rgba = (hex: string, a: number) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// ---- label board: a cheap greedy de-overlap, reused every frame (the sky redraws each frame)
const boxes: number[] = []
let nBox = 0
// the brass rim of the astrolabe, which no name should sit beneath
let rimX = 0, rimY = 0, rimIn = -1, rimOut = -1
function boardFree(x0: number, y0: number, x1: number, y1: number): boolean {
  if (rimOut > 0) {
    const nx = Math.max(x0, Math.min(x1, rimX)) - rimX, ny = Math.max(y0, Math.min(y1, rimY)) - rimY
    const fx = Math.max(Math.abs(x0 - rimX), Math.abs(x1 - rimX)), fy = Math.max(Math.abs(y0 - rimY), Math.abs(y1 - rimY))
    if (Math.hypot(nx, ny) < rimOut && Math.hypot(fx, fy) > rimIn) return false
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
let fontsWatched = false
/** Width of a label in a given font, measured once (the sky's labels come in a few fixed fonts). */
function tw(ctx: CanvasRenderingContext2D, text: string): number {
  if (!fontsWatched && typeof document !== 'undefined' && document.fonts) {
    fontsWatched = true
    document.fonts.addEventListener('loadingdone', () => widths.clear())
  }
  const key = ctx.font + '\u0000' + text
  let w = widths.get(key)
  if (w === undefined) { w = ctx.measureText(text).width; widths.set(key, w) }
  return w
}

const HALO = 'rgba(15, 12, 10, 0.78)'
/** Text with a soft dark halo, so names stay legible over lines and the Milky Way. */
function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.strokeStyle = HALO
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.strokeText(text, x, y)
  ctx.fillText(text, x, y)
}

// the brightest named stars carry a pointer on the rete, as on a real astrolabe
const retePicks = new WeakMap<Catalog, number[]>()
function reteStars(cat: Catalog): number[] {
  let hit = retePicks.get(cat)
  if (!hit) {
    hit = cat.stars.map((st, i) => ({ st, i }))
      .filter((x) => x.st.hip && cat.names[x.st.hip]?.[0])
      .sort((a, b) => a.st.mag - b.st.mag)
      .slice(0, 20)
      .map((x) => x.i)
    retePicks.set(cat, hit)
  }
  return hit
}

interface Pending { x: number; y: number; text: string; mag: number; yoga: boolean }
const pendingStars: Pending[] = []
const pendingFigures: Array<{ x: number; y: number; text: string; n: number }> = []

export function drawSky(
  ctx: CanvasRenderingContext2D, p: Proj, F: Frames, cat: Catalog, sky: SkyMoment, o: SkyOptions,
): Drawn {
  const { w, h } = p
  const brass = '#c8992f', brassDim = '#9a6f22', gold = '#d9b45a', star = '#f6ead0', madder = '#c8766a'
  const inst = o.instrument
  nBox = 0
  rimOut = -1
  if (o.astrolabe * inst > 0.3) {
    const lg = limbGeometry(p, F, sky)
    if (lg) { rimX = lg.c[0]; rimY = lg.c[1]; rimIn = lg.R - 2; rimOut = lg.R + 36 }
  }
  pendingStars.length = 0
  pendingFigures.length = 0
  const zoomK = Math.max(0.75, Math.min(2.6, 70 / Math.max(20, fovOf(p))))

  // ---- the night itself: warm, never navy
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75)
  g.addColorStop(0, '#1d1814')
  g.addColorStop(1, '#0f0c0a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // ---- milky way, five layers of faint linen
  if (o.showMilkyWay) {
    for (const layer of cat.milkyway) {
      ctx.fillStyle = `rgba(246, 234, 208, ${0.02 + layer.level * 0.004})`
      for (const poly of layer.polys) {
        for (const ring of poly) {
          ctx.beginPath()
          let ok = true
          ring.forEach(([ra, dec], i) => {
            const s = project(p, mul(F.eqj, unit(ra, dec)), -0.55)
            if (!s) { ok = false; return }
            if (i === 0) ctx.moveTo(s[0], s[1])
            else ctx.lineTo(s[0], s[1])
          })
          if (ok) ctx.fill()
        }
      }
    }
  }

  // ---- the ground below the horizon (dimmed, and named)
  drawGround(ctx, p, o)

  // ---- instrument circles
  if (inst > 0.01) {
    ctx.save()
    ctx.lineWidth = 1
    const zen: V3 = [0, 0, 1]
    // almucantars, every 10° of altitude (the plate)
    ctx.strokeStyle = rgba(brassDim, 0.35 * inst)
    for (let alt = 10; alt < 90; alt += 10) strokeSphere(ctx, p, circlePoints(zen, 90 - alt, 160))
    // azimuth lines, every 30°
    ctx.setLineDash([2, 5])
    for (let az = 0; az < 360; az += 30) {
      const v: V3 = [Math.cos((az * Math.PI) / 180), -Math.sin((az * Math.PI) / 180), 0]
      const axis = norm(cross(v, zen))
      strokeSphere(ctx, p, circlePoints(axis, 90, 180).filter((q) => q[2] >= -0.02))
    }
    ctx.setLineDash([])
    // horizon
    ctx.strokeStyle = rgba(madder, 0.75 * inst + 0.15)
    ctx.lineWidth = 1.6
    strokeSphere(ctx, p, circlePoints(zen, 90, 240))
    // meridian
    ctx.strokeStyle = rgba(brassDim, 0.45 * inst)
    ctx.lineWidth = 1
    strokeSphere(ctx, p, circlePoints([0, 1, 0], 90, 240))
    // equator and the two tropics
    const pole = mul(F.eqd, [0, 0, 1])
    ctx.strokeStyle = rgba(brass, 0.55 * inst)
    strokeSphere(ctx, p, circlePoints(pole, 90, 240))
    ctx.setLineDash([4, 4])
    strokeSphere(ctx, p, circlePoints(pole, 90 - sky.obliquity, 240))
    strokeSphere(ctx, p, circlePoints(pole, 90 + sky.obliquity, 240))
    ctx.setLineDash([])
    ctx.restore()
  }

  // ---- the ecliptic, with its two rings: signs above, nakshatras below
  drawZodiac(ctx, p, F, sky, o, inst)

  // ---- constellation figures (their names wait for the label pass)
  if (o.showFigures) {
    const culture = cat.cultures[o.culture]
    ctx.save()
    ctx.strokeStyle = 'rgba(217, 180, 90, 0.42)'
    ctx.lineWidth = 1
    for (const fig of culture?.constellations ?? []) {
      let sx = 0, sy = 0, n = 0
      for (const line of fig.lines) {
        ctx.beginPath()
        let pen = false
        let last: [number, number] | null = null
        for (const hip of line) {
          const st = cat.byHip.get(hip)
          if (!st) { pen = false; continue }
          const s = project(p, mul(F.eqj, st.v), -0.4)
          if (!s) { pen = false; continue }
          if (last && Math.hypot(s[0] - last[0], s[1] - last[1]) > w * 0.6) pen = false
          if (pen) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1])
          pen = true
          last = s
          sx += s[0]; sy += s[1]; n++
        }
        ctx.stroke()
      }
      if (n > 1 && zoomK > 0.9) {
        const cx = sx / n, cy = sy / n
        if (cx > 0 && cx < w && cy > 0 && cy < h) pendingFigures.push({ x: cx, y: cy, text: fig.name, n })
      }
    }
    ctx.restore()
  }

  // ---- stars
  const drawn: Drawn = { stars: [], bodies: [] }
  const limitMag = 3.2 + zoomK * 1.9
  for (let i = 0; i < cat.stars.length; i++) {
    const st = cat.stars[i]
    if (st.mag > limitMag) continue
    const v = mul(F.eqj, st.v)
    const s = project(p, v, -0.6)
    if (!s || s[0] < -4 || s[0] > w + 4 || s[1] < -4 || s[1] > h + 4) continue
    let r = Math.max(0.55, (limitMag + 0.6 - st.mag) * 0.42 * Math.sqrt(zoomK))
    let alpha = Math.min(1, 0.35 + (limitMag - st.mag) * 0.22)
    if (v[2] < 0) alpha *= 0.35 + 0.65 * (1 - o.astrolabe) * 0.4
    if (o.twinkle && st.mag < 2.5) alpha *= 0.86 + 0.14 * Math.sin(o.t / 420 + i * 1.7)
    const col = starColor(st.ci)
    if (st.mag < 1.6) {
      const halo = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], r * 5)
      halo.addColorStop(0, rgba(col, 0.32 * alpha))
      halo.addColorStop(1, rgba(col, 0))
      ctx.fillStyle = halo
      ctx.fillRect(s[0] - r * 5, s[1] - r * 5, r * 10, r * 10)
      r *= 1.15
    }
    ctx.fillStyle = rgba(col, alpha)
    ctx.beginPath()
    ctx.arc(s[0], s[1], r, 0, Math.PI * 2)
    ctx.fill()
    drawn.stars.push({ x: s[0], y: s[1], hip: st.hip, mag: st.mag, i })
  }
  // names of the brightest, and every yogatara when the nakshatra figures are shown
  const yogataras = yogataraSet()
  ctx.strokeStyle = 'rgba(217, 180, 90, 0.7)'
  ctx.lineWidth = 1
  for (const d of drawn.stars) {
    const isYoga = yogataras.has(d.hip)
    if (d.mag > 1.3 + zoomK * 0.8 && !(isYoga && o.instrument > 0.2)) continue
    const nm = starName(cat, d.hip)
    if (!nm) continue
    pendingStars.push({ x: d.x, y: d.y, text: nm, mag: d.mag, yoga: isYoga })
    if (isYoga) { ctx.beginPath(); ctx.arc(d.x, d.y, 5.5, 0, Math.PI * 2); ctx.stroke() }
  }

  claimCardinals(p)

  // ---- the grahas: bodies first, so every label can see every body
  const glabels: Array<{ x: number; y: number; r: number; text: string; sel: boolean }> = []
  for (const b of sky.bodies) {
    const v = mul(F.ect, eclVec(b.tropical, b.latitude))
    const s = project(p, v, -0.6)
    if (!s) continue
    drawn.bodies.push({ x: s[0], y: s[1], id: b.id })
    const isSel = o.selected?.kind === 'body' && o.selected.id === b.id
    let br = 3.4
    if (b.id === 'sun') {
      const r = 7 * Math.sqrt(zoomK)
      const halo = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], r * 4)
      halo.addColorStop(0, 'rgba(241, 201, 139, 0.55)')
      halo.addColorStop(1, 'rgba(241, 201, 139, 0)')
      ctx.fillStyle = halo
      ctx.fillRect(s[0] - r * 4, s[1] - r * 4, r * 8, r * 8)
      ctx.fillStyle = gold
      ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, Math.PI * 2); ctx.fill()
      br = r
    } else if (b.id === 'moon') {
      const r = 6.5 * Math.sqrt(zoomK)
      const sun = sky.bodies.find((x) => x.id === 'sun')!
      drawMoon(ctx, s[0], s[1], r, ((b.tropical - sun.tropical) % 360 + 360) % 360)
      br = r
    } else {
      const node = b.id === 'rahu' || b.id === 'ketu'
      br = node ? 2.5 : 3.4
      ctx.fillStyle = node ? 'rgba(200, 118, 106, 0.9)' : 'rgba(246, 234, 208, 0.95)'
      ctx.beginPath(); ctx.arc(s[0], s[1], br, 0, Math.PI * 2); ctx.fill()
    }
    if (isSel) {
      ctx.strokeStyle = star
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(s[0], s[1], 12, 0, Math.PI * 2); ctx.stroke()
    }
    boardAdd(s[0] - br - 1, s[1] - br - 1, s[0] + br + 1, s[1] + br + 1)
    glabels.push({
      x: s[0], y: s[1], r: br, sel: isSel,
      text: `${GLYPH[b.id] ?? ''} ${VEDIC[b.id] ?? b.id}${b.retrograde && b.id !== 'rahu' && b.id !== 'ketu' ? ' ℞' : ''}`,
    })
  }

  // ---- rete pointers for the brightest stars, while the instrument is out
  const reteA = inst * o.astrolabe
  if (reteA > 0.04) drawRetePointers(ctx, p, F, cat, reteA)

  // ---- names, in order of standing: grahas (always shown, led out if crowded), stars, figures
  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = '600 13px "Public Sans", sans-serif'
  for (const g of glabels) placeGraha(ctx, g)
  ctx.font = '11.5px "Public Sans", sans-serif'
  pendingStars.sort((a, b) => Number(b.yoga) - Number(a.yoga) || a.mag - b.mag)
  for (const d of pendingStars) {
    const wdt = tw(ctx, d.text)
    // up-right first, as the eye expects; then the other three corners
    for (let c = 0; c < 4; c++) {
      const right = c === 0 || c === 2
      const up = c < 2
      const x0 = right ? d.x + 6 : d.x - 6 - wdt
      const yc = up ? d.y - 9 : d.y + 9
      if (!boardPlace(x0 - 1, yc - 7, x0 + wdt + 1, yc + 7)) continue
      ctx.fillStyle = d.yoga ? 'rgba(217, 180, 90, 0.95)' : 'rgba(246, 234, 208, 0.7)'
      haloText(ctx, d.text, x0, yc)
      break
    }
  }
  ctx.font = 'italic 12px Vollkorn, Georgia, serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(217, 180, 90, 0.72)'
  pendingFigures.sort((a, b) => b.n - a.n)
  for (const f of pendingFigures) {
    const wdt = tw(ctx, f.text)
    for (const dy of [14, -12, 0, 26]) {
      const yc = f.y + dy
      if (!boardPlace(f.x - wdt / 2 - 2, yc - 7, f.x + wdt / 2 + 2, yc + 7)) continue
      haloText(ctx, f.text, f.x, yc)
      break
    }
  }
  ctx.restore()

  // ---- the selected star
  if (o.selected?.kind === 'star') {
    const st = cat.byHip.get(o.selected.id as number) ?? cat.stars[o.selected.id as number]
    if (st) {
      const s = project(p, mul(F.eqj, st.v), -0.6)
      if (s) {
        ctx.strokeStyle = star
        ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.arc(s[0], s[1], 11, 0, Math.PI * 2); ctx.stroke()
        for (const a of [0, 90, 180, 270]) {
          const r = (a * Math.PI) / 180
          ctx.beginPath()
          ctx.moveTo(s[0] + Math.cos(r) * 14, s[1] + Math.sin(r) * 14)
          ctx.lineTo(s[0] + Math.cos(r) * 20, s[1] + Math.sin(r) * 20)
          ctx.stroke()
        }
      }
    }
  }

  // ---- the astrolabe's limb and rule
  if (o.astrolabe > 0.02 && inst > 0.02) drawLimb(ctx, p, F, sky, inst * o.astrolabe)
  // cardinal points on the horizon
  drawCardinals(ctx, p, inst)
  return drawn
}

let yogaSet: Set<number> | null = null
const yogataraSet = () => (yogaSet ??= new Set(NAKSHATRAS.map((n) => n.yogatara.hip).filter(Boolean) as number[]))

const GRAHA_ANGLES = [0, -0.55, 0.55, Math.PI, Math.PI + 0.55, Math.PI - 0.55, -Math.PI / 2, Math.PI / 2]
const GRAHA_STEPS = [0, 14, 28, 46]

/** A graha's name: beside it when there is room, otherwise led out along a fine line. */
function placeGraha(ctx: CanvasRenderingContext2D, g: { x: number; y: number; r: number; text: string; sel: boolean }) {
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
  boardAdd(bx - 2, by - hh / 2, bx + wdt + 2, by + hh / 2)
  if (step > 0) {
    // the leader runs from the body's rim to the nearest edge of its name
    const nx = Math.max(bx, Math.min(bx + wdt, g.x)), ny = Math.max(by - hh / 2 + 2, Math.min(by + hh / 2 - 2, g.y))
    const dx = nx - g.x, dy = ny - g.y, d = Math.hypot(dx, dy) || 1
    ctx.strokeStyle = 'rgba(224, 165, 74, 0.6)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(g.x + (dx / d) * (g.r + 2), g.y + (dy / d) * (g.r + 2))
    ctx.lineTo(nx - (dx / d) * 2, ny - (dy / d) * 2)
    ctx.stroke()
  }
  ctx.fillStyle = g.sel ? '#f6ead0' : 'rgba(224, 165, 74, 0.95)'
  haloText(ctx, g.text, bx, by)
}

/** Flame-shaped pointers, as on an astrolabe's rete: each tip touches its star, each tail
 *  reaches back toward the pole the rete turns on. */
function drawRetePointers(ctx: CanvasRenderingContext2D, p: Proj, F: Frames, cat: Catalog, a: number) {
  const c = project(p, mul(F.eqd, [0, 0, 1]), -0.999)
  if (!c) return
  ctx.save()
  ctx.lineJoin = 'round'
  for (const i of reteStars(cat)) {
    const st = cat.stars[i]
    const s = project(p, mul(F.eqj, st.v), -0.6)
    if (!s || s[0] < -20 || s[0] > p.w + 20 || s[1] < -20 || s[1] > p.h + 20) continue
    let ux = c[0] - s[0], uy = c[1] - s[1]
    const L0 = Math.hypot(ux, uy)
    if (L0 < 40) continue
    ux /= L0; uy /= L0
    const px = -uy, py = ux
    const L = 18
    const X = (t: number, q: number) => s[0] + ux * L * t + px * q
    const Y = (t: number, q: number) => s[1] + uy * L * t + py * q
    ctx.beginPath()
    ctx.moveTo(X(0.2, 0), Y(0.2, 0))
    ctx.bezierCurveTo(X(0.36, 0.9), Y(0.36, 0.9), X(0.48, 3.3), Y(0.48, 3.3), X(0.7, 3.1), Y(0.7, 3.1))
    ctx.bezierCurveTo(X(0.9, 2.9), Y(0.9, 2.9), X(1.02, 1.1), Y(1.02, 1.1), X(0.96, -0.5), Y(0.96, -0.5))
    ctx.bezierCurveTo(X(0.9, -2.5), Y(0.9, -2.5), X(0.64, -2.9), Y(0.64, -2.9), X(0.52, -2.1), Y(0.52, -2.1))
    ctx.bezierCurveTo(X(0.4, -1.3), Y(0.4, -1.3), X(0.3, -0.5), Y(0.3, -0.5), X(0.2, 0), Y(0.2, 0))
    ctx.globalAlpha = a * 0.85
    ctx.fillStyle = '#a87c26'
    ctx.fill()
    ctx.globalAlpha = a * 0.7
    ctx.strokeStyle = '#e8cf8a'
    ctx.lineWidth = 0.7
    ctx.stroke()
    // a thread of tracery tying the pointer back into the rete
    ctx.globalAlpha = a * 0.35
    ctx.beginPath()
    ctx.moveTo(X(0.98, 0), Y(0.98, 0))
    ctx.quadraticCurveTo(X(1.35, 1.6), Y(1.35, 1.6), X(1.8, 0), Y(1.8, 0))
    ctx.stroke()
    const ex = X(1, 0), ey = Y(1, 0)
    boardAdd(Math.min(s[0], ex) - 4, Math.min(s[1], ey) - 4, Math.max(s[0], ex) + 4, Math.max(s[1], ey) + 4)
  }
  ctx.restore()
}

function fovOf(p: Proj): number {
  // invert scale = half / (2 tan(fov/4))
  const half = Math.min(p.w, p.h) / 2
  return (Math.atan(half / (2 * p.scale)) * 4 * 180) / Math.PI
}

function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, elong: number) {
  ctx.save()
  ctx.fillStyle = 'rgba(42, 34, 27, 0.95)'
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  const k = Math.cos((elong * Math.PI) / 180)
  const waxing = elong < 180
  ctx.fillStyle = '#f6ead0'
  ctx.beginPath()
  ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, !waxing)
  ctx.ellipse(x, y, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing)
  ctx.fill()
  ctx.strokeStyle = 'rgba(200, 153, 47, 0.8)'
  ctx.lineWidth = 0.8
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}

function drawGround(ctx: CanvasRenderingContext2D, p: Proj, o: SkyOptions) {
  // Fit the projected horizon (a circle under stereographic projection) through three points.
  const pts: Array<[number, number]> = []
  for (const az of [0, 120, 240, 60, 180, 300]) {
    const a = (az * Math.PI) / 180
    const s = project(p, [Math.cos(a), -Math.sin(a), 0], -0.995)
    if (s) pts.push(s)
  }
  if (pts.length < 3) return
  const [A, B, C] = pts
  const d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]))
  const alpha = 0.55 * (1 - o.astrolabe) + 0.25 * o.astrolabe
  const glow = Math.max(0, 1 - o.astrolabe * 1.6)
  ctx.save()
  ctx.fillStyle = `rgba(20, 15, 11, ${alpha})`
  ctx.beginPath()
  if (Math.abs(d) < 1e-6) {
    // the horizon is a straight line: shade the half-plane holding the nadir
    const nx = -(B[1] - A[1]), ny = B[0] - A[0]
    const nad = project(p, [0, 0, -1], -0.999) ?? [p.cx - nx, p.cy - ny]
    const side = Math.sign((nad[0] - A[0]) * nx + (nad[1] - A[1]) * ny) || 1
    const L = Math.max(p.w, p.h) * 4
    const ux = (B[0] - A[0]), uy = (B[1] - A[1])
    const ul = Math.hypot(ux, uy) || 1
    ctx.moveTo(A[0] - (ux / ul) * L, A[1] - (uy / ul) * L)
    ctx.lineTo(A[0] + (ux / ul) * L, A[1] + (uy / ul) * L)
    ctx.lineTo(A[0] + (ux / ul) * L + side * nx / ul * L, A[1] + (uy / ul) * L + side * ny / ul * L)
    ctx.lineTo(A[0] - (ux / ul) * L + side * nx / ul * L, A[1] - (uy / ul) * L + side * ny / ul * L)
    ctx.fill()
    if (glow > 0.01) {
      // the sky side is away from the nadir
      const nl = Math.hypot(nx, ny) || 1
      const sx = (-side * nx) / nl, sy = (-side * ny) / nl
      const band = Math.min(p.w, p.h) * 0.22
      const lg = ctx.createLinearGradient(A[0] - sx * 10, A[1] - sy * 10, A[0] + sx * band, A[1] + sy * band)
      lg.addColorStop(0, 'rgba(211, 138, 79, 0)')
      lg.addColorStop(10 / (band + 10), `rgba(211, 138, 79, ${0.2 * glow})`)
      lg.addColorStop(0.45, `rgba(200, 118, 106, ${0.07 * glow})`)
      lg.addColorStop(1, 'rgba(200, 118, 106, 0)')
      ctx.fillStyle = lg
      ctx.fillRect(0, 0, p.w, p.h)
    }
    ctx.restore()
    return
  }
  const ux = ((A[0] ** 2 + A[1] ** 2) * (B[1] - C[1]) + (B[0] ** 2 + B[1] ** 2) * (C[1] - A[1]) + (C[0] ** 2 + C[1] ** 2) * (A[1] - B[1])) / d
  const uy = ((A[0] ** 2 + A[1] ** 2) * (C[0] - B[0]) + (B[0] ** 2 + B[1] ** 2) * (A[0] - C[0]) + (C[0] ** 2 + C[1] ** 2) * (B[0] - A[0])) / d
  const R = Math.hypot(A[0] - ux, A[1] - uy)
  const zen = project(p, [0, 0, 1], -0.999)
  const zenInside = zen ? Math.hypot(zen[0] - ux, zen[1] - uy) < R : false
  if (zenInside) {
    // sky inside the circle, ground outside
    ctx.rect(-10, -10, p.w + 20, p.h + 20)
    ctx.arc(ux, uy, R, 0, Math.PI * 2, true)
  } else {
    ctx.arc(ux, uy, R, 0, Math.PI * 2)
  }
  ctx.fill('evenodd')
  if (glow > 0.01 && R < 1e6) {
    // a warm haze lying along the horizon, as dusk light holds low in the air; it spreads into
    // the sky side and only a little below the line
    const band = Math.min(p.w, p.h) * 0.22, under = 10
    const inner = zenInside ? Math.max(0, R - band) : Math.max(0, R - under)
    const outer = zenInside ? R + under : R + band
    const at = (r: number) => (r - inner) / (outer - inner)
    const rg = ctx.createRadialGradient(ux, uy, inner, ux, uy, outer)
    const peak = `rgba(211, 138, 79, ${0.2 * glow})`, soft = `rgba(200, 118, 106, ${0.07 * glow})`
    if (zenInside) {
      rg.addColorStop(0, 'rgba(200, 118, 106, 0)')
      rg.addColorStop(Math.max(0, at(R - band * 0.45)), soft)
      rg.addColorStop(at(R), peak)
      rg.addColorStop(1, 'rgba(211, 138, 79, 0)')
    } else {
      rg.addColorStop(0, 'rgba(211, 138, 79, 0)')
      rg.addColorStop(at(R), peak)
      rg.addColorStop(Math.min(1, at(R + band * 0.45)), soft)
      rg.addColorStop(1, 'rgba(200, 118, 106, 0)')
    }
    ctx.fillStyle = rg
    ctx.fillRect(0, 0, p.w, p.h)
  }
  ctx.restore()
}

function drawZodiac(ctx: CanvasRenderingContext2D, p: Proj, F: Frames, sky: SkyMoment, o: SkyOptions, inst: number) {
  const ring = Math.max(0.35, inst)
  const ay = sky.ayanamsa
  const signZero = o.lens === 'jyotish' ? ay : 0
  ctx.save()
  // the ecliptic line
  ctx.strokeStyle = `rgba(224, 165, 74, ${0.5 * ring + 0.15})`
  ctx.lineWidth = 1.4
  const ecl: V3[] = []
  for (let l = 0; l <= 360; l += 2) ecl.push(mul(F.ect, eclVec(l)))
  strokeSphere(ctx, p, ecl)

  // the band of nakshatras below the ecliptic, alternately tinted, the Moon's lodge lit
  const NAK = 360 / 27
  for (let i = 0; i < 27; i++) {
    const a = i * NAK + ay
    const poly: V3[] = []
    for (let s = 0; s <= 6; s++) poly.push(mul(F.ect, eclVec(a + (NAK * s) / 6, -2)))
    for (let s = 6; s >= 0; s--) poly.push(mul(F.ect, eclVec(a + (NAK * s) / 6, -9)))
    const pts = poly.map((v) => project(p, v, -0.5))
    if (pts.some((q) => !q)) continue
    ctx.beginPath()
    pts.forEach((q, k) => (k === 0 ? ctx.moveTo(q![0], q![1]) : ctx.lineTo(q![0], q![1])))
    ctx.closePath()
    const lit = o.highlightNakshatra === i
    ctx.fillStyle = lit ? 'rgba(217, 180, 90, 0.28)' : i % 2 ? `rgba(200, 153, 47, ${0.07 * ring})` : `rgba(176, 138, 171, ${0.06 * ring})`
    ctx.fill()
    ctx.strokeStyle = `rgba(154, 111, 34, ${0.55 * ring})`
    ctx.lineWidth = 0.8
    ctx.stroke()
    const mid = project(p, mul(F.ect, eclVec(a + NAK / 2, -5.5)), -0.5)
    if (mid) {
      ctx.font = `${lit ? 600 : 400} ${lit ? 13 : 11}px Vollkorn, Georgia, serif`
      ctx.fillStyle = lit ? '#f6ead0' : `rgba(233, 220, 192, ${0.75 * ring})`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const nm = NAKSHATRAS[i]?.name ?? String(i + 1)
      ctx.fillText(nm, mid[0], mid[1])
      const nw = tw(ctx, nm)
      boardAdd(mid[0] - nw / 2, mid[1] - 7, mid[0] + nw / 2, mid[1] + 7)
    }
  }
  // the graduated ecliptic: a fine engraved scale, a tick every 5° and a longer one every 10°
  if (ring > 0.36) {
    ctx.strokeStyle = `rgba(224, 165, 74, ${0.42 * ring})`
    ctx.lineWidth = 0.7
    const edge: V3[] = []
    for (let l = 0; l <= 360; l += 3) edge.push(mul(F.ect, eclVec(l, 2.1)))
    strokeSphere(ctx, p, edge)
    ctx.beginPath()
    for (let d = 0; d < 360; d += 5) {
      const t0 = project(p, mul(F.ect, eclVec(signZero + d, 0)), -0.5)
      const t1 = project(p, mul(F.ect, eclVec(signZero + d, d % 10 === 0 ? 2.1 : 1.1)), -0.5)
      if (!t0 || !t1) continue
      ctx.moveTo(t0[0], t0[1])
      ctx.lineTo(t1[0], t1[1])
    }
    ctx.stroke()
  }
  // the twelve signs above the ecliptic
  for (let i = 0; i < 12; i++) {
    const a = signZero + i * 30
    const t0 = project(p, mul(F.ect, eclVec(a, 0)), -0.5)
    const t1 = project(p, mul(F.ect, eclVec(a, 8)), -0.5)
    if (t0 && t1) {
      ctx.strokeStyle = `rgba(224, 165, 74, ${0.6 * ring})`
      ctx.beginPath(); ctx.moveTo(t0[0], t0[1]); ctx.lineTo(t1[0], t1[1]); ctx.stroke()
    }
    const mid = project(p, mul(F.ect, eclVec(a + 15, 4.5)), -0.5)
    if (mid) {
      const r = RASHIS[i]
      ctx.font = '15px "Public Sans", "Noto Sans Symbols", sans-serif'
      ctx.fillStyle = `rgba(224, 165, 74, ${0.85 * ring})`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(r?.glyph ?? '', mid[0], mid[1])
      ctx.font = 'italic 11px Vollkorn, Georgia, serif'
      const nm = o.lens === 'western' || o.lens === 'grain' ? (r?.western ?? '') : (r?.name ?? '')
      ctx.fillText(nm, mid[0], mid[1] + 13)
      const nw = Math.max(16, tw(ctx, nm))
      boardAdd(mid[0] - nw / 2, mid[1] - 9, mid[0] + nw / 2, mid[1] + 19)
    }
  }
  ctx.restore()
}

/** Where the limb sits: on the far tropic, whose projected circle is centred on the pole. */
function limbGeometry(p: Proj, F: Frames, sky: SkyMoment): { c: [number, number]; R: number } | null {
  const pole = mul(F.eqd, [0, 0, 1])
  const far = circlePoints(pole, 90 + sky.obliquity, 120).map((v) => project(p, v, -0.999)).filter(Boolean) as Array<[number, number]>
  const c = project(p, pole, -0.999)
  if (!c || far.length < 10) return null
  return { c, R: far.reduce((s, q) => s + Math.hypot(q[0] - c[0], q[1] - c[1]), 0) / far.length }
}

function drawLimb(ctx: CanvasRenderingContext2D, p: Proj, F: Frames, sky: SkyMoment, a: number) {
  const geo = limbGeometry(p, F, sky)
  if (!geo) return
  const { c, R } = geo
  ctx.save()
  ctx.globalAlpha = a
  // the mater's rim: a brass annulus
  const rim = new Path2D()
  rim.arc(c[0], c[1], R + 34, 0, Math.PI * 2)
  rim.arc(c[0], c[1], R, 0, Math.PI * 2, true)
  const g = ctx.createRadialGradient(c[0], c[1], R, c[0], c[1], R + 34)
  g.addColorStop(0, '#5a4220')
  g.addColorStop(0.5, '#8a6528')
  g.addColorStop(1, '#4a3518')
  ctx.fillStyle = g
  ctx.fill(rim, 'evenodd')
  // light from the upper left across worked metal
  const sheen = ctx.createLinearGradient(c[0] - R, c[1] - R, c[0] + R, c[1] + R)
  sheen.addColorStop(0, 'rgba(244, 233, 207, 0.2)')
  sheen.addColorStop(0.45, 'rgba(244, 233, 207, 0)')
  sheen.addColorStop(0.7, 'rgba(20, 12, 4, 0)')
  sheen.addColorStop(1, 'rgba(20, 12, 4, 0.28)')
  ctx.fillStyle = sheen
  ctx.fill(rim, 'evenodd')
  // engraved rings, cut in pairs: each a dark groove with a bright lip
  const groove = (r: number, w: number, bright: number) => {
    ctx.lineWidth = w
    ctx.strokeStyle = 'rgba(30, 20, 8, 0.75)'
    ctx.beginPath(); ctx.arc(c[0], c[1] + 0.7, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = `rgba(244, 222, 160, ${bright})`
    ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); ctx.stroke()
  }
  groove(R, 1, 0.95)
  groove(R + 3, 0.6, 0.5)
  groove(R + 28, 0.6, 0.45)
  groove(R + 31, 0.6, 0.5)
  groove(R + 34, 1, 0.85)
  // the degree scale between the outer pair: every 5°, longer every 10°
  ctx.strokeStyle = 'rgba(244, 222, 160, 0.55)'
  ctx.lineWidth = 0.6
  ctx.beginPath()
  for (let d = 0; d < 360; d += 5) {
    const ang = (d * Math.PI) / 180
    const r0 = R + 28, r1 = d % 10 === 0 ? R + 31 : R + 29.6
    ctx.moveTo(c[0] + Math.cos(ang) * r0, c[1] + Math.sin(ang) * r0)
    ctx.lineTo(c[0] + Math.cos(ang) * r1, c[1] + Math.sin(ang) * r1)
  }
  ctx.stroke()
  // hour scale: 24 hours from the meridian, XII at the top (the south meridian, as on a
  // northern astrolabe), with ticks every quarter hour
  const south = project(p, [-1, 0, 0.0001], -0.999)
  const base = south ? Math.atan2(south[1] - c[1], south[0] - c[0]) : -Math.PI / 2
  ctx.strokeStyle = '#f4e9cf'
  ctx.fillStyle = '#f4e9cf'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '600 12px Vollkorn, Georgia, serif'
  const roman = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']
  for (let q = 0; q < 96; q++) {
    const ang = base + (q / 96) * Math.PI * 2
    const L = q % 4 === 0 ? 8 : 3.5
    ctx.lineWidth = q % 4 === 0 ? 1.2 : 0.6
    ctx.beginPath()
    ctx.moveTo(c[0] + Math.cos(ang) * (R + 3), c[1] + Math.sin(ang) * (R + 3))
    ctx.lineTo(c[0] + Math.cos(ang) * (R + 3 + L), c[1] + Math.sin(ang) * (R + 3 + L))
    ctx.stroke()
    if (q % 4 === 0) {
      const hr = q / 4
      // numerals run around the rim, cut in: a shadow below, the bright face above
      const lx = c[0] + Math.cos(ang) * (R + 19.5), ly = c[1] + Math.sin(ang) * (R + 19.5)
      const rot = Math.sin(ang) > 0.05 ? ang - Math.PI / 2 : ang + Math.PI / 2
      ctx.translate(lx, ly)
      ctx.rotate(rot)
      ctx.fillStyle = 'rgba(30, 20, 8, 0.7)'
      ctx.fillText(roman[hr % 12], 0, 0.8)
      ctx.fillStyle = '#f4e9cf'
      ctx.fillText(roman[hr % 12], 0, 0)
      ctx.rotate(-rot)
      ctx.translate(-lx, -ly)
    }
  }
  // the rule (alidade) through the Sun, reading the hour on the limb
  const sun = sky.bodies.find((b) => b.id === 'sun')!
  const s = project(p, mul(F.ect, eclVec(sun.tropical, 0)), -0.999)
  if (s) {
    const ang = Math.atan2(s[1] - c[1], s[0] - c[0])
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(c[0] - Math.cos(ang) * (R + 30), c[1] - Math.sin(ang) * (R + 30))
    ctx.lineTo(c[0] + Math.cos(ang) * (R + 30), c[1] + Math.sin(ang) * (R + 30))
    ctx.strokeStyle = 'rgba(30, 20, 8, 0.55)'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.strokeStyle = 'rgba(217, 180, 90, 0.92)'
    ctx.lineWidth = 2
    ctx.stroke()
    // the pin the rete and rule turn on
    ctx.fillStyle = '#d9b45a'
    ctx.beginPath(); ctx.arc(c[0], c[1], 5.5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(30, 20, 8, 0.7)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(c[0], c[1], 2.4, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.restore()
}

const CARDINALS: Array<[string, number]> = [['N', 0], ['E', 90], ['S', 180], ['W', 270]]
function claimCardinals(p: Proj) {
  for (const [, az] of CARDINALS) {
    const a = (az * Math.PI) / 180
    const s = project(p, [Math.cos(a), -Math.sin(a), -0.035], -0.8)
    if (s) boardAdd(s[0] - 8, s[1] - 9, s[0] + 8, s[1] + 9)
  }
}

function drawCardinals(ctx: CanvasRenderingContext2D, p: Proj, inst: number) {
  const pts = CARDINALS
  ctx.save()
  ctx.font = '600 13px "Public Sans", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = `rgba(200, 118, 106, ${0.5 + 0.4 * inst})`
  for (const [label, az] of pts) {
    const a = (az * Math.PI) / 180
    const s = project(p, [Math.cos(a), -Math.sin(a), -0.035], -0.8)
    if (s && s[0] > 0 && s[0] < p.w && s[1] > 0 && s[1] < p.h) ctx.fillText(label, s[0], s[1])
  }
  ctx.restore()
}

export { dot }
