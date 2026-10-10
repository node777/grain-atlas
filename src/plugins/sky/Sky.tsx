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
import { SkyRenderer, flatOf, type SkyLayers } from './drawSky'
import { THRONE, astrolabeFit, type Disc } from './instrument'
import { drawEdge } from './edge'
import { palette, resetPalette } from './palette'
import { paintSpace } from './space'
import { type Depths, type Tilt, FACE_ON, REST_3D, clampTilt, depths, isFlat, layerTransform, lerpTilt, lighting, planeMatrix, scaleTilt, toPlane } from './tilt'
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
function astrolabeCam(lat: number, view: ViewRect, zoom: number): { cam: Cam; centre: [number, number]; Ro: number } {
  const north = lat >= 0
  const fit = astrolabeFit(view, EPS, zoom)
  return { cam: { fwd: horVec(Math.abs(lat), north ? 0 : 180), up: [0, 0, 1], fov: fit.fov }, centre: fit.centre, Ro: fit.Ro }
}
const domeCam = (az = 180, alt = 28, fov = 110): Cam => ({ fwd: horVec(alt, az), up: [0, 0, 1], fov })

/** The glint that runs across the limb's brushed face: painted once per size into an image
 *  (no mask), then only turned and faded with the tilt. */
function placeSheen(el: HTMLDivElement, d: Disc) {
  el.style.left = `${(d.x - d.Ro).toFixed(2)}px`
  el.style.top = `${(d.y - d.Ro).toFixed(2)}px`
  el.style.width = el.style.height = `${(d.Ro * 2).toFixed(2)}px`
  const k = Math.min(2, window.devicePixelRatio || 1)
  const n = Math.ceil(d.Ro * 2 * k)
  const cv = document.createElement('canvas')
  cv.width = cv.height = n
  const c = cv.getContext('2d')
  if (!c) return
  const r = n / 2, ri = (d.R / d.Ro) * r
  const glint = 'rgba(255, 244, 214, '
  if (typeof c.createConicGradient === 'function') {
    const g = c.createConicGradient(-Math.PI / 2, r, r)
    const stops: Array<[number, number]> = [[0, 0], [0.04, 0.85], [0.095, 0], [0.5, 0], [0.54, 0.5], [0.595, 0], [1, 0]]
    for (const [o, a] of stops) g.addColorStop(o, glint + a + ')')
    c.fillStyle = g
  } else c.fillStyle = glint + '0.3)'
  c.beginPath(); c.arc(r, r, r, 0, Math.PI * 2); c.arc(r, r, ri, 0, Math.PI * 2, true); c.fill('evenodd')
  el.style.backgroundImage = `url(${cv.toDataURL()})`
  el.style.backgroundSize = '100% 100%'
}

