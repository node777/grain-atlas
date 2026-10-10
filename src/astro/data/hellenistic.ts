// Hellenistic reference tables (tropical zodiac): Chaldean order, decans/faces, Dorothean
// triplicity rulers, Egyptian terms (bounds) and planetary-hour helpers.

import type { Decan, Source } from './types'

export type ClassicalPlanet = 'Saturn' | 'Jupiter' | 'Mars' | 'Sun' | 'Venus' | 'Mercury' | 'Moon'

/** Slowest to fastest, by apparent geocentric period. */
export const CHALDEAN_ORDER: ClassicalPlanet[] = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon']

/** Traditional domicile rulers by sign index (0 = Aries). */
export const SIGN_RULERS: ClassicalPlanet[] = [
  'Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter',
]

export type TriplicityElement = 'fire' | 'earth' | 'air' | 'water'

export interface TriplicityRulers {
  element: TriplicityElement
  signs: number[]
  day: ClassicalPlanet
  night: ClassicalPlanet
  participating: ClassicalPlanet
}

/** Dorotheus of Sidon, Carmen Astrologicum I.1. */
export const TRIPLICITIES: TriplicityRulers[] = [
  { element: 'fire', signs: [0, 4, 8], day: 'Sun', night: 'Jupiter', participating: 'Saturn' },
  { element: 'earth', signs: [1, 5, 9], day: 'Venus', night: 'Moon', participating: 'Mars' },
  { element: 'air', signs: [2, 6, 10], day: 'Saturn', night: 'Mercury', participating: 'Jupiter' },
  { element: 'water', signs: [3, 7, 11], day: 'Venus', night: 'Mars', participating: 'Moon' },
]

const SIGN_NAMES = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

/**
 * 36 decans. `chaldeanRuler` is the Chaldean-order "face" (Mars, Sun, Venus for Aries, continuing
 * without break through Pisces). `triplicityRuler` is the domicile lord of the same-element sign
 * counted 1st/5th/9th from the decan's sign: the scheme of the Indian drekkana (BPHS) and of
 * modern Western "triplicity decans". It is not the Dorothean triplicity lord.
 */
export const DECANS: Decan[] = Array.from({ length: 36 }, (_, k) => {
  const sign = Math.floor(k / 3)
  const decan = (k % 3) as 0 | 1 | 2
  const chaldeanRuler = CHALDEAN_ORDER[(2 + k) % 7] // index 2 = Mars for Aries I
  const triplicityRuler = SIGN_RULERS[(sign + 4 * decan) % 12]
  return {
    sign,
    decan,
    chaldeanRuler,
    triplicityRuler,
    note: `${SIGN_NAMES[sign]} ${decan * 10}°-${decan * 10 + 10}°`,
  }
})

export type TermPlanet = 'Saturn' | 'Jupiter' | 'Mars' | 'Venus' | 'Mercury'

/**
 * Egyptian terms (bounds), as reported in Ptolemy's Tetrabiblos book I and used by Vettius Valens.
 * Per sign: [planet, endDegree] in order; each bound runs from the previous end (or 0) up to endDegree.
 * Totals per planet over the zodiac: Saturn 57, Jupiter 79, Mars 66, Venus 82, Mercury 76 (= 360).
 */
export const EGYPTIAN_TERMS: [TermPlanet, number][][] = [
  /* Aries */       [['Jupiter', 6], ['Venus', 12], ['Mercury', 20], ['Mars', 25], ['Saturn', 30]],
  /* Taurus */      [['Venus', 8], ['Mercury', 14], ['Jupiter', 22], ['Saturn', 27], ['Mars', 30]],
  /* Gemini */      [['Mercury', 6], ['Jupiter', 12], ['Venus', 17], ['Mars', 24], ['Saturn', 30]],
  /* Cancer */      [['Mars', 7], ['Venus', 13], ['Mercury', 19], ['Jupiter', 26], ['Saturn', 30]],
  /* Leo */         [['Jupiter', 6], ['Venus', 11], ['Saturn', 18], ['Mercury', 24], ['Mars', 30]],
  /* Virgo */       [['Mercury', 7], ['Venus', 17], ['Jupiter', 21], ['Mars', 28], ['Saturn', 30]],
  /* Libra */       [['Saturn', 6], ['Mercury', 14], ['Jupiter', 21], ['Venus', 28], ['Mars', 30]],
  /* Scorpio */     [['Mars', 7], ['Venus', 11], ['Mercury', 19], ['Jupiter', 24], ['Saturn', 30]],
  /* Sagittarius */ [['Jupiter', 12], ['Venus', 17], ['Mercury', 21], ['Saturn', 26], ['Mars', 30]],
  /* Capricorn */   [['Mercury', 7], ['Jupiter', 14], ['Venus', 22], ['Saturn', 26], ['Mars', 30]],
  /* Aquarius */    [['Mercury', 7], ['Venus', 13], ['Jupiter', 20], ['Mars', 25], ['Saturn', 30]],
  /* Pisces */      [['Venus', 12], ['Jupiter', 16], ['Mercury', 19], ['Mars', 28], ['Saturn', 30]],
]

/** Term ruler for a tropical longitude (degrees). */
export function egyptianTermRuler(longitude: number): TermPlanet {
  const lon = ((longitude % 360) + 360) % 360
  const sign = Math.floor(lon / 30)
  const deg = lon - sign * 30
  for (const [planet, end] of EGYPTIAN_TERMS[sign]) if (deg < end) return planet
  return EGYPTIAN_TERMS[sign][4][0]
}

/** Ruler of the first planetary hour of each weekday (0 = Sunday). */
export const DAY_RULERS: ClassicalPlanet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']

/**
 * Planetary-hour ruler. `hour` 0..11 are the seasonal hours from sunrise to sunset, 12..23 from
 * sunset to the next sunrise. Hours follow the Chaldean order starting from the day ruler; 24 steps
 * later the sequence lands on the next day's ruler, which is how the weekday order arises.
 */
export function planetaryHourRuler(weekday: number, hour: number): ClassicalPlanet {
  const start = CHALDEAN_ORDER.indexOf(DAY_RULERS[((weekday % 7) + 7) % 7])
  return CHALDEAN_ORDER[(start + (((hour % 24) + 24) % 24)) % 7]
}

export const sources: Source[] = [
  {
    title: 'Claudius Ptolemy, Tetrabiblos book I, chapters on triplicities, exaltations, terms and faces (tr. F. E. Robbins, Loeb 1940)',
    note: 'Egyptian terms table (which Ptolemy reports and criticises before offering his own); faces in Chaldean order. Table reproduced from the standard text and checked by per-planet totals.',
  },
  {
    title: 'Dorotheus of Sidon, Carmen Astrologicum I.1 (tr. D. Pingree 1976; B. Dykes 2017)',
    note: 'Day, night and participating triplicity rulers. Ptolemy (I.18) gives a variant without a consistent third ruler.',
  },
  {
    title: 'Vettius Valens, Anthology I',
    note: 'Uses the same Egyptian terms; cited as corroboration from memory, not re-checked here.',
  },
  {
    title: 'Brihat Parashara Hora Shastra, ch. 6 (drekkana: lords of the 1st, 5th and 9th signs)',
    note: 'Basis of the `triplicityRuler` field.',
  },
]
