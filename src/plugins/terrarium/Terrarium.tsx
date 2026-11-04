// The Grain Terrarium: a fish tank drawn in text. A browser cousin of the Terrarium host that the
// living tree is planning -- "the glass over the world" -- with a small ecosystem under it.
//
//   click the water      -> flakes (hold and drag to sprinkle)
//   drag anything        -> move it; let go of a fish to toss it
//   tap a creature       -> a boop
//   Add                  -> arm a creature or a piece of scenery, then click the water to place it
//   Scoop                -> click a thing to lift it out
//   the chest, the bottle-> doors to grain-www and to the Terrarium.app download
//   Keep                 -> commit the tank. Like the Mantrapod, it is RAM only and forgets otherwise.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ViewProps } from '@/core/registry'
import { prefersStill } from '@/core/settings'
import { toast } from '@/ui/Toast'
import { cssVar } from '@/ui/useCanvas'
import {
  addCreature, addDecor, boop, BOOT_STAGES, createWorld, DECOR, dragTo, feed, grab, hitTest, populate, release,
  removeEntity, resize, restore, skipBoot, snapshot, SPECIES, startBoot, step, type DecorId, type Entity, type SpeciesId, type World,
} from './engine'
import { compose, COLOR_NAMES, PALETTE } from './render'
import { LINKS, type LinkId } from './links'
import './terrarium.css'

const KEY = 'grain-atlas:terrarium'
type Tool = { kind: 'feed' } | { kind: 'scoop' } | { kind: 'add'; what: 'creature' | 'decor'; id: SpeciesId | DecorId }

const TRAY_GLYPH: Record<string, string> = {
  tetra: '><>', angel: '><(o)>', betta: '}}(o)>', puffer: '( o)>', ray: '>-.__.-\'', seahorse: '(o>', jelly: '.-"-.', angler: '<(Vww)>', crab: '\\(oo)/', snail: '(___)=>', star: '--(*)--',
  kelp: ')Y(', coral: '\\|/', brain: '(@@@)', rock: '/___\\', shell: '(vvv)', castle: '|^|^|', vent: ',^,',
}

function loadKept(): ReturnType<typeof snapshot> | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    return s && s.v === 1 && Array.isArray(s.creatures) && Array.isArray(s.decor) ? s : null
  } catch { return null }
}

const link = (e: Entity | null): LinkId | null => (e && e.kind === 'decor' && (e.d === 'www' || e.d === 'app') ? e.d : null)

