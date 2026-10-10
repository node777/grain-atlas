// The Heavens: grain's own history as a sky. Every stamped file is a star, set at the bearing
// where the Moon stood among the nakshatras when it was written, and at a distance from the
// centre that grows with time -- the first stamps near the seed, the newest at the rim.
// Rooms become constellations, drawn in the order their pages were written.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/core/store'
import { navigate } from '@/core/router'
import type { ViewProps } from '@/core/registry'
import { settings } from '@/core/settings'
import { repo, stampOf } from '@/grain/repo'
import { REGIONS, regionOf } from '@/grain/rooms'
import { quickMoment, quickLine, plainDate } from '@/astro/describe'
import { NAKSHATRAS } from '@/astro/data/nakshatras'
import { useCanvas, cssVar, type CanvasApi } from '@/ui/useCanvas'
import { MASAS } from '@/astro/panchanga'
import { sprigOf } from '@/grain/stamps'
import './heavens.css'

interface HStar { path: string; t: number; angle: number; size: number; region: string; element: string; nak: number; room: string }

const R_IN = 90, R_OUT = 900

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
    // month rings: each new month of grain's life is a circle
    ctx.font = '11px "Source Code Pro", monospace'
    ctx.fillStyle = 'rgba(200, 153, 47, 0.6)'
    ctx.textAlign = 'left'
    const d0 = new Date(data.t0)
    for (let m = 0; m < 48; m++) {
      const d = new Date(d0.getFullYear(), d0.getMonth() + m + 1, 1)
      if (d.getTime() > data.t1) break
      const rr = radiusOf(d.getTime()) * k
      ctx.strokeStyle = 'rgba(154, 111, 34, 0.28)'
      ctx.setLineDash([2, 6])
      ctx.beginPath(); ctx.arc(o.x, o.y, rr, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillText(d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' }), o.x + 4, o.y - rr - 3)
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

    // the stars
    for (const s of data.stars) {
      if (!visible(s)) continue
      const p = pos(s)
      const q = a.toScreen(p.x, p.y)
      if (q.x < -5 || q.x > w + 5 || q.y < -5 || q.y > h + 5) continue
      const dim = lineRoom !== undefined && s.room !== lineRoom
      const rad = Math.max(0.9, (s.size - 1.6) * 0.9 * Math.sqrt(Math.max(0.6, k * 2)))
      const fresh = playing && cutoff - s.t < (data.t1 - data.t0) * 0.02
      ctx.fillStyle = C[`--el-${s.element}`] || '#f6ead0'
      ctx.globalAlpha = dim ? 0.18 : 0.92
      ctx.beginPath(); ctx.arc(q.x, q.y, fresh ? rad * 2.2 : rad, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1
    }
    if (hover) {
      const p = pos(hover.s)
      const q = a.toScreen(p.x, p.y)
      ctx.strokeStyle = '#f6ead0'
      ctx.beginPath(); ctx.arc(q.x, q.y, 8, 0, Math.PI * 2); ctx.stroke()
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
      {hs && hq && hover && (
        <div className="fields-tip panel linen-fine" style={{ left: hover.x + 14, top: hover.y + 14, position: 'absolute' }}>
          <div style={{ fontStyle: 'italic' }}>{r.entries.get(hs.path)?.meta?.title ?? sprigOf(hs.path)}</div>
          <div className="mono faint" style={{ fontSize: 11.5 }}>{hs.path}</div>
          <div style={{ fontSize: 14 }}>{quickLine(hq)}</div>
          <div className="mono faint" style={{ fontSize: 11.5 }}>{plainDate(new Date(hs.t))}</div>
        </div>
      )}
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
