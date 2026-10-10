// The Sky: an astrolabe that opens into a dome. Turn the rete to turn time; step inside to stand
// under the stars; fade the brass away to be left with the sky alone.

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import * as A from 'astronomy-engine'
import { useStore } from '@/core/store'
import { settings, prefersStill } from '@/core/settings'
import { navigate, type Route } from '@/core/router'
import type { ViewProps } from '@/core/registry'
import { fullMoment, nakshatraIast } from '@/astro/describe'
import { castSky, type SkyMoment } from '@/astro/positions'
import { norm360 } from '@/astro/math'
import { NAKSHATRAS } from '@/astro/data/nakshatras'
import { RASHIS } from '@/astro/data/rashis'
import { GRAHAS } from '@/astro/data/grahas'
import { loadCatalog, starName, type Catalog, type CultureId, CULTURE_IDS } from './catalog'
import { SkyRenderer } from './drawSky'
import { astrolabeFit } from './instrument'
import { resetPalette } from './palette'
import { framesAt, horVec, makeProj, slerp, type Cam, type Frames, type ViewRect } from './projection'
import { Readings, MomentCard } from './Readings'
import './sky.css'

const CULTURE_LABEL: Record<CultureId, string> = {
  modern: 'Modern (IAU)', indian: 'Indian: nakshatras and rashis', indian_nakshatras: 'Nakshatras (temple carvings)', chinese: 'Chinese asterisms',
}
const SPEEDS = [
  { label: 'still', v: 0 }, { label: '1 min/s', v: 60 }, { label: '1 hour/s', v: 3600 }, { label: '1 day/s', v: 86400 },
]
const SIDEREAL_DAY_MS = 86164091
const EPS = 23.44 // the obliquity, near enough for framing the disc

