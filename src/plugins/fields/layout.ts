// Laying the tree out as land. Bottom-up: a folder's plot is just big enough to hold its
// sub-plots and its loose grains (files), packed in sunflower order (the golden angle) and then
// relaxed until nothing overlaps. Regions gather their rooms the same way; then regions are set
// around the Front Door by the ring and bearing MAP.md suggests. Deterministic: same tree, same map.

import { REGIONS, regionOf, type Region } from '@/grain/rooms'
import type { Entry } from '@/grain/repo'

export const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const GRAIN = 5               // world radius per file in a leaf plot
const PAD = 1.12

export interface Grain { path: string; name: string; x: number; y: number; a: number }

export interface Plot {
  path: string
  name: string
  x: number                   // centre, relative to parent until absolutized
  y: number
  r: number
  files: number
  depth: number
  furrow: number              // furrow angle (radians)
  children: Plot[]
  grains: Grain[]             // direct files, relative to plot centre
  region: Region
  /** the disc the loose files are sown in (centre relative like x/y until absolutized; lr 0 if none) */
  lx: number
  ly: number
  lr: number
  /** map view: where the atlas sets this plot (most plots stay put; a basin's dated folders are
   *  re-strung along their river), and its loose disc there. Unset until the atlas is built. */
  mx?: number
  my?: number
  mlx?: number
  mly?: number
}

export interface RegionLand {
  region: Region
  x: number
  y: number
  r: number
  hull: Array<[number, number]>
  rooms: Plot[]
  files: number
}

export interface World { regions: RegionLand[]; index: Map<string, { x: number; y: number; r: number }>; radius: number }

export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967295
}

/** Pack circles (in place) by golden angle, then relax overlaps. Returns enclosing radius. */
function pack(items: Array<{ x: number; y: number; r: number }>): number {
  if (!items.length) return 0
  items.sort((a, b) => b.r - a.r)
  const avg = items.reduce((s, i) => s + i.r, 0) / items.length
  items.forEach((it, i) => {
    const rad = i === 0 ? 0 : avg * 1.9 * Math.sqrt(i + 0.3)
    it.x = Math.cos(i * GOLDEN) * rad
    it.y = Math.sin(i * GOLDEN) * rad
  })
  const n = items.length
  for (let iter = 0; iter < (n > 60 ? 50 : 120); iter++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = items[i], b = items[j]
        let dx = b.x - a.x, dy = b.y - a.y
        let d = Math.hypot(dx, dy)
        const min = (a.r + b.r) * 1.04
        if (d < min) {
          if (d < 1e-6) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1 }
          const push = (min - d) / 2
          const ux = dx / d, uy = dy / d
          const wa = b.r / (a.r + b.r), wb = a.r / (a.r + b.r)
          a.x -= ux * push * wa * 2; a.y -= uy * push * wa * 2
          b.x += ux * push * wb * 2; b.y += uy * push * wb * 2
          moved = true
        }
      }
    }
    // gentle gravity keeps the cluster round
    for (const it of items) { it.x *= 0.985; it.y *= 0.985 }
    if (!moved && iter > 20) break
  }
  // final separation pass without gravity
  for (let iter = 0; iter < 40; iter++) {
    let moved = false
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = items[i], b = items[j]
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 1
      const min = (a.r + b.r) * 1.03
      if (d < min) {
        const push = (min - d) / 2
        a.x -= (dx / d) * push; a.y -= (dy / d) * push
        b.x += (dx / d) * push; b.y += (dy / d) * push
        moved = true
      }
    }
    if (!moved) break
  }
  // recentre on the bounding circle's centre
  let cx = 0, cy = 0
  for (const it of items) { cx += it.x; cy += it.y }
  cx /= n; cy /= n
  let R = 0
  for (const it of items) { it.x -= cx; it.y -= cy; R = Math.max(R, Math.hypot(it.x, it.y) + it.r) }
  return R
}

function grainsFor(files: string[], R: number): Grain[] {
  const n = files.length
  return files.map((p, i) => {
    const rad = R * 0.86 * Math.sqrt((i + 0.5) / n)
    const a = i * GOLDEN
    return { path: p, name: p.slice(p.lastIndexOf('/') + 1).slice(0, 34), x: Math.cos(a) * rad, y: Math.sin(a) * rad, a: a + Math.PI / 2 }
  })
}

function plotFor(entries: Map<string, Entry>, path: string, depth: number, region: Region): Plot {
  const e = entries.get(path)!
  const kids = e.children.map((c) => entries.get(c)!).filter(Boolean)
  const dirs = kids.filter((k) => k.kind === 'dir')
  const files = kids.filter((k) => k.kind !== 'dir').map((k) => k.path)
  const children = dirs.map((d) => plotFor(entries, d.path, depth + 1, region))
  const looseR = files.length ? GRAIN * Math.sqrt(files.length) * 1.25 : 0
  const items: Array<{ x: number; y: number; r: number; plot?: Plot }> = children.map((c) => ({ x: 0, y: 0, r: c.r, plot: c }))
  let loose: { x: number; y: number; r: number } | undefined
  if (files.length) { loose = { x: 0, y: 0, r: looseR }; items.push(loose) }
  let R: number
  if (items.length === 1 && loose) R = looseR
  else R = pack(items) * PAD + 4
  for (const it of items) if (it.plot) { it.plot.x = it.x; it.plot.y = it.y }
  const grains = loose ? grainsFor(files, looseR).map((g) => ({ ...g, x: g.x + loose!.x, y: g.y + loose!.y })) : []
  return {
    path, name: e.name, x: 0, y: 0, r: Math.max(R, GRAIN * 1.6), files: e.files, depth,
    furrow: hash(path) * Math.PI, children, grains, region,
    lx: loose ? loose.x : 0, ly: loose ? loose.y : 0, lr: loose ? looseR : 0,
  }
}

