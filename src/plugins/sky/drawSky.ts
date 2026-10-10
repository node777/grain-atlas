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

export function drawSky(
  ctx: CanvasRenderingContext2D, p: Proj, F: Frames, cat: Catalog, sky: SkyMoment, o: SkyOptions,
): Drawn {
  const { w, h } = p
  const brass = '#c8992f', brassDim = '#9a6f22', gold = '#d9b45a', star = '#f6ead0', madder = '#c8766a'
  const inst = o.instrument
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

  // ---- constellation figures
  if (o.showFigures) {
    const culture = cat.cultures[o.culture]
    ctx.save()
    ctx.strokeStyle = 'rgba(217, 180, 90, 0.42)'
    ctx.lineWidth = 1
    ctx.font = 'italic 12px Vollkorn, Georgia, serif'
    ctx.fillStyle = 'rgba(217, 180, 90, 0.72)'
    ctx.textAlign = 'center'
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
        if (cx > 0 && cx < w && cy > 0 && cy < h) ctx.fillText(fig.native && o.culture !== 'modern' ? `${fig.name}` : fig.name, cx, cy + 14)
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
  ctx.font = '11.5px "Public Sans", sans-serif'
  ctx.textAlign = 'left'
  const yogataras = new Set(NAKSHATRAS.map((n) => n.yogatara.hip).filter(Boolean) as number[])
  for (const d of drawn.stars) {
    const isYoga = yogataras.has(d.hip)
    if (d.mag > 1.3 + zoomK * 0.8 && !(isYoga && o.instrument > 0.2)) continue
    const nm = starName(cat, d.hip)
    if (!nm) continue
    ctx.fillStyle = isYoga ? 'rgba(217, 180, 90, 0.95)' : 'rgba(246, 234, 208, 0.66)'
    ctx.fillText(nm, d.x + 6, d.y - 5)
    if (isYoga) {
      ctx.strokeStyle = 'rgba(217, 180, 90, 0.7)'
      ctx.beginPath(); ctx.arc(d.x, d.y, 5.5, 0, Math.PI * 2); ctx.stroke()
    }
  }

  // ---- the grahas
  ctx.textAlign = 'left'
  for (const b of sky.bodies) {
    const v = mul(F.ect, eclVec(b.tropical, b.latitude))
    const s = project(p, v, -0.6)
    if (!s) continue
    drawn.bodies.push({ x: s[0], y: s[1], id: b.id })
    const isSel = o.selected?.kind === 'body' && o.selected.id === b.id
    if (b.id === 'sun') {
      const r = 7 * Math.sqrt(zoomK)
      const halo = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], r * 4)
      halo.addColorStop(0, 'rgba(241, 201, 139, 0.55)')
      halo.addColorStop(1, 'rgba(241, 201, 139, 0)')
      ctx.fillStyle = halo
      ctx.fillRect(s[0] - r * 4, s[1] - r * 4, r * 8, r * 8)
      ctx.fillStyle = gold
      ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, Math.PI * 2); ctx.fill()
    } else if (b.id === 'moon') {
      const r = 6.5 * Math.sqrt(zoomK)
      const sun = sky.bodies.find((x) => x.id === 'sun')!
      drawMoon(ctx, s[0], s[1], r, ((b.tropical - sun.tropical) % 360 + 360) % 360)
    } else {
      ctx.fillStyle = b.id === 'rahu' || b.id === 'ketu' ? 'rgba(200, 118, 106, 0.9)' : 'rgba(246, 234, 208, 0.95)'
      ctx.beginPath(); ctx.arc(s[0], s[1], b.id === 'rahu' || b.id === 'ketu' ? 2.5 : 3.4, 0, Math.PI * 2); ctx.fill()
    }
    ctx.font = '600 13px "Public Sans", sans-serif'
    ctx.fillStyle = isSel ? '#f6ead0' : 'rgba(224, 165, 74, 0.95)'
    ctx.fillText(`${GLYPH[b.id] ?? ''} ${VEDIC[b.id] ?? b.id}${b.retrograde && b.id !== 'rahu' && b.id !== 'ketu' ? ' ℞' : ''}`, s[0] + 9, s[1] + 4)
    if (isSel) {
      ctx.strokeStyle = star
      ctx.beginPath(); ctx.arc(s[0], s[1], 12, 0, Math.PI * 2); ctx.stroke()
    }
  }

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
      ctx.fillText(NAKSHATRAS[i]?.name ?? String(i + 1), mid[0], mid[1])
    }
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
      ctx.fillText(o.lens === 'western' || o.lens === 'grain' ? (r?.western ?? '') : (r?.name ?? ''), mid[0], mid[1] + 13)
    }
  }
  ctx.restore()
}

