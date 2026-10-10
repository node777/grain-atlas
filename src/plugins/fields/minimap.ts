// The minimap: every island at a glance, rooms you have walked lit gold, and the window you are
// looking through drawn as a brass frame. The islands are painted once into an offscreen base;
// each redraw only copies it and draws the frame. In the map view the base is a small chart:
// parchment land in ink, its rivers, and a dot for each settlement.

import type { Camera } from '@/ui/useCanvas'
import type { World } from './layout'
import type { Geo } from './draw'
import type { Atlas } from './atlas'

export const MINI_W = 184
export const MINI_H = 132
const PAD = 10

export class Minimap {
  private base: HTMLCanvasElement | null = null
  private key = ''
  scale = 1
  ox = 0
  oy = 0

  private fit(geo: Geo) {
    const b = geo.bounds
    const bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0)
    this.scale = Math.min((MINI_W - PAD * 2) / bw, (MINI_H - PAD * 2) / bh)
    this.ox = MINI_W / 2 - ((b.x0 + b.x1) / 2) * this.scale
    this.oy = MINI_H / 2 - ((b.y0 + b.y1) / 2) * this.scale
  }

  toWorld(mx: number, my: number) {
    return { x: (mx - this.ox) / this.scale, y: (my - this.oy) / this.scale }
  }

  private build(world: World, geo: Geo, C: Record<string, string>, discovered: Set<string>, dpr: number, atlas?: Atlas | null) {
    this.fit(geo)
    const cv = this.base ?? document.createElement('canvas')
    cv.width = Math.round(MINI_W * dpr)
    cv.height = Math.round(MINI_H * dpr)
    const ctx = cv.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, MINI_W, MINI_H)
    if (atlas) { this.buildMap(ctx, world, atlas, C, discovered); this.base = cv; return }
    world.regions.forEach((land, i) => {
      const accent = C[`--el-${land.region.element}`]
      ctx.save()
      ctx.translate(this.ox, this.oy)
      ctx.scale(this.scale, this.scale)
      ctx.fillStyle = accent
      ctx.globalAlpha = 0.16
      ctx.fill(geo.hulls[i])
      ctx.strokeStyle = accent
      ctx.globalAlpha = 0.75
      ctx.lineWidth = 1 / this.scale
      ctx.stroke(geo.hulls[i])
      ctx.restore()
      for (const room of land.rooms) {
        const x = room.x * this.scale + this.ox, y = room.y * this.scale + this.oy
        const r = Math.max(0.9, room.r * this.scale)
        const lit = discovered.has(room.path)
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = lit ? C['--gold'] : accent
        ctx.globalAlpha = lit ? 0.75 : 0.3
        ctx.fill()
      }
    })
    ctx.globalAlpha = 1
    this.base = cv
  }

  private buildMap(ctx: CanvasRenderingContext2D, world: World, atlas: Atlas, C: Record<string, string>, discovered: Set<string>) {
    const s = this.scale
    ctx.save()
    ctx.translate(this.ox, this.oy)
    ctx.scale(s, s)
    ctx.lineJoin = 'round'
    const shape = (pts: Float32Array) => {
      ctx.beginPath()
      for (let i = 0; i < pts.length; i += 8) (i ? ctx.lineTo(pts[i], pts[i + 1]) : ctx.moveTo(pts[i], pts[i + 1]))
      ctx.closePath()
    }
    atlas.coastPts.forEach((pts, i) => {
      shape(pts)
      ctx.strokeStyle = C['--ink']
      ctx.globalAlpha = 0.25
      ctx.lineWidth = 4 / s
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle = C['--surface-2']
      ctx.fill()
      ctx.fillStyle = C[`--el-${world.regions[i].region.element}`]
      ctx.globalAlpha = 0.14
      ctx.fill()
      ctx.globalAlpha = 0.8
      ctx.lineWidth = 0.8 / s
      ctx.stroke()
    })
    ctx.globalAlpha = 0.7
    ctx.strokeStyle = C['--ink']
    ctx.lineWidth = 0.7 / s
    for (const rv of atlas.rivers) {
      ctx.beginPath()
      for (let i = 0; i < rv.pts.length; i += 2) (i ? ctx.lineTo(rv.pts[i], rv.pts[i + 1]) : ctx.moveTo(rv.pts[i], rv.pts[i + 1]))
      ctx.lineWidth = (rv.main ? 0.9 : 0.6) / s
      ctx.stroke()
    }
    for (const lk of atlas.lakes) {
      ctx.beginPath()
      for (let i = 0; i < lk.pts.length; i += 2) (i ? ctx.lineTo(lk.pts[i], lk.pts[i + 1]) : ctx.moveTo(lk.pts[i], lk.pts[i + 1]))
      ctx.closePath()
      ctx.fillStyle = C['--page']
      ctx.fill()
      ctx.lineWidth = 0.6 / s
      ctx.stroke()
    }
    ctx.restore()
    for (const st of atlas.settlements) {
      if (st.n < 4) continue
      const x = st.x * s + this.ox, y = st.y * s + this.oy
      const r = Math.max(0.6, Math.min(2.2, Math.sqrt(st.n) * 0.12))
      ctx.fillStyle = st.houses * 2 >= st.n ? C['--madder'] : C['--weld']
      ctx.globalAlpha = 0.85
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    // walked rooms still show gold
    for (const land of world.regions) for (const room of land.rooms) {
      if (!discovered.has(room.path)) continue
      ctx.strokeStyle = C['--gold']
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 1.2
      ctx.beginPath(); ctx.arc(room.x * s + this.ox, room.y * s + this.oy, Math.max(1.5, room.r * s), 0, Math.PI * 2); ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  draw(
    cv: HTMLCanvasElement, world: World, geo: Geo, C: Record<string, string>, discovered: Set<string>,
    cam: Camera, view: { w: number; h: number; dpr: number }, key: string, atlas?: Atlas | null,
  ) {
    const dpr = view.dpr
    const k = `${key}|${dpr}`
    if (k !== this.key || !this.base) { this.build(world, geo, C, discovered, dpr, atlas); this.key = k }
    const pw = Math.round(MINI_W * dpr), ph = Math.round(MINI_H * dpr)
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph }
    const ctx = cv.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, MINI_W, MINI_H)
    ctx.drawImage(this.base!, 0, 0, MINI_W, MINI_H)
    // the window onto the world
    const x0 = (cam.x - view.w / 2 / cam.k) * this.scale + this.ox
    const y0 = (cam.y - view.h / 2 / cam.k) * this.scale + this.oy
    const rw = (view.w / cam.k) * this.scale, rh = (view.h / cam.k) * this.scale
    ctx.strokeStyle = C['--gold']
    ctx.fillStyle = C['--gold']
    if (rw < 7 || rh < 7) {
      // too small to frame: mark the spot with a cross
      const cx = x0 + rw / 2, cy = y0 + rh / 2
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(cx - 6, cy); ctx.lineTo(cx - 2, cy); ctx.moveTo(cx + 2, cy); ctx.lineTo(cx + 6, cy)
      ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy - 2); ctx.moveTo(cx, cy + 2); ctx.lineTo(cx, cy + 6)
      ctx.stroke()
      return
    }
    // keep the frame on the card even when the view is wider than the world
    const fx0 = Math.max(1, x0), fy0 = Math.max(1, y0)
    const fx1 = Math.min(MINI_W - 1, x0 + rw), fy1 = Math.min(MINI_H - 1, y0 + rh)
    if (fx1 - fx0 < 4 || fy1 - fy0 < 4) return
    ctx.globalAlpha = 0.1
    ctx.beginPath(); ctx.roundRect(fx0, fy0, fx1 - fx0, fy1 - fy0, 3); ctx.fill()
    ctx.globalAlpha = 0.95
    ctx.lineWidth = 1.3
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}
