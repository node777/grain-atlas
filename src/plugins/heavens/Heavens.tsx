// The Heavens: grain's own history as a sky. Every stamped file is a star, set at the bearing
// where the Moon stood among the nakshatras when it was written, and at a distance from the
// centre that grows with time -- the first stamps near the seed, the newest at the rim.
// Rooms become constellations, drawn in the order their pages were written.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/core/store'
import { navigate } from '@/core/router'
import type { ViewProps } from '@/core/registry'
import { settings, prefersStill } from '@/core/settings'
import { repo, stampOf } from '@/grain/repo'
import { REGIONS, regionOf, regionById } from '@/grain/rooms'
import { quickMoment, quickLine, plainDate } from '@/astro/describe'
import { NAKSHATRAS } from '@/astro/data/nakshatras'
import { useCanvas, cssVar, type CanvasApi } from '@/ui/useCanvas'
import { MASAS } from '@/astro/panchanga'
import { sprigOf } from '@/grain/stamps'
import './heavens.css'

interface HStar { path: string; t: number; angle: number; size: number; region: string; element: string; nak: number; room: string }

const R_IN = 90, R_OUT = 900
const TRAILS = 160                  // at most this many comets in the sky at once
const MONTH_ANGLES = [-90, -80, -100, -70, -110, -60, -120, -50, -130].map((d) => (d * Math.PI) / 180)

const hexA = (hex: string, a: number) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

