// The companion: whether the current voice sits out in the corner of every view, or rests in
// its burrow in the header. Changing it is a small leap: the character jumps from the dock into
// the header button, or out of it, along an arc. Still motion skips the leap.

import { createStore } from '@/core/store'
import { prefersStill } from '@/core/settings'

export const companion = createStore<{ on: boolean }>({ on: true }, 'grain-atlas:companion')

export interface Leap {
  to: boolean                // the state the leap ends in
  from: { x: number; y: number; size: number }
  dest: { x: number; y: number; size: number }
}

export const leaping = createStore<{ leap: Leap | null }>({ leap: null })

const centre = (el: Element) => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.width }
}

/** Show or hide the companion; with motion on and both ends visible, it leaps between them. */
export function setCompanion(on: boolean): void {
  if (companion.get().on === on || leaping.get().leap) return
  const face = document.querySelector('.dock-face .voice-character')
  const home = document.querySelector('.companion-btn .voice-character')
  if (prefersStill() || !face || !home) {
    companion.set({ on })
    return
  }
  const a = centre(face), b = centre(home)
  leaping.set({ leap: on ? { to: true, from: b, dest: a } : { to: false, from: a, dest: b } })
}

export const toggleCompanion = () => setCompanion(!companion.get().on)

/** Called by the leap when it lands. */
export function landLeap(): void {
  const leap = leaping.get().leap
  if (!leap) return
  companion.set({ on: leap.to })
  leaping.set({ leap: null })
  const home = document.querySelector('.companion-btn')
  home?.animate?.(
    [{ transform: 'scale(1)' }, { transform: leap.to ? 'scale(0.86)' : 'scale(1.22)' }, { transform: 'scale(1)' }],
    { duration: 320, easing: 'ease-out' },
  )
}

/**
 * Keyframes for an arc from one point to another: a crouch, a quadratic flight that peaks above
 * both ends, a turn in the air, and a squash on landing.
 */
export function leapFrames(leap: Leap, size: number): Keyframe[] {
  const { from, dest } = leap
  const s0 = from.size / size, s1 = dest.size / size
  const peak = Math.min(from.y, dest.y) - Math.max(70, Math.abs(dest.x - from.x) * 0.18)
  const cx = (from.x + dest.x) / 2
  const spin = leap.to ? 360 : -360
  const frames: Keyframe[] = []
  const at = (x: number, y: number, sx: number, sy: number, rot: number, offset: number, opacity = 1) =>
    frames.push({ offset, opacity, transform: `translate(${x - size / 2}px, ${y - size / 2}px) rotate(${rot}deg) scale(${sx}, ${sy})` })
  at(from.x, from.y, s0, s0, 0, 0)
  at(from.x, from.y + size * s0 * 0.06, s0 * 1.12, s0 * 0.84, 0, 0.12)       // crouch
  const N = 14
  for (let i = 1; i <= N; i++) {
    const u = i / N
    const t = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2               // ease in-out along the arc
    const x = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * cx + t * t * dest.x
    const y = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * peak + t * t * dest.y
    const s = s0 + (s1 - s0) * t
    const stretch = 1 + 0.12 * Math.sin(Math.PI * u)
    at(x, y, s / stretch, s * stretch, spin * t, 0.12 + 0.76 * u)
  }
  at(dest.x, dest.y + size * s1 * 0.04, s1 * 1.14, s1 * 0.86, spin, 0.94)  // squash
  at(dest.x, dest.y, s1, s1, spin, 1, leap.to ? 1 : 0.2)
  return frames
}
