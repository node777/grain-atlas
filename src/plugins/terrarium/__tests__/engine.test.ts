import { describe, it, expect } from 'vitest'
import {
  createWorld, populate, startBoot, step, feed, addCreature, addDecor, removeEntity, hitTest, boundsOf,
  snapshot, restore, skipBoot, resize, dragTo, grab, release, BOOT_END, MAX_CREATURES, SPECIES, DECOR, floorTop, type SpeciesId,
} from '../engine'
import { mirror, creatureRows } from '../art'
import { compose } from '../render'

const run = (w: ReturnType<typeof createWorld>, seconds: number) => { for (let i = 0; i < seconds * 30; i++) step(w, 1 / 30) }

describe('art', () => {
  it('mirrors brackets and slashes and keeps width', () => {
    expect(mirror(['><>'])).toEqual(['<><'])
    expect(mirror(['  /\\  ', '><(o)>'])).toEqual(['  /\\  ', '<(o)><'])
  })
  it('every species draws in both directions with equal-width rows', () => {
    const w = createWorld(100, 60)
    for (const sp of Object.keys(SPECIES) as SpeciesId[]) {
      const c = addCreature(w, sp, 50, 20)!
      for (const face of [1, -1] as const) {
        c.face = face
        const rows = creatureRows(c, 0)
        expect(new Set(rows.map((r) => r.length)).size).toBe(1)
      }
    }
  })
})

describe('world', () => {
  it('keeps everything inside the glass for two minutes', () => {
    const w = createWorld(120, 70)
    populate(w)
    run(w, 120)
    for (const c of w.creatures) {
      expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x).toBeLessThanOrEqual(w.W)
      expect(c.y).toBeGreaterThanOrEqual(0); expect(c.y).toBeLessThanOrEqual(w.H)
      expect(Number.isFinite(c.vx + c.vy)).toBe(true)
    }
  })
  it('is deterministic for a given seed', () => {
    const a = createWorld(100, 60, 7), b = createWorld(100, 60, 7)
    populate(a); populate(b); run(a, 20); run(b, 20)
    expect(a.creatures.map((c) => [c.x, c.y])).toEqual(b.creatures.map((c) => [c.x, c.y]))
  })
  it('lets fish eat flakes and fills their bellies', () => {
    const w = createWorld(100, 60)
    const f = addCreature(w, 'angel', 50, 20)!
    f.belly = 0.2
    feed(w, 50, 14, 6)
    run(w, 25)
    expect(f.belly).toBeGreaterThan(0.2)
    expect(w.food.filter((x) => x.k === 'flake').length).toBeLessThan(6)
  })
  it('turns uneaten flakes into algae, and grazers clear it again', () => {
    const w = createWorld(100, 60)
    feed(w, 50, 4, 20)
    run(w, 60)
    expect(w.algae).toBeGreaterThan(0.1)
    const before = w.algae
    addCreature(w, 'snail', 40); addCreature(w, 'snail', 60); addCreature(w, 'crab', 50)
    run(w, 120)
    expect(w.algae).toBeLessThan(before)
  })
  it('never starves anything to death', () => {
    const w = createWorld(100, 60)
    populate(w)
    const n = w.creatures.length
    run(w, 600)
    expect(w.creatures.length).toBeGreaterThanOrEqual(n)
  })
  it('raises fry when well fed, and stops at the ceiling', () => {
    const w = createWorld(140, 70, 3)
    populate(w)
    const before = w.creatures.filter((c) => c.sp === 'tetra').length
    for (let i = 0; i < 40; i++) { feed(w, 20 + (i % 10) * 10, 4, 5); run(w, 8) }
    const after = w.creatures.filter((c) => c.sp === 'tetra').length
    expect(after).toBeGreaterThan(before)
    expect(after).toBeLessThanOrEqual(SPECIES.tetra.max + 1)
    expect(w.creatures.length).toBeLessThanOrEqual(MAX_CREATURES)
  })
  it('plants shed plankton that small fish eat', () => {
    const w = createWorld(100, 60)
    addDecor(w, 'kelp', 30); addDecor(w, 'kelp', 70)
    run(w, 30)
    expect(w.food.some((f) => f.k === 'plankton')).toBe(true)
  })
  it('respects caps', () => {
    const w = createWorld(100, 60)
    for (let i = 0; i < 100; i++) addCreature(w, 'tetra')
    expect(w.creatures.length).toBe(MAX_CREATURES)
    for (let i = 0; i < 30; i++) addDecor(w, 'castle')
    expect(w.decor.filter((d) => d.d === 'castle').length).toBe(DECOR.castle.max)
  })
})

