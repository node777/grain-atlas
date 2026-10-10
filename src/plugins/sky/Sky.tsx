// The Sky: an astrolabe that opens into a dome. Turn the rete to turn time; step inside to stand
// under the stars; fade the brass away to be left with the sky alone.

import { useEffect, useMemo, useRef, useState } from 'react'
import * as A from 'astronomy-engine'
import { useStore } from '@/core/store'
import { settings, prefersStill } from '@/core/settings'
import { navigate, type Route } from '@/core/router'
import type { ViewProps } from '@/core/registry'
import { fullMoment, nakshatraIast } from '@/astro/describe'
import { norm360 } from '@/astro/math'
import { NAKSHATRAS } from '@/astro/data/nakshatras'
import { RASHIS } from '@/astro/data/rashis'
import { GRAHAS } from '@/astro/data/grahas'
import { loadCatalog, starName, type Catalog, type CultureId, CULTURE_IDS } from './catalog'
import { drawSky, type Drawn } from './drawSky'
import { framesAt, horVec, makeProj, slerp, type Cam } from './projection'
import { Readings, MomentCard } from './Readings'
import './sky.css'

const CULTURE_LABEL: Record<CultureId, string> = {
  modern: 'Modern (IAU)', indian: 'Indian: nakshatras and rashis', indian_nakshatras: 'Nakshatras (temple carvings)', chinese: 'Chinese asterisms',
}
const SPEEDS = [
  { label: 'still', v: 0 }, { label: '1 min/s', v: 60 }, { label: '1 hour/s', v: 3600 }, { label: '1 day/s', v: 86400 },
]

function astrolabeCam(lat: number): Cam {
  const north = lat >= 0
  return { fwd: horVec(Math.abs(lat), north ? 0 : 180), up: [0, 0, 1], fov: 236 }
}
const domeCam = (az = 180, alt = 28, fov = 110): Cam => ({ fwd: horVec(alt, az), up: [0, 0, 1], fov })

