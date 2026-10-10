import { describe, expect, it } from 'vitest'
import type { Entry } from '@/grain/repo'
import { layoutWorld } from '../layout'
import { buildAtlas, CELL } from '../atlas'
import { Kind, kindOf } from '../glyphs'
import { WaterIndex } from '../water'

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
  'README.md', 'LICENSE', 'flake.nix', 'docs/README.md', 'docs/guide/README.md', 'docs/guide/deep/README.md',
  ...Array.from({ length: 8 }, (_, i) => `press/notes/20260801-${String(100000 + i * 3001)}_n${i}.md`),
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
    expect(kindOf('LICENSE')).toBe(Kind.Court)
    expect(kindOf('docs/README.md')).toBe(Kind.Landmark)
    expect(kindOf('CHANGELOG.md')).toBe(Kind.Archive)
    expect(kindOf('waymarks/date/20260730/20260730-010834_voice.md')).toBe(Kind.Archive)
    expect(kindOf('rye/tests/parse.rye')).toBe(Kind.Tower)
    expect(kindOf('src/lexer.test.ts')).toBe(Kind.Tower)
    expect(kindOf('context/specs/rules.md')).toBe(Kind.House)
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
      const k = atlas.plot[i].path
      byPlot.set(k, [...(byPlot.get(k) ?? []), i])
    }
    for (const ids of byPlot.values()) {
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
        const d = Math.hypot(atlas.gx[ids[a]] - atlas.gx[ids[b]], atlas.gy[ids[a]] - atlas.gy[ids[b]])
        expect(d).toBeGreaterThan(CELL * 0.6)
      }
    }
  })

  it('makes READMEs landmarks, grander nearer the root', () => {
    const tierOf = (p: string) => atlas.tier[atlas.path.indexOf(p)]
    const scaleOf = (p: string) => atlas.scale[atlas.path.indexOf(p)]
    expect(tierOf('README.md')).toBe(0)
    expect(tierOf('docs/README.md')).toBe(1)
    expect(tierOf('docs/guide/README.md')).toBe(2)
    expect(tierOf('docs/guide/deep/README.md')).toBe(3)
    expect(scaleOf('README.md')).toBeGreaterThan(scaleOf('docs/README.md'))
    expect(scaleOf('docs/README.md')).toBeGreaterThan(scaleOf('docs/guide/deep/README.md'))
  })

  it('rivers widen downstream with the files they pass, and lakes are not circles', () => {
    for (const r of atlas.rivers) {
      for (let i = 1; i < r.w.length; i++) expect(r.w[i]).toBeGreaterThanOrEqual(r.w[i - 1] - 1e-6)
      expect(r.w[r.w.length - 1]).toBeGreaterThan(r.w[0])
    }
    for (const l of atlas.lakes) {
      const rs: number[] = []
      for (let i = 0; i < l.pts.length; i += 2) rs.push(Math.hypot(l.pts[i] - l.x, l.pts[i + 1] - l.y))
      expect(Math.max(...rs) / Math.min(...rs)).toBeGreaterThan(1.3)
    }
  })

  it('draws no file mark on the water', () => {
    const water = new WaterIndex(atlas.rivers, atlas.lakes)
    for (let i = 0; i < atlas.n; i++) expect(water.at(atlas.gx[i], atlas.gy[i], CELL * 0.45 * atlas.scale[i])).toBeNull()
  })

  it('outlines each river as one closed channel, its banks a river width apart', () => {
    for (const r of atlas.rivers) {
      const n = r.pts.length / 2
      expect(r.channel.length).toBe(n * 4)
      const mid = Math.floor(n / 2), across = 2 * n - 1 - mid
      const bank = Math.hypot(r.channel[mid * 2] - r.channel[across * 2], r.channel[mid * 2 + 1] - r.channel[across * 2 + 1])
      expect(bank).toBeCloseTo(r.w[mid], 3)
    }
  })

  it('runs one main river through a basin of dated folders, and lines its days up in time', () => {
    const mains = atlas.rivers.filter((r) => r.main)
    expect(mains.length).toBe(1)
    expect(mains[0].name).toBe('R. Waymarks')
    // the other dated folder runs as a brook of its own
    expect(atlas.rivers.some((r) => !r.main && r.name === 'Notes Brook')).toBe(true)
    const rv = mains[0]
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