describe('boot', () => {
  it('brings the creatures up in the order of the plan, then hands over to the tank', () => {
    const w = createWorld(120, 70)
    startBoot(w)
    expect(w.creatures.length).toBe(0)
    const seen: string[] = []
    let last = -2
    for (let i = 0; i < BOOT_END * 30 + 5; i++) {
      step(w, 1 / 30)
      if (w.boot && w.boot.stage !== last) { last = w.boot.stage; seen.push(`${last}:${w.creatures.length}`) }
    }
    expect(seen.map((s) => s.split(':')[0])).toEqual(['0', '1', '2', '3', '4', '5'])
    expect(w.boot).toBeNull()
    expect(w.light).toBe(1)
    const kinds = new Set(w.creatures.map((c) => c.sp))
    for (const sp of ['snail', 'jelly', 'seahorse', 'tetra', 'crab'] as SpeciesId[]) expect(kinds.has(sp)).toBe(true)
    expect(w.decor.some((d) => d.d === 'www')).toBe(true)
    expect(w.decor.some((d) => d.d === 'app')).toBe(true)
  })
  it('can be skipped', () => {
    const w = createWorld(120, 70)
    startBoot(w); step(w, 0.1); skipBoot(w)
    expect(w.boot).toBeNull()
    expect(w.creatures.length).toBeGreaterThan(10)
  })
})

describe('touch', () => {
  it('finds, drags and scoops things; the two doors cannot be scooped', () => {
    const w = createWorld(120, 70)
    populate(w)
    const www = w.decor.find((d) => d.d === 'www')!
    const b = boundsOf(w, www)
    expect(hitTest(w, b.c0 + 2, (b.r0 + 1) * 2)).toBe(www)
    expect(removeEntity(w, www.id)).toBe(false)
    const rock = w.decor.find((d) => d.d === 'rock')!
    grab(rock); dragTo(w, rock, 60, 20); release(w, rock)
    run(w, 5)
    expect(rock.y).toBe(floorTop(w))                  // it fell back to the sand
    expect(rock.x).toBeCloseTo(60, 0)
    expect(removeEntity(w, rock.id)).toBe(true)
  })
})

describe('keeping', () => {
  it('round-trips a tank through a snapshot, even at another size', () => {
    const w = createWorld(120, 70)
    populate(w); run(w, 10)
    const snap = JSON.parse(JSON.stringify(snapshot(w)))
    const v = createWorld(90, 50)
    restore(v, snap)
    expect(v.creatures.length).toBe(w.creatures.length)
    expect(v.decor.filter((d) => d.d === 'www').length).toBe(1)
    expect(v.dirty).toBe(false)
    resize(v, 150, 80); run(v, 5)
    expect(v.creatures.every((c) => c.x <= 150)).toBe(true)
  })
  it('ignores unknown things in an old snapshot', () => {
    const w = createWorld(100, 60)
    restore(w, { v: 1, creatures: [{ s: 'kraken' as SpeciesId, fx: 0.5, fy: 0.5, belly: 1, age: 99 }], decor: [], algae: 0 })
    expect(w.creatures.length).toBe(0)
  })
})

describe('frame', () => {
  it('composes a frame with fish, sand and the two doors', () => {
    const w = createWorld(100, 60)
    populate(w); run(w, 3)
    const f = compose(w, 100, 30)
    const s = f.ch.join('')
    expect(s).toContain('grain-www')
    expect(s).toContain('Terrarium.app')
    expect(f.a.some((v) => v > 0)).toBe(true)
  })
})
