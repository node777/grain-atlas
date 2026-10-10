// A voice's face, drawn from simple shapes: a soft head, big eyes, a small mouth, a crown that
// says which element row it belongs to. It breathes, blinks, looks toward the pointer, and its
// mouth moves while it speaks. Still motion leaves it calm and open-eyed.

import { useEffect, useId, useRef, useState } from 'react'
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

export function Character({ look, size = 72, speaking, thinking, mood = 'idle', title }: Props) {
  const uid = useId().replace(/:/g, '')
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
      t = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 140); loop() }, 2400 + Math.random() * 3200)
    }
    loop()
    return () => clearTimeout(t)
  }, [still])

  // eyes follow the pointer, gently
  useEffect(() => {
    if (still) return
    const onMove = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
      const d = Math.hypot(dx, dy) || 1
      const k = Math.min(1, d / 400)
      setGaze({ x: (dx / d) * 2.6 * k, y: (dy / d) * 2 * k })
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [still])

  // a moving mouth while speaking
  useEffect(() => {
    if (!speaking || still) { setMouthOpen(0); return }
    const id = setInterval(() => setMouthOpen(0.3 + Math.random() * 0.7), 110)
    return () => clearInterval(id)
  }, [speaking, still])

  const smile = mood === 'happy' ? Math.max(0.8, look.mouth) : mood === 'focused' ? 0.2 : look.mouth
  const lids = mood === 'sleepy' ? 0.55 : thinking ? Math.max(look.lids, 0.25) : look.lids
  const eyeR = 6.2 * look.eyes
  const eyeY = 54
  const lidH = blink ? eyeR * 2.2 : eyeR * 2 * lids
  const gx = thinking ? 2.2 : gaze.x, gy = thinking ? -2.4 : gaze.y
  const mouthW = 9
  const curve = smile * 6
  const open = mouthOpen * 5

  return (
    <svg
      ref={ref}
      className={`voice-character${still ? '' : ' alive'}${speaking ? ' speaking' : ''}`}
      width={size} height={size} viewBox="0 -10 100 106" role="img" aria-label={title ?? 'a voice'}
      style={{ ['--bob' as string]: `${2.6 - look.bob * 1.4}s`, ['--lift' as string]: `${1 + look.bob * 2.5}px` }}
    >
      <defs>
        <radialGradient id={`g${uid}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#fff6e4" stopOpacity="0.55" />
          <stop offset="60%" stopColor={look.hue} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="94" rx="26" ry="4" fill="rgba(0,0,0,0.22)" className="vc-shadow" />
      <g className="vc-body">
        <Crown kind={look.crown} color={look.accent} />
        {look.ears === 'leaf' && <g fill={look.accent}><ellipse cx="14" cy="46" rx="5" ry="10" transform="rotate(-30 14 46)" /><ellipse cx="86" cy="46" rx="5" ry="10" transform="rotate(30 86 46)" /></g>}
        {look.ears === 'round' && <g fill={look.hue} stroke={look.accent} strokeWidth="1.5"><circle cx="18" cy="30" r="8" /><circle cx="82" cy="30" r="8" /></g>}
        {look.ears === 'point' && <g fill={look.hue} stroke={look.accent} strokeWidth="1.5"><path d="M18 36 L14 14 L32 26 Z" /><path d="M82 36 L86 14 L68 26 Z" /></g>}
        <path d={HEADS[look.head]} fill={look.hue} stroke={look.accent} strokeWidth="2" />
        <path d={HEADS[look.head]} fill={`url(#g${uid})`} />
        {look.cheeks && <g fill={look.accent} opacity="0.32"><ellipse cx="27" cy="66" rx="7" ry="4.5" /><ellipse cx="73" cy="66" rx="7" ry="4.5" /></g>}
        {/* brows */}
        <g stroke="#3a2a1c" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.75">
          <path d={`M${31} ${40 - look.brows * 2} Q37 ${37 - look.brows * 3} ${43} ${40 - look.brows}`} />
          <path d={`M${57} ${40 - look.brows} Q63 ${37 - look.brows * 3} ${69} ${40 - look.brows * 2}`} />
        </g>
        {/* eyes */}
        {[37, 63].map((cx) => (
          <g key={cx}>
            <ellipse cx={cx} cy={eyeY} rx={eyeR} ry={eyeR * 1.1} fill="#2b1f16" />
            <circle cx={cx + gx - eyeR * 0.3} cy={eyeY + gy - eyeR * 0.4} r={eyeR * 0.36} fill="#fffaf0" />
            <circle cx={cx + gx + eyeR * 0.35} cy={eyeY + gy + eyeR * 0.3} r={eyeR * 0.16} fill="#fffaf0" opacity="0.8" />
            {lidH > 0.2 && <rect x={cx - eyeR - 1} y={eyeY - eyeR * 1.15 - 1} width={eyeR * 2 + 2} height={Math.min(lidH, eyeR * 2.3)} fill={look.hue} />}
          </g>
        ))}
        {/* mouth */}
        {open > 0.5
          ? <ellipse cx="50" cy={72 + curve * 0.2} rx={mouthW * 0.55} ry={open * 0.8 + 1} fill="#5a2e22" />
          : <path d={`M${50 - mouthW} 72 Q50 ${72 + curve} ${50 + mouthW} 72`} stroke="#3a2a1c" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
        {thinking && <g fill={look.accent} className="vc-think"><circle cx="86" cy="22" r="2.4" /><circle cx="92" cy="12" r="3.4" /><circle cx="97" cy="0" r="4.4" /></g>}
      </g>
    </svg>
  )
}
