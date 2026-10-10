// Reader preferences, kept in this browser only.

import { createStore } from './store'
import { DEFAULT_PLACE, type Place } from '@/astro/positions'
import type { AyanamsaId } from '@/astro/ayanamsa'
import { nearestCity } from '@/astro/cities'

export type Mode = 'hearth' | 'stone'
export type ElementRow = 'aether' | 'air' | 'fire' | 'water' | 'earth'
export type Lens = 'jyotish' | 'grain' | 'western'

export interface Settings {
  mode: Mode
  element: ElementRow
  motion: 'full' | 'still'
  place: Place
  placeSource: 'unset' | 'geolocation' | 'manual' | 'fallback'
  ayanamsa: AyanamsaId
  /** jyotish: sidereal signs; grain: tropical signs + sidereal nakshatras (the grain caster's
   *  hybrid); western: tropical throughout. */
  lens: Lens
  nakshatraOrder: 'ashvini' | 'krittika'
  owner: string
  repo: string
  branch: string
  token: string
  introSeen: boolean
}

export const DEFAULT_REPO = { owner: 'grain-ww', repo: 'grain', branch: 'main' }

export const settings = createStore<Settings>(
  {
    mode: 'hearth',
    element: 'earth',
    motion: 'full',
    place: DEFAULT_PLACE,
    placeSource: 'unset',
    ayanamsa: 'lahiri',
    lens: 'jyotish',
    nakshatraOrder: 'ashvini',
    ...DEFAULT_REPO,
    token: '',
    introSeen: false,
  },
  'grain-atlas:settings',
)

// The default place moved from Ujjain to Reno; readers who never chose a place follow it.
{
  const s = settings.get()
  if ((s.placeSource === 'fallback' || s.placeSource === 'unset') && s.place.name === 'Ujjain') settings.set({ place: DEFAULT_PLACE })
}

/** Ask once for the reader's location; Reno, Nevada stays the place when the answer is no. */
export function settlePlaceOnce(): void {
  const s = settings.get()
  if (s.placeSource !== 'unset') return
  if (!('geolocation' in navigator)) {
    settings.set({ placeSource: 'fallback' })
    return
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = Math.round(pos.coords.latitude * 1000) / 1000
      const lon = Math.round(pos.coords.longitude * 1000) / 1000
      const near = nearestCity(lat, lon)
      settings.set({
        place: { lat, lon, name: near && near.km < 60 ? near.name : 'Your place' },
        placeSource: 'geolocation',
      })
    },
    () => settings.set({ placeSource: 'fallback', place: DEFAULT_PLACE }),
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 86400000 },
  )
}

export function applyTheme(s: Settings): void {
  const root = document.documentElement
  root.dataset.mode = s.mode
  root.dataset.element = s.element
  root.dataset.motion = s.motion
}

export const prefersStill = (): boolean =>
  settings.get().motion === 'still' ||
  (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