function hullFor(rooms: Plot[], seed: string, margin: number): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  const steps = 72
  for (let s = 0; s < steps; s++) {
    const t = (s / steps) * Math.PI * 2
    const ux = Math.cos(t), uy = Math.sin(t)
    let reach = 0
    for (const p of rooms) reach = Math.max(reach, p.x * ux + p.y * uy + p.r)
    const wobble = 1 + 0.05 * Math.sin(t * 3 + hash(seed) * 6) + 0.03 * Math.sin(t * 7 + hash(seed + 'x') * 6)
    pts.push([ux * (reach + margin) * wobble, uy * (reach + margin) * wobble])
  }
  return pts
}

export function layoutWorld(entries: Map<string, Entry>): World {
  const root = entries.get('')
  const byRegion = new Map<string, Plot[]>()
  if (root) {
    const rootFiles = root.children.filter((c) => entries.get(c)?.kind !== 'dir')
    // the root files gather as one plot: the Front Door's threshold stones
    const front = REGIONS[0]
    if (rootFiles.length) {
      const R = GRAIN * Math.sqrt(rootFiles.length) * 1.4
      byRegion.set('front', [{
        path: '', name: 'the root', x: 0, y: 0, r: R, files: rootFiles.length, depth: 0, furrow: 0.3,
        children: [], grains: grainsFor(rootFiles, R), region: front, lx: 0, ly: 0, lr: R,
      }])
    }
    for (const c of root.children) {
      const e = entries.get(c)!
      if (e.kind !== 'dir') continue
      const region = regionOf(c + '/x')
      const plot = plotFor(entries, c, 0, region)
      byRegion.set(region.id, [...(byRegion.get(region.id) ?? []), plot])
    }
  }

  const lands: RegionLand[] = []
  for (const region of REGIONS) {
    const rooms = byRegion.get(region.id)
    if (!rooms?.length) continue
    const items = rooms.map((p) => ({ x: 0, y: 0, r: p.r + 14, plot: p }))
    const R = pack(items)
    items.forEach((it) => { it.plot.x = it.x; it.plot.y = it.y })
    lands.push({
      region, x: 0, y: 0, r: R + 40, rooms, files: rooms.reduce((s, p) => s + p.files, 0),
      hull: hullFor(rooms, region.id, 46),
    })
  }

  // set regions by ring and bearing, then push apart so coasts never touch
  const ringR = [0, 1, 1.75, 2.45]
  const sorted = lands.map((l) => l.r).sort((a, b) => a - b)
  const unit = Math.max(260, sorted[Math.floor(sorted.length / 2)] * 2.6)
  for (const l of lands) {
    const a = (l.region.angle * Math.PI) / 180
    const rr = ringR[l.region.ring] * unit
    l.x = Math.cos(a) * rr
    l.y = -Math.sin(a) * rr
  }
  for (let iter = 0; iter < 200; iter++) {
    let moved = false
    for (let i = 0; i < lands.length; i++) for (let j = i + 1; j < lands.length; j++) {
      const a = lands[i], b = lands[j]
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 1
      const min = (a.r + b.r) * 1.08 + 60
      if (d < min) {
        const push = (min - d) / 2
        const fa = a.region.ring === 0 ? 0 : 1, fb = b.region.ring === 0 ? 0 : 1
        const tot = fa + fb || 1
        a.x -= (dx / d) * push * (2 * fa / tot); a.y -= (dy / d) * push * (2 * fa / tot)
        b.x += (dx / d) * push * (2 * fb / tot); b.y += (dy / d) * push * (2 * fb / tot)
        moved = true
      }
    }
    if (!moved) break
  }

  // absolutize every plot and index positions by path (for focus, journeys and the heavens)
  const index = new Map<string, { x: number; y: number; r: number }>()
  const abs = (p: Plot, ox: number, oy: number) => {
    p.x += ox; p.y += oy
    p.lx += p.x; p.ly += p.y
    index.set(p.path, { x: p.x, y: p.y, r: p.r })
    for (const g of p.grains) { g.x += p.x; g.y += p.y; index.set(g.path, { x: g.x, y: g.y, r: GRAIN }) }
    for (const c of p.children) abs(c, p.x, p.y)
  }
  let radius = 0
  for (const l of lands) {
    for (const p of l.rooms) abs(p, l.x, l.y)
    l.hull = l.hull.map(([x, y]) => [x + l.x, y + l.y])
    radius = Math.max(radius, Math.hypot(l.x, l.y) + l.r)
  }
  return { regions: lands, index, radius }
}