export function Sky({ route }: ViewProps) {
  const place = useStore(settings, (s) => s.place)
  const ayan = useStore(settings, (s) => s.ayanamsa)
  const lens = useStore(settings, (s) => s.lens)
  const initial = route.params.t ? new Date(route.params.t) : new Date()
  const [date, setDate] = useState<Date>(isNaN(initial.getTime()) ? new Date() : initial)
  const [speed, setSpeed] = useState(0)
  const [mode, setMode] = useState<'astrolabe' | 'dome'>(route.params.mode === 'dome' ? 'dome' : 'astrolabe')
  const [instrument, setInstrument] = useState(1)
  const [culture, setCulture] = useState<CultureId>('indian')
  const [figures, setFigures] = useState(true)
  const [cat, setCat] = useState<Catalog | null>(null)
  const [catErr, setCatErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ kind: 'star' | 'body'; id: number | string } | null>(null)
  const [panel, setPanel] = useState(true)

  const canvas = useRef<HTMLCanvasElement>(null)
  const cam = useRef<Cam>(mode === 'dome' ? domeCam() : astrolabeCam(place.lat))
  const blend = useRef(mode === 'astrolabe' ? 1 : 0)
  const flight = useRef<{ from: Cam; to: Cam; b0: number; b1: number; t0: number } | null>(null)
  const drawn = useRef<Drawn>({ stars: [], bodies: [] })
  const dirty = useRef(true)
  const state = useRef({ date, instrument, culture, figures, selected, lens, speed })
  state.current = { date, instrument, culture, figures, selected, lens, speed }

  // follow the route when a new stamp is opened
  useEffect(() => {
    if (route.params.t) {
      const d = new Date(route.params.t)
      if (!isNaN(d.getTime())) setDate(d)
    }
  }, [route.params.t])

  useEffect(() => { loadCatalog().then(setCat).catch((e) => setCatErr(e.message)) }, [])
  const fm = useMemo(() => fullMoment(date, place, ayan), [date.getTime(), place.lat, place.lon, ayan])
  useEffect(() => { dirty.current = true }, [fm, instrument, culture, figures, selected, cat, lens])

  // switching instrument and dome: fly the camera
  const goMode = (m: 'astrolabe' | 'dome') => {
    setMode(m)
    const to = m === 'astrolabe' ? astrolabeCam(place.lat) : domeCam()
    if (prefersStill()) { cam.current = to; blend.current = m === 'astrolabe' ? 1 : 0; dirty.current = true; return }
    flight.current = { from: { ...cam.current }, to, b0: blend.current, b1: m === 'astrolabe' ? 1 : 0, t0: performance.now() }
  }

  // time flows when a speed is set
  useEffect(() => {
    if (!speed) return
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      const dt = (t - last) / 1000
      last = t
      setDate((d) => new Date(d.getTime() + dt * speed * 1000))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [speed])

  // the draw loop
  useEffect(() => {
    const cv = canvas.current!
    const ctx = cv.getContext('2d')!
    let raf = 0
    let size = { w: 1, h: 1, dpr: 1 }
    const resize = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      size = { w: r.width, h: r.height, dpr }
      cv.width = Math.round(r.width * dpr)
      cv.height = Math.round(r.height * dpr)
      dirty.current = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(cv)
    resize()
    const loop = (t: number) => {
      const f = flight.current
      if (f) {
        const u = Math.min(1, (t - f.t0) / 1000)
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
        cam.current = {
          fwd: slerp(f.from.fwd, f.to.fwd, e),
          up: [0, 0, 1],
          fov: Math.exp(Math.log(f.from.fov) + (Math.log(f.to.fov) - Math.log(f.from.fov)) * e),
        }
        blend.current = f.b0 + (f.b1 - f.b0) * e
        dirty.current = true
        if (u >= 1) flight.current = null
      }
      const twinkle = !prefersStill()
      if (dirty.current || twinkle) {
        dirty.current = false
        const s = state.current
        if (cat) {
          ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
          const p = makeProj(cam.current, size.w, size.h)
          const F = framesAt(s.date, place.lat, place.lon)
          drawn.current = drawSky(ctx, p, F, cat, fm.sky, {
            instrument: s.instrument, astrolabe: blend.current, culture: s.culture, showFigures: s.figures,
            showMilkyWay: true, lens: s.lens, lat: place.lat, selected: s.selected,
            highlightNakshatra: fm.p.nakshatra.index, t, twinkle,
          })
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [cat, fm, place.lat, place.lon])

  // pointer: in the astrolabe, dragging turns the rete (time); in the dome, it turns your head
  useEffect(() => {
    const cv = canvas.current!
    let down: { x: number; y: number; moved: boolean; date: number } | null = null
    const local = (e: PointerEvent | WheelEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height } }
    const onDown = (e: PointerEvent) => { cv.setPointerCapture(e.pointerId); const p = local(e); down = { x: p.x, y: p.y, moved: false, date: state.current.date.getTime() } }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const p = local(e)
      const dx = p.x - down.x, dy = p.y - down.y
      if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true
      if (!down.moved) return
      if (blend.current > 0.5) {
        // angle swept around the centre turns the rete: one turn = one sidereal day
        const cx = p.w / 2, cy = p.h / 2
        const a0 = Math.atan2(down.y - cy, down.x - cx), a1 = Math.atan2(p.y - cy, p.x - cx)
        let da = a1 - a0
        if (da > Math.PI) da -= 2 * Math.PI
        if (da < -Math.PI) da += 2 * Math.PI
        const north = place.lat >= 0 ? 1 : -1
        setDate(new Date(down.date - north * (da / (2 * Math.PI)) * 86164091))
      } else {
        const c = cam.current
        const f = c.fwd
        const az = Math.atan2(-f[1], f[0]) * 180 / Math.PI
        const alt = Math.asin(f[2]) * 180 / Math.PI
        const k = c.fov / Math.min(p.w, p.h)
        const nAz = az - (e.movementX * k)
        const nAlt = Math.max(-30, Math.min(89, alt + e.movementY * k))
        cam.current = { ...c, fwd: horVec(nAlt, nAz) }
        dirty.current = true
      }
    }
    const onUp = (e: PointerEvent) => {
      const p = local(e)
      if (down && !down.moved) {
        let best: { kind: 'star' | 'body'; id: number | string } | null = null
        let bd = 14
        for (const b of drawn.current.bodies) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < bd) { bd = d; best = { kind: 'body', id: b.id } } }
        if (!best) for (const s of drawn.current.stars) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < bd) { bd = d; best = { kind: 'star', id: s.hip || -s.i - 1 } } }
        setSelected(best)
      }
      down = null
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const c = cam.current
      const max = blend.current > 0.5 ? 260 : 200
      cam.current = { ...c, fov: Math.max(8, Math.min(max, c.fov * Math.exp(e.deltaY * 0.0012))) }
      dirty.current = true
    }
    cv.addEventListener('pointerdown', onDown)
    cv.addEventListener('pointermove', onMove)
    cv.addEventListener('pointerup', onUp)
    cv.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      cv.removeEventListener('pointerdown', onDown)
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerup', onUp)
      cv.removeEventListener('wheel', onWheel)
    }
  }, [place.lat])

  const shift = (ms: number) => setDate((d) => new Date(d.getTime() + ms))
  const from = route.params.from
  const localValue = toLocalInput(date)

  return (
    <div className="sky">
      <canvas ref={canvas} className="sky-canvas" aria-label="The sky of this moment: stars, figures, and the nine grahas" />
      {catErr && <div className="sky-err">{catErr}</div>}

      <div className="sky-dial panel">
        <div className="dial-row">
          <button className="chip" aria-pressed={mode === 'astrolabe'} onClick={() => goMode('astrolabe')}>Astrolabe</button>
          <button className="chip" aria-pressed={mode === 'dome'} onClick={() => goMode('dome')}>Step inside</button>
        </div>
        <label className="dial-row sans" title="Fade the instrument away until only the sky is left">
          <span className="faint" style={{ fontSize: 12 }}>brass</span>
          <input type="range" min={0} max={1} step={0.01} value={instrument} onChange={(e) => setInstrument(+e.target.value)} aria-label="Instrument visibility" />
        </label>
        <div className="dial-row">
          <select value={culture} onChange={(e) => setCulture(e.target.value as CultureId)} aria-label="Sky culture">
            {CULTURE_IDS.map((c) => <option key={c} value={c}>{CULTURE_LABEL[c]}</option>)}
          </select>
          <button className="chip" aria-pressed={figures} onClick={() => setFigures(!figures)}>figures</button>
        </div>
      </div>

      <div className="sky-time panel">
        <input type="datetime-local" value={localValue} step={60} onChange={(e) => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) setDate(d) }} aria-label="Moment" />
        <div className="dial-row">
          <button className="ascii-btn" onClick={() => shift(-86400000)} title="a day back">[ -1d ]</button>
          <button className="ascii-btn" onClick={() => shift(-3600000)} title="an hour back">[ -1h ]</button>
          <select value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="Time speed">
            {SPEEDS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
          <button className="ascii-btn" onClick={() => shift(3600000)} title="an hour on">[ +1h ]</button>
          <button className="ascii-btn" onClick={() => shift(86400000)} title="a day on">[ +1d ]</button>
        </div>
        <div className="dial-row">
          <button className="ascii-btn" onClick={() => { setSpeed(0); setDate(new Date()) }}>[ now ]</button>
          {route.params.t && <button className="ascii-btn" onClick={() => { setSpeed(0); setDate(new Date(route.params.t)) }}>[ the moment ]</button>}
          <span className="faint sans" style={{ fontSize: 12 }}>{place.name}</span>
        </div>
      </div>

      {selected && cat && <SelectedCard cat={cat} sel={selected} date={date} ayan={fm.sky.ayanamsa} onClose={() => setSelected(null)} />}

      <aside className={`sky-panel panel linen${panel ? '' : ' folded'}`}>
        <button className="ascii-btn sky-fold" onClick={() => setPanel(!panel)}>{panel ? '[ fold ]' : '[ readings ]'}</button>
        {panel && <>
          <MomentCard fm={fm} from={from} />
          <Readings fm={fm} from={from} />
        </>}
      </aside>
    </div>
  )
}

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function SelectedCard({ cat, sel, date, ayan, onClose }: { cat: Catalog; sel: { kind: 'star' | 'body'; id: number | string }; date: Date; ayan: number; onClose: () => void }) {
  if (sel.kind === 'body') {
    const g = GRAHAS.find((x) => x.id === sel.id)
    return (
      <div className="sky-selected panel linen-fine">
        <div style={{ display: 'flex' }}><span className="sans faint" style={{ fontSize: 12 }}>graha</span><span style={{ flex: 1 }} /><button className="ascii-btn" onClick={onClose}>[ x ]</button></div>
        {g ? <>
          <h3 style={{ margin: '2px 0', fontWeight: 400 }}>{g.glyph} {g.iast} <span className="deva">{g.devanagari}</span></h3>
          <p className="muted" style={{ margin: '0 0 6px' }}>{g.english}; rules {g.owns.map((r) => RASHIS[r]?.name).join(' and ') || 'no sign'}; {g.dashaYears}-year dasha.</p>
          <p style={{ margin: 0, fontSize: 15 }}>{g.karakas.slice(0, 5).join(', ')}.</p>
        </> : <h3 style={{ margin: 0, fontWeight: 400 }}>{String(sel.id)}</h3>}
      </div>
    )
  }
  const st = typeof sel.id === 'number' && sel.id > 0 ? cat.byHip.get(sel.id) : cat.stars[-(sel.id as number) - 1]
  if (!st) return null
  const time = A.MakeTime(date)
  const ecl = A.Ecliptic(new A.Vector(st.v[0], st.v[1], st.v[2], time))
  const sid = norm360(ecl.elon - ayan)
  const nk = Math.floor(sid / (360 / 27))
  const con = A.Constellation(st.ra / 15, st.dec)
  const yoga = NAKSHATRAS.find((n) => n.yogatara.hip === st.hip)
  return (
    <div className="sky-selected panel linen-fine">
      <div style={{ display: 'flex' }}><span className="sans faint" style={{ fontSize: 12 }}>star{st.hip ? `, HIP ${st.hip}` : ''}</span><span style={{ flex: 1 }} /><button className="ascii-btn" onClick={onClose}>[ x ]</button></div>
      <h3 style={{ margin: '2px 0', fontWeight: 400 }}>{starName(cat, st.hip) ?? 'an unnamed star'}</h3>
      <p className="muted" style={{ margin: '0 0 6px', fontSize: 15 }}>
        magnitude {st.mag.toFixed(2)}, in {con.name}; ecliptic longitude {sid.toFixed(2)}° sidereal, within {nakshatraIast(nk)}.
      </p>
      {yoga && <p style={{ margin: 0, fontSize: 15 }}>The yogatara, junction star, of <b style={{ fontWeight: 600 }}>{yoga.iast}</b>: {yoga.essence}{yoga.yogatara.note ? <span className="faint"> {yoga.yogatara.note}</span> : null}</p>}
    </div>
  )
}

export function openSkyFor(route: Route) { navigate('sky', '', route.params) }
