// Vimshottari dasha: a 120-year cycle of planetary periods, entered through the lord of the
// Moon's birth nakshatra and weighted by how much of that nakshatra the Moon has yet to cross.
// Years here are Julian years of 365.25 days; some schools use 360-day savana years instead.

import type { GrahaId } from './data/types'

export const DASHA_ORDER: GrahaId[] = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury']
export const DASHA_YEARS: Record<GrahaId, number> = {
  ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17,
}
const YEAR_MS = 365.25 * 86400_000
const NAK = 360 / 27

export interface DashaPeriod {
  lord: GrahaId
  start: Date
  end: Date
  sub?: DashaPeriod[]
}

/** Nakshatra lord for a sidereal longitude (Ashvini-first order). */
export const nakshatraLord = (sid: number): GrahaId => DASHA_ORDER[Math.floor(sid / NAK) % 9]

function subPeriods(lord: GrahaId, start: Date, spanMs: number, depth: number): DashaPeriod[] {
  const out: DashaPeriod[] = []
  const i0 = DASHA_ORDER.indexOf(lord)
  let t = start.getTime()
  for (let k = 0; k < 9; k++) {
    const l = DASHA_ORDER[(i0 + k) % 9]
    const len = (spanMs * DASHA_YEARS[l]) / 120
    const p: DashaPeriod = { lord: l, start: new Date(t), end: new Date(t + len) }
    if (depth > 1) p.sub = subPeriods(l, p.start, len, depth - 1)
    out.push(p)
    t += len
  }
  return out
}

/**
 * Mahadashas from a birth moment. The first period is truncated by the portion of the birth
 * nakshatra already traversed; `depth` 2 adds antardashas, 3 adds pratyantardashas.
 */
export function vimshottari(birth: Date, moonSidereal: number, depth = 2): DashaPeriod[] {
  const lord = nakshatraLord(moonSidereal)
  const traversed = (moonSidereal % NAK) / NAK
  const fullFirst = DASHA_YEARS[lord] * YEAR_MS
  // The cycle "began" before birth; compute the virtual start of the first mahadasha.
  const virtualStart = birth.getTime() - traversed * fullFirst
  const out: DashaPeriod[] = []
  let t = virtualStart
  const i0 = DASHA_ORDER.indexOf(lord)
  for (let k = 0; k < 9; k++) {
    const l = DASHA_ORDER[(i0 + k) % 9]
    const len = DASHA_YEARS[l] * YEAR_MS
    const p: DashaPeriod = { lord: l, start: new Date(t), end: new Date(t + len) }
    if (depth > 1) p.sub = subPeriods(l, p.start, len, depth - 1)
    out.push(p)
    t += len
  }
  return out
}

/** The chain of periods (maha > antar > pratyantar) running at `at`. */
export function activeChain(periods: DashaPeriod[], at: Date): DashaPeriod[] {
  const chain: DashaPeriod[] = []
  let level: DashaPeriod[] | undefined = periods
  while (level) {
    const p: DashaPeriod | undefined = level.find((x) => at >= x.start && at < x.end)
    if (!p) break
    chain.push(p)
    level = p.sub
  }
  return chain
}
