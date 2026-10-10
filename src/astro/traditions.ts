// The same instant read through other sky traditions. Each function takes a cast SkyMoment and
// returns indices into the tables in ./data, so naming and meaning stay in one place.

import { body, type SkyMoment } from './positions'
import { jdOf, norm180, norm360 } from './math'

// ---------- Western (tropical) ----------

export const tropicalSign = (lon: number) => Math.floor(norm360(lon) / 30)

export const ASPECTS = [
  { name: 'conjunction', angle: 0, orb: 8, glyph: '☌' },
  { name: 'sextile', angle: 60, orb: 4, glyph: '⚹' },
  { name: 'square', angle: 90, orb: 6, glyph: '□' },
  { name: 'trine', angle: 120, orb: 6, glyph: '△' },
  { name: 'opposition', angle: 180, orb: 8, glyph: '☍' },
] as const

export interface AspectHit { a: string; b: string; aspect: (typeof ASPECTS)[number]; orb: number }

export function aspects(sky: SkyMoment): AspectHit[] {
  const list = sky.bodies.filter((b) => b.id !== 'ketu')
  const hits: AspectHit[] = []
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const sep = Math.abs(norm180(list[i].tropical - list[j].tropical))
      for (const asp of ASPECTS) {
        const orb = Math.abs(sep - asp.angle)
        if (orb <= asp.orb) hits.push({ a: list[i].id, b: list[j].id, aspect: asp, orb })
      }
    }
  }
  return hits.sort((x, y) => x.orb - y.orb)
}

// ---------- Hellenistic ----------

/** Day chart when the Sun is above the horizon. */
export const isDiurnal = (sky: SkyMoment) => body(sky, 'sun').alt > 0

/** Lot of Fortune: Asc + Moon − Sun by day, reversed by night. */
export function lotOfFortune(sky: SkyMoment): number {
  const s = body(sky, 'sun').tropical
  const m = body(sky, 'moon').tropical
  const a = sky.ascendant.tropical
  return norm360(isDiurnal(sky) ? a + m - s : a + s - m)
}

/** Lot of Spirit: the mirror of Fortune. */
export function lotOfSpirit(sky: SkyMoment): number {
  const s = body(sky, 'sun').tropical
  const m = body(sky, 'moon').tropical
  const a = sky.ascendant.tropical
  return norm360(isDiurnal(sky) ? a + s - m : a + m - s)
}

/** Decan (face) index 0..35 of a tropical longitude. */
export const decanOf = (lon: number) => Math.floor(norm360(lon) / 10)

// ---------- Arabic lunar stations ----------

/** Manazil as 28 equal stations of 12°51′26″ from 0° tropical Aries (the later astrological
 *  convention; the older Bedouin stations were star-marked, not equal). */
export const manzilOf = (moonTropical: number) => Math.floor(norm360(moonTropical) / (360 / 28))

// ---------- Chinese ----------

export interface Pillars {
  year: number            // sexagenary index 0..59 (0 = jiazi)
  month: number
  day: number
  hour: number
  solarTerm: number       // 0..23, 0 = Lichun (sun at 315°)
}

const sexagenary = (stem: number, branch: number) => {
  for (let i = 0; i < 60; i++) if (i % 10 === stem && i % 12 === branch) return i
  return 0
}

/**
 * Four Pillars (BaZi) for a moment and a civil UTC offset in hours. The year and month turn on
 * the solar terms (Lichun at 315° solar longitude), not the lunar new year.
 */
export function fourPillars(sky: SkyMoment, utcOffsetHours: number): Pillars {
  const sunLon = body(sky, 'sun').tropical
  const local = new Date(sky.date.getTime() + utcOffsetHours * 3600_000)
  let y = local.getUTCFullYear()
  // Before Lichun (sun < 315°) in Jan/Feb belongs to the previous solar year.
  if (local.getUTCMonth() < 2 && sunLon >= 270 && sunLon < 315) y -= 1
  const yearIdx = (((y - 4) % 60) + 60) % 60
  const m = Math.floor(norm360(sunLon - 315) / 30)    // 0 = Yin month
  const yearStem = yearIdx % 10
  const monthStem = ((yearStem % 5) * 2 + 2 + m) % 10
  const monthBranch = (m + 2) % 12
  // Day pillar: civil day at the local offset; Zi hour (23:00) opens the next day in many schools,
  // here the day turns at midnight for simplicity of reading.
  const jdn = Math.floor(jdOf(local) + 0.5)
  const dayIdx = (((jdn - 11) % 60) + 60) % 60
  const hourBranch = Math.floor((local.getUTCHours() + 1) / 2) % 12
  const hourStem = ((dayIdx % 10) * 2 + hourBranch) % 10
  return {
    year: yearIdx,
    month: sexagenary(monthStem, monthBranch),
    day: dayIdx,
    hour: sexagenary(hourStem, hourBranch),
    solarTerm: Math.floor(norm360(sunLon - 315) / 15),
  }
}

export const SOLAR_TERMS = [
  'Lichun (Start of Spring)', 'Yushui (Rain Water)', 'Jingzhe (Awakening of Insects)',
  'Chunfen (Spring Equinox)', 'Qingming (Pure Brightness)', 'Guyu (Grain Rain)',
  'Lixia (Start of Summer)', 'Xiaoman (Grain Buds)', 'Mangzhong (Grain in Ear)',
  'Xiazhi (Summer Solstice)', 'Xiaoshu (Minor Heat)', 'Dashu (Major Heat)',
  'Liqiu (Start of Autumn)', 'Chushu (End of Heat)', 'Bailu (White Dew)',
  'Qiufen (Autumn Equinox)', 'Hanlu (Cold Dew)', 'Shuangjiang (Frost Descent)',
  'Lidong (Start of Winter)', 'Xiaoxue (Minor Snow)', 'Daxue (Major Snow)',
  'Dongzhi (Winter Solstice)', 'Xiaohan (Minor Cold)', 'Dahan (Major Cold)',
]
