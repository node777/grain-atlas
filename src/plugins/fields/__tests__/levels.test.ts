import { describe, expect, it } from 'vitest'
import { targetLevel, shownLevel, buildLevel, LruStore } from '../levels'

describe('target level', () => {
  it('holds still while the zoom wavers', () => {
    let z: number | null = null
    const seen = new Set<number>()
    for (const ideal of [3.0, 3.1, 2.95, 3.12, 2.4, 2.2, 3.1]) seen.add(z = targetLevel(ideal, z))
    expect([...seen]).toEqual([3])
  })
  it('moves up as soon as the screen would blow a level up by more than a tenth', () => {
    expect(targetLevel(3.2, 3)).toBe(4)
    expect(targetLevel(1.9, 3)).toBe(2)
  })
})

describe('shown level', () => {
  const only = (...levels: number[]) => (z: number) => levels.includes(z)
  it('shows the target once it is complete', () => {
    expect(shownLevel(5, 2, -3, only(2, 5))).toBe(5)
  })
  it('steps toward the target as levels complete, never away from it', () => {
    expect(shownLevel(5, -3, -3, only(-3, 1))).toBe(1)
    expect(shownLevel(5, 1, -3, only(-3, 1, 3))).toBe(3)
    // a coarser level completing later does not pull the view back
    expect(shownLevel(5, 3, -3, only(-3, 1, 2, 3))).toBe(3)
  })
  it('prefers a finer complete level when zooming out (shrinking stays crisp)', () => {
    expect(shownLevel(3, 4, -3, only(2, 4))).toBe(4)
  })
  it('falls back to the overview only when nothing else is whole', () => {
    expect(shownLevel(5, 4, -3, only())).toBe(-3)
  })
})

describe('build level', () => {
  it('climbs a level at a time from just above the shown level', () => {
    expect(buildLevel(5, 1, (z) => z <= 2)).toBe(3)
    expect(buildLevel(5, 5, () => true)).toBe(5)
    expect(buildLevel(3, 4, () => false)).toBe(3)
  })
})

describe('the cache and the levels together', () => {
  // A screen whose target level alone needs more tiles than the cache's floor, as on a large
  // high-density display: the case that used to loop between the overview and the target.
  const tilesAt = (z: number) => Array.from({ length: Math.min(4 ** Math.max(0, z), 300) }, (_, i) => `${z}:${i}`)
  const simulate = (capacity: number, perFrame: number, frames: number, protect = true) => {
    const store = new LruStore<true>()
    const base = -3, target = 6
    let shown: number | null = null
    const history: number[] = []
    for (let f = 0; f < frames; f++) {
      const complete = (z: number) => z <= base || tilesAt(z).every((k) => store.has(k))
      for (const k of tilesAt(base)) store.set(k, true)
      const build = buildLevel(target, shown ?? base, complete)
      let made = 0
      for (const k of tilesAt(build)) {
        if (store.use(k)) continue
        if (made++ < perFrame) store.set(k, true)
      }
      shown = shownLevel(target, shown, base, complete)
      history.push(shown)
      const keep = new Set([...tilesAt(base), ...tilesAt(target), ...tilesAt(shown), ...tilesAt(build)])
      if (protect) store.evict(Math.max(capacity, keep.size * 1.25), (k) => keep.has(k))
      else store.evict(capacity, () => false)
    }
    return history
  }

  it('reaches the target and stays there, never stepping back down', () => {
    const history = simulate(360, 12, 200)
    expect(history[history.length - 1]).toBe(6)
    for (let i = 1; i < history.length; i++) expect(history[i]).toBeGreaterThanOrEqual(history[i - 1])
  })

  it('without protecting the levels in use, it loops (the old behaviour)', () => {
    const history = simulate(360, 12, 400, false)
    const drops = history.filter((z, i) => i > 0 && z < history[i - 1]).length
    expect(drops).toBeGreaterThan(1)
  })
})

describe('LruStore', () => {
  it('drops the least recently used, but never a kept key', () => {
    const s = new LruStore<number>()
    for (const k of ['a', 'b', 'c', 'd']) s.set(k, 1)
    s.use('a')
    s.evict(2, (k) => k === 'b')
    expect(['a', 'b', 'c', 'd'].filter((k) => s.has(k))).toEqual(['a', 'b'])
  })
})
