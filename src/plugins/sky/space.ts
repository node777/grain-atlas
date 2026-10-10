// The space behind the instrument: a deep warm night, a faint dusting of stars and a soft band
// of dusty glow. It is imagined, not the real sky (the real one is on the rete), so it stays
// faint, and it is painted once per size into its own canvas -- nothing here animates.

import { type Palette, mix, rgba } from './palette'
import { STAR_COLS } from './rete'

/** A small seeded generator, so the same space comes back on every visit. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (r: () => number) => (r() + r() + r() + r() - 2) / 2

/** Paint the space into `cv` at its current CSS size; returns the key it was painted for. */
export function paintSpace(cv: HTMLCanvasElement, pal: Palette): string {
  const rect = cv.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  const w = Math.max(1, rect.width), h = Math.max(1, rect.height)
  const W = Math.round(w * dpr), H = Math.round(h * dpr)
  const key = `${W}x${H}|${pal.mode}`
  if (cv.dataset.key === key) return key
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')
  if (!ctx) return key
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const r = rng(20261010)

  // the night: warm at the heart, deeper toward the corners
  const g = ctx.createRadialGradient(w * 0.42, h * 0.46, 0, w * 0.42, h * 0.46, Math.hypot(w, h) * 0.62)
  g.addColorStop(0, mix(pal.sky, pal.haze, 0.35))
  g.addColorStop(0.5, pal.sky)
  g.addColorStop(1, mix(pal.skyDeep, '#000000', 0.35))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // the dusty band: a broad diagonal of soft clouds in the plant dyes, with darker lanes
  const diag = Math.hypot(w, h)
  ctx.save()
  ctx.translate(w * 0.5, h * 0.52)
  ctx.rotate(-0.5)
  const dyes = [pal.haze, pal.annatto, pal.madder, pal.elder, pal.weld, pal.haze, pal.starWarm]
  const cloud = (x: number, y: number, rad: number, col: string, a: number) => {
    const cg = ctx.createRadialGradient(x, y, 0, x, y, rad)
    cg.addColorStop(0, rgba(col, a))
    cg.addColorStop(0.55, rgba(col, a * 0.45))
    cg.addColorStop(1, rgba(col, 0))
    ctx.fillStyle = cg
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  const s = Math.min(w, h) / 900
  for (let i = 0; i < 70; i++) {
    const x = (r() - 0.5) * diag * 1.1
    const y = gauss(r) * h * 0.13
    const col = dyes[Math.floor(r() * dyes.length)]
    const a = col === pal.haze ? 0.1 + r() * 0.1 : 0.018 + r() * 0.03
    cloud(x, y, (60 + r() * 200) * s, col, a)
  }
  // a brighter, warmer knot toward one end, as the galaxy's heart
  cloud(-diag * 0.18, h * 0.02, 260 * s, pal.starWarm, 0.035)
  cloud(-diag * 0.2, h * 0.0, 140 * s, pal.annatto, 0.03)
  // dust lanes
  for (let i = 0; i < 26; i++) {
    const x = (r() - 0.5) * diag * 0.95
    const y = gauss(r) * h * 0.04
    cloud(x, y, (30 + r() * 90) * s, pal.skyDeep, 0.25 + r() * 0.2)
  }
  ctx.restore()

  // stars: most scattered, some gathered along the band; a very few with a soft halo
  const n = Math.round((w * h) / 1100)
  const band = (x: number, y: number) => {
    // distance from the band's axis, for gathering stars
    const cx = x - w * 0.5, cy = y - h * 0.52
    return Math.abs(-Math.sin(-0.5) * cx + Math.cos(-0.5) * cy)
  }
  for (let i = 0; i < n; i++) {
    let x = r() * w, y = r() * h
    if (r() < 0.4) {
      // pull toward the band
      const t = (r() - 0.5) * diag
      const off = gauss(r) * h * 0.12
      x = w * 0.5 + Math.cos(-0.5) * t - Math.sin(-0.5) * off
      y = h * 0.52 + Math.sin(-0.5) * t + Math.cos(-0.5) * off
    }
    const near = Math.max(0, 1 - band(x, y) / (h * 0.3))
    const m = Math.pow(r(), 7)
    const rad = 0.3 + m * 1.25
    const a = Math.min(0.85, 0.18 + Math.pow(r(), 2.5) * 0.45 + m * 0.4 + near * 0.08)
    const col = STAR_COLS[Math.min(5, Math.floor(r() * r() * 6.5))]
    ctx.fillStyle = rgba(col, a)
    if (rad < 0.7) ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    else { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill() }
    if (m > 0.45) {
      const hg = ctx.createRadialGradient(x, y, 0, x, y, rad * 6)
      hg.addColorStop(0, rgba(col, 0.18))
      hg.addColorStop(1, rgba(col, 0))
      ctx.fillStyle = hg
      ctx.fillRect(x - rad * 6, y - rad * 6, rad * 12, rad * 12)
    }
  }

  // a last, gentle vignette
  const v = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.35, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.6)
  v.addColorStop(0, 'rgba(8, 6, 4, 0)')
  v.addColorStop(1, 'rgba(8, 6, 4, 0.55)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, w, h)
  cv.dataset.key = key
  return key
}
