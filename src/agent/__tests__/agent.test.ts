import { describe, expect, it, beforeEach } from 'vitest'

// a tiny localStorage for stores that persist
const mem = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0,
} as Storage

const { costOf } = await import('../models')
const { Run, gauge } = await import('../gauge')
const { bind, recall, sheaves } = await import('../sheaves')
const { parsePlan } = await import('../sowing')
const { kyriFields } = await import('../../sources/versions')

describe('the gauge', () => {
  beforeEach(() => gauge.set({ today: 0, allTime: 0, day: new Date().toISOString().slice(0, 10), limits: { perRun: 1, perDay: 10, perAgent: 0.5, maxAgents: 4 } }))
  it('prices usage with cache reads and writes', () => {
    // Opus 5.5: $4 in, $20 out, $0.20 cache read, cache write 1.25x input
    const c = costOf('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 0 })
    expect(c).toBeCloseTo(4 + 2 + 0.2, 6)
  })
  it('stops an agent at its limit and a run at its cap', () => {
    const run = new Run('test', 1)
    run.recordCost('a', 0.6)
    expect(run.check('a')).toMatch(/agent/)
    expect(run.check('b')).toBeNull()
    run.recordCost('b', 0.45)
    expect(run.check('b')).toMatch(/run/)
    expect(gauge.get().today).toBeCloseTo(1.05, 6)
  })
})

describe('sheaves', () => {
  it('recalls by overlap and counts uses', () => {
    sheaves.set({ list: [] })
    bind({ kind: 'fact', text: 'Caravan is the supervisor that starts every module', tags: ['caravan'], paths: ['caravan/README.md'], voice: 'Kyri' })
    bind({ kind: 'fact', text: 'Mantra names things so a name stays true', tags: [], paths: [], voice: 'Kyri' })
    const hits = recall('how does the caravan supervisor work', 3)
    expect(hits[0].text).toMatch(/Caravan/)
    expect(sheaves.get().list.find((s) => s.text.startsWith('Caravan'))!.uses).toBe(1)
  })
})

describe('sowing plans', () => {
  it('reads a fenced json plan', () => {
    const p = parsePlan('Here is the plan.\n```json\n{"plan":"grow a tour","plots":[{"title":"read","task":"read caravan","paths":["caravan/"],"done":"notes"}]}\n```')
    expect(p?.plots).toHaveLength(1)
    expect(p?.plots[0].paths).toEqual(['caravan/'])
  })
  it('refuses prose without plots', () => {
    expect(parsePlan('no plan here')).toBeNull()
  })
})

describe('pier fields', () => {
  it('reads kyri key-value lines', () => {
    const f = kyriFields('# profile\nformat glow-profile-v1\nvoice Kyri\ntimezone America/New_York\n')
    expect(f.voice).toBe('Kyri')
    expect(f.format).toBe('glow-profile-v1')
  })
})
