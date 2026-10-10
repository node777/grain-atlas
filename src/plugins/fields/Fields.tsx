// The Fields: grain drawn as land. Regions are islands, rooms are fields furrowed in their
// element's colour, folders are plots within plots, and every file is a single grain.
// Rhumb lines run out from the Front Door the way a portolan chart's run from its rose.
// Rooms you have not read in yet lie under a warm mist; reading a page there clears it.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/core/store'
import { navigate, getRoute } from '@/core/router'
import type { ViewProps } from '@/core/registry'
import { repo, stampOf, lookup } from '@/grain/repo'
import { progress } from '@/grain/progress'
import { journeyById } from '@/grain/quests'
import { settings, prefersStill } from '@/core/settings'
import { useCanvas, cssVar, type CanvasApi, type Camera } from '@/ui/useCanvas'
import { Stamp } from '@/ui/Stamp'
import { layoutWorld, type Plot, type World, type Grain } from './layout'
import { buildGeo, drawFields, roomOfFile, roomOfPlot, type Geo } from './draw'
import { Minimap, MINI_W, MINI_H } from './minimap'
import './fields.css'

interface Pick { plot?: Plot; grain?: Grain; regionName?: string }

const PULSE_MS = 720
const PAN_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1],
}

const hexA = (hex: string, a: number) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** A seamless tile of soft cloud, drawn once per mode and laid over unwalked rooms. */
function fogTile(color: string): HTMLCanvasElement {
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  // a fixed little weather: the same clouds every time
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  for (let i = 0; i < 46; i++) {
    const x = rnd() * N, y = rnd() * N
    const r = 18 + rnd() * 52
    const a = 0.12 + rnd() * 0.22
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      const cx = x + dx, cy = y + dy
      if (cx + r < 0 || cx - r > N || cy + r * 0.62 < 0 || cy - r * 0.62 > N) continue
      // clouds lie long and low: a round puff squashed flat
      g.save()
      g.translate(cx, cy)
      g.scale(1, 0.62)
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r)
      gr.addColorStop(0, hexA(color, a))
      gr.addColorStop(1, hexA(color, 0))
      g.fillStyle = gr
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill()
      g.restore()
    }
  }
  return c
}

