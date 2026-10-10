import { describe, expect, it } from 'vitest'
import type { Entry } from '@/grain/repo'
import { layoutWorld } from '../layout'
import { buildAtlas, CELL } from '../atlas'
import { Kind, kindOf } from '../glyphs'

/** A minimal tree of entries from file paths (dirs first, then by name, as the repo model sorts). */
function tree(paths: string[]): Map<string, Entry> {
  const m = new Map<string, Entry>()
  m.set('', { path: '', name: 'grain', kind: 'dir', size: 0, parent: '', children: [], files: 0 })
  const dir = (p: string): Entry => {
    const hit = m.get(p)
    if (hit) return hit
    const parent = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
    const e: Entry = { path: p, name: p.split('/').pop()!, kind: 'dir', size: 0, parent, children: [], files: 0 }
    m.set(p, e)
    dir(parent).children.push(p)
    return e
  }
  for (const p of paths) {
    const parent = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
    m.set(p, { path: p, name: p.split('/').pop()!, kind: 'file', size: 1, parent, children: [], files: 1 })
    dir(parent).children.push(p)
  }
  const roll = (e: Entry): number => {
    if (e.kind !== 'dir') return 1
    e.files = e.children.reduce((s, c) => s + roll(m.get(c)!), 0)
    e.children.sort((a, b) => {
      const A = m.get(a)!, B = m.get(b)!
      if ((A.kind === 'dir') !== (B.kind === 'dir')) return A.kind === 'dir' ? -1 : 1
      return A.name.localeCompare(B.name)
    })
    return e.files
  }
  roll(m.get('')!)
  return m
}

const day = (d: string, n: number) =>
  Array.from({ length: n }, (_, i) => `waymarks/date/${d}/${d}-${String(10000 + i * 731).padStart(6, '0')}_note-${i}.md`)

const SAMPLE = [
  'README.md', 'LICENSE', 'flake.nix',
  ...Array.from({ length: 30 }, (_, i) => `docs/page-${i}.md`),
  ...Array.from({ length: 40 }, (_, i) => `tools/al/witness_${i}.rish`),
  ...Array.from({ length: 12 }, (_, i) => `tools/al/run_${i}.sh`),
  'tools/al/manifest.json', 'tools/al/shape.zig', 'image/logo.png',
  ...Array.from({ length: 25 }, (_, i) => `glow/gen/g/part_${i}.glow`),
  ...day('20260728', 6), ...day('20260729', 9), ...day('20260730', 14), ...day('20260731', 4),
]

describe('file marks', () => {
  it('names each kind of file by its extension', () => {
    expect(kindOf('docs/a.md')).toBe(Kind.House)
    expect(kindOf('LICENSE')).toBe(Kind.House)
    expect(kindOf('rye/x.rye')).toBe(Kind.Field)
    expect(kindOf('tools/x.rish')).toBe(Kind.Field)
    expect(kindOf('tools/x.sh')).toBe(Kind.Mill)
    expect(kindOf('Makefile')).toBe(Kind.Mill)
    expect(kindOf('src/x.zig')).toBe(Kind.Forge)
    expect(kindOf('a/b.json')).toBe(Kind.Stone)
    expect(kindOf('a/b.svg')).toBe(Kind.Tree)
    expect(kindOf('a/b.rye', true)).toBe(Kind.Post)
    expect(kindOf('a/b.weird')).toBe(Kind.Cairn)
  })
})

describe('the atlas', () => {
  const entries = tree(SAMPLE)
  const world = layoutWorld(entries)
  const atlas = buildAtlas(world, entries)

  it('sets down every file once, and indexes it where its mark stands', () => {
    expect(atlas.n).toBe(SAMPLE.length)
    expect(new Set(atlas.path).size).toBe(SAMPLE.length)
    for (let i = 0; i < atlas.n; i++) {
      const at = atlas.index.get(atlas.path[i])!
      expect(at.x).toBeCloseTo(atlas.gx[i])
      expect(at.y).toBeCloseTo(atlas.gy[i])
    }
  })

  it('draws the same map from the same tree', () => {
    const again = buildAtlas(layoutWorld(tree(SAMPLE)), tree(SAMPLE))
    expect(Array.from(again.gx)).toEqual(Array.from(atlas.gx))
    expect(Array.from(again.gy)).toEqual(Array.from(atlas.gy))
    expect(again.rivers.length).toBe(atlas.rivers.length)
  })

  it('never stacks two marks of one settlement on the same plot', () => {
    const byPlot = new Map<string, number[]>()
    for (let i = 0; i < atlas.n; i++) {
      const k = atlas.glyphPlot[i].path
      byPlot.set(k, [...(byPlot.get(k) ?? []), i])
    }
    for (const ids of byPlot.values()) {
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
        const d = Math.hypot(atlas.gx[ids[a]] - atlas.gx[ids[b]], atlas.gy[ids[a]] - atlas.gy[ids[b]])
        expect(d).toBeGreaterThan(CELL * 0.6)
      }
    }
  })

  it('runs one river through a basin of dated folders, and lines its days up in time', () => {
    expect(atlas.rivers.length).toBe(1)
    const rv = atlas.rivers[0]
    expect(rv.pts.length / 2).toBeGreaterThan(40)
    // downstream the river widens
    expect(rv.w[rv.w.length - 1]).toBeGreaterThan(rv.w[0])
    // each day's first file lies nearer the source (along the river) than its last
    const along = (x: number, y: number) => {
      let best = 0, bd = Infinity
      for (let i = 0; i < rv.pts.length / 2; i++) {
        const d = Math.hypot(rv.pts[i * 2] - x, rv.pts[i * 2 + 1] - y)
        if (d < bd) { bd = d; best = i }
      }
      return best
    }
    const first = atlas.index.get(day('20260729', 9)[0])!, last = atlas.index.get(day('20260729', 9)[8])!
    expect(along(first.x, first.y)).toBeLessThan(along(last.x, last.y))
    const d28 = atlas.index.get(day('20260728', 6)[0])!, d31 = atlas.index.get(day('20260731', 4)[0])!
    expect(along(d28.x, d28.y)).toBeLessThan(along(d31.x, d31.y))
  })

  it('grows with the tree: thirty thousand files still build quickly', () => {
    const big: string[] = []
    const rooms = ['tools', 'docs', 'rye', 'glow', 'waymarks', 'context', 'pond', 'caravan']
    const ext = ['md', 'rye', 'rish', 'sh', 'json', 'glow', 'zig']
    for (let i = 0; i < 30000; i++) {
      const r = rooms[i % rooms.length]
      const a = Math.floor(i / 97) % 23, b = Math.floor(i / 13) % 7
      big.push(`${r}/d${a}/s${b}/file_${i}.${ext[i % ext.length]}`)
    }
    const t0 = performance.now()
    const e = tree(big)
    const at = buildAtlas(layoutWorld(e), e)
    const ms = performance.now() - t0
    expect(at.n).toBe(30000)
    expect(ms).toBeLessThan(20000)
  })
})
