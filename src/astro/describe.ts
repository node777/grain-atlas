// Turning an instant into words: the Vedic name of a moment, quick for lists and whole for the
// sky view. Names come from the reference tables in ./data; this file only composes them.

import * as A from 'astronomy-engine'
import { ayanamsa, type AyanamsaId } from './ayanamsa'
import { castSky, type Place, type SkyMoment } from './positions'
import { panchanga, MASAS, MUHURTAS, SAMVATSARAS, type Panchanga } from './panchanga'
import { jdOf, norm360 } from './math'
import { NAKSHATRAS } from './data/nakshatras'
import { TITHIS, YOGAS, VARAS, karanaForIndex } from './data/panchanga'
import { RASHIS } from './data/rashis'
import { GRAHAS } from './data/grahas'
import type { GrahaId } from './data/types'

const NAK = 360 / 27

/** The quick reading used in lists: Moon's nakshatra and pada, tithi, weekday, phase. */
export interface QuickMoment {
  nakshatra: number
  pada: number
  tithi: number
  elongation: number      // Moon minus Sun, degrees (0 new, 180 full)
  vara: number
  moonSidereal: number
  sunSidereal: number
}

const quickCache = new Map<string, QuickMoment>()

export function quickMoment(date: Date, lon: number, ayanId: AyanamsaId = 'lahiri'): QuickMoment {
  const key = `${date.getTime()}|${Math.round(lon)}|${ayanId}`
  const hit = quickCache.get(key)
  if (hit) return hit
  const jd = jdOf(date)
  const ay = ayanamsa(jd, ayanId)
  const moon = norm360(A.EclipticGeoMoon(date).lon)
  const sun = norm360(A.SunPosition(date).elon)
  const moonSid = norm360(moon - ay)
  const elong = norm360(moon - sun)
  // Weekday by local mean time; the full reading corrects for sunrise.
  const vara = new Date(date.getTime() + (lon / 15) * 3600_000).getUTCDay()
  const q: QuickMoment = {
    nakshatra: Math.floor(moonSid / NAK),
    pada: Math.floor((moonSid % NAK) / (NAK / 4)) + 1,
    tithi: Math.floor(elong / 12),
    elongation: elong,
    vara,
    moonSidereal: moonSid,
    sunSidereal: norm360(sun - ay),
  }
  if (quickCache.size > 5000) quickCache.clear()
  quickCache.set(key, q)
  return q
}

export const nakshatraName = (i: number) => NAKSHATRAS[((i % 27) + 27) % 27]?.name ?? `Nakshatra ${i + 1}`
export const nakshatraIast = (i: number) => NAKSHATRAS[((i % 27) + 27) % 27]?.iast ?? nakshatraName(i)
export const tithiName = (i: number) => {
  const t = TITHIS[i]
  if (!t) return `Tithi ${i + 1}`
  if (i === 14 || i === 29) return t.name
  return `${t.paksha === 'shukla' ? 'Shukla' : 'Krishna'} ${t.name}`
}
export const varaName = (i: number) => VARAS[i]?.name ?? ['Ravi', 'Soma', 'Mangala', 'Budha', 'Guru', 'Shukra', 'Shani'][i] + 'vara'
export const rashiName = (i: number) => RASHIS[i]?.name ?? `Rashi ${i + 1}`
export const westernSign = (i: number) => RASHIS[i]?.western ?? `Sign ${i + 1}`
export const grahaOf = (id: GrahaId) => GRAHAS.find((g) => g.id === id)

/** One line, in Vedic terms, for a list cell. */
export function quickLine(q: QuickMoment): string {
  return `${nakshatraIast(q.nakshatra)} ${q.pada}, ${tithiName(q.tithi)}`
}

export interface FullMoment {
  sky: SkyMoment
  p: Panchanga
  words: {
    nakshatra: string
    tithi: string
    vara: string
    yoga: string
    karana: string
    masa: string
    samvat: string
    ghati: string
    muhurta: string
    hora: string
  }
}

const fullCache = new Map<string, FullMoment>()

export function fullMoment(date: Date, place: Place, ayanId: AyanamsaId = 'lahiri'): FullMoment {
  const key = `${date.getTime()}|${place.lat}|${place.lon}|${ayanId}`
  const hit = fullCache.get(key)
  if (hit) return hit
  const sky = castSky(date, place, ayanId)
  const p = panchanga(date, place, ayanId, sky)
  const hora = grahaOf(p.hora.lord)
  const fm: FullMoment = {
    sky, p,
    words: {
      nakshatra: `${nakshatraIast(p.nakshatra.index)}, pada ${p.nakshatra.pada}`,
      tithi: tithiName(p.tithi.index),
      vara: varaName(p.vara.index),
      yoga: YOGAS[p.yoga.index]?.name ?? '',
      karana: karanaForIndex(p.karana.index)?.name ?? '',
      masa: `${p.masa.adhika ? 'Adhika ' : ''}${MASAS[p.masa.index]}`,
      samvat: `Vikram Samvat ${p.samvat.vikram}, ${SAMVATSARAS[p.samvat.samvatsara]}`,
      ghati: `${p.ghati} ghati ${p.pala} pala after sunrise`,
      muhurta: MUHURTAS[p.muhurta.index] ?? '',
      hora: hora ? `${hora.name} hora` : '',
    },
  }
  if (fullCache.size > 200) fullCache.clear()
  fullCache.set(key, fm)
  return fm
}

/** The wall-clock datetime in the reader's own zone, plainly. */
export function plainDate(date: Date, opts: { seconds?: boolean; zone?: string } = {}): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    second: opts.seconds ? '2-digit' : undefined, timeZone: opts.zone, timeZoneName: 'short',
  }).format(date)
}
