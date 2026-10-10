// A voice's face, drawn from a few flat shapes in the cloth's own dyes: a soft head with one
// ink line, two big eyes, a small mouth, and a crown for its element row. It breathes, blinks,
// glances toward the pointer, and its mouth moves while it speaks. A few lit voices (look.gloss)
// carry a sheen and a catchlight. Still motion leaves it calm and open-eyed.

import { useEffect, useRef, useState } from 'react'
import type { Look } from './voices'
import { prefersStill } from '@/core/settings'

interface Props {
  look: Look
  size?: number
  speaking?: boolean
  thinking?: boolean
  mood?: 'idle' | 'happy' | 'focused' | 'sleepy'
  title?: string
}

const HEADS: Record<Look['head'], string> = {
  round: 'M50 14 C74 14 88 32 88 54 C88 76 72 90 50 90 C28 90 12 76 12 54 C12 32 26 14 50 14 Z',
  seed: 'M50 10 C70 16 86 34 86 56 C86 78 70 91 50 91 C30 91 14 78 14 56 C14 34 30 16 50 10 Z',
  drop: 'M50 8 C58 22 86 38 86 60 C86 80 70 92 50 92 C30 92 14 80 14 60 C14 38 42 22 50 8 Z',
  bell: 'M50 14 C70 14 80 30 82 50 C84 66 90 76 90 84 C90 89 80 91 50 91 C20 91 10 89 10 84 C10 76 16 66 18 50 C20 30 30 14 50 14 Z',
  leaf: 'M50 12 C76 20 90 40 86 60 C82 80 66 92 50 92 C34 92 18 80 14 60 C10 40 24 20 50 12 Z',
  moon: 'M52 12 C76 14 90 34 88 56 C86 78 70 92 48 90 C28 88 12 72 12 52 C12 30 30 10 52 12 Z',
}

function Crown({ kind, color }: { kind: Look['crown']; color: string }) {
  switch (kind) {
    case 'sprout':
      return <g fill={color}><path d="M50 16 C50 8 50 6 50 2" stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" /><ellipse cx="44" cy="6" rx="6" ry="3.2" transform="rotate(-24 44 6)" /><ellipse cx="56" cy="5" rx="6" ry="3.2" transform="rotate(24 56 5)" /></g>
    case 'wheat':
      return <g fill={color}><path d="M50 16 V-2" stroke={color} strokeWidth="2" strokeLinecap="round" />{[0, 6, 12].map((y) => <g key={y}><ellipse cx="46" cy={10 - y} rx="2.6" ry="4.6" transform={`rotate(-26 46 ${10 - y})`} /><ellipse cx="54" cy={10 - y} rx="2.6" ry="4.6" transform={`rotate(26 54 ${10 - y})`} /></g>)}</g>
    case 'star':
      return <path d="M50 -4 L53 6 L63 7 L55 12 L58 21 L50 15 L42 21 L45 12 L37 7 L47 6 Z" fill={color} />
    case 'flame':
      return <path d="M50 18 C40 10 46 2 50 -4 C52 4 60 6 56 14 C55 17 52 18 50 18 Z" fill={color} />
    case 'ripple':
      return <g fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M36 10 Q43 4 50 10 T64 10" /><path d="M40 3 Q45 -1 50 3 T60 3" /></g>
    case 'antenna':
      return <g><path d="M50 16 V2" stroke={color} strokeWidth="2" /><circle cx="50" cy="1" r="4" fill={color} /></g>
    case 'halo':
      return <ellipse cx="50" cy="6" rx="18" ry="5" fill="none" stroke={color} strokeWidth="2.4" />
    default:
      return null
  }
}

/** One ink for every line, warm enough to sit on Stone and on Hearth. */
const INK = '#34291f'