export function Fields({ route }: ViewProps) {
  const r = useStore(repo, (s) => ({ entries: s.entries, version: s.version, phase: s.phase }))
  const seeds = useStore(progress, (p) => p.seeds)
  const active = useStore(progress, (p) => p.activeJourney)
  const mode = useStore(settings, (s) => s.mode)
  const world = useMemo<World | null>(() => (r.entries.size > 1 ? layoutWorld(r.entries) : null), [r.version])
  const geo = useMemo<Geo | null>(() => (world ? buildGeo(world) : null), [world])
  const discovered = useMemo(() => {
    const out = new Set<string>()
    if (!geo) return out
    for (const p in seeds) { const room = roomOfFile(p); if (geo.roomOf.has(room)) out.add(room) }
    return out
  }, [seeds, geo])
  const [hover, setHover] = useState<Pick & { x: number; y: number } | null>(null)
  const [selected, setSelected] = useState<Plot | null>(null)
  const colors = useRef<Record<string, string>>({})
  const fog = useRef<HTMLCanvasElement | null>(null)
  const fitted = useRef(false)
  const hoverPlot = useRef<Plot | null>(null)
  const pulseT0 = useRef(0)
  const lastFly = useRef<{ k: number; t: number }>({ k: 0, t: 0 })
  const mini = useRef(new Minimap())
  const miniRef = useRef<HTMLCanvasElement>(null)
  const live = useRef({ world, geo, selected, entries: r.entries })
  live.current = { world, geo, selected, entries: r.entries }

  useEffect(() => {
    const names = ['--page', '--surface', '--surface-2', '--ink', '--ink-2', '--ink-3', '--rule', '--brass', '--brass-dim', '--gold', '--star',
      '--el-aether', '--el-air', '--el-fire', '--el-water', '--el-earth', '--invite', '--madder']
    colors.current = Object.fromEntries(names.map((n) => [n, cssVar(n)]))
    fog.current = fogTile(mode === 'stone' ? colors.current['--surface-2'] : colors.current['--ink-2'])
    api.redraw()
  }, [mode])

  const pickAt = (sx: number, sy: number, a: CanvasApi): Pick => {
    if (!world) return {}
    const w = a.toWorld(sx, sy)
    const k = a.camera.current.k
    for (const land of world.regions) {
      if (Math.hypot(w.x - land.x, w.y - land.y) > land.r * 1.25) continue
      let found: Plot | undefined
      let level: Plot[] = land.rooms
      while (level.length) {
        const hit: Plot | undefined = level.find((p) => Math.hypot(w.x - p.x, w.y - p.y) <= p.r)
        if (!hit) break
        found = hit
        if (hit.r * k < 70) break
        level = hit.children
      }
      if (found && found.r * k > 50) {
        let best: Grain | undefined, bd = 9 / k
        for (const g of found.grains) {
          const d = Math.hypot(w.x - g.x, w.y - g.y)
          if (d < bd) { bd = d; best = g }
        }
        if (best) return { plot: found, grain: best, regionName: land.region.name }
      }
      if (found) return { plot: found, regionName: land.region.name }
      return { regionName: land.region.name }
    }
    return {}
  }

  const fitK = (p: { r: number }, a: CanvasApi, share = 0.42) => {
    const s = a.size.current
    return Math.min(28, (Math.min(s.w, s.h) * share) / p.r)
  }
  const flyTo = (a: CanvasApi, to: Camera, ms = 1000) => {
    lastFly.current = { k: to.k, t: performance.now() + (prefersStill() ? 0 : ms) }
    a.flyTo(to, ms)
  }

  const { ref, api } = useCanvas({
    minK: 0.02,
    maxK: 30,
    // keep drawing only while the hover ring is still spreading
    get animate() { return hoverPlot.current !== null && !prefersStill() && performance.now() - pulseT0.current < PULSE_MS + 40 },
    draw: (ctx, a, t) => {
      if (!world || !geo) return
      const still = prefersStill()
      const u = (t - pulseT0.current) / PULSE_MS
      drawFields(ctx, a, world, geo, {
        C: colors.current, stone: mode === 'stone', seeds, activeJourney: active, selected,
        hovered: hoverPlot.current, pulse: !still && hoverPlot.current && u >= 0 && u < 1 ? u : -1,
        discovered, fog: fog.current,
      })
      if (miniRef.current) {
        mini.current.draw(miniRef.current, world, geo, colors.current, discovered, a.camera.current, a.size.current,
          `${r.version}|${mode}|${discovered.size}`)
      }
    },
    onHover: (sx, sy, a) => {
      if (sx < 0) {
        setHover(null)
        if (hoverPlot.current) { hoverPlot.current = null; a.redraw() }
        return
      }
      const p = pickAt(sx, sy, a)
      const plot = p.grain ? null : p.plot ?? null
      if (plot !== hoverPlot.current) {
        hoverPlot.current = plot
        pulseT0.current = performance.now()
        a.redraw()
      }
      setHover(p.plot || p.regionName ? { ...p, x: sx, y: sy } : null)
    },
    onPick: (sx, sy, a) => {
      const p = pickAt(sx, sy, a)
      if (p.grain) { navigate('fields', '', { open: p.grain.path }); return }
      if (p.plot) {
        setSelected(p.plot)
        flyTo(a, { x: p.plot.x, y: p.plot.y, k: fitK(p.plot, a) })
      }
    },
  })

  // fit the whole world once it exists; honour ?focus=path
  useEffect(() => {
    if (!world) return
    const s = api.size.current
    // frame the land itself (not the empty sea out to the far ring), clear of the minimap
    const b = geo!.bounds
    const fit = {
      x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2,
      k: Math.min((s.w - 480) / (b.x1 - b.x0), (s.h - 140) / (b.y1 - b.y0), (Math.min(s.w, s.h) * 1.1) / world.radius),
    }
    if (fit.k <= 0) fit.k = (Math.min(s.w, s.h) * 0.5) / world.radius
    if (!fitted.current) {
      api.camera.current = { ...fit, k: fit.k * 0.6 }
      api.flyTo(fit, 1000)
      fitted.current = true
    }
    api.redraw()
  }, [world])
  useEffect(() => {
    const target = route.params.focus ?? route.params.open
    if (!world || !target) return
    const at = world.index.get(target) ?? world.index.get(target.split('/').slice(0, -1).join('/'))
    if (at) {
      const s = api.size.current
      api.flyTo({ x: at.x, y: at.y, k: Math.min(20, Math.max(1.2, (Math.min(s.w, s.h) * 0.12) / at.r)) })
    }
  }, [world, route.params.focus, route.params.open])
  useEffect(() => api.redraw(), [seeds, active, selected, discovered])

  // keyboard: arrows or WASD wander, +/- zoom, Enter reads a plot's door, Escape lets go
  useEffect(() => {
    const held = new Set<string>()
    let raf = 0, last = 0
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      let dx = 0, dy = 0
      for (const key of held) { const v = PAN_KEYS[key]; if (v) { dx += v[0]; dy += v[1] } }
      if (dx || dy) {
        const c = api.camera.current
        const sp = (640 * dt) / c.k / (dx && dy ? Math.SQRT2 : 1)
        c.x += dx * sp
        c.y += dy * sp
        api.redraw()
      }
      raf = held.size ? requestAnimationFrame(step) : 0
    }
    const busy = (t: EventTarget | null, enter: boolean) =>
      t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || (enter && /^(BUTTON|A|SUMMARY)$/.test(t.tagName)))
    const zoomBy = (f: number) => {
      const c = api.camera.current
      api.flyTo({ x: c.x, y: c.y, k: Math.max(0.02, Math.min(30, c.k * f)) }, 240)
    }
    const centrePlot = (): Plot | undefined => {
      const s = api.size.current
      return pickAt(s.w / 2, s.h / 2, api).plot
    }
    const onDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (getRoute().params.open) return             // the reader is open: its keys, not ours
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (busy(e.target, key === 'Enter')) return
      if (PAN_KEYS[key]) {
        e.preventDefault()
        if (!held.has(key)) held.add(key)
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(step) }
        return
      }
      if (key === '+' || key === '=') { e.preventDefault(); zoomBy(1.5); return }
      if (key === '-' || key === '_') { e.preventDefault(); zoomBy(1 / 1.5); return }
      if (key === 'Escape') { setSelected(null); return }
      if (key === 'Enter') {
        const plot = hoverPlot.current ?? live.current.selected ?? centrePlot()
        if (!plot) return
        e.preventDefault()
        const readme = live.current.entries.get(plot.path)?.children.find((c) => /(^|\/)README\.md$/i.test(c))
        if (readme) navigate('fields', '', { open: readme })
        else { setSelected(plot); flyTo(api, { x: plot.x, y: plot.y, k: fitK(plot, api) }) }
      }
    }
    const onUp = (e: KeyboardEvent) => { held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key) }
    const onBlur = () => held.clear()
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [world])

  // double-click: go one plot deeper under the pointer
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const onDbl = (e: MouseEvent) => {
      const w = live.current.world
      if (!w) return
      const rect = cv.getBoundingClientRect()
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top
      const at = api.toWorld(sx, sy)
      // a flight from the first click may still be under way: measure against where it lands
      const now = performance.now()
      const k = Math.max(api.camera.current.k, now < lastFly.current.t + 200 ? lastFly.current.k : 0)
      let level: Plot[] = []
      for (const land of w.regions) if (Math.hypot(at.x - land.x, at.y - land.y) <= land.r * 1.25) level = land.rooms
      let target: Plot | undefined
      while (level.length) {
        const hit = level.find((p) => Math.hypot(at.x - p.x, at.y - p.y) <= p.r)
        if (!hit) break
        if (fitK(hit, api, 0.46) > k * 1.3) { target = hit; break }
        level = hit.children
      }
      if (target) {
        setSelected(target)
        flyTo(api, { x: target.x, y: target.y, k: fitK(target, api, 0.46) }, 700)
      } else {
        flyTo(api, { x: at.x, y: at.y, k: Math.min(30, k * 2) }, 500)
      }
    }
    cv.addEventListener('dblclick', onDbl)
    return () => cv.removeEventListener('dblclick', onDbl)
  }, [])

  // the minimap: press or drag to carry the view there
  useEffect(() => {
    const cv = miniRef.current
    if (!cv) return
    let down = false
    const go = (e: PointerEvent) => {
      const rect = cv.getBoundingClientRect()
      const p = mini.current.toWorld((e.clientX - rect.left) * (MINI_W / rect.width), (e.clientY - rect.top) * (MINI_H / rect.height))
      api.flyTo({ ...api.camera.current, x: p.x, y: p.y }, 0)
    }
    const onDown = (e: PointerEvent) => { down = true; cv.setPointerCapture(e.pointerId); go(e) }
    const onMove = (e: PointerEvent) => { if (down) go(e) }
    const onUp = () => { down = false }
    cv.addEventListener('pointerdown', onDown)
    cv.addEventListener('pointermove', onMove)
    cv.addEventListener('pointerup', onUp)
    cv.addEventListener('pointercancel', onUp)
    return () => {
      cv.removeEventListener('pointerdown', onDown)
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerup', onUp)
      cv.removeEventListener('pointercancel', onUp)
    }
  }, [world])

  const journey = active ? journeyById(active) : undefined
  const total = geo?.rooms.length ?? 0
  const view = api.size.current
  const tipStyle = hover
    ? {
      left: hover.x > view.w - 320 ? undefined : hover.x + 14,
      right: hover.x > view.w - 320 ? view.w - hover.x + 14 : undefined,
      top: hover.y > view.h - 120 ? undefined : hover.y + 14,
      bottom: hover.y > view.h - 120 ? view.h - hover.y + 14 : undefined,
    }
    : undefined
  const misted = hover?.plot && !hover.grain && !discovered.has(roomOfPlot(hover.plot.path))

  return (
    <div className="fields">
      <canvas ref={ref} className="fields-canvas" tabIndex={0}
        aria-label="The map of grain: regions, rooms and files. Arrow keys or WASD to wander, plus and minus to zoom, Enter to read the plot's door." />
      {!world && <div className="fields-wait">{r.phase === 'error' ? 'The tree could not be read.' : 'Sowing the map…'}</div>}
      {hover && (
        <div className="fields-tip panel linen-fine" style={tipStyle}>
          {hover.grain
            ? <><div className="mono" style={{ fontSize: 12.5 }}>{hover.grain.path}</div>
              {lookup(hover.grain.path)?.meta?.title && <div style={{ fontStyle: 'italic' }}>{lookup(hover.grain.path)!.meta!.title}</div>}</>
            : hover.plot
              ? <><div><b style={{ fontWeight: 600 }}>{hover.plot.path || 'the root'}</b> <span className="faint">{hover.plot.files} files</span></div>
                <div className="faint sans" style={{ fontSize: 12 }}>{hover.regionName}</div>
                {misted && <div className="fields-tip-mist sans">Under mist until you read a page here</div>}</>
              : <div style={{ fontStyle: 'italic' }}>{hover.regionName}</div>}
        </div>
      )}
      {world && (
        <div className="fields-mini panel linen-fine">
          <canvas ref={miniRef} style={{ width: MINI_W, height: MINI_H }} aria-label="Minimap: press or drag to move the view" />
        </div>
      )}
      {selected && <Inspector plot={selected} onClose={() => setSelected(null)} />}
      {journey && (
        <div className="fields-journey panel linen-fine">
          <div className="sans faint" style={{ fontSize: 12 }}>On the road</div>
          <div style={{ fontSize: 18 }}>{journey.title}</div>
          <ol>
            {journey.stops.map((s) => (
              <li key={s.path} className={seeds[s.path] ? 'done' : ''}>
                <a href={`#/fields?open=${encodeURIComponent(s.path)}`}>{s.note}</a>
              </li>
            ))}
          </ol>
          <button className="ascii-btn" onClick={() => progress.set({ activeJourney: undefined })}>[ leave the road ]</button>
        </div>
      )}
      <div className="fields-legend sans">
        {total > 0 && (
          <span className="fields-found" title="A room clears once you have read a page in it">
            <svg width="9" height="13" viewBox="0 0 9 13" aria-hidden="true"><ellipse cx="4.5" cy="6.5" rx="3.2" ry="5.4" /></svg>
            {discovered.size} of {total} rooms walked
          </span>
        )}
        <span className="faint">one grain is one file; drag or use the arrows to wander, scroll or +/- to zoom</span>
      </div>
    </div>
  )
}