/** The astrolabe: the camera on the visible celestial pole, with a field that fits the disc. */
function astrolabeCam(lat: number, view: ViewRect, zoom: number): { cam: Cam; centre: [number, number] } {
  const north = lat >= 0
  const fit = astrolabeFit(view, EPS, zoom)
  return { cam: { fwd: horVec(Math.abs(lat), north ? 0 : 180), up: [0, 0, 1], fov: fit.fov }, centre: fit.centre }
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
  const aside = useRef<HTMLElement>(null)
  const dial = useRef<HTMLDivElement>(null)
  const timeBox = useRef<HTMLDivElement>(null)
  const renderer = useRef<SkyRenderer | null>(null)
  const cam = useRef<Cam>(domeCam())
  const astroZoom = useRef(1)
  const blend = useRef(mode === 'astrolabe' ? 1 : 0)
  const flight = useRef<{ from: Cam; to: Cam; b0: number; b1: number; t0: number } | null>(null)
  // The moment the canvas shows. It runs ahead of React's `date` while dragging or while time
  // flows, and React is told only a few times a second (the readings are heavy to recompute).
  const view = useRef({ ms: date.getTime(), pushed: NaN, lastPush: 0, dragging: false })
  const request = useRef<() => void>(() => {})
  const onTable = mode === 'astrolabe' && instrument > 0.01
  const inputs = useRef({ place, ayan, lens, instrument, culture, figures, selected, speed, cat, onTable })
  inputs.current = { place, ayan, lens, instrument, culture, figures, selected, speed, cat, onTable }

  // follow the route when a new stamp is opened
  useEffect(() => {
    if (route.params.t) {
      const d = new Date(route.params.t)
      if (!isNaN(d.getTime())) setDate(d)
    }
  }, [route.params.t])

  useEffect(() => { loadCatalog().then(setCat).catch((e) => setCatErr(e.message)) }, [])
  // the readings follow the moment a beat behind, so turning the rete never waits on them
  const shown = useDeferredValue(date)
  const fm = useMemo(() => fullMoment(shown, place, ayan), [shown.getTime(), place.lat, place.lon, ayan])

  // a date set from outside the canvas (inputs, buttons, the route) moves the canvas too
  useEffect(() => {
    if (date.getTime() !== view.current.pushed) { view.current.ms = date.getTime(); request.current() }
  }, [date])
  useEffect(() => { request.current() }, [place.lat, place.lon, ayan, lens, instrument, culture, figures, selected, cat, speed, panel, onTable])

  const pushDate = (ms: number, force = false) => {
    const v = view.current
    const now = performance.now()
    if (!force && now - v.lastPush < 120) return
    v.lastPush = now
    v.pushed = ms
    startTransition(() => setDate(new Date(ms)))
  }

  // switching instrument and dome: fly the camera
  const goMode = (m: 'astrolabe' | 'dome') => {
    setMode(m)
    const vr = viewRect.current
    const to = m === 'astrolabe' ? astrolabeCam(place.lat, vr, astroZoom.current).cam : domeCam()
    if (prefersStill()) { cam.current = to; blend.current = m === 'astrolabe' ? 1 : 0; flight.current = null; request.current(); return }
    flight.current = { from: { ...cam.current }, to, b0: blend.current, b1: m === 'astrolabe' ? 1 : 0, t0: performance.now() }
    request.current()
  }

  // where the sky is framed: the canvas less the readings panel (and, on a phone, the dials)
  const viewRect = useRef<ViewRect>({ x: 0, y: 0, w: 1, h: 1 })

  // the draw loop: one frame per request, and frames only while something moves
  useEffect(() => {
    const cv = canvas.current!
    const ctx = cv.getContext('2d')!
    renderer.current ??= new SkyRenderer()
    const R = renderer.current
    let raf = 0
    let size = { w: 0, h: 0, dpr: 1 }
    let skyKey = ''
    let sky: SkyMoment | null = null
    let F: Frames | null = null
    let lastT = 0

    /** Size the canvas and frame the view; true when the backing store changed (and was cleared). */
    const measure = (): boolean => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr))
      // assigning width clears the canvas, so only do it when the size really changed
      const changed = cv.width !== W || cv.height !== H
      if (cv.width !== W) cv.width = W
      if (cv.height !== H) cv.height = H
      size = { w: r.width, h: r.height, dpr }
      const vr: ViewRect = { x: 0, y: 0, w: r.width, h: r.height }
      const pr = aside.current?.getBoundingClientRect()
      if (pr && pr.width > 0 && pr.height > 0) {
        if (pr.left - r.left > r.width * 0.3 && pr.height > r.height * 0.6) vr.w = pr.left - r.left
        else if (pr.top - r.top > r.height * 0.25 && pr.width > r.width * 0.6) vr.h = pr.top - r.top
      }
      if (r.width >= 700) {
        // on a wide screen the dials stand in a column at the left: keep the disc clear of them
        let right = 0
        for (const el of [dial.current, timeBox.current]) {
          const b = el?.getBoundingClientRect()
          if (b && b.width && b.left - r.left < 40) right = Math.max(right, b.right - r.left + 12)
        }
        if (vr.w - right > vr.h * 0.6) { vr.x = right; vr.w -= right }
      } else {
        // on a phone the dials run across the top and the bottom: frame the sky between them
        let top = vr.y, bottom = vr.y + vr.h
        for (const el of [dial.current, timeBox.current]) {
          const b = el?.getBoundingClientRect()
          if (!b || !b.height) continue
          const mid = (b.top + b.bottom) / 2 - r.top
          if (mid < vr.y + vr.h / 2) top = Math.max(top, b.bottom - r.top + 4)
          else bottom = Math.min(bottom, b.top - r.top - 4)
        }
        vr.y = top
        vr.h = Math.max(80, bottom - top)
      }
      viewRect.current = vr
      return changed
    }

    const frame = (t: number) => {
      raf = 0
      const inp = inputs.current
      const v = view.current
      const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0
      lastT = t
      if (!size.w) measure()
      // time flowing
      if (inp.speed) {
        v.ms += dt * inp.speed * 1000
        pushDate(v.ms)
      }
      // the camera in flight between astrolabe and dome
      const f = flight.current
      const astro = astrolabeCam(inp.place.lat, viewRect.current, astroZoom.current)
      if (f) {
        const u = Math.min(1, (t - f.t0) / 1000)
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
        if (f.b1 === 1) f.to = astro.cam // the disc may have been reframed mid-flight
        cam.current = {
          fwd: slerp(f.from.fwd, f.to.fwd, e),
          up: [0, 0, 1],
          fov: Math.exp(Math.log(f.from.fov) + (Math.log(f.to.fov) - Math.log(f.from.fov)) * e),
        }
        blend.current = f.b0 + (f.b1 - f.b0) * e
        if (u >= 1) flight.current = null
      } else if (blend.current >= 1) {
        cam.current = astro.cam
      }
      const animating = !!flight.current || !!inp.speed
      if (inp.cat) {
        const date = new Date(v.ms)
        const key = `${v.ms}|${inp.place.lat}|${inp.place.lon}|${inp.ayan}`
        if (key !== skyKey) {
          sky = castSky(date, inp.place, inp.ayan)
          F = framesAt(date, inp.place.lat, inp.place.lon)
          skyKey = key
        }
        const b = blend.current
        const vr = viewRect.current
        const domeC: [number, number] = [vr.x + vr.w / 2, vr.y + vr.h / 2]
        const centre: [number, number] = [domeC[0] + (astro.centre[0] - domeC[0]) * b, domeC[1] + (astro.centre[1] - domeC[1]) * b]
        const p = makeProj(cam.current, size.w, size.h, vr, centre)
        R.draw(ctx, p, F!, inp.cat, sky!, {
          instrument: inp.instrument, astrolabe: b, culture: inp.culture, showFigures: inp.figures,
          showMilkyWay: true, lens: inp.lens, lat: inp.place.lat, lon: inp.place.lon, selected: inp.selected,
          atPole: !flight.current && b >= 1, settled: !animating && !v.dragging, cssNight: !inp.onTable,
        }, size.dpr)
      }
      if (animating) raf = requestAnimationFrame(frame)
      else lastT = 0
    }
    request.current = () => { if (!raf) raf = requestAnimationFrame(frame) }

    // a resize clears the canvas: repaint at once, before the browser shows the empty frame
    const ro = new ResizeObserver(() => {
      if (measure()) { if (raf) cancelAnimationFrame(raf); raf = 0; frame(performance.now()) } else request.current()
    })
    ro.observe(cv)
    for (const el of [aside.current, dial.current, timeBox.current]) if (el) ro.observe(el)
    measure()
    // the theme and the fonts change the brass and the lettering
    const mo = new MutationObserver(() => { resetPalette(); R.invalidate(); request.current() })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] })
    const onFonts = () => { R.invalidate(); request.current() }
    document.fonts?.addEventListener?.('loadingdone', onFonts)
    request.current()
    return () => {
      cancelAnimationFrame(raf)
      raf = 0
      ro.disconnect()
      mo.disconnect()
      document.fonts?.removeEventListener?.('loadingdone', onFonts)
      request.current = () => {}
    }
  }, [])

  // pointer: in the astrolabe, dragging turns the rete (time); in the dome, it turns your head
  useEffect(() => {
    const cv = canvas.current!
    let down: { x: number; y: number; moved: boolean; ms: number; a: number; turned: number } | null = null
    const local = (e: PointerEvent | WheelEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height } }
    const pin = () => {
      const d = renderer.current?.disc
      const vr = viewRect.current
      return d ? { x: d.x, y: d.y } : { x: vr.x + vr.w / 2, y: vr.y + vr.h / 2 }
    }
    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId)
      const p = local(e)
      const c = pin()
      down = { x: p.x, y: p.y, moved: false, ms: view.current.ms, a: Math.atan2(p.y - c.y, p.x - c.x), turned: 0 }
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const p = local(e)
      const dx = p.x - down.x, dy = p.y - down.y
      if (!down.moved && Math.abs(dx) + Math.abs(dy) > 4) { down.moved = true; view.current.dragging = true }
      if (!down.moved) return
      if (blend.current > 0.5) {
        // the angle swept around the pin turns the rete: one turn is one sidereal day
        const c = pin()
        const a = Math.atan2(p.y - c.y, p.x - c.x)
        let da = a - down.a
        if (da > Math.PI) da -= 2 * Math.PI
        if (da < -Math.PI) da += 2 * Math.PI
        down.a = a
        down.turned += da
        const north = inputs.current.place.lat >= 0 ? 1 : -1
        view.current.ms = down.ms - north * (down.turned / (2 * Math.PI)) * SIDEREAL_DAY_MS
        pushDate(view.current.ms)
      } else {
        const c = cam.current
        const f = c.fwd
        const az = Math.atan2(-f[1], f[0]) * 180 / Math.PI
        const alt = Math.asin(f[2]) * 180 / Math.PI
        const k = c.fov / Math.min(viewRect.current.w, viewRect.current.h)
        const nAz = az - (e.movementX * k)
        const nAlt = Math.max(-30, Math.min(89, alt + e.movementY * k))
        cam.current = { ...c, fwd: horVec(nAlt, nAz) }
      }
      request.current()
    }
    const end = (e: PointerEvent, click: boolean) => {
      if (down && !down.moved && click) {
        const p = local(e)
        setSelected(renderer.current?.pick(p.x, p.y) ?? null)
      } else if (down?.moved) {
        pushDate(view.current.ms, true)
      }
      down = null
      view.current.dragging = false
      request.current() // one settled frame: a turned rete is redrawn crisp
    }
    const onUp = (e: PointerEvent) => end(e, true)
    const onCancel = (e: PointerEvent) => end(e, false)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (blend.current > 0.5 && !flight.current) {
        astroZoom.current = Math.max(0.8, Math.min(14, astroZoom.current * Math.exp(-e.deltaY * 0.0012)))
      } else {
        const c = cam.current
        cam.current = { ...c, fov: Math.max(8, Math.min(200, c.fov * Math.exp(e.deltaY * 0.0012))) }
      }
      request.current()
    }
    cv.addEventListener('pointerdown', onDown)
    cv.addEventListener('pointermove', onMove)
    cv.addEventListener('pointerup', onUp)
    cv.addEventListener('pointercancel', onCancel)
    cv.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      cv.removeEventListener('pointerdown', onDown)
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerup', onUp)
      cv.removeEventListener('pointercancel', onCancel)
      cv.removeEventListener('wheel', onWheel)
    }
  }, [])

  const shift = (ms: number) => { const d = view.current.ms + ms; view.current.ms = d; setDate(new Date(d)) }
  const setNow = (d: Date) => { view.current.ms = d.getTime(); setDate(d) }
  const from = route.params.from
  const localValue = toLocalInput(date)

  return (
    <div className={`sky${onTable ? ' on-table' : ''}${panel ? '' : ' folded'}`}>
      <canvas ref={canvas} className="sky-canvas" aria-label="The sky of this moment: stars, figures, and the nine grahas" />
      {catErr && <div className="sky-err">{catErr}</div>}

      <div className="sky-dial panel" ref={dial}>
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

      <div className="sky-time panel" ref={timeBox}>
        <input type="datetime-local" value={localValue} step={60} onChange={(e) => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) setNow(d) }} aria-label="Moment" />
        <div className="sky-steps">
          <button className="ascii-btn" onClick={() => shift(-86400000)} title="a day back">[ -1d ]</button>
          <button className="ascii-btn" onClick={() => shift(-3600000)} title="an hour back">[ -1h ]</button>
          <button className="ascii-btn" onClick={() => shift(3600000)} title="an hour on">[ +1h ]</button>
          <button className="ascii-btn" onClick={() => shift(86400000)} title="a day on">[ +1d ]</button>
        </div>
        <div className="dial-row">
          <select value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="Time speed">
            {SPEEDS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
          <button className="ascii-btn" onClick={() => { setSpeed(0); setNow(new Date()) }}>[ now ]</button>
          {route.params.t && <button className="ascii-btn" onClick={() => { setSpeed(0); setNow(new Date(route.params.t)) }}>[ the moment ]</button>}
          <span className="faint sans" style={{ fontSize: 12 }}>{place.name}</span>
        </div>
      </div>

      {selected && cat && <SelectedCard cat={cat} sel={selected} date={date} ayan={fm.sky.ayanamsa} onClose={() => setSelected(null)} />}

      <aside ref={aside} className={`sky-panel panel linen${panel ? '' : ' folded'}`}>
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