export function Terrarium(_: ViewProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const world = useRef<World | null>(null)
  const grid = useRef({ cols: 0, rows: 0, cw: 8, ch: 16, font: 13 })
  const colors = useRef<string[]>([])
  const hover = useRef<{ id: number } | null>(null)
  const drag = useRef<{ e: Entity; x0: number; y0: number; t0: number; moved: boolean; vx: number; vy: number; lx: number; ly: number; lt: number } | null>(null)
  const sprinkle = useRef({ down: false, last: 0 })
  const toolRef = useRef<Tool>({ kind: 'feed' })
  const redraw = useRef<() => void>(() => {})

  const still0 = useMemo(() => prefersStill(), [])
  const [moving, setMoving] = useState(!still0)
  const movingRef = useRef(moving)
  movingRef.current = moving
  const [tool, setTool] = useState<Tool>({ kind: 'feed' })
  toolRef.current = tool
  const [tray, setTray] = useState(false)
  const [kept, setKept] = useState(() => !!loadKept())
  const [stats, setStats] = useState({ creatures: 0, species: 0, algae: 0, dirty: false, stage: -1, counts: {} as Record<string, number> })
  const [tip, setTip] = useState<{ x: number; y: number; id: LinkId } | null>(null)
  const [cursor, setCursor] = useState('crosshair')

  const readStats = useCallback(() => {
    const w = world.current
    if (!w) return
    const counts: Record<string, number> = {}
    for (const c of w.creatures) counts[c.sp] = (counts[c.sp] ?? 0) + 1
    for (const d of w.decor) counts[d.d] = (counts[d.d] ?? 0) + 1
    setStats({ creatures: w.creatures.length, species: new Set(w.creatures.map((c) => c.sp)).size, algae: w.algae, dirty: w.dirty, stage: w.boot ? w.boot.stage : -1, counts })
  }, [])

  // ---- painting
  const paint = useCallback(() => {
    const cv = canvas.current, w = world.current
    if (!cv || !w) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const g = grid.current
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const W = cv.width / dpr, H = cv.height / dpr
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, cssVar('--sky-haze') || '#2a221b')
    grad.addColorStop(0.55, cssVar('--sky') || '#1b1713')
    grad.addColorStop(1, cssVar('--sky-deep') || '#120f0c')
    ctx.globalAlpha = 1
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
    // a cold hart is dim; the water greens with algae
    const f = compose(w, g.cols, g.rows, { hover: hover.current })
    ctx.font = `${g.font}px "Source Code Pro", Menlo, Consolas, monospace`
    ctx.textBaseline = 'alphabetic'
    let lastCol = -1, lastA = -1
    for (let r = 0; r < f.rows; r++) {
      for (let c = 0; c < f.cols; c++) {
        const i = r * f.cols + c
        const a = f.a[i]
        if (!a) continue
        if (f.col[i] !== lastCol) { ctx.fillStyle = colors.current[f.col[i]] || '#e5dcc8'; lastCol = f.col[i] }
        if (a !== lastA) { ctx.globalAlpha = a / 8; lastA = a }
        ctx.fillText(f.ch[i], c * g.cw, r * g.ch + g.ch * 0.78)
      }
    }
    ctx.globalAlpha = 1
    if (w.algae > 0.05) {
      ctx.fillStyle = cssVar('--el-air') || '#9fae6c'
      ctx.globalAlpha = Math.min(0.16, w.algae * 0.2)
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
    }
  }, [])
  redraw.current = paint

  // ---- sizing and the world
  useEffect(() => {
    const el = wrap.current, cv = canvas.current
    if (!el || !cv) return
    colors.current = COLOR_NAMES.map((n) => cssVar(PALETTE[n]) || '#e5dcc8')

    const measure = () => {
      const rect = el.getBoundingClientRect()
      const w = Math.max(200, rect.width), h = Math.max(160, rect.height)
      const dpr = window.devicePixelRatio || 1
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
      cv.style.width = `${w}px`; cv.style.height = `${h}px`
      const font = Math.max(12, Math.min(19, Math.round(w / 80)))
      const ctx = cv.getContext('2d')!
      ctx.font = `${font}px "Source Code Pro", Menlo, Consolas, monospace`
      const cw = ctx.measureText('M').width || font * 0.6
      const ch = Math.round(font * 1.3)
      const cols = Math.max(30, Math.floor(w / cw)), rows = Math.max(14, Math.floor(h / ch))
      grid.current = { cols, rows, cw, ch, font }
      if (!world.current) {
        const wd = createWorld(cols, rows * 2)
        world.current = wd
        const kept0 = loadKept()
        if (kept0) restore(wd, kept0)
        else if (still0) populate(wd)
        else startBoot(wd)
        if (!kept0 && !still0) for (let i = 0; i < 30; i++) step(wd, 1 / 30)   // the first frame is already breathing
        if (still0 || kept0) for (let i = 0; i < 90; i++) step(wd, 1 / 30)
      } else resize(world.current, cols, rows * 2)
      paint()
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    document.fonts?.ready.then(measure).catch(() => {})
    const timer = window.setInterval(readStats, 250)
    readStats()
    return () => { ro.disconnect(); window.clearInterval(timer) }
  }, [paint, readStats, still0])

  // ---- the clock
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const w = world.current
      if (!w || !movingRef.current) return
      acc += dt
      let n = 0
      while (acc >= 1 / 30 && n++ < 3) { step(w, 1 / 30); acc -= 1 / 30 }
      acc = Math.min(acc, 1 / 30)
      paint()
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [paint])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setTool({ kind: 'feed' }); setTray(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- hands
  const toWorld = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    const g = grid.current
    return { x: (e.clientX - r.left) / g.cw, y: ((e.clientY - r.top) / g.ch) * 2, px: e.clientX - r.left, py: e.clientY - r.top }
  }
  const nudge = () => { redraw.current(); readStats() }

  const onDown = (e: React.PointerEvent) => {
    const w = world.current
    if (!w) return
    const p = toWorld(e)
    canvas.current!.setPointerCapture(e.pointerId)
    const hit = hitTest(w, p.x, p.y)
    const t = toolRef.current
    if (t.kind === 'scoop') {
      if (hit && removeEntity(w, hit.id)) { w.bubbles.push({ x: hit.x, y: hit.y - 2, vy: -6, ph: 0 }, { x: hit.x + 1, y: hit.y - 1, vy: -7, ph: 1 }); toast('Lifted out. Add it back from the tray.', 2200) }
      else if (hit) toast('The doors are part of the glass; drag them instead.', 2400)
      nudge()
      return
    }
    if (hit) {
      grab(hit)
      drag.current = { e: hit, x0: p.px, y0: p.py, t0: performance.now(), moved: false, vx: 0, vy: 0, lx: p.x, ly: p.y, lt: performance.now() }
      setCursor('grabbing')
      return
    }
    if (t.kind === 'add') {
      const made = t.what === 'creature' ? addCreature(w, t.id as SpeciesId, p.x, p.y) : addDecor(w, t.id as DecorId, p.x, p.y)
      if (!made) toast(t.what === 'creature' ? 'The tank is full.' : `That is all the ${DECOR[t.id as DecorId].name.toLowerCase()} the glass will hold.`, 2400)
      else if (made.kind === 'decor' && !DECOR[made.d].fixed) made.vy = 0
      nudge()
      return
    }
    feed(w, p.x, p.y, 4)
    sprinkle.current = { down: true, last: performance.now() }
    nudge()
  }

  const onMove = (e: React.PointerEvent) => {
    const w = world.current
    if (!w) return
    const p = toWorld(e)
    const d = drag.current
    if (d) {
      const now = performance.now()
      if (!d.moved && Math.hypot(p.px - d.x0, p.py - d.y0) > 4) d.moved = true
      if (d.moved) {
        dragTo(w, d.e, p.x, p.y)
        const dtm = Math.max(1, now - d.lt) / 1000
        d.vx = d.vx * 0.5 + ((p.x - d.lx) / dtm) * 0.5
        d.vy = d.vy * 0.5 + ((p.y - d.ly) / dtm) * 0.5
        d.lx = p.x; d.ly = p.y; d.lt = now
        if (!movingRef.current) nudge()
      }
      return
    }
    if (sprinkle.current.down && performance.now() - sprinkle.current.last > 110) {
      sprinkle.current.last = performance.now()
      feed(w, p.x, p.y, 1)
      if (!movingRef.current) nudge()
      return
    }
    const hit = hitTest(w, p.x, p.y)
    const id = hit ? hit.id : null
    if ((hover.current?.id ?? null) !== id) {
      hover.current = hit ? { id: hit.id } : null
      const l = link(hit)
      setTip(l ? { x: p.px, y: p.py, id: l } : null)
      setCursor(toolRef.current.kind === 'scoop' ? (hit ? 'not-allowed' : 'default') : hit ? (l ? 'pointer' : 'grab') : toolRef.current.kind === 'add' ? 'copy' : 'crosshair')
      if (!movingRef.current) redraw.current()
    } else if (tip) setTip((t) => (t ? { ...t, x: p.px, y: p.py } : t))
  }

  const onUp = (e: React.PointerEvent) => {
    const w = world.current
    sprinkle.current.down = false
    const d = drag.current
    drag.current = null
    if (!w || !d) return
    const click = !d.moved && performance.now() - d.t0 < 450
    if (click) {
      release(w, d.e)
      const l = link(d.e)
      if (l) window.open(LINKS[l].url, '_blank', 'noopener,noreferrer')
      else if (d.e.kind === 'creature') boop(w, d.e, toWorld(e).x)
    } else {
      const fast = performance.now() - d.lt < 80
      release(w, d.e, fast ? d.vx * 0.6 : 0, fast ? d.vy * 0.6 : 0)
    }
    setCursor(hover.current ? 'grab' : 'crosshair')
    nudge()
  }

  // ---- buttons
  const keep = () => {
    const w = world.current
    if (!w) return
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshot(w)))
      w.dirty = false
      setKept(true)
      toast('Kept. This tank will be here when you come back.', 2800)
    } catch { toast('This browser would not keep the tank.', 3200) }
    readStats()
  }
  const reboot = () => {
    const w = world.current
    if (!w) return
    startBoot(w)
    setMoving(true)
    setTray(false)
    setTool({ kind: 'feed' })
    readStats()
  }
  const skip = () => { const w = world.current; if (w) { skipBoot(w); nudge() } }
  const arm = (t: Tool) => { setTool(t); }

  const booting = stats.stage >= 0 && !!world.current?.boot
  const stage = BOOT_STAGES[Math.max(0, stats.stage)]
  const water = stats.algae > 0.5 ? 'green: the snails have work' : stats.algae > 0.15 ? 'a little cloudy' : 'clear'
  const armedName = tool.kind === 'add' ? (tool.what === 'creature' ? SPECIES[tool.id as SpeciesId].name : DECOR[tool.id as DecorId].name) : ''

  return (
    <div className="terrarium">
      <div className="tank" ref={wrap}>
        <canvas
          ref={canvas}
          role="img"
          aria-label="A fish tank drawn in text. Click the water to feed the fish; drag things to move them. The chest links to grain-www and the bottle to the Terrarium.app download."
          style={{ cursor, touchAction: 'none' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => { if (!drag.current) { hover.current = null; setTip(null); if (!movingRef.current) redraw.current() } }}
        />
        <div className="tank-title sans">
          <h1>Grain <em>Terrarium</em></h1>
          {booting ? (
            <p aria-live="polite"><b>Stage {stats.stage} · {stage.name}.</b> {stage.line}</p>
          ) : (
            <p>
              {stats.creatures} creatures, {stats.species} kinds · water {water}
              {' · '}{stats.dirty || !kept ? <span title="This tank is only in memory. Keep it to commit it.">unkept: it forgets when you leave</span> : <span>kept</span>}
            </p>
          )}
          <p className="faint tank-credit">a terrarium by DJINN, in the spirit of the host the grain tree is planning</p>
        </div>
        {tip && (
          <div className="tank-tip sans" style={{ left: Math.min(tip.x + 14, (wrap.current?.clientWidth ?? 400) - 230), top: tip.y + 16 }}>
            <b>{LINKS[tip.id].label}</b> <span className="faint">opens {new URL(LINKS[tip.id].url).host}</span>
            <div className="faint">{LINKS[tip.id].note}</div>
          </div>
        )}
        {booting && <button className="chip tank-skip" onClick={skip}>skip the boot</button>}
        <div className="tank-doors sans">
          <a href={LINKS.www.url} target="_blank" rel="noopener noreferrer">grain-www ↗</a>
          <a href={LINKS.app.url} target="_blank" rel="noopener noreferrer">Terrarium.app ↓</a>
        </div>
      </div>

      <div className="tank-bar sans">
        {tray && (
          <div className="tank-tray panel linen-fine" role="group" aria-label="Add to the tank">
            <div className="tray-group">
              <span className="faint">creatures</span>
              {(Object.keys(SPECIES) as SpeciesId[]).map((id) => (
                <button key={id} className="chip" aria-pressed={tool.kind === 'add' && tool.id === id} title={SPECIES[id].blurb}
                  onClick={() => arm({ kind: 'add', what: 'creature', id })}>
                  <code className="mono">{TRAY_GLYPH[id]}</code> {SPECIES[id].name}{stats.counts[id] ? <span className="faint"> {stats.counts[id]}</span> : null}
                </button>
              ))}
            </div>
            <div className="tray-group">
              <span className="faint">scenery</span>
              {(['kelp', 'coral', 'brain', 'rock', 'shell', 'castle', 'vent'] as DecorId[]).map((id) => (
                <button key={id} className="chip" aria-pressed={tool.kind === 'add' && tool.id === id}
                  onClick={() => arm({ kind: 'add', what: 'decor', id })}>
                  <code className="mono">{TRAY_GLYPH[id]}</code> {DECOR[id].name}{stats.counts[id] ? <span className="faint"> {stats.counts[id]}</span> : null}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="bar-row">
          <button className="chip" aria-pressed={tool.kind === 'feed'} onClick={() => { setTool({ kind: 'feed' }); setTray(false) }} title="Click the water to scatter flakes; hold and drag to sprinkle">Feed</button>
          <button className="chip" aria-pressed={tool.kind === 'add' || tray} onClick={() => setTray(!tray)} title="Add creatures and scenery">{tool.kind === 'add' ? `Adding: ${armedName}` : 'Add'}</button>
          <button className="chip" aria-pressed={tool.kind === 'scoop'} onClick={() => { setTool(tool.kind === 'scoop' ? { kind: 'feed' } : { kind: 'scoop' }); setTray(false) }} title="Click a creature or a piece of scenery to lift it out">Scoop</button>
          <span className="bar-gap" />
          {still0 && <button className="chip" aria-pressed={moving} onClick={() => setMoving(!moving)} title="Your settings ask for stillness; this lets the tank move">{moving ? 'Pause' : 'Let it move'}</button>}
          <button className="chip" onClick={keep} disabled={kept && !stats.dirty} title="Commit this tank to this browser. Otherwise it dissolves when you leave, as the Mantrapod's memory does.">{kept && !stats.dirty ? 'Kept' : 'Keep'}</button>
          <button className="chip" onClick={reboot} title="Replay the boot from a cold hart (a kept tank stays kept)">Reboot</button>
        </div>
      </div>
    </div>
  )
}
