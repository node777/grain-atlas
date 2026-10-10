// The twelve rashis (sidereal signs) of Jyotish.
// Lords, gender, direction and the Kalapurusha body map follow BPHS ch. 4 and Brihat Jataka 1.
// Element/modality use the usual Western labels for the same scheme (chara/sthira/dvisvabhava).

import type { Rashi, Source } from './types'

export const RASHIS: Rashi[] = [
  {
    index: 0, name: 'Mesha', iast: 'Meṣa', devanagari: 'मेष', western: 'Aries', glyph: '♈',
    symbol: 'the ram', element: 'fire', modality: 'cardinal', lord: 'mars', gender: 'masculine',
    direction: 'east', bodyPart: 'head',
    keywords: ['initiative', 'courage', 'impulse', 'pioneering'],
  },
  {
    index: 1, name: 'Vrishabha', iast: 'Vṛṣabha', devanagari: 'वृषभ', western: 'Taurus', glyph: '♉',
    symbol: 'the bull', element: 'earth', modality: 'fixed', lord: 'venus', gender: 'feminine',
    direction: 'south', bodyPart: 'face',
    keywords: ['steadiness', 'wealth', 'sensuality', 'patience'],
  },
  {
    index: 2, name: 'Mithuna', iast: 'Mithuna', devanagari: 'मिथुन', western: 'Gemini', glyph: '♊',
    symbol: 'a couple, the man holding a mace and the woman a lute', element: 'air', modality: 'mutable',
    lord: 'mercury', gender: 'masculine', direction: 'west', bodyPart: 'chest, shoulders and arms',
    keywords: ['communication', 'pairing', 'curiosity', 'skill'],
  },
  {
    index: 3, name: 'Karka', iast: 'Karka', devanagari: 'कर्क', western: 'Cancer', glyph: '♋',
    symbol: 'the crab', element: 'water', modality: 'cardinal', lord: 'moon', gender: 'feminine',
    direction: 'north', bodyPart: 'heart',
    keywords: ['nurture', 'home', 'sensitivity', 'protection'],
  },
  {
    index: 4, name: 'Simha', iast: 'Siṃha', devanagari: 'सिंह', western: 'Leo', glyph: '♌',
    symbol: 'the lion', element: 'fire', modality: 'fixed', lord: 'sun', gender: 'masculine',
    direction: 'east', bodyPart: 'stomach',
    keywords: ['authority', 'dignity', 'generosity', 'display'],
  },
  {
    index: 5, name: 'Kanya', iast: 'Kanyā', devanagari: 'कन्या', western: 'Virgo', glyph: '♍',
    symbol: 'a maiden in a boat holding grain and fire', element: 'earth', modality: 'mutable',
    lord: 'mercury', gender: 'feminine', direction: 'south', bodyPart: 'waist and hips',
    keywords: ['discernment', 'service', 'craft', 'purity'],
  },
  {
    index: 6, name: 'Tula', iast: 'Tulā', devanagari: 'तुला', western: 'Libra', glyph: '♎',
    symbol: 'a man holding a balance', element: 'air', modality: 'cardinal', lord: 'venus',
    gender: 'masculine', direction: 'west', bodyPart: 'lower abdomen (basti)',
    keywords: ['balance', 'trade', 'partnership', 'fairness'],
  },
  {
    index: 7, name: 'Vrishchika', iast: 'Vṛścika', devanagari: 'वृश्चिक', western: 'Scorpio', glyph: '♏',
    symbol: 'the scorpion', element: 'water', modality: 'fixed', lord: 'mars', gender: 'feminine',
    direction: 'north', bodyPart: 'genitals',
    keywords: ['intensity', 'secrecy', 'transformation', 'endurance'],
  },
  {
    index: 8, name: 'Dhanu', iast: 'Dhanus', devanagari: 'धनु', western: 'Sagittarius', glyph: '♐',
    symbol: 'an archer whose hind part is a horse', element: 'fire', modality: 'mutable', lord: 'jupiter',
    gender: 'masculine', direction: 'east', bodyPart: 'thighs',
    keywords: ['aspiration', 'dharma', 'travel', 'teaching'],
  },
  {
    index: 9, name: 'Makara', iast: 'Makara', devanagari: 'मकर', western: 'Capricorn', glyph: '♑',
    symbol: 'the makara: deer-faced, with a crocodile body', element: 'earth', modality: 'cardinal',
    lord: 'saturn', gender: 'feminine', direction: 'south', bodyPart: 'knees',
    keywords: ['ambition', 'structure', 'perseverance', 'pragmatism'],
  },
  {
    index: 10, name: 'Kumbha', iast: 'Kumbha', devanagari: 'कुम्भ', western: 'Aquarius', glyph: '♒',
    symbol: 'a man carrying a water pot', element: 'air', modality: 'fixed', lord: 'saturn',
    gender: 'masculine', direction: 'west', bodyPart: 'calves (shanks)',
    keywords: ['community', 'ideals', 'detachment', 'innovation'],
  },
  {
    index: 11, name: 'Mina', iast: 'Mīna', devanagari: 'मीन', western: 'Pisces', glyph: '♓',
    symbol: 'a pair of fish', element: 'water', modality: 'mutable', lord: 'jupiter',
    gender: 'feminine', direction: 'north', bodyPart: 'feet',
    keywords: ['compassion', 'dissolution', 'imagination', 'surrender'],
  },
]

export const sources: Source[] = [
  {
    title: 'Brihat Parashara Hora Shastra, ch. 4 (tr. R. Santhanam)',
    url: 'https://archive.org/download/BPHSEnglish/BPHS%20-%201%20RSanthanam.pdf',
    note: 'Sign forms, lords, directions (east/south/west/north repeating from Aries), gender (odd signs masculine), movable/fixed/dual.',
  },
  {
    title: 'Varahamihira, Brihat Jataka 1.4 (Kalapurusha limbs)',
    note: 'Head, face, chest, heart, belly, hips, lower abdomen, genitals, thighs, knees, shanks, feet.',
  },
  {
    title: 'jyotisha (sanskrit-coders) RASHI_NAMES table',
    url: 'https://github.com/sanskrit-coders/jyotisha',
    note: 'Devanagari cross-check. That table uses the inflected/Tamil-tradition forms (e.g. कटकः for Cancer); we use the uninflected stems common in North Indian panchangas (कर्क).',
  },
]
