// The Fields: grain drawn as land. Regions are islands, rooms are fields furrowed in their
// element's colour, folders are plots within plots, and every file is a single grain.
// Rhumb lines run out from the Front Door the way a portolan chart's run from its rose.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/core/store'
import { navigate } from '@/core/router'
import type { ViewProps } from '@/core/registry'
import { repo, stampOf, lookup } from '@/grain/repo'
import { progress } from '@/grain/progress'
import { journeyById } from '@/grain/quests'
import { settings } from '@/core/settings'
import { useCanvas, cssVar, type CanvasApi } from '@/ui/useCanvas'
import { Stamp } from '@/ui/Stamp'
import { layoutWorld, type Plot, type World, type Grain } from './layout'
import './fields.css'

interface Pick { plot?: Plot; grain?: Grain; regionName?: string }

export function Fields({ route }: ViewProps) {
  const r = useStore(repo, (s) => ({ entries: s.entries, version: s.version, phase: s.phase }))
  const seeds = useStore(progress, (p) => p.seeds)
  const active = useStore(progress, (p) => p.activeJourney)
  const mode = useStore(settings, (s) => s.mode)
  const world = useMemo<World | null>(() => (r.entries.size > 1 ? layoutWorld(r.entries) : null), [r.version])
  const [hover, setHover] = useState<Pick & { x: number; y: number } | null>(null)
  const [selected, setSelected] = useState<Plot | null>(null)
  const colors = useRef<Record<string, string>>({})
  const fitted = useRef(false)

  useEffect(() => {
    const names = ['--page', '--surface', '--surface-2', '--ink', '--ink-2', '--ink-3', '--rule', '--brass', '--brass-dim', '--gold', '--star',
      '--el-aether', '--el-air', '--el-fire', '--el-water', '--el-earth', '--invite', '--madder']
    colors.current = Object.fromEntries(names.map((n) => [n, cssVar(n)]))
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

  const { ref, api } = useCanvas({
    minK: 0.02,
    maxK: 30,
    draw: (ctx, a) => world && draw(ctx, a, world, colors.current, seeds, active, selected),
    onHover: (sx, sy, a) => {
      if (sx < 0) { setHover(null); return }
      const p = pickAt(sx, sy, a)
      setHover(p.plot || p.regionName ? { ...p, x: sx, y: sy } : null)
    },
    onPick: (sx, sy, a) => {
      const p = pickAt(sx, sy, a)
      if (p.grain) { navigate('fields', '', { open: p.grain.path }); return }
      if (p.plot) {
        setSelected(p.plot)
        const s = a.size.current
        a.flyTo({ x: p.plot.x, y: p.plot.y, k: Math.min(28, (Math.min(s.w, s.h) * 0.42) / p.plot.r) })
      }
    },
  })

  // fit the whole world once it exists; honour ?focus=path
  useEffect(() => {
    if (!world) return
    const s = api.size.current
    const fit = { x: 0, y: 0, k: (Math.min(s.w, s.h) * 0.5) / world.radius }
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
  useEffect(() => api.redraw(), [seeds, active, selected])

  const journey = active ? journeyById(active) : undefined

  return (
    <div className="fields">
      <canvas ref={ref} className="fields-canvas" aria-label="The map of grain: regions, rooms and files" />
      {!world && <div className="fields-wait">{r.phase === 'error' ? 'The tree could not be read.' : 'Sowing the map…'}</div>}
      {hover && (
        <div className="fields-tip panel linen-fine" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hover.grain
            ? <><div className="mono" style={{ fontSize: 12.5 }}>{hover.grain.path}</div>
              {lookup(hover.grain.path)?.meta?.title && <div style={{ fontStyle: 'italic' }}>{lookup(hover.grain.path)!.meta!.title}</div>}</>
            : hover.plot
              ? <><div><b style={{ fontWeight: 600 }}>{hover.plot.path || 'the root'}</b> <span className="faint">{hover.plot.files} files</span></div>
                <div className="faint sans" style={{ fontSize: 12 }}>{hover.regionName}</div></>
              : <div>{hover.regionName}</div>}
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
      <div className="fields-legend sans faint">one grain is one file -- scroll to zoom, drag to wander</div>
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
        <button className="ascii-btn" onClick={onClose}>[ x ]</button>
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
        {readme && <a className="chip" href={`#/fields?open=${encodeURIComponent(readme)}`}>Read its door</a>}
        <a className="chip" href={`#/ledger/${plot.path}`}>Open in the ledger</a>
        <a className="chip" href={`#/heavens?room=${encodeURIComponent(plot.path)}`}>See its stars</a>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ drawing

function draw(
  ctx: CanvasRenderingContext2D, a: CanvasApi, world: World, C: Record<string, string>,
  seeds: Record<string, number>, activeJourney: string | undefined, selected: Plot | null,
) {
  const { w, h } = a.size.current
  const cam = a.camera.current
  const k = cam.k
  const S = (x: number, y: number) => a.toScreen(x, y)
  const visible = (x: number, y: number, r: number) => {
    const p = S(x, y)
    return p.x + r * k > -20 && p.x - r * k < w + 20 && p.y + r * k > -20 && p.y - r * k < h + 20
  }

  // sea: rhumb lines from the Front Door, and range rings
  const o = S(0, 0)
  ctx.save()
  ctx.strokeStyle = C['--rule']
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 0.6
  ctx.setLineDash([2, 6])
  for (let i = 0; i < 32; i++) {
    const t = (i / 32) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(o.x, o.y)
    ctx.lineTo(o.x + Math.cos(t) * 4000, o.y + Math.sin(t) * 4000)
    ctx.stroke()
  }
  ctx.setLineDash([])
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath()
    ctx.arc(o.x, o.y, world.radius * 0.36 * i * k, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()

  // land
  for (const land of world.regions) {
    if (!visible(land.x, land.y, land.r * 1.3)) continue
    const accent = C[`--el-${land.region.element}`]
    const path = new Path2D()
    land.hull.forEach(([x, y], i) => {
      const p = S(x, y)
      if (i === 0) path.moveTo(p.x, p.y)
      else path.lineTo(p.x, p.y)
    })
    path.closePath()
    // contour rings, like soundings around an island
    for (let ring = 3; ring >= 1; ring--) {
      ctx.save()
      const s = 1 + ring * 0.035
      const c = S(land.x, land.y)
      ctx.translate(c.x, c.y)
      ctx.scale(s, s)
      ctx.translate(-c.x, -c.y)
      ctx.strokeStyle = accent
      ctx.globalAlpha = 0.12 / ring + 0.04
      ctx.lineWidth = 1 / s
      ctx.stroke(path)
      ctx.restore()
    }
    ctx.fillStyle = C['--surface']
    ctx.globalAlpha = 0.55
    ctx.fill(path)
    ctx.globalAlpha = 1
    ctx.strokeStyle = accent
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1.2
    ctx.stroke(path)
    ctx.globalAlpha = 1

    for (const room of land.rooms) drawPlot(ctx, a, room, accent, C, 0, selected)
  }

  // planted seeds glow gold
  ctx.fillStyle = C['--gold']
  for (const p of Object.keys(seeds)) {
    const at = world.index.get(p)
    if (!at) continue
    const s = S(at.x, at.y)
    if (s.x < -10 || s.x > w + 10 || s.y < -10 || s.y > h + 10) continue
    ctx.globalAlpha = 0.25
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(4, 7 * Math.min(1, k)), 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(1.6, 2.6 * Math.min(1.5, k)), 0, Math.PI * 2); ctx.fill()
  }

  // the road of the active journey
  const j = activeJourney ? journeyById(activeJourney) : undefined
  if (j) {
    const pts = j.stops.map((s) => world.index.get(s.path)).filter(Boolean) as Array<{ x: number; y: number }>
    ctx.save()
    ctx.strokeStyle = C['--invite']
    ctx.lineWidth = 2
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    pts.forEach((p, i) => {
      const s = S(p.x, p.y)
      if (i === 0) ctx.moveTo(s.x, s.y)
      else {
        const prev = S(pts[i - 1].x, pts[i - 1].y)
        const mx = (prev.x + s.x) / 2 + (s.y - prev.y) * 0.18
        const my = (prev.y + s.y) / 2 - (s.x - prev.x) * 0.18
        ctx.quadraticCurveTo(mx, my, s.x, s.y)
      }
    })
    ctx.stroke()
    ctx.setLineDash([])
    j.stops.forEach((st, i) => {
      const p = world.index.get(st.path)
      if (!p) return
      const s = S(p.x, p.y)
      ctx.fillStyle = seeds[st.path] ? C['--gold'] : C['--page']
      ctx.strokeStyle = C['--invite']
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = seeds[st.path] ? C['--page'] : C['--invite']
      ctx.font = '600 11px "Public Sans", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), s.x, s.y + 0.5)
    })
    ctx.restore()
  }

  // region names, cartographer's italic
  for (const land of world.regions) {
    const top = S(land.x, land.y - land.r * 1.02)
    const size = Math.max(13, Math.min(34, land.r * k * 0.16))
    if (top.y < -40 || top.y > h + 40) continue
    ctx.font = `italic ${size}px Vollkorn, Georgia, serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = C['--ink']
    ctx.globalAlpha = land.r * k > 900 ? 0.35 : 0.92
    ctx.fillText(land.region.name, top.x, top.y)
    ctx.globalAlpha = 1
  }
}

function drawPlot(ctx: CanvasRenderingContext2D, a: CanvasApi, p: Plot, accent: string, C: Record<string, string>, depth: number, selected: Plot | null) {
  const k = a.camera.current.k
  const { w, h } = a.size.current
  const s = a.toScreen(p.x, p.y)
  const R = p.r * k
  if (s.x + R < -10 || s.x - R > w + 10 || s.y + R < -10 || s.y - R > h + 10) return
  if (R < 1.2) {
    ctx.fillStyle = accent
    ctx.fillRect(s.x - 0.8, s.y - 0.8, 1.6, 1.6)
    return
  }
  // the field: a rounded plot with furrows
  ctx.save()
  ctx.beginPath()
  ctx.arc(s.x, s.y, R, 0, Math.PI * 2)
  ctx.fillStyle = depth === 0 ? C['--page'] : C['--surface-2']
  ctx.globalAlpha = depth === 0 ? 0.85 : 0.5
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.clip()
  const gap = Math.max(4, Math.min(9, R / 6))
  ctx.strokeStyle = accent
  ctx.globalAlpha = depth === 0 ? 0.32 : 0.22
  ctx.lineWidth = 1
  ctx.translate(s.x, s.y)
  ctx.rotate(p.furrow)
  ctx.beginPath()
  for (let x = -R; x <= R; x += gap) { ctx.moveTo(x, -R); ctx.lineTo(x, R) }
  ctx.stroke()
  ctx.restore()

  ctx.beginPath()
  ctx.arc(s.x, s.y, R, 0, Math.PI * 2)
  ctx.strokeStyle = selected === p ? C['--gold'] : accent
  ctx.lineWidth = selected === p ? 2.4 : depth === 0 ? 1.4 : 0.9
  ctx.globalAlpha = 0.85
  ctx.stroke()
  ctx.globalAlpha = 1

  // inside: sub-plots once there is room, grains once they can be seen
  if (R > 34) for (const c of p.children) drawPlot(ctx, a, c, accent, C, depth + 1, selected)
  if (R > 46 && p.grains.length) {
    const gr = Math.max(1.2, Math.min(4.5, 2.2 * k))
    ctx.fillStyle = C['--gold']
    ctx.strokeStyle = C['--brass-dim']
    ctx.lineWidth = 0.6
    for (const g of p.grains) {
      const q = a.toScreen(g.x, g.y)
      if (q.x < -6 || q.x > w + 6 || q.y < -6 || q.y > h + 6) continue
      ctx.beginPath()
      ctx.ellipse(q.x, q.y, gr * 0.62, gr, g.a, 0, Math.PI * 2)
      ctx.fill()
      if (gr > 2.5) ctx.stroke()
    }
    if (gr > 3.6) {
      ctx.font = '11px "Source Code Pro", monospace'
      ctx.fillStyle = C['--ink-2']
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      for (const g of p.grains) {
        const q = a.toScreen(g.x, g.y)
        if (q.x < -60 || q.x > w || q.y < 0 || q.y > h) continue
        ctx.fillText(g.path.split('/').pop()!.slice(0, 34), q.x + gr + 4, q.y)
      }
    }
  }

  // label
  if (R > 16) {
    const size = depth === 0 ? Math.max(11, Math.min(20, R * 0.2)) : Math.max(10, Math.min(15, R * 0.16))
    ctx.font = `${depth === 0 ? 600 : 400} ${size}px "Public Sans", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const label = p.name + (p.files > 1 ? ` ${p.files}` : '')
    const ly = R > 140 ? s.y - R + size * 1.4 : s.y
    ctx.lineWidth = 3
    ctx.strokeStyle = C['--page']
    ctx.globalAlpha = 0.9
    ctx.strokeText(label, s.x, ly)
    ctx.globalAlpha = 1
    ctx.fillStyle = C['--ink']
    ctx.fillText(label, s.x, ly)
  }
}