export function Sky({ route }: ViewProps) {
  const place = useStore(settings, (s) => s.place)
  const ayan = useStore(settings, (s) => s.ayanamsa)
  const lens = useStore(settings, (s) => s.lens)
  const initial = route.params.t ? new Date(route.params.t) : new Date()
  const [date, setDate] = useState<Date>(isNaN(initial.getTime()) ? new Date() : initial)
  const [speed, setSpeed] = useState(0)
  const [mode, setMode] = useState<'astrolabe' | 'dome'>(route.params.mode === 'astrolabe' ? 'astrolabe' : 'dome')  // inside the sky by default
  const [instrument, setInstrument] = useState(0.5)  // the brass half faded, the sky showing through
  const [culture, setCulture] = useState<CultureId>('indian')
  const [figures, setFigures] = useState(true)
  const [cat, setCat] = useState<Catalog | null>(null)
  const [catErr, setCatErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ kind: 'star' | 'body'; id: number | string } | null>(null)
  const [panel, setPanel] = useState(true)

  const [depth, setDepth] = useState(false)  // the instrument seen as an object, three-quarter on; flat by default

  const stage = useRef<HTMLDivElement>(null)
  const obj = useRef<HTMLDivElement>(null)
  const space = useRef<HTMLCanvasElement>(null)
  const plateC = useRef<HTMLCanvasElement>(null)
  const reteC = useRef<HTMLCanvasElement>(null)
  const limbC = useRef<HTMLCanvasElement>(null)
  const topC = useRef<HTMLCanvasElement>(null)
  const sheen = useRef<HTMLDivElement>(null)
  const edge = useRef<HTMLCanvasElement>(null)
  const aside = useRef<HTMLElement>(null)
  const dial = useRef<HTMLDivElement>(null)
  const timeBox = useRef<HTMLDivElement>(null)
  const renderer = useRef<SkyRenderer | null>(null)
  const cam = useRef<Cam>(domeCam())
  const astroZoom = useRef(1)
  const blend = useRef(mode === 'astrolabe' ? 1 : 0)
  const flight = useRef<{ from: Cam; to: Cam; b0: number; b1: number; t0: number; tFrom: Tilt; tTo: Tilt } | null>(null)
  // the instrument's tilt, and its gentle return to rest after you let it go
  const rest = useRef<Tilt>(FACE_ON)
  rest.current = depth ? REST_3D : FACE_ON
  const tilt = useRef<Tilt>(FACE_ON)
  const tiltAnim = useRef<{ from: Tilt; to: Tilt; t0: number; dur: number } | null>(null)
  const applied = useRef<{ key: string; geo: string; tilt: Tilt; op: number }>({ key: '', geo: '', tilt: FACE_ON, op: -1 })
  // The moment the canvas shows. It runs ahead of React's `date` while dragging or while time
  // flows, and React is told only a few times a second (the readings are heavy to recompute).
  const view = useRef({ ms: date.getTime(), pushed: NaN, lastPush: 0, dragging: false })
  const request = useRef<(content?: boolean) => void>(() => {})
  const inputs = useRef({ place, ayan, lens, instrument, culture, figures, selected, speed, cat })
  inputs.current = { place, ayan, lens, instrument, culture, figures, selected, speed, cat }

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
  useEffect(() => { request.current() }, [place.lat, place.lon, ayan, lens, instrument, culture, figures, selected, cat, speed, panel])

  const pushDate = (ms: number, force = false) => {
    const v = view.current
    const now = performance.now()
    if (!force && now - v.lastPush < 120) return
    v.lastPush = now
    v.pushed = ms
    startTransition(() => setDate(new Date(ms)))
  }

  /** Ease the instrument to a pose (at once, for those who prefer stillness). */
  const tiltTo = (to: Tilt, dur = 900) => {
    if (prefersStill()) { tilt.current = to; tiltAnim.current = null } else tiltAnim.current = { from: { ...tilt.current }, to, t0: performance.now(), dur }
    request.current(false)
  }
  const toggleDepth = () => { const d = !depth; setDepth(d); if (mode === 'astrolabe') tiltTo(d ? REST_3D : FACE_ON) }

  // switching instrument and dome: fly the camera; the instrument lies flat as you step inside
  const goMode = (m: 'astrolabe' | 'dome') => {
    setMode(m)
    const vr = viewRect.current
    const to = m === 'astrolabe' ? astrolabeCam(place.lat, vr, astroZoom.current).cam : domeCam()
    const tTo = m === 'astrolabe' ? rest.current : FACE_ON
    tiltAnim.current = null
    if (prefersStill()) { cam.current = to; blend.current = m === 'astrolabe' ? 1 : 0; tilt.current = tTo; flight.current = null; request.current(); return }
    flight.current = { from: { ...cam.current }, to, b0: blend.current, b1: m === 'astrolabe' ? 1 : 0, t0: performance.now(), tFrom: { ...tilt.current }, tTo }
    request.current()
  }

  // where the sky is framed: the canvas less the readings panel (and, on a phone, the dials)
  const viewRect = useRef<ViewRect>({ x: 0, y: 0, w: 1, h: 1 })

  /** A screen point (stage px) as a point on the rete's own plane, in drawing px. */
  const toDrawing = (sx: number, sy: number, plane: keyof Pick<Depths, 'rete' | 'limb'> = 'rete'): [number, number] => {
    const t = applied.current.tilt
    const d = renderer.current?.disc
    if (!d || isFlat(t)) return [sx, sy]
    const D = depths(d.Ro)
    const [X, Y] = toPlane(planeMatrix(t, D.P, D[plane]), sx - d.x, sy - d.y)
    return [X + d.x, Y + d.y]
  }

  // the draw loop: one frame per request, and frames only while something moves
  useEffect(() => {
    const layers = [plateC.current!, reteC.current!, limbC.current!, topC.current!]
    const ctx2 = (c: HTMLCanvasElement) => c.getContext('2d')!
    const L: SkyLayers = { plate: ctx2(layers[0]), rete: ctx2(layers[1]), limb: ctx2(layers[2]), top: ctx2(layers[3]) }
    renderer.current ??= new SkyRenderer()
    const R = renderer.current
    let raf = 0
    let content = true
    let size = { w: 0, h: 0, dpr: 1 }
    let skyKey = ''
    let sky: SkyMoment | null = null
    let F: Frames | null = null
    let lastT = 0
    let edgeBox: { x: number; y: number; k: number } | null = null
    // the layers' box on the stage: the whole stage, or (with the astrolabe out and resting)
    // just the disc and its throne, so the compositor moves far fewer pixels when it tilts
    let box = { x: 0, y: 0, w: 0, h: 0 }
    const ensureBox = (astro: { centre: [number, number]; Ro: number }) => {
      const inst = inputs.current.instrument
      const dpr = size.dpr
      let x = 0, y = 0, w = size.w, h = size.h
      if (blend.current >= 1 && !flight.current && inst > 0.01) {
        const [cx, cy] = astro.centre, Ro = astro.Ro + 6
        const x0 = Math.max(0, cx - Ro), y0 = Math.max(0, cy - Ro - astro.Ro * THRONE * 1.45)
        const x1 = Math.min(size.w, cx + Ro), y1 = Math.min(size.h, cy + Ro)
        // on whole device pixels, so the canvases map pixel for pixel when face-on
        x = Math.floor(x0 * dpr) / dpr; y = Math.floor(y0 * dpr) / dpr
        w = Math.ceil((x1 - x) * dpr) / dpr; h = Math.ceil((y1 - y) * dpr) / dpr
      }
      if (x === box.x && y === box.y && w === box.w && h === box.h) return
      box = { x, y, w, h }
      const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr))
      for (const cv of layers) {
        cv.style.left = `${x}px`; cv.style.top = `${y}px`; cv.style.width = `${w}px`; cv.style.height = `${h}px`
        if (cv.width !== W) cv.width = W
        if (cv.height !== H) cv.height = H
      }
      R.invalidate()
      content = true
      applied.current.geo = ''
      applied.current.key = ''
    }

    /** Frame the view on the stage; true when the stage's size or resolution changed. */
    const measure = (): boolean => {
      const r = stage.current!.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const changed = r.width !== size.w || r.height !== size.h || dpr !== size.dpr
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
      // a tilted disc stands a little taller on screen than its face: leave it room
      vr.y += vr.h * 0.02
      vr.h *= 0.96
      viewRect.current = vr
      // space, painted once per size (it is larger than the view, for parallax)
      if (space.current) paintSpace(space.current, palette())
      return changed
    }

    /** Place the instrument in depth: compositor transforms only, never a redraw. */
    const apply3D = () => {
      const inst = inputs.current.instrument
      const fl = flatOf(inst, blend.current)
      const eff = scaleTilt(tilt.current, Math.min(1, inst))
      const d = R.disc
      const flatNow = !d || fl < 0.01 || isFlat(eff)
      const A = applied.current
      if (space.current && Math.abs(A.op - fl) > 0.002) { space.current.style.opacity = fl.toFixed(3); A.op = fl }
      const key = flatNow ? 'flat' : `${eff.ax.toFixed(3)},${eff.ay.toFixed(3)},${d!.x.toFixed(1)},${d!.y.toFixed(1)},${d!.Ro.toFixed(1)},${fl.toFixed(3)}`
      if (key === A.key) return
      A.key = key
      A.tilt = flatNow ? FACE_ON : eff
      const st = stage.current!.style, os = obj.current!.style
      const sh = sheen.current
      if (flatNow) {
        st.perspective = ''
        os.transform = ''
        for (const cv of layers) cv.style.transform = ''
        if (edge.current) edge.current.style.display = 'none'
        if (sh) sh.style.display = 'none'
        if (space.current) space.current.style.transform = ''
        A.geo = ''
        return
      }
      const D = depths(d!.Ro)
      const origin = `${d!.x.toFixed(2)}px ${d!.y.toFixed(2)}px`
      const geo = `${origin}|${d!.R.toFixed(2)}|${d!.Ro.toFixed(2)}|${box.x},${box.y},${box.w},${box.h}`
      if (geo !== A.geo) {
        A.geo = geo
        st.perspectiveOrigin = origin
        os.transformOrigin = origin
        const zs = [D.plate, D.rete, D.limb, D.top]
        const local = `${(d!.x - box.x).toFixed(2)}px ${(d!.y - box.y).toFixed(2)}px`
        layers.forEach((cv, i) => { cv.style.transformOrigin = local; cv.style.transform = layerTransform(zs[i], D.P) })
        // the walls' canvas covers the disc, its throne and the room its sides need when tilted
        if (edge.current) {
          const m = D.T * 2 + 8
          const ex = Math.floor(d!.x - d!.Ro - m), ey = Math.floor(d!.y - d!.Ro * (1 + THRONE * 1.5) - m)
          const ew = Math.ceil(d!.Ro * 2 + m * 2), eh = Math.ceil(d!.Ro * (2 + THRONE * 1.5) + m * 2)
          const k = Math.min(2, window.devicePixelRatio || 1)
          const cv = edge.current
          cv.style.left = `${ex}px`; cv.style.top = `${ey}px`; cv.style.width = `${ew}px`; cv.style.height = `${eh}px`
          if (cv.width !== Math.round(ew * k)) cv.width = Math.round(ew * k)
          if (cv.height !== Math.round(eh * k)) cv.height = Math.round(eh * k)
          edgeBox = { x: ex, y: ey, k }
        }
        if (sh) placeSheen(sh, d!)
      }
      st.perspective = `${D.P}px`
      os.transform = `rotateX(${eff.ax.toFixed(3)}deg) rotateY(${eff.ay.toFixed(3)}deg)`
      // the walls, drawn for this tilt (a small canvas, flat behind the tilted layers)
      if (edge.current && edgeBox) {
        const cv = edge.current, c = cv.getContext('2d')!
        cv.style.display = 'block'
        c.setTransform(1, 0, 0, 1, 0, 0)
        c.clearRect(0, 0, cv.width, cv.height)
        c.setTransform(edgeBox.k, 0, 0, edgeBox.k, 0, 0)
        drawEdge(c, d!, D, eff, palette(), fl, edgeBox.x, edgeBox.y)
      }
      // the brass answers the lamp: a glint across the limb that swings and brightens with the tilt
      const lt = lighting(eff)
      if (sh) {
        sh.style.display = 'block'
        sh.style.opacity = (fl * (0.12 + 0.75 * lt.glare)).toFixed(3)
        sh.style.transform = `translateZ(${(D.limb + 0.4).toFixed(2)}px) rotate(${((lt.angle * 180) / Math.PI + 90).toFixed(2)}deg)`
      }
      // space drifts a little against the instrument: depth by parallax
      if (space.current) space.current.style.transform = `translate3d(${(-eff.ay * 0.55).toFixed(2)}px, ${(eff.ax * 0.45).toFixed(2)}px, 0)`
    }

    const frame = (t: number) => {
      raf = 0
      const t0 = performance.now()
      const inp = inputs.current
      const v = view.current
      const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0
      lastT = t
      if (!size.w) measure()
      // time flowing
      if (inp.speed) {
        v.ms += dt * inp.speed * 1000
        pushDate(v.ms)
        content = true
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
        // lie flat early when stepping inside; rise late when stepping back out
        const k = f.b1 === 1 ? Math.max(0, Math.min(1, (e - 0.45) / 0.55)) : Math.min(1, e * 1.8)
        tilt.current = lerpTilt(f.tFrom, f.tTo, k)
        content = true
        if (u >= 1) flight.current = null
      } else if (blend.current >= 1) {
        cam.current = astro.cam
      }
      const ta = tiltAnim.current
      if (ta && !f) {
        const u = Math.min(1, (t - ta.t0) / ta.dur)
        const e = 1 - Math.pow(1 - u, 3)
        tilt.current = lerpTilt(ta.from, ta.to, e)
        if (u >= 1) tiltAnim.current = null
      }
      const animating = !!flight.current || !!inp.speed
      ensureBox(astro)
      if (content && inp.cat) {
        content = false
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
        R.draw(L, p, F!, inp.cat, sky!, {
          instrument: inp.instrument, astrolabe: b, culture: inp.culture, showFigures: inp.figures,
          showMilkyWay: true, lens: inp.lens, lat: inp.place.lat, lon: inp.place.lon, selected: inp.selected,
          atPole: !flight.current && b >= 1, settled: !animating && !v.dragging,
        }, size.dpr, box)
      }
      apply3D()
      // measurement scripts may collect whole-frame times here (window.__skyProf = {})
      const PROF = (globalThis as { __skyProf?: Record<string, number[]> }).__skyProf
      if (PROF) (PROF.frame ??= []).push(performance.now() - t0)
      if (animating || tiltAnim.current) raf = requestAnimationFrame(frame)
      else lastT = 0
    }
    request.current = (c = true) => { if (c) content = true; if (!raf) raf = requestAnimationFrame(frame) }

    // a resize clears the canvases: repaint at once, before the browser shows an empty frame
    const ro = new ResizeObserver(() => {
      // (a new size may resize the layers, which clears them: draw in this same callback)
      if (measure()) { if (raf) cancelAnimationFrame(raf); raf = 0; content = true; frame(performance.now()) } else request.current()
    })
    ro.observe(stage.current!)
    for (const el of [aside.current, dial.current, timeBox.current]) if (el) ro.observe(el)
    measure()
    // the theme and the fonts change the brass and the lettering
    const mo = new MutationObserver(() => { resetPalette(); R.invalidate(); if (space.current) { delete space.current.dataset.key; paintSpace(space.current, palette()) } request.current() })
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

  // pointer: on the disc, dragging turns the rete (time); around it (or with the right button or
  // shift) it tilts the instrument, which eases back to rest when let go; in the dome it turns
  // your head
  useEffect(() => {
    const el = stage.current!
    type Down = { x: number; y: number; moved: boolean; ms: number; a: number; turned: number; kind: 'time' | 'tilt' | 'look'; t0: Tilt }
    let down: Down | null = null
    const local = (e: PointerEvent | WheelEvent) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
    const pin = () => {
      const d = renderer.current?.disc
      const vr = viewRect.current
      return d ? { x: d.x, y: d.y } : { x: vr.x + vr.w / 2, y: vr.y + vr.h / 2 }
    }
    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId)
      const p = local(e)
      const c = pin()
      const d = renderer.current?.disc
      const astro = blend.current > 0.5 && !flight.current
      let kind: Down['kind'] = astro ? 'time' : 'look'
      if (astro && d && inputs.current.instrument > 0.01) {
        const [lx, ly] = toDrawing(p.x, p.y, 'limb')
        // the plate and rete turn time; the brass rim (and the space around it) tilts the instrument
        if (e.button === 2 || e.shiftKey || Math.hypot(lx - d.x, ly - d.y) > d.R) kind = 'tilt'
      }
      const [qx, qy] = toDrawing(p.x, p.y)
      down = { x: p.x, y: p.y, moved: false, ms: view.current.ms, a: Math.atan2(qy - c.y, qx - c.x), turned: 0, kind, t0: { ...tilt.current } }
      if (kind === 'tilt') tiltAnim.current = null
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const p = local(e)
      const dx = p.x - down.x, dy = p.y - down.y
      if (!down.moved && Math.abs(dx) + Math.abs(dy) > 4) { down.moved = true; view.current.dragging = down.kind !== 'tilt' }
      if (!down.moved) return
      if (down.kind === 'tilt') {
        tilt.current = clampTilt({ ax: down.t0.ax - dy * 0.28, ay: down.t0.ay + dx * 0.28 })
        request.current(false)
        return
      }
      if (down.kind === 'time') {
        // the angle swept around the pin, on the rete's own plane, turns it: one turn is one sidereal day
        const c = pin()
        const [qx, qy] = toDrawing(p.x, p.y)
        const a = Math.atan2(qy - c.y, qx - c.x)
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
      if (down?.kind === 'tilt') {
        if (down.moved) tiltTo(rest.current)
      } else if (down && !down.moved && click) {
        const p = local(e)
        const [qx, qy] = toDrawing(p.x, p.y)
        setSelected(renderer.current?.pick(qx, qy) ?? null)
      } else if (down?.moved) {
        pushDate(view.current.ms, true)
      }
      const wasTime = down?.kind !== 'tilt'
      down = null
      view.current.dragging = false
      if (wasTime) request.current() // one settled frame: a turned rete is redrawn crisp
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
    const onMenu = (e: Event) => e.preventDefault()
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', onMenu)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('contextmenu', onMenu)
    }
  }, [])

  const shift = (ms: number) => { const d = view.current.ms + ms; view.current.ms = d; setDate(new Date(d)) }
  const setNow = (d: Date) => { view.current.ms = d.getTime(); setDate(d) }
  const from = route.params.from
  const localValue = toLocalInput(date)

  return (
    <div className={`sky${panel ? '' : ' folded'}`}>
      <canvas ref={space} className="sky-space" aria-hidden="true" />
      <canvas ref={edge} className="sky-edge" aria-hidden="true" />
      <div ref={stage} className="sky-stage" role="img" aria-label="The sky of this moment: an astrolabe of the stars, figures, and the nine grahas">
        <div ref={obj} className="sky-object">
          <canvas ref={plateC} className="sky-layer sky-plate" />
          <canvas ref={reteC} className="sky-layer sky-rete" />
          <canvas ref={limbC} className="sky-layer sky-limb" />
          <div ref={sheen} className="sky-sheen" />
          <canvas ref={topC} className="sky-layer sky-top" />
        </div>
      </div>
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
          <button className="chip" aria-pressed={depth} onClick={toggleDepth} title="See the astrolabe as an object, three-quarter on (drag around it to tilt it), or flat and face-on">3D</button>
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