function Inspector({ plot, onClose }: { plot: Plot; onClose: () => void }) {
  const entries = useStore(repo, (s) => s.entries)
  const e = entries.get(plot.path)
  const readme = e?.children.find((c) => /README\.md$/i.test(c))
  const stamps = useMemo(() => {
    const out: Array<{ path: string; t: number }> = []
    const walk = (p: string) => {
      const x = entries.get(p)
      if (!x) return
      if (x.kind === 'dir') x.children.forEach(walk)
      else { const s = stampOf(x); if (s) out.push({ path: p, t: s.date.getTime() }) }
    }
    walk(plot.path)
    out.sort((a, b) => a.t - b.t)
    return out
  }, [plot.path])
  const first = stamps[0], last = stamps[stamps.length - 1]
  return (
    <div className="fields-inspector panel linen-fine">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="sans faint" style={{ fontSize: 12 }}>{plot.region.name}</span>
        <span style={{ flex: 1 }} />
        <button className="ascii-btn" onClick={onClose} aria-label="Close (Escape)">[ x ]</button>
      </div>
      <h2 style={{ margin: '2px 0 4px', fontWeight: 400, fontSize: 26 }}>{plot.path || 'the root'}</h2>
      <p className="muted" style={{ margin: '0 0 10px', fontSize: 15 }}>{plot.region.motto}</p>
      <p className="sans" style={{ margin: '0 0 10px', fontSize: 13 }}>
        {plot.files.toLocaleString()} files{plot.children.length ? `, ${plot.children.length} folders` : ''}{stamps.length ? `, ${stamps.length} stamped` : ''}
      </p>
      {first && last && (
        <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          <span className="sans faint" style={{ fontSize: 12 }}>first stamp</span>
          <Stamp stamp={stampOf(entries.get(first.path))} from={first.path} />
          {last.path !== first.path && <><span className="sans faint" style={{ fontSize: 12 }}>latest stamp</span>
            <Stamp stamp={stampOf(entries.get(last.path))} from={last.path} /></>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {readme && <a className="chip" href={`#/fields?open=${encodeURIComponent(readme)}`}>Read its door <span className="kbd">Enter</span></a>}
        <a className="chip" href={`#/ledger/${plot.path}`}>Open in the ledger</a>
        <a className="chip" href={`#/heavens?room=${encodeURIComponent(plot.path)}`}>See its stars</a>
      </div>
    </div>
  )
}
