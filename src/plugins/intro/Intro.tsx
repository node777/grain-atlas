// The opening: a night of stars; the stars fall and become seeds; the seeds grow into grain;
// the grain is seen from above and becomes the map. One continuous motion, skippable, and a
// single still frame for readers who prefer stillness.

import { useEffect, useRef, useState } from 'react'
import { navigate } from '@/core/router'
import type { ViewProps } from '@/core/registry'
import { settings, prefersStill, settlePlaceOnce } from '@/core/settings'
import { progress } from '@/grain/progress'
import { Mark } from '@/ui/Mark'
import './intro.css'

const N = 260
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

interface Seed { sx: number; sy: number; mag: number; gx: number; lean: number; h: number; mx: number; my: number; field: number; tw: number }

const T = { stars: 2200, fall: 1500, grow: 2300, map: 1700, title: 900 }
const T_FALL = T.stars, T_GROW = T_FALL + T.fall, T_MAP = T_GROW + T.grow, T_TITLE = T_MAP + T.map, T_END = T_TITLE + T.title

export function Intro(_: ViewProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [done, setDone] = useState(false)
  const still = prefersStill()

  const enter = (journey?: string) => {
    settings.set({ introSeen: true })
    settlePlaceOnce()
    if (journey) {
      progress.set({ activeJourney: journey })
      navigate('fields', '', { open: 'README.md', focus: 'README.md' })
    } else navigate('fields')
  }

  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    let w = 1, h = 1, dpr = 1
    const resize = () => {
      const r = cv.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width; h = r.height
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const rand = rng(20260627)
    // fields of the final map: seven plots in sunflower order around the centre
    const fields = Array.from({ length: 7 }, (_, i) => {
      const rr = i === 0 ? 0 : 0.2 * Math.sqrt(i)
      return { x: Math.cos(i * GOLDEN * 3) * rr, y: Math.sin(i * GOLDEN * 3) * rr * 0.8, r: i === 0 ? 0.09 : 0.06 + rand() * 0.04 }
    })
    const seeds: Seed[] = Array.from({ length: N }, (_, i) => {
      const field = i % fields.length
      const f = fields[field]
      const k = Math.floor(i / fields.length)
      const per = Math.ceil(N / fields.length)
      const rr = f.r * 0.9 * Math.sqrt((k + 0.5) / per)
      return {
        sx: rand(), sy: rand() * 0.72, mag: rand(), gx: 0.04 + rand() * 0.92, lean: (rand() - 0.5) * 0.35,
        h: 0.18 + rand() * 0.26, mx: f.x + Math.cos(k * GOLDEN) * rr, my: f.y + Math.sin(k * GOLDEN) * rr, field, tw: rand() * 6.28,
      }
    })

    const ease = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
    let t0 = performance.now()
    let raf = 0

    const frame = (now: number) => {
      const t = still ? T_END : now - t0
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const soil = h * 0.8
      const uFall = ease((t - T_FALL) / T.fall)
      const uGrow = ease((t - T_GROW) / T.grow)
      const uMap = ease((t - T_MAP) / T.map)

      // sky warms from night to hearth as the stars come down
      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, mix('#0f0c0a', '#2a2520', uFall * 0.8))
      sky.addColorStop(1, mix('#1b1713', '#3a332c', uFall * 0.8))
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)

      // the map's fields fade in as the grain is seen from above
      const mapScale = Math.min(w, h) * 1.15
      const cx = w / 2, cy = h * 0.52
      if (uMap > 0) {
        ctx.save()
        ctx.globalAlpha = uMap
        ctx.strokeStyle = 'rgba(154, 111, 34, 0.5)'
        ctx.setLineDash([2, 6])
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w); ctx.stroke()
        }
        ctx.setLineDash([])
        const accents = ['#d0b34a', '#9fae6c', '#b08aab', '#d38a4f', '#c8766a', '#d0b34a', '#9fae6c']
        fields.forEach((f, i) => {
          const x = cx + f.x * mapScale, y = cy + f.y * mapScale, r = f.r * mapScale
          ctx.fillStyle = 'rgba(42, 37, 32, 0.85)'
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
          ctx.save()
          ctx.clip()
          ctx.strokeStyle = accents[i]
          ctx.globalAlpha = 0.3 * uMap
          ctx.translate(x, y); ctx.rotate(i * 0.9)
          ctx.beginPath()
          for (let gx = -r; gx <= r; gx += 6) { ctx.moveTo(gx, -r); ctx.lineTo(gx, r) }
          ctx.stroke()
          ctx.restore()
          ctx.strokeStyle = accents[i]
          ctx.globalAlpha = 0.8 * uMap
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
          ctx.globalAlpha = uMap
        })
        ctx.restore()
      }

      for (const s of seeds) {
        // where the seed lies on the soil, and where it will lie on the map
        const groundX = s.gx * w
        const starX = s.sx * w, starY = s.sy * h
        const fx = starX + (groundX - starX) * uFall
        const fy = starY + (soil - starY) * (uFall * uFall)
        const mapX = cx + s.mx * mapScale, mapY = cy + s.my * mapScale

        if (uFall < 1) {
          // a star, twinkling, stretching into a falling seed
          const tw = 0.7 + 0.3 * Math.sin(t / 380 + s.tw)
          const r = (0.6 + (1 - s.mag) * 1.6) * (1 - uFall * 0.2)
          ctx.fillStyle = `rgba(246, 234, 208, ${(0.35 + (1 - s.mag) * 0.65) * tw * (1 - uFall) + uFall * 0.9})`
          ctx.beginPath()
          ctx.ellipse(fx, fy, r * (1 - uFall * 0.3), r * (1 + uFall * 1.6), 0, 0, Math.PI * 2)
          ctx.fill()
          if (uFall > 0.1) {
            ctx.fillStyle = `rgba(217, 180, 90, ${uFall})`
            ctx.beginPath(); ctx.ellipse(fx, fy, 1.6 + uFall, 2.6 + uFall * 1.4, 0.3, 0, Math.PI * 2); ctx.fill()
          }
          continue
        }

        // a stalk grows from the seed; then the whole field is seen from above
        const sway = Math.sin(t / 900 + s.tw) * 0.04 * (1 - uMap)
        const height = s.h * h * uGrow * (1 - uMap)
        const baseX = groundX + (mapX - groundX) * uMap
        const baseY = soil + (mapY - soil) * uMap
        const tipX = baseX + (s.lean + sway) * height
        const tipY = baseY - height
        if (height > 1) {
          ctx.strokeStyle = 'rgba(154, 111, 34, 0.9)'
          ctx.lineWidth = 1.3
          ctx.beginPath()
          ctx.moveTo(baseX, baseY)
          ctx.quadraticCurveTo(baseX, baseY - height * 0.6, tipX, tipY)
          ctx.stroke()
          // the ear: grains in pairs up the top of the stalk
          const grains = Math.round(6 * uGrow)
          for (let g = 0; g < grains; g++) {
            const u = 1 - g * 0.07
            const gx = baseX + (tipX - baseX) * u, gy = baseY + (tipY - baseY) * u
            for (const side of [-1, 1]) {
              ctx.fillStyle = '#d9b45a'
              ctx.beginPath()
              ctx.ellipse(gx + side * 2.6, gy, 1.9, 3.4, side * 0.5 + s.lean, 0, Math.PI * 2)
              ctx.fill()
            }
          }
          ctx.strokeStyle = 'rgba(217, 180, 90, 0.7)'
          ctx.lineWidth = 0.8
          ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(tipX + s.lean * 6, tipY - 9); ctx.stroke()
        } else {
          // seen from above: one grain on the map
          ctx.fillStyle = '#d9b45a'
          ctx.beginPath(); ctx.ellipse(baseX, baseY, 1.7, 2.8, s.tw, 0, Math.PI * 2); ctx.fill()
        }
      }

      // the soil line while things grow
      if (uFall > 0 && uMap < 1) {
        ctx.strokeStyle = `rgba(154, 111, 34, ${0.6 * (1 - uMap) * uFall})`
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(0, soil + 4); ctx.lineTo(w, soil + 4); ctx.stroke()
      }

      if (t >= T_TITLE && !done) setDone(true)
      if (t < T_END + 50) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const skip = () => { t0 = performance.now() - T_END }
    cv.addEventListener('click', skip)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); cv.removeEventListener('click', skip) }
  }, [])

  return (
    <div className="intro">
      <canvas ref={ref} className="intro-canvas" aria-hidden="true" />
      <div className={`intro-title${done ? ' on' : ''}`}>
        <Mark size={54} />
        <h1>Grain <em>Atlas</em></h1>
        <p>A grain is a tree you can hold.</p>
        <p className="intro-sub">A map, a ledger and a sky of the grain tree, with every moment read in the stars.</p>
        <div className="intro-actions">
          <button className="chip intro-go" onClick={() => enter('three-doors')}>Begin where grain begins</button>
          <button className="chip" onClick={() => enter()}>Wander the fields</button>
        </div>
        <p className="intro-note sans">The atlas may ask for your location once, to cast the sky where you are. Say no and it casts from Ujjain.</p>
        <p className="intro-by">an atlas by DJINN</p>
      </div>
      {!done && <button className="ascii-btn intro-skip" onClick={() => setDone(true)}>[ skip ]</button>}
    </div>
  )
}

function mix(a: string, b: string, u: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * u)).join(',')})`
}
