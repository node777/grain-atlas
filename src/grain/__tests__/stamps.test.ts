import { describe, expect, it } from 'vitest'
import { parseStamp, stampFromPath, toStamp } from '../stamps'
import { parseHeader, extractLinks } from '../header'

describe('one-clock stamps', () => {
  it('reads a filename stamp with its time, in the Eastern season', () => {
    const s = stampFromPath('foundations/20260823-034321_the-return-that-feeds-everyone.md')!
    expect(s.hasTime).toBe(true)
    expect(s.zone).toBe('America/New_York')
    expect(s.date.toISOString()).toBe('2026-08-23T07:43:21.000Z')
  })
  it('reads early stamps as UTC (UDT) and honours an explicit zone word', () => {
    expect(stampFromPath('foundations/20260618-184912_growing.md')!.date.toISOString()).toBe('2026-06-18T18:49:12.000Z')
    expect(parseStamp('20260801.120000 UDT', 'inline')!.date.toISOString()).toBe('2026-08-01T12:00:00.000Z')
  })
  it('round-trips through the one-clock form on the Eastern wall', () => {
    expect(toStamp(new Date('2026-08-23T07:43:21Z'))).toBe('20260823.034321')
  })
})

describe('page headers', () => {
  it('reads fields, several to a line, and the room', () => {
    const h = parseHeader('# Title Here\n\n**Stamp:** `20260810` (EDT)  -  Voice: x\n**Status:** Mixed -- some\n**Language:** EN - **Voice:** Kyri\n')
    expect(h.title).toBe('Title Here')
    expect(h.fields['Voice']).toBe('Kyri')
    expect(h.status?.room).toBe('mixed')
    expect(h.stampRaw).toBe('20260810')
  })
  it('resolves relative links', () => {
    expect(extractLinks('a/b/c.md', '[x](../d.md) [y](https://x.y) [z](./e/f.md#h)')).toEqual(['a/d.md', 'a/b/e/f.md'])
  })
})
