// Panchanga -- the "five limbs" of a Vedic day -- plus the finer clocks a reading uses.
//
//   tithi    lunar day: each 12° of Moon–Sun elongation (30 per synodic month)
//   vara     weekday, counted from sunrise to sunrise (not midnight)
//   nakshatra  the Moon's sidereal mansion, 13°20′ each, with four padas of 3°20′
//   yoga     (sidereal Sun + sidereal Moon) in 13°20′ steps (27 nitya yogas)
//   karana   half a tithi (6° of elongation); 60 per month over 11 names
//
// Also: ghati/pala since sunrise (60 ghatis = 1 day), muhurta (30 per day), hora (planetary
// hour), Rahu kala, the amanta lunar month (masa) with adhika detection, and the year in the
// Vikram and Shaka eras with its 60-year samvatsara name (southern reckoning).

import * as A from 'astronomy-engine'
import { ayanamsa, type AyanamsaId } from './ayanamsa'
import { body, castSky, type Place, type SkyMoment } from './positions'
import { jdOf, norm360 } from './math'
import type { GrahaId } from './data/types'

const NAK = 360 / 27
const PADA = NAK / 4

export interface Panchanga {
  tithi: { index: number; fraction: number; paksha: 'shukla' | 'krishna'; dayInPaksha: number }
  nakshatra: { index: number; pada: number; fraction: number }
  yoga: { index: number; fraction: number }
  karana: { index: number }        // 0..59, see karanaForIndex in data/panchanga
  vara: { index: number; lord: GrahaId }   // 0 = Sunday
  sunrise: Date | null
  sunset: Date | null
  nextSunrise: Date | null
  isDay: boolean
  ghati: number                     // since sunrise (fractional)
  pala: number
  vighati: number
  muhurta: { index: number; isDay: boolean }  // 0..29 (day 0..14, night 15..29)
  hora: { index: number; lord: GrahaId }
  rahuKala: { start: Date; end: Date } | null
  masa: { index: number; adhika: boolean; newMoon: Date }   // 0 = Chaitra (amanta)
  samvat: { vikram: number; shaka: number; kali: number; samvatsara: number }
  sunRashi: number                  // sidereal
  moonRashi: number
}

