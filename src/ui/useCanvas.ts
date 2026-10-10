// A pan-and-zoom canvas: wheel or pinch to zoom at the pointer, drag to pan, click to pick.
// Draws on demand (only when something changed), sized for the device pixel ratio.
//
// The wheel sets a zoom target rather than the zoom itself: each event's delta is normalised
// (lines and pages become pixels) and capped, so a hard flick on a trackpad or a fast wheel
// cannot hurl the view to its limit, and the camera eases toward the target over a few frames.

import { useCallback, useEffect, useRef } from 'react'
import { prefersStill } from '@/core/settings'

export interface Camera { x: number; y: number; k: number }

export interface CanvasApi {
  camera: React.MutableRefObject<Camera>
  size: React.MutableRefObject<{ w: number; h: number; dpr: number }>
  redraw: () => void
  flyTo: (target: Camera, ms?: number) => void
  toWorld: (sx: number, sy: number) => { x: number; y: number }
  toScreen: (wx: number, wy: number) => { x: number; y: number }
}

interface Options {
  draw: (ctx: CanvasRenderingContext2D, api: CanvasApi, t: number) => void
  onPick?: (sx: number, sy: number, api: CanvasApi) => void
  onHover?: (sx: number, sy: number, api: CanvasApi) => void
  /** zoom limits; a function is read each time, for limits that follow the content */
  minK?: number | (() => number)
  maxK?: number | (() => number)
  animate?: boolean       // keep drawing every frame (for twinkles and drifting skies)
}

