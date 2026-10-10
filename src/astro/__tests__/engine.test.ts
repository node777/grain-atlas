import { describe, expect, it } from 'vitest'
import { ayanamsa } from '../ayanamsa'
import { castSky, body, UJJAIN, type Place } from '../positions'
import { panchanga, SAMVATSARAS } from '../panchanga'
import { fourPillars } from '../traditions'
import { vimshottari, activeChain } from '../dasha'

const ist = (iso: string) => new Date(iso + '+05:30')
const AYODHYA: Place = { lat: 26.7922, lon: 82.1998, name: 'Ayodhya' }
const DELHI: Place = { lat: 28.6139, lon: 77.209, name: 'Delhi' }

describe('ayanamsa', () => {
  it('Lahiri at J2000 is about 23°51′', () => {
    expect(ayanamsa(2451545.0)).toBeCloseTo(23.857, 2)
  })
})

describe('panchanga against published almanac days', () => {
  it('Ugadi / Gudi Padwa 2024: Chaitra Shukla Pratipada, VS 2081, Krodhi', () => {
    const p = panchanga(ist('2024-04-09T09:00:00'), UJJAIN)
    expect(p.masa.index).toBe(0)
    expect(p.masa.adhika).toBe(false)
    expect(p.tithi.index).toBe(0)
    expect(p.samvat.vikram).toBe(2081)
    expect(SAMVATSARAS[p.samvat.samvatsara]).toBe('Krodhi')
    expect(p.vara.index).toBe(2) // Tuesday
  })
  it('Ayodhya consecration 2024-01-22: Pausha Shukla Dwadashi, Mrigashira, Monday', () => {
    const p = panchanga(ist('2024-01-22T12:30:00'), AYODHYA)
    expect(p.masa.index).toBe(9)
    expect(p.tithi.index).toBe(11)
    expect(p.nakshatra.index).toBe(4)
    expect(p.vara.index).toBe(1)
  })
  it('Diwali 2024-11-01 evening: Amavasya closing amanta Ashvina', () => {
    const p = panchanga(ist('2024-11-01T12:00:00'), DELHI) // Amavasya ends 18:16 IST
    expect(p.tithi.index).toBe(29)
    expect(p.masa.index).toBe(6)
  })
  it('vara is counted from sunrise: 05:00 before sunrise still belongs to the previous day', () => {
    const p = panchanga(ist('2024-04-10T05:00:00'), UJJAIN) // Wednesday wall clock, pre-dawn
    expect(p.vara.index).toBe(2) // still Tuesday's vara
  })
})

describe('positions', () => {
  it('Sun enters sidereal Makara near 14 Jan (Makar Sankranti)', () => {
    const before = castSky(new Date('2024-01-14T12:00:00Z'), UJJAIN)
    const after = castSky(new Date('2024-01-16T00:00:00Z'), UJJAIN)
    expect(Math.floor(body(before, 'sun').sidereal / 30)).toBe(8)
    expect(Math.floor(body(after, 'sun').sidereal / 30)).toBe(9)
  })
  it('true node is retrograde on average and Ketu is opposite', () => {
    const s = castSky(new Date('2026-10-10T00:00:00Z'), UJJAIN)
    const r = body(s, 'rahu'), k = body(s, 'ketu')
    expect((r.tropical - k.tropical + 360) % 360).toBeCloseTo(180, 9)
  })
})

describe('chinese pillars', () => {
  it('2000-01-01 is a wuwu day (index 54)', () => {
    const s = castSky(new Date('2000-01-01T04:00:00Z'), UJJAIN)
    expect(fourPillars(s, 8).day).toBe(54)
  })
  it('2024-03-01 is a jiachen year (index 40)', () => {
    const s = castSky(new Date('2024-03-01T04:00:00Z'), UJJAIN)
    expect(fourPillars(s, 8).year).toBe(40)
  })
})

describe('vimshottari', () => {
  it('periods chain cover 120 years and nest', () => {
    const d = vimshottari(new Date('2000-01-01T00:00:00Z'), 10) // Ashvini -> Ketu
    expect(d[0].lord).toBe('ketu')
    const span = d[8].end.getTime() - d[0].start.getTime()
    expect(span / (365.25 * 86400000)).toBeCloseTo(120, 5)
    expect(activeChain(d, new Date('2001-01-01')).length).toBe(2)
  })
})

import { osculatingNode, trueNode } from '../positions'
import { jdOf } from '../math'
describe('nodes and true ayanamsa', () => {
  it('osculating node agrees with the Meeus series within half a degree', () => {
    const d = new Date('2026-10-10T00:00:00Z')
    const diff = Math.abs(((osculatingNode(d) - trueNode(jdOf(d)) + 540) % 360) - 180)
    expect(diff).toBeLessThan(0.5)
  })
  it('true Lahiri on 2026-01-01 is 24°13′19″ (Jagannatha Hora / Swiss Ephemeris)', () => {
    const s = castSky(new Date('2026-01-01T00:00:00Z'), UJJAIN)
    expect(Math.abs(s.ayanamsa - (24 + 13 / 60 + 19 / 3600)) * 3600).toBeLessThan(3)
  })
})