export function Heavens({ route }: ViewProps) {
  const r = useStore(repo, (s) => ({ entries: s.entries, version: s.version }))
  const ayan = useStore(settings, (s) => s.ayanamsa)
  const lon = useStore(settings, (s) => s.place.lon)
  const [regionFilter, setRegionFilter] = useState<string | null>(null)
  const room = route.params.room
  const [hover, setHover] = useState<{ s: HStar; x: number; y: number } | null>(null)
  const [until, setUntil] = useState(1)
  const [playing, setPlaying] = useState(false)
  const colors = useRef<Record<string, string>>({})

  const data = useMemo(() => {
    const stars: HStar[] = []
    for (const e of r.entries.values()) {
      if (e.kind === 'dir') continue
      const st = stampOf(e)
      if (!st || st.source === 'commit') continue
      // keep to the life of the tree: fixtures sometimes carry far-future or ancient sample stamps
      if (st.date.getTime() > Date.now() + 86400000 || st.date.getTime() < Date.UTC(2020, 0, 1)) continue
      const q = quickMoment(st.date, lon, ayan)
      const reg = regionOf(e.path)
      stars.push({
        path: e.path, t: st.date.getTime(), angle: q.moonSidereal, size: Math.log10(Math.max(100, e.size)),
        region: reg.id, element: reg.element, nak: q.nakshatra, room: e.path.includes('/') ? e.path.split('/')[0] : '',
      })
    }
    stars.sort((a, b) => a.t - b.t)
    const t0 = stars[0]?.t ?? Date.now(), t1 = stars[stars.length - 1]?.t ?? Date.now()
    return { stars, t0, t1 }
  }, [r.version, ayan, lon])

  // distance from the seed follows the rank of a moment among all stamps, so busy weeks spread
  // out instead of crowding the rim
  const times = useMemo(() => data.stars.map((s) => s.t), [data])
  const radiusOf = (t: number) => {
    if (!times.length) return R_IN
    let lo = 0, hi = times.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < t) lo = mid + 1; else hi = mid }
    const u = lo / times.length
    const lin = (t - data.t0) / Math.max(1, data.t1 - data.t0)
    return R_IN + (0.75 * u + 0.25 * lin) * (R_OUT - R_IN)
  }
  const pos = (s: HStar) => {
    // 0° sidereal (start of Ashvini) at the top, the nakshatras running clockwise like a dial
    const a = ((s.angle - 90) * Math.PI) / 180
    const rr = radiusOf(s.t)
    return { x: Math.cos(a) * rr, y: Math.sin(a) * rr }
  }

  useEffect(() => {
    colors.current = Object.fromEntries(['--el-aether', '--el-air', '--el-fire', '--el-water', '--el-earth', '--gold', '--brass', '--brass-dim', '--star'].map((n) => [n, cssVar(n)]))
  }, [])

  const cutoff = data.t0 + (data.t1 - data.t0) * until
  const visible = (s: HStar) => s.t <= cutoff && (!regionFilter || s.region === regionFilter)

  const { ref, api } = useCanvas({
    minK: 0.2, maxK: 20, animate: playing,
    draw: (ctx, a) => drawHeavens(ctx, a),
    onHover: (sx, sy, a) => {
      if (sx < 0) { setHover(null); return }
      const s = nearest(sx, sy, a)
      setHover(s ? { s, x: sx, y: sy } : null)
    },
    onPick: (sx, sy, a) => {
      const s = nearest(sx, sy, a)
      if (s) navigate('heavens', '', { ...route.params, open: s.path })
    },
  })

  const nearest = (sx: number, sy: number, a: CanvasApi): HStar | null => {
    let best: HStar | null = null, bd = 9
    for (const s of data.stars) {
      if (!visible(s)) continue
      const p = pos(s)
      const q = a.toScreen(p.x, p.y)
      const d = Math.hypot(q.x - sx, q.y - sy)
      if (d < bd) { bd = d; best = s }
    }
    return best
  }

  useEffect(() => {
    const s = api.size.current
    api.camera.current = { x: 0, y: -90, k: (Math.min(s.w, s.h) * 0.42) / R_OUT }
    api.redraw()
  }, [data])
  useEffect(() => api.redraw(), [regionFilter, room, until, hover])
  useEffect(() => {
    if (!playing) return
    let raf = 0, last = performance.now()
    const tick = (t: number) => {
      const dt = (t - last) / 1000
      last = t
      setUntil((u) => {
        const n = u + dt / 14
        if (n >= 1) { setPlaying(false); return 1 }
        return n
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  function drawHeavens(ctx: CanvasRenderingContext2D, a: CanvasApi) {
    const { w, h } = a.size.current
    const C = colors.current
    const k = a.camera.current.k
    const o = a.toScreen(0, 0)
    const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R_OUT * k * 1.2)
    g.addColorStop(0, '#221c16')
    g.addColorStop(1, '#100d0a')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    // nakshatra sectors and names around the rim
    ctx.save()
    for (let i = 0; i < 27; i++) {
      const a0 = ((i * 360) / 27 - 90) * (Math.PI / 180)
      ctx.strokeStyle = 'rgba(154, 111, 34, 0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(o.x + Math.cos(a0) * R_IN * k, o.y + Math.sin(a0) * R_IN * k)
      ctx.lineTo(o.x + Math.cos(a0) * (R_OUT + 40) * k, o.y + Math.sin(a0) * (R_OUT + 40) * k)
      ctx.stroke()
      const am = a0 + (Math.PI / 27)
      const lx = o.x + Math.cos(am) * (R_OUT + 70) * k, ly = o.y + Math.sin(am) * (R_OUT + 70) * k
      ctx.save()
      ctx.translate(lx, ly)
      ctx.rotate(am + Math.PI / 2)
      ctx.font = `italic ${Math.max(11, Math.min(18, 15 * k * 2.2))}px Vollkorn, Georgia, serif`
      ctx.fillStyle = 'rgba(233, 220, 192, 0.8)'
      ctx.textAlign = 'center'
      ctx.fillText(NAKSHATRAS[i]?.name ?? '', 0, 0)
      ctx.restore()
    }
    // month rings: each new month of grain's life is a circle. Names sit on the ring's crown,
    // or step along it when an earlier month already holds that spot
    ctx.font = '11px "Source Code Pro", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const placed: number[] = []
    const free = (x0: number, y0: number, x1: number, y1: number) => {
      for (let i = 0; i < placed.length; i += 4) if (x0 < placed[i + 2] && x1 > placed[i] && y0 < placed[i + 3] && y1 > placed[i + 1]) return false
      return true
    }
    const d0 = new Date(data.t0)
    const months: Array<{ rr: number; text: string }> = []
    for (let m = 0; m < 48; m++) {
      const d = new Date(d0.getFullYear(), d0.getMonth() + m + 1, 1)
      if (d.getTime() > data.t1) break
      const rr = radiusOf(d.getTime()) * k
      ctx.strokeStyle = 'rgba(154, 111, 34, 0.28)'
      ctx.setLineDash([2, 6])
      ctx.beginPath(); ctx.arc(o.x, o.y, rr, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
      months.push({ rr, text: d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) })
    }
    // the newest months first: they have the widest rings, and are the ones most looked for
    for (let i = months.length - 1; i >= 0; i--) {
      const { rr, text } = months[i]
      const tw = ctx.measureText(text).width
      for (const a of MONTH_ANGLES) {
        const x = o.x + Math.cos(a) * rr, y = o.y + Math.sin(a) * rr
        const x0 = x - tw / 2 - 4, y0 = y - 13, x1 = x + tw / 2 + 4, y1 = y + 2
        if (!free(x0, y0, x1, y1)) continue
        placed.push(x0, y0, x1, y1)
        ctx.fillStyle = 'rgba(16, 13, 10, 0.72)'
        ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 4); ctx.fill()
        ctx.fillStyle = 'rgba(200, 153, 47, 0.8)'
        ctx.fillText(text, x, y - 2)
        break
      }
    }
    // while the history plays (or is held part way), the front of time is a faint brass ring
    if (until < 1) {
      ctx.strokeStyle = 'rgba(217, 180, 90, 0.38)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(o.x, o.y, radiusOf(cutoff) * k, 0, Math.PI * 2); ctx.stroke()
    }
    // the seed at the centre
    ctx.fillStyle = C['--gold']
    ctx.beginPath(); ctx.ellipse(o.x, o.y, 5, 8, 0.4, 0, Math.PI * 2); ctx.fill()
    ctx.font = 'italic 13px Vollkorn, Georgia, serif'
    ctx.fillStyle = 'rgba(233, 220, 192, 0.85)'
    ctx.textAlign = 'center'
    ctx.fillText('the first stamp', o.x, o.y + 24)
    ctx.restore()

    // constellations: one room's pages joined in the order they were written
    const lineRoom = room ?? hover?.s.room
    if (lineRoom !== undefined) {
      const pts = data.stars.filter((s) => s.room === lineRoom && visible(s))
      ctx.strokeStyle = 'rgba(217, 180, 90, 0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      pts.forEach((s, i) => {
        const p = pos(s)
        const q = a.toScreen(p.x, p.y)
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y)
      })
      ctx.stroke()
    }

    // comets: the newest stars, while the history plays, trail light back toward the seed
    const freshSpan = (data.t1 - data.t0) * 0.05
    const trails = playing && !prefersStill()
    if (trails) {
      ctx.save()
      ctx.lineCap = 'round'
      let drawnTrails = 0
      for (let i = data.stars.length - 1; i >= 0 && drawnTrails < TRAILS; i--) {
        const s = data.stars[i]
        if (s.t > cutoff) continue
        const age = (cutoff - s.t) / freshSpan
        if (age >= 1) break
        if (!visible(s)) continue
        const p = pos(s)
        const q = a.toScreen(p.x, p.y)
        if (q.x < -40 || q.x > w + 40 || q.y < -40 || q.y > h + 40) continue
        const f = 1 - age
        const dx = o.x - q.x, dy = o.y - q.y, d = Math.hypot(dx, dy) || 1
        const len = (8 + 34 * f) * Math.min(1.6, Math.max(0.7, k * 2))
        const tx = q.x + (dx / d) * len, ty = q.y + (dy / d) * len
        const col = C[`--el-${s.element}`] || '#f6ead0'
        const lg = ctx.createLinearGradient(q.x, q.y, tx, ty)
        lg.addColorStop(0, hexA(col, 0.55 * f))
        lg.addColorStop(1, hexA(col, 0))
        ctx.strokeStyle = lg
        ctx.lineWidth = 0.8 + 1.3 * f
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(tx, ty); ctx.stroke()
        drawnTrails++
      }
      ctx.restore()
    }

    // the stars
    for (const s of data.stars) {
      if (!visible(s)) continue
      const p = pos(s)
      const q = a.toScreen(p.x, p.y)
      if (q.x < -5 || q.x > w + 5 || q.y < -5 || q.y > h + 5) continue
      const dim = lineRoom !== undefined && s.room !== lineRoom
      const rad = Math.max(0.9, (s.size - 1.6) * 0.9 * Math.sqrt(Math.max(0.6, k * 2)))
      const f = playing ? 1 - (cutoff - s.t) / freshSpan : 0
      ctx.fillStyle = C[`--el-${s.element}`] || '#f6ead0'
      ctx.globalAlpha = dim ? 0.18 : 0.92
      ctx.beginPath(); ctx.arc(q.x, q.y, f > 0 ? rad * (1 + 1.1 * f) : rad, 0, Math.PI * 2); ctx.fill()
      if (f > 0.5) {
        // a bright head on the newest
        ctx.fillStyle = '#f6ead0'
        ctx.globalAlpha = (f - 0.5) * 1.6
        ctx.beginPath(); ctx.arc(q.x, q.y, rad * 0.6, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    if (hover) {
      const p = pos(hover.s)
      const q = a.toScreen(p.x, p.y)
      ctx.strokeStyle = 'rgba(246, 234, 208, 0.9)'
      ctx.lineWidth = 1.2
      ctx.beginPath(); ctx.arc(q.x, q.y, 7, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = 'rgba(217, 180, 90, 0.35)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(q.x, q.y, 11, 0, Math.PI * 2); ctx.stroke()
    }
  }

  const hs = hover?.s
  const hq = hs ? quickMoment(new Date(hs.t), lon, ayan) : null
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of data.stars) c[s.region] = (c[s.region] ?? 0) + 1
    return c
  }, [data])

  return (
    <div className="heavens">
      <canvas ref={ref} className="heavens-canvas" aria-label="grain's history as a sky of its stamped files" />
      <div className="heavens-bar panel">
        <div className="sans faint" style={{ fontSize: 12 }}>{data.stars.length.toLocaleString()} stamped pages, set where the Moon stood when each was written</div>
        <div className="dial-row" style={{ marginTop: 6 }}>
          <button className="chip" aria-pressed={!regionFilter} onClick={() => setRegionFilter(null)}>all</button>
          {REGIONS.filter((rg) => counts[rg.id]).map((rg) => (
            <button key={rg.id} className="chip" aria-pressed={regionFilter === rg.id} onClick={() => setRegionFilter(regionFilter === rg.id ? null : rg.id)}>
              <span className="swatch" style={{ background: `var(--el-${rg.element})` }} />{rg.name.replace(/^The /, '')} <span className="faint">{counts[rg.id]}</span>
            </button>
          ))}
        </div>
        <div className="dial-row" style={{ marginTop: 8 }}>
          <button className="ascii-btn" onClick={() => { if (until >= 1) setUntil(0); setPlaying(!playing) }}>{playing ? '[ pause ]' : '[ play the history ]'}</button>
          <input type="range" min={0} max={1} step={0.001} value={until} onChange={(e) => { setPlaying(false); setUntil(+e.target.value) }} aria-label="History until" style={{ flex: 1 }} />
          <span className="mono faint" style={{ fontSize: 11.5 }}>{new Date(cutoff).toLocaleDateString()}</span>
        </div>
        {room !== undefined && <div className="sans" style={{ fontSize: 13, marginTop: 6 }}>Constellation of <b>{room || 'the root'}</b> <button className="ascii-btn" onClick={() => navigate('heavens')}>[ clear ]</button></div>}
      </div>
      {hs && hq && hover && (() => {
        const view = api.size.current
        const flipX = hover.x > view.w - 340, flipY = hover.y > view.h - 150
        const region = regionById(hs.region)
        return (
          <div className="heavens-tip panel" style={{
            left: flipX ? undefined : hover.x + 16, right: flipX ? view.w - hover.x + 16 : undefined,
            top: flipY ? undefined : hover.y + 16, bottom: flipY ? view.h - hover.y + 16 : undefined,
          }}>
            <div className="heavens-tip-title">{r.entries.get(hs.path)?.meta?.title ?? sprigOf(hs.path)}</div>
            <div className="heavens-tip-line">{quickLine(hq)}</div>
            <div className="heavens-tip-meta sans">
              <span className="swatch" style={{ background: `var(--el-${hs.element})` }} />
              {region?.name ?? 'Uncharted'}, in {hs.room || 'the root'}
            </div>
            <div className="mono faint heavens-tip-path">{hs.path}</div>
            <div className="mono faint heavens-tip-path">{plainDate(new Date(hs.t))}</div>
          </div>
        )
      })()}
      <Ledgerette stars={data.stars} cutoff={cutoff} />
    </div>
  )
}

/** A small tally of which nakshatras grain was written under, as a bar of 27. */
function Ledgerette({ stars, cutoff }: { stars: HStar[]; cutoff: number }) {
  const counts = useMemo(() => {
    const c = new Array(27).fill(0)
    for (const s of stars) if (s.t <= cutoff) c[s.nak]++
    return c
  }, [stars, cutoff])
  const max = Math.max(1, ...counts)
  const top = counts.indexOf(max)
  return (
    <div className="heavens-tally panel">
      <div className="sans faint" style={{ fontSize: 12, marginBottom: 4 }}>pages under each nakshatra; most under <b>{NAKSHATRAS[top]?.name}</b></div>
      <div className="tally-bars">
        {counts.map((n, i) => (
          <div key={i} title={`${NAKSHATRAS[i]?.name}: ${n}`} style={{ height: `${(n / max) * 100}%` }} />
        ))}
      </div>
      <div className="sans faint" style={{ fontSize: 10.5, display: 'flex', justifyContent: 'space-between' }}><span>Ashvini</span><span>Revati</span></div>
      <div className="faint" style={{ fontSize: 11 }}>{MASAS.length} masas turn through these 27 seats each year.</div>
    </div>
  )
}
