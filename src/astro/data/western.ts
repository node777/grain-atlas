// Western tropical astrology: sign meanings, essential dignities and the major aspects.
// Signs are measured from the vernal equinox (tropical), not from the stars.

import type { Element, Modality, Source } from './types'

export type WesternBody =
  | 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune' | 'Pluto'

export interface TropicalSign {
  index: number                 // 0 = Aries, beginning at the March equinox point
  name: string
  glyph: string
  element: Element
  modality: Modality
  polarity: 'positive' | 'negative' // masculine/diurnal vs feminine/nocturnal
  traditionalRuler: WesternBody
  modernRuler?: WesternBody     // only where modern astrology assigns an outer planet
  keywords: string[]
}

export const TROPICAL_SIGNS: TropicalSign[] = [
  { index: 0, name: 'Aries', glyph: '♈', element: 'fire', modality: 'cardinal', polarity: 'positive',
    traditionalRuler: 'Mars', keywords: ['initiative', 'assertion', 'courage', 'impatience'] },
  { index: 1, name: 'Taurus', glyph: '♉', element: 'earth', modality: 'fixed', polarity: 'negative',
    traditionalRuler: 'Venus', keywords: ['stability', 'sensuality', 'possession', 'persistence'] },
  { index: 2, name: 'Gemini', glyph: '♊', element: 'air', modality: 'mutable', polarity: 'positive',
    traditionalRuler: 'Mercury', keywords: ['communication', 'curiosity', 'versatility', 'restlessness'] },
  { index: 3, name: 'Cancer', glyph: '♋', element: 'water', modality: 'cardinal', polarity: 'negative',
    traditionalRuler: 'Moon', keywords: ['nurture', 'belonging', 'memory', 'defensiveness'] },
  { index: 4, name: 'Leo', glyph: '♌', element: 'fire', modality: 'fixed', polarity: 'positive',
    traditionalRuler: 'Sun', keywords: ['self-expression', 'warmth', 'pride', 'creativity'] },
  { index: 5, name: 'Virgo', glyph: '♍', element: 'earth', modality: 'mutable', polarity: 'negative',
    traditionalRuler: 'Mercury', keywords: ['analysis', 'service', 'precision', 'worry'] },
  { index: 6, name: 'Libra', glyph: '♎', element: 'air', modality: 'cardinal', polarity: 'positive',
    traditionalRuler: 'Venus', keywords: ['balance', 'relationship', 'diplomacy', 'indecision'] },
  { index: 7, name: 'Scorpio', glyph: '♏', element: 'water', modality: 'fixed', polarity: 'negative',
    traditionalRuler: 'Mars', modernRuler: 'Pluto', keywords: ['intensity', 'depth', 'control', 'regeneration'] },
  { index: 8, name: 'Sagittarius', glyph: '♐', element: 'fire', modality: 'mutable', polarity: 'positive',
    traditionalRuler: 'Jupiter', keywords: ['exploration', 'belief', 'candour', 'excess'] },
  { index: 9, name: 'Capricorn', glyph: '♑', element: 'earth', modality: 'cardinal', polarity: 'negative',
    traditionalRuler: 'Saturn', keywords: ['ambition', 'discipline', 'responsibility', 'reserve'] },
  { index: 10, name: 'Aquarius', glyph: '♒', element: 'air', modality: 'fixed', polarity: 'positive',
    traditionalRuler: 'Saturn', modernRuler: 'Uranus', keywords: ['independence', 'community', 'invention', 'detachment'] },
  { index: 11, name: 'Pisces', glyph: '♓', element: 'water', modality: 'mutable', polarity: 'negative',
    traditionalRuler: 'Jupiter', modernRuler: 'Neptune', keywords: ['empathy', 'imagination', 'transcendence', 'diffusion'] },
]

export interface Dignity {
  planet: WesternBody
  domicile: number[]
  detriment: number[]
  exaltation?: { sign: number; degree?: number }
  fall?: { sign: number; degree?: number }
}

/**
 * Essential dignities of the seven traditional planets. Exaltation signs are Ptolemaic; the
 * degrees are the medieval values (Firmicus Maternus, al-Biruni, Abu Ma'shar). Note the Indian
 * deep-exaltation degrees differ for the Sun (10), Jupiter (5) and Saturn (20).
 * Modern co-rulerships (Uranus, Neptune, Pluto) are listed separately because their exaltations
 * are not agreed.
 */