export function useCanvas(opts: Options) {
  const ref = useRef<HTMLCanvasElement>(null)
  const camera = useRef<Camera>({ x: 0, y: 0, k: 1 })
  const size = useRef({ w: 1, h: 1, dpr: 1 })
  const dirty = useRef(true)
  const optsRef = useRef(opts)
  optsRef.current = opts
  const fly = useRef<{ from: Camera; to: Camera; t0: number; ms: number } | null>(null)
  /** where the wheel is taking the zoom, and the screen point it zooms about */
  const wheel = useRef<{ k: number; sx: number; sy: number } | null>(null)

  const toWorld = useCallback((sx: number, sy: number) => {
    const c = camera.current, s = size.current
    return { x: (sx - s.w / 2) / c.k + c.x, y: (sy - s.h / 2) / c.k + c.y }
  }, [])
  const toScreen = useCallback((wx: number, wy: number) => {
    const c = camera.current, s = size.current
    return { x: (wx - c.x) * c.k + s.w / 2, y: (wy - c.y) * c.k + s.h / 2 }
  }, [])
  const redraw = useCallback(() => { dirty.current = true }, [])
  const flyTo = useCallback((to: Camera, ms = 1000) => {
    wheel.current = null
    if (prefersStill() || ms <= 0) { camera.current = { ...to }; dirty.current = true; return }
    fly.current = { from: { ...camera.current }, to, t0: performance.now(), ms }
  }, [])
  const api: CanvasApi = { camera, size, redraw, flyTo, toWorld, toScreen }
  const apiRef = useRef(api)

  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    let raf = 0
    const resize = () => {
      const rect = cv.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      size.current = { w: rect.width, h: rect.height, dpr }
      cv.width = Math.round(rect.width * dpr)
      cv.height = Math.round(rect.height * dpr)
      dirty.current = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(cv)
    resize()
    let last = performance.now()
    const loop = (t: number) => {
      const dt = Math.min(64, t - last)
      last = t
      const w = wheel.current
      if (w) {
        // ease toward the wheel's target in log space: about 90% of the way in 150 ms
        const lk = Math.log(camera.current.k), lt = Math.log(w.k)
        const step = Math.abs(lt - lk) < 0.002 ? lt - lk : (lt - lk) * (1 - Math.exp(-dt / 65))
        zoomAt(w.sx, w.sy, Math.exp(step))
        if (Math.abs(lt - Math.log(camera.current.k)) < 0.0005) wheel.current = null
      }
      const f = fly.current
      if (f) {
        const u = Math.min(1, (t - f.t0) / f.ms)
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
        // zoom interpolates in log space so the flight feels even
        const lk = Math.log(f.from.k) + (Math.log(f.to.k) - Math.log(f.from.k)) * e
        camera.current = { x: f.from.x + (f.to.x - f.from.x) * e, y: f.from.y + (f.to.y - f.from.y) * e, k: Math.exp(lk) }
        dirty.current = true
        if (u >= 1) fly.current = null
      }
      if (dirty.current || optsRef.current.animate) {
        dirty.current = false
        const s = size.current
        ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
        ctx.clearRect(0, 0, s.w, s.h)
        optsRef.current.draw(ctx, apiRef.current, t)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    // pointer handling: drag to pan, pinch to zoom, tap to pick
    const pts = new Map<number, { x: number; y: number }>()
    let down: { x: number; y: number; moved: boolean } | null = null
    let pinch: { d: number; k: number } | null = null
    const local = (e: PointerEvent | WheelEvent) => {
      const r = cv.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const limit = (v: number | (() => number) | undefined, d: number) => (typeof v === 'function' ? v() : v ?? d)
    const clampK = (k: number) => Math.max(limit(optsRef.current.minK, 0.02), Math.min(limit(optsRef.current.maxK, 40), k))
    const zoomAt = (sx: number, sy: number, factor: number) => {
      const before = toWorld(sx, sy)
      camera.current.k = clampK(camera.current.k * factor)
      const after = toWorld(sx, sy)
      camera.current.x += before.x - after.x
      camera.current.y += before.y - after.y
      dirty.current = true
    }
    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId)
      const p = local(e)
      pts.set(e.pointerId, p)
      fly.current = null
      wheel.current = null
      if (pts.size === 1) down = { ...p, moved: false }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: camera.current.k }
      }
    }
    const onMove = (e: PointerEvent) => {
      const p = local(e)
      const prev = pts.get(e.pointerId)
      if (!prev) { optsRef.current.onHover?.(p.x, p.y, apiRef.current); return }
      pts.set(e.pointerId, p)
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        zoomAt(mid.x, mid.y, clampK(pinch.k * (d / pinch.d)) / camera.current.k)
        return
      }
      if (down) {
        const dx = p.x - prev.x, dy = p.y - prev.y
        if (Math.abs(p.x - down.x) + Math.abs(p.y - down.y) > 4) down.moved = true
        camera.current.x -= dx / camera.current.k
        camera.current.y -= dy / camera.current.k
        dirty.current = true
      }
    }
    const onUp = (e: PointerEvent) => {
      const p = local(e)
      if (down && !down.moved && pts.size === 1) optsRef.current.onPick?.(p.x, p.y, apiRef.current)
      pts.delete(e.pointerId)
      if (pts.size < 2) pinch = null
      if (pts.size === 0) down = null
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = local(e)
      fly.current = null
      // pixels, whatever the device reports; a pinch (ctrlKey) moves in small, fine steps
      const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? size.current.h : 1)
      const step = Math.max(-1, Math.min(1, px / 240)) * (e.ctrlKey ? 0.6 : 0.36)
      // the target may run at most ~3x ahead of the view, so momentum scrolling stays in hand
      const now = camera.current.k
      const from = wheel.current?.k ?? now
      const k = clampK(Math.min(now * 3, Math.max(now / 3, from * Math.exp(-step))))
      if (prefersStill()) { zoomAt(p.x, p.y, k / camera.current.k); return }
      wheel.current = { k, sx: p.x, sy: p.y }
    }
    const onLeave = () => optsRef.current.onHover?.(-1, -1, apiRef.current)
    cv.addEventListener('pointerdown', onDown)
    cv.addEventListener('pointermove', onMove)
    cv.addEventListener('pointerup', onUp)
    cv.addEventListener('pointercancel', onUp)
    cv.addEventListener('pointerleave', onLeave)
    cv.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      cv.removeEventListener('pointerdown', onDown)
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerup', onUp)
      cv.removeEventListener('pointercancel', onUp)
      cv.removeEventListener('pointerleave', onLeave)
      cv.removeEventListener('wheel', onWheel)
    }
  }, [])

  return { ref, api }
}

/** Read a CSS custom property (for drawing with the theme's own colours). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