function drawLimb(ctx: CanvasRenderingContext2D, p: Proj, F: Frames, sky: SkyMoment, a: number) {
  // The limb sits on the far tropic: its projected circle is centred on the pole.
  const pole = mul(F.eqd, [0, 0, 1])
  const far = circlePoints(pole, 90 + sky.obliquity, 120).map((v) => project(p, v, -0.999)).filter(Boolean) as Array<[number, number]>
  const c = project(p, pole, -0.999)
  if (!c || far.length < 10) return
  const R = far.reduce((s, q) => s + Math.hypot(q[0] - c[0], q[1] - c[1]), 0) / far.length
  ctx.save()
  ctx.globalAlpha = a
  // the mater's rim: a brass annulus
  ctx.beginPath()
  ctx.arc(c[0], c[1], R + 34, 0, Math.PI * 2)
  ctx.arc(c[0], c[1], R, 0, Math.PI * 2, true)
  const g = ctx.createRadialGradient(c[0], c[1], R, c[0], c[1], R + 34)
  g.addColorStop(0, '#5a4220')
  g.addColorStop(0.5, '#8a6528')
  g.addColorStop(1, '#4a3518')
  ctx.fillStyle = g
  ctx.fill('evenodd')
  ctx.strokeStyle = '#d9b45a'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(c[0], c[1], R + 34, 0, Math.PI * 2); ctx.stroke()
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
    const L = q % 4 === 0 ? 10 : 4
    ctx.lineWidth = q % 4 === 0 ? 1.2 : 0.6
    ctx.beginPath()
    ctx.moveTo(c[0] + Math.cos(ang) * R, c[1] + Math.sin(ang) * R)
    ctx.lineTo(c[0] + Math.cos(ang) * (R + L), c[1] + Math.sin(ang) * (R + L))
    ctx.stroke()
    if (q % 4 === 0) {
      const hr = q / 4
      ctx.fillText(roman[hr % 12], c[0] + Math.cos(ang) * (R + 22), c[1] + Math.sin(ang) * (R + 22))
    }
  }
  // the rule (alidade) through the Sun, reading the hour on the limb
  const sun = sky.bodies.find((b) => b.id === 'sun')!
  const s = project(p, mul(F.ect, eclVec(sun.tropical, 0)), -0.999)
  if (s) {
    const ang = Math.atan2(s[1] - c[1], s[0] - c[0])
    ctx.strokeStyle = 'rgba(217, 180, 90, 0.9)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(c[0] - Math.cos(ang) * (R + 30), c[1] - Math.sin(ang) * (R + 30))
    ctx.lineTo(c[0] + Math.cos(ang) * (R + 30), c[1] + Math.sin(ang) * (R + 30))
    ctx.stroke()
    ctx.fillStyle = '#d9b45a'
    ctx.beginPath(); ctx.arc(c[0], c[1], 5, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

function drawCardinals(ctx: CanvasRenderingContext2D, p: Proj, inst: number) {
  const pts: Array<[string, number]> = [['N', 0], ['E', 90], ['S', 180], ['W', 270]]
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
