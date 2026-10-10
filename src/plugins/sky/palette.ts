// The sky's colours, read once per theme from the Linengrow tokens (src/styles/tokens.css).
// The night and the brass are shared by Stone and Hearth; only the table the astrolabe lies on
// (the page) changes with the mode.

import { cssVar } from '@/ui/useCanvas'

export interface Palette {
  mode: string
  skyDeep: string
  sky: string
  haze: string
  star: string
  starWarm: string
  brass: string
  brassDim: string
  gold: string
  goldPale: string
  madder: string        // the horizon: the shared madder of the element rows
  elder: string
  sage: string
  weld: string
  annatto: string
  page: string
  /** brass shading stops, light to dark, for the worked metal of the limb, rete and rule */
  metal: [string, string, string, string]
}

const FALLBACK: Record<string, string> = {
  '--sky-deep': '#120f0c', '--sky': '#1b1713', '--sky-haze': '#2a221b', '--star': '#f6ead0', '--star-warm': '#f1c98b',
  '--brass': '#c8992f', '--brass-dim': '#9a6f22', '--gold': '#d9b45a', '--gold-pale': '#f4e9cf',
  '--el-water': '#c8766a', '--el-aether': '#b08aab', '--el-air': '#9fae6c', '--el-earth': '#d0b34a', '--el-fire': '#d38a4f',
  '--page': '#2a2520',
}

let cache: Palette | null = null
let cacheKey = ''

const read = (name: string) => {
  const v = typeof document === 'undefined' ? '' : cssVar(name)
  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : FALLBACK[name]
}

export function palette(): Palette {
  const mode = (typeof document !== 'undefined' && document.documentElement.dataset.mode) || 'hearth'
  if (cache && cacheKey === mode) return cache
  const brass = read('--brass'), dim = read('--brass-dim'), gold = read('--gold'), pale = read('--gold-pale')
  cache = {
    mode,
    skyDeep: read('--sky-deep'), sky: read('--sky'), haze: read('--sky-haze'), star: read('--star'), starWarm: read('--star-warm'),
    brass, brassDim: dim, gold, goldPale: pale,
    madder: read('--el-water'), elder: read('--el-aether'), sage: read('--el-air'), weld: read('--el-earth'), annatto: read('--el-fire'),
    page: read('--page'),
    metal: [mix(pale, gold, 0.35), gold, brass, mix(dim, '#000000', 0.45)],
  }
  cacheKey = mode
  return cache
}

/** Forget the cached palette (the theme changed). */
export const resetPalette = () => { cache = null }

const hexCache = new Map<string, [number, number, number]>()
function parse(hex: string): [number, number, number] {
  let c = hexCache.get(hex)
  if (!c) {
    const h = hex.replace('#', '')
    const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6), 16)
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    hexCache.set(hex, c)
  }
  return c
}

const rgbaCache = new Map<string, string>()
/** `rgba()` for a token colour at an alpha; memoised at 1/200 steps so hot paths do not build strings. */
export function rgba(hex: string, a: number): string {
  const q = Math.max(0, Math.min(200, Math.round(a * 200)))
  const key = hex + q
  let s = rgbaCache.get(key)
  if (!s) {
    const [r, g, b] = parse(hex)
    s = `rgba(${r}, ${g}, ${b}, ${q / 200})`
    if (rgbaCache.size > 4000) rgbaCache.clear()
    rgbaCache.set(key, s)
  }
  return s
}

/** Mix two hex colours (t = 0 gives a, 1 gives b). */
export function mix(a: string, b: string, t: number): string {
  const x = parse(a), y = parse(b)
  const c = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0')
  return `#${c(0)}${c(1)}${c(2)}`
}