export const VARA_LORDS: GrahaId[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn']
// Chaldean order, slowest to swiftest; planetary hours step through it.
export const CHALDEAN: GrahaId[] = ['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon']
// Rahu kala: which eighth of daylight, by weekday (Sun..Sat), 1-based.
const RAHU_KALA_SEGMENT = [8, 2, 7, 5, 6, 4, 3]

const observerOf = (p: Place) => new A.Observer(p.lat, p.lon, p.elevation ?? 0)

function searchRise(dir: 1 | -1, p: Place, from: Date, days: number): Date | null {
  const t = A.SearchRiseSet(A.Body.Sun, observerOf(p), dir, from, days)
  return t ? t.date : null
}

/** Last sunrise at or before `date`, the sunset after it, and the next sunrise. */
export function solarDay(date: Date, p: Place) {
  let sunrise = searchRise(1, p, new Date(date.getTime() - 26 * 3600_000), 1.2)
  let guard = 0
  while (sunrise && guard < 3) {
    const next = searchRise(1, p, new Date(sunrise.getTime() + 60_000), 1.2)
    if (!next || next.getTime() > date.getTime()) break
    sunrise = next
    guard++
  }
  if (sunrise && sunrise.getTime() > date.getTime()) {
    sunrise = searchRise(1, p, new Date(date.getTime() - 50 * 3600_000), 1.2)
  }
  const sunset = sunrise ? searchRise(-1, p, sunrise, 1) : null
  const nextSunrise = sunrise ? searchRise(1, p, new Date(sunrise.getTime() + 60_000), 1.2) : null
  return { sunrise, sunset, nextSunrise }
}

/** Weekday (0 = Sunday) of an instant reckoned in local mean solar time at longitude `lon`. */
export function localMeanWeekday(date: Date, lon: number): number {
  const shifted = new Date(date.getTime() + (lon / 15) * 3600_000)
  return shifted.getUTCDay()
}

function siderealSunAt(date: Date, ayanId: AyanamsaId): number {
  return norm360(A.SunPosition(date).elon - ayanamsa(jdOf(date), ayanId))
}

/** Amanta lunar month: named for the Sun's sidereal sign at the opening new moon. */
export function lunarMonth(date: Date, ayanId: AyanamsaId = 'lahiri') {
  const start = A.SearchMoonPhase(0, new Date(date.getTime() - 31 * 86400_000), 32)
  let nm = start ? start.date : date
  // step forward to the latest new moon at or before `date`
  for (let i = 0; i < 3; i++) {
    const nxt = A.SearchMoonPhase(0, new Date(nm.getTime() + 86400_000), 31)
    if (!nxt || nxt.date.getTime() > date.getTime()) break
    nm = nxt.date
  }
  const next = A.SearchMoonPhase(0, new Date(nm.getTime() + 86400_000), 31)
  const r0 = Math.floor(siderealSunAt(nm, ayanId) / 30)
  const r1 = next ? Math.floor(siderealSunAt(next.date, ayanId) / 30) : (r0 + 1) % 12
  // No sankranti (solar ingress) inside the month -> it is an adhika (intercalary) month,
  // which takes the name of the month that follows it.
  const adhika = r0 === r1
  return { index: (r0 + 1) % 12, adhika, newMoon: nm }
}

export function samvatOf(date: Date, masaIndex: number) {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() // 0 = Jan
  // The luni-solar year turns at Chaitra Shukla Pratipada (Mar/Apr). Pausha, Magha and Phalguna
  // falling in Jan–Apr still belong to the year that began the previous spring.
  const startYear = masaIndex >= 9 && m <= 4 ? y - 1 : y
  const shaka = startYear - 78
  return {
    vikram: startYear + 57,
    shaka,
    kali: shaka + 3179,
    samvatsara: (((shaka + 11) % 60) + 60) % 60,
  }
}

export function panchanga(date: Date, place: Place, ayanId: AyanamsaId = 'lahiri', skyIn?: SkyMoment): Panchanga {
  const sky = skyIn ?? castSky(date, place, ayanId)
  const sun = body(sky, 'sun')
  const moon = body(sky, 'moon')
  const elong = norm360(moon.tropical - sun.tropical)
  const tIndex = Math.floor(elong / 12)
  const nIndex = Math.floor(moon.sidereal / NAK)
  const ySum = norm360(sun.sidereal + moon.sidereal)

  const { sunrise, sunset, nextSunrise } = solarDay(date, place)
  const isDay = !!(sunrise && sunset && date >= sunrise && date < sunset)
  const varaIndex = sunrise ? localMeanWeekday(sunrise, place.lon) : localMeanWeekday(date, place.lon)

  // Vedic clock: 1 day = 60 ghati, 1 ghati = 60 pala (= 24 min), 1 pala = 60 vipala.
  let ghati = 0, pala = 0, vighati = 0
  let muhurta = { index: 0, isDay }
  let hora = { index: 0, lord: VARA_LORDS[varaIndex] }
  let rahuKala: Panchanga['rahuKala'] = null
  if (sunrise && nextSunrise) {
    const dayLen = nextSunrise.getTime() - sunrise.getTime()
    const since = date.getTime() - sunrise.getTime()
    const g = (since / dayLen) * 60
    ghati = Math.floor(g)
    pala = Math.floor((g - ghati) * 60)
    vighati = Math.floor((((g - ghati) * 60) - pala) * 60)
    if (sunset) {
      const light = sunset.getTime() - sunrise.getTime()
      const dark = nextSunrise.getTime() - sunset.getTime()
      let mi: number, hi: number
      if (isDay) {
        mi = Math.floor((since / light) * 15)
        hi = Math.floor((since / light) * 12)
      } else {
        const s2 = date.getTime() - sunset.getTime()
        mi = 15 + Math.floor((s2 / dark) * 15)
        hi = 12 + Math.floor((s2 / dark) * 12)
      }
      muhurta = { index: Math.min(29, mi), isDay }
      const first = CHALDEAN.indexOf(VARA_LORDS[varaIndex])
      hora = { index: hi, lord: CHALDEAN[(first + hi) % 7] }
      const seg = RAHU_KALA_SEGMENT[varaIndex] - 1
      rahuKala = {
        start: new Date(sunrise.getTime() + (light / 8) * seg),
        end: new Date(sunrise.getTime() + (light / 8) * (seg + 1)),
      }
    }
  }

  const masa = lunarMonth(date, ayanId)
  return {
    tithi: {
      index: tIndex,
      fraction: (elong % 12) / 12,
      paksha: tIndex < 15 ? 'shukla' : 'krishna',
      dayInPaksha: (tIndex % 15) + 1,
    },
    nakshatra: {
      index: nIndex,
      pada: Math.floor((moon.sidereal % NAK) / PADA) + 1,
      fraction: (moon.sidereal % NAK) / NAK,
    },
    yoga: { index: Math.floor(ySum / NAK), fraction: (ySum % NAK) / NAK },
    karana: { index: Math.floor(elong / 6) },
    vara: { index: varaIndex, lord: VARA_LORDS[varaIndex] },
    sunrise, sunset, nextSunrise, isDay,
    ghati, pala, vighati, muhurta, hora, rahuKala,
    masa,
    samvat: samvatOf(date, masa.index),
    sunRashi: Math.floor(sun.sidereal / 30),
    moonRashi: Math.floor(moon.sidereal / 30),
  }
}

export const MASAS = [
  'Chaitra', 'Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada',
  'Ashvina', 'Kartika', 'Margashirsha', 'Pausha', 'Magha', 'Phalguna',
]

// The thirty muhurtas, fifteen of day then fifteen of night, after the list commonly given from
// the Muhurta Chintamani tradition. Abhijit is the eighth of the day (index 7, "Vidhi").
export const MUHURTAS = [
  'Rudra', 'Ahi', 'Mitra', 'Pitri', 'Vasu', 'Varaha', 'Vishvedeva', 'Vidhi (Abhijit)',
  'Satamukhi', 'Puruhuta', 'Vahini', 'Naktanakara', 'Varuna', 'Aryaman', 'Bhaga',
  'Girisha', 'Ajapada', 'Ahirbudhnya', 'Pushan', 'Ashvini', 'Yama', 'Agni', 'Vidhatri',
  'Kanda', 'Aditi', 'Jiva (Amrita)', 'Vishnu', 'Dyumadgadyuti', 'Brahma', 'Samudra',
]

export const SAMVATSARAS = [
  'Prabhava', 'Vibhava', 'Shukla', 'Pramoda', 'Prajapati', 'Angirasa', 'Shrimukha', 'Bhava',
  'Yuva', 'Dhatri', 'Ishvara', 'Bahudhanya', 'Pramathi', 'Vikrama', 'Vrisha', 'Chitrabhanu',
  'Svabhanu', 'Tarana', 'Parthiva', 'Vyaya', 'Sarvajit', 'Sarvadhari', 'Virodhi', 'Vikriti',
  'Khara', 'Nandana', 'Vijaya', 'Jaya', 'Manmatha', 'Durmukhi', 'Hevilambi', 'Vilambi',
  'Vikari', 'Sharvari', 'Plava', 'Shubhakrit', 'Shobhakrit', 'Krodhi', 'Vishvavasu',
  'Parabhava', 'Plavanga', 'Kilaka', 'Saumya', 'Sadharana', 'Virodhikrit', 'Paridhavi',
  'Pramadicha', 'Ananda', 'Rakshasa', 'Nala', 'Pingala', 'Kalayukti', 'Siddharthi', 'Raudri',
  'Durmati', 'Dundubhi', 'Rudhirodgari', 'Raktakshi', 'Krodhana', 'Akshaya',
]