/** A colour pushed most of the way to warm white: the eye of a voice keeps a breath of its dye. */
function brighten(hex: string, t: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#fdf9ee'
  const n = parseInt(m[1], 16)
  const mix = (c: number, w: number) => Math.round(c + (w - c) * t)
  const r = mix((n >> 16) & 255, 255), g = mix((n >> 8) & 255, 252), b = mix(n & 255, 242)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export function Character({ look, size = 72, speaking, thinking, mood = 'idle', title }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const [blink, setBlink] = useState(false)
  const [gaze, setGaze] = useState({ x: 0, y: 0 })
  const [mouthOpen, setMouthOpen] = useState(0)
  const still = prefersStill()

  // blink every few seconds
  useEffect(() => {
    if (still) return
    let t: ReturnType<typeof setTimeout>
    const loop = () => {
      t = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 130); loop() }, 2600 + Math.random() * 3400)
    }
    loop()
    return () => clearTimeout(t)
  }, [still])

  // eyes glance toward the pointer, gently; updates are coalesced to one per frame
  useEffect(() => {
    if (still) return
    let raf = 0, last: PointerEvent | null = null
    const apply = () => {
      raf = 0
      const r = ref.current?.getBoundingClientRect()
      if (!r || !last) return
      const dx = last.clientX - (r.left + r.width / 2), dy = last.clientY - (r.top + r.height / 2)
      const d = Math.hypot(dx, dy) || 1
      const k = Math.min(1, d / 360)
      const x = Math.round((dx / d) * 2.4 * k * 4) / 4, y = Math.round((dy / d) * 1.8 * k * 4) / 4
      setGaze((g) => (g.x === x && g.y === y ? g : { x, y }))
    }
    const onMove = (e: PointerEvent) => { last = e; if (!raf) raf = requestAnimationFrame(apply) }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { window.removeEventListener('pointermove', onMove); if (raf) cancelAnimationFrame(raf) }
  }, [still])

  // a moving mouth while speaking
  useEffect(() => {
    if (!speaking || still) { setMouthOpen(0); return }
    const id = setInterval(() => setMouthOpen(0.3 + Math.random() * 0.7), 120)
    return () => clearInterval(id)
  }, [speaking, still])

  const smile = mood === 'happy' ? Math.max(0.8, look.mouth) : mood === 'focused' ? 0.2 : look.mouth
  const lids = mood === 'sleepy' ? 0.6 : thinking ? Math.max(look.lids, 0.25) : look.lids
  const r = 8.6 * look.eyes
  const rx = r * 0.9
  const ryOpen = r * 1.08
  const ry = ryOpen * (1 - lids * 0.6)
  const eyeY = 56 + (ryOpen - ry) * 0.5
  const gx = thinking ? 2 : gaze.x, gy = thinking ? -2 : gaze.y
  const mouthY = 73
  const white = brighten(look.hue, 0.86)
  const curve = smile * 5
  const open = mouthOpen * 4.5

  return (
    <svg
      ref={ref}
      className={`voice-character${still ? '' : ' alive'}${speaking ? ' speaking' : ''}`}
      width={size} height={size} viewBox="0 -10 100 106" role="img" aria-label={title ?? 'a voice'}
      style={{ ['--bob' as string]: `${2.8 - look.bob * 1.4}s`, ['--lift' as string]: `${1 + look.bob * 2.2}px` }}
    >
      <ellipse cx="50" cy="94" rx="24" ry="3.6" fill="rgba(0,0,0,0.16)" className="vc-shadow" />
      <g className="vc-body">
        <Crown kind={look.crown} color={look.accent} />
        {look.ears === 'leaf' && <g fill={look.accent}><ellipse cx="14" cy="46" rx="5" ry="10" transform="rotate(-30 14 46)" /><ellipse cx="86" cy="46" rx="5" ry="10" transform="rotate(30 86 46)" /></g>}
        {look.ears === 'round' && <g fill={look.hue} stroke={INK} strokeWidth="2"><circle cx="18" cy="30" r="8" /><circle cx="82" cy="30" r="8" /></g>}
        {look.ears === 'point' && <g fill={look.hue} stroke={INK} strokeWidth="2" strokeLinejoin="round"><path d="M18 36 L14 14 L32 26 Z" /><path d="M82 36 L86 14 L68 26 Z" /></g>}
        <path d={HEADS[look.head]} fill={look.hue} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
        {look.gloss && <ellipse cx="34" cy="31" rx="11" ry="6" transform="rotate(-24 34 31)" fill="#fff8ea" opacity="0.3" />}
        {look.cheeks && <g fill={look.accent} opacity="0.28"><circle cx="24" cy="69" r="5.5" /><circle cx="76" cy="69" r="5.5" /></g>}
        {/* eyes: bright, nearly white, tinted with the voice's own dye; a small ink pupil glances */}
        {[35, 65].map((cx) => blink
          ? <path key={cx} d={`M${cx - rx} ${eyeY} Q${cx} ${eyeY + 3} ${cx + rx} ${eyeY}`} stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" />
          : (
            <g key={cx}>
              <ellipse cx={cx} cy={eyeY} rx={rx} ry={ry} fill={white} stroke={INK} strokeWidth="2" />
              <ellipse cx={cx + gx * 1.15} cy={eyeY + gy * 1.1 + ry * 0.08} rx={rx * 0.46} ry={Math.min(ry * 0.6, rx * 0.52)} fill={INK} />
              {look.gloss && <circle cx={cx + gx * 1.15 - rx * 0.16} cy={eyeY + gy * 1.1 - ry * 0.1} r={r * 0.15} fill="#fffdf6" />}
            </g>
          ))}
        {/* mouth */}
        {open > 0.5
          ? <ellipse cx="50" cy={mouthY + 1} rx="4.6" ry={open * 0.7 + 1.2} fill={INK} />
          : <path d={`M44 ${mouthY} Q50 ${mouthY + curve} 56 ${mouthY}`} stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" />}
        {thinking && <g fill={look.accent} className="vc-think"><circle cx="86" cy="22" r="2.4" /><circle cx="92" cy="12" r="3.4" /><circle cx="97" cy="0" r="4.4" /></g>}
      </g>
    </svg>
  )
}