export const DIGNITIES: Dignity[] = [
  { planet: 'Sun', domicile: [4], detriment: [10], exaltation: { sign: 0, degree: 19 }, fall: { sign: 6, degree: 19 } },
  { planet: 'Moon', domicile: [3], detriment: [9], exaltation: { sign: 1, degree: 3 }, fall: { sign: 7, degree: 3 } },
  { planet: 'Mercury', domicile: [2, 5], detriment: [8, 11], exaltation: { sign: 5, degree: 15 }, fall: { sign: 11, degree: 15 } },
  { planet: 'Venus', domicile: [1, 6], detriment: [7, 0], exaltation: { sign: 11, degree: 27 }, fall: { sign: 5, degree: 27 } },
  { planet: 'Mars', domicile: [0, 7], detriment: [6, 1], exaltation: { sign: 9, degree: 28 }, fall: { sign: 3, degree: 28 } },
  { planet: 'Jupiter', domicile: [8, 11], detriment: [2, 5], exaltation: { sign: 3, degree: 15 }, fall: { sign: 9, degree: 15 } },
  { planet: 'Saturn', domicile: [9, 10], detriment: [3, 4], exaltation: { sign: 6, degree: 21 }, fall: { sign: 0, degree: 21 } },
]

/** Modern rulerships (no agreed exaltations). Detriment is the opposite sign. */
export const MODERN_RULERSHIPS: Dignity[] = [
  { planet: 'Uranus', domicile: [10], detriment: [4] },
  { planet: 'Neptune', domicile: [11], detriment: [5] },
  { planet: 'Pluto', domicile: [7], detriment: [1] },
]

/** Medieval Western exaltation of the lunar nodes (Head in Gemini, Tail in Sagittarius); not universal. */
export const NODE_EXALTATIONS = {
  northNode: { sign: 2, degree: 3 },
  southNode: { sign: 8, degree: 3 },
} as const

export interface Aspect {
  name: string
  glyph: string
  angle: number
  orb: number          // a typical modern orb in degrees; schools vary
  nature: 'harmonious' | 'challenging' | 'neutral'
  ptolemaic: boolean   // one of the five aspects recognised by Ptolemy
}

export const ASPECTS: Aspect[] = [
  { name: 'conjunction', glyph: '☌', angle: 0, orb: 8, nature: 'neutral', ptolemaic: true },
  { name: 'sextile', glyph: '⚹', angle: 60, orb: 4, nature: 'harmonious', ptolemaic: true },
  { name: 'square', glyph: '□', angle: 90, orb: 7, nature: 'challenging', ptolemaic: true },
  { name: 'trine', glyph: '△', angle: 120, orb: 7, nature: 'harmonious', ptolemaic: true },
  { name: 'opposition', glyph: '☍', angle: 180, orb: 8, nature: 'challenging', ptolemaic: true },
  { name: 'quincunx', glyph: '⚻', angle: 150, orb: 2, nature: 'neutral', ptolemaic: false },
  { name: 'semi-sextile', glyph: '⚺', angle: 30, orb: 2, nature: 'neutral', ptolemaic: false },
]

/**
 * Traditional planetary orbs ("light"), in degrees: an aspect is in orb when the separation is
 * within half the sum of the two planets' orbs (their moieties). Values after al-Biruni; other
 * authors (e.g. William Lilly) differ by a degree or two for Saturn, Jupiter and Mars.
 */
export const PLANETARY_ORBS: Partial<Record<WesternBody, number>> = {
  Sun: 15, Moon: 12, Saturn: 9, Jupiter: 9, Mars: 8, Venus: 7, Mercury: 7,
}

export const sources: Source[] = [
  {
    title: 'Claudius Ptolemy, Tetrabiblos book I (tr. F. E. Robbins, Loeb 1940)',
    note: 'Domiciles, exaltation signs, the five aspects.',
  },
  {
    title: 'al-Biruni, Book of Instruction in the Elements of the Art of Astrology (tr. R. R. Wright, 1934)',
    note: 'Exaltation degrees and planetary orbs (cited from the standard text, not re-fetched).',
  },
  {
    title: 'Modern rulerships of the outer planets',
    note: '20th-century convention (Pluto-Scorpio, Uranus-Aquarius, Neptune-Pisces); aspect orbs are typical modern practice and vary by school.',
  },
]
