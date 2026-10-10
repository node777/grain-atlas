// The five limbs (pancha-anga) of the Hindu almanac: tithi, vara, nakshatra (see nakshatras.ts),
// yoga and karana.
//
// Tithi deities: Muhurta Chintamani's tithi-lord verse (Agni, Brahma, Gauri, Ganesha, Naga, Skanda,
//   Surya, Shiva, Durga, Yama, Vishvedevas, Vishnu, Kama, Shiva, Chandra); Amavasya -> the Pitris.
// Groups: Nanda (1, 6, 11), Bhadra (2, 7, 12), Jaya (3, 8, 13), Rikta (4, 9, 14), Purna (5, 10, 15/30).

import type { Karana, Source, Tithi, Vara, Yoga } from './types'

const TITHI_NAMES = [
  'Pratipada', 'Dvitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami',
  'Navami', 'Dashami', 'Ekadashi', 'Dvadashi', 'Trayodashi', 'Chaturdashi',
] as const

const TITHI_DEITIES = [
  'Agni', 'Brahma', 'Gauri', 'Ganesha', 'the Nagas (serpents)', 'Skanda (Kartikeya)', 'Surya',
  'Shiva (Rudra)', 'Durga', 'Yama', 'the Vishvedevas', 'Vishnu', 'Kama', 'Shiva',
] as const

const GROUPS: Tithi['group'][] = ['nanda', 'bhadra', 'jaya', 'rikta', 'purna']

const GROUP_KEYWORDS: Record<Tithi['group'], string[]> = {
  nanda: ['joy', 'festivity', 'beginnings'],
  bhadra: ['wellbeing', 'auspicious works', 'stability'],
  jaya: ['victory', 'contest', 'effort'],
  rikta: ['emptiness', 'avoided for auspicious starts', 'suited to clearing and ending'],
  purna: ['fullness', 'completion', 'fulfilment'],
}

function tithi(index: number): Tithi {
  const paksha: Tithi['paksha'] = index < 15 ? 'shukla' : 'krishna'
  const n = index % 15 // 0..14 within the fortnight
  const group = GROUPS[n % 5]
  if (n === 14) {
    return paksha === 'shukla'
      ? { index, name: 'Purnima', paksha, deity: 'Chandra (Soma)', group, keywords: ['full moon', ...GROUP_KEYWORDS.purna] }
      : {
          index, name: 'Amavasya', paksha, deity: 'the Pitris (ancestors)', group,
          keywords: ['new moon', 'ancestral rites', 'counted purna by position but generally avoided for auspicious starts'],
        }
  }
  return { index, name: TITHI_NAMES[n], paksha, deity: TITHI_DEITIES[n], group, keywords: [...GROUP_KEYWORDS[group]] }
}

/** 30 tithis: 0..14 shukla paksha (Pratipada..Purnima), 15..29 krishna paksha (Pratipada..Amavasya). */
export const TITHIS: Tithi[] = Array.from({ length: 30 }, (_, i) => tithi(i))

/** 27 nitya yogas: yoga index = floor((sun + moon sidereal longitude) / 13°20'). */
export const YOGAS: Yoga[] = [
  { index: 0, name: 'Vishkambha', meaning: 'the prop (also: obstruction)', quality: 'inauspicious' },
  { index: 1, name: 'Priti', meaning: 'fondness, affection', quality: 'auspicious' },
  { index: 2, name: 'Ayushman', meaning: 'long-lived', quality: 'auspicious' },
  { index: 3, name: 'Saubhagya', meaning: 'good fortune', quality: 'auspicious' },
  { index: 4, name: 'Shobhana', meaning: 'splendid, lovely', quality: 'auspicious' },
  { index: 5, name: 'Atiganda', meaning: 'great danger (a big knot)', quality: 'inauspicious' },
  { index: 6, name: 'Sukarma', meaning: 'good action', quality: 'auspicious' },
  { index: 7, name: 'Dhriti', meaning: 'steadiness, resolve', quality: 'auspicious' },
  { index: 8, name: 'Shula', meaning: 'the spike (sharp pain)', quality: 'inauspicious' },
  { index: 9, name: 'Ganda', meaning: 'the knot (danger)', quality: 'inauspicious' },
  { index: 10, name: 'Vriddhi', meaning: 'growth, increase', quality: 'auspicious' },
  { index: 11, name: 'Dhruva', meaning: 'fixed, constant', quality: 'auspicious' },
  { index: 12, name: 'Vyaghata', meaning: 'the blow (striking down)', quality: 'inauspicious' },
  { index: 13, name: 'Harshana', meaning: 'delighting', quality: 'auspicious' },
  { index: 14, name: 'Vajra', meaning: 'the thunderbolt (diamond)', quality: 'inauspicious' },
  { index: 15, name: 'Siddhi', meaning: 'accomplishment', quality: 'auspicious' },
  { index: 16, name: 'Vyatipata', meaning: 'calamity (a sudden fall)', quality: 'inauspicious' },
  { index: 17, name: 'Variyan', meaning: 'the most excellent (comfort)', quality: 'auspicious' },
  { index: 18, name: 'Parigha', meaning: 'the iron bar (a barrier)', quality: 'inauspicious' },
  { index: 19, name: 'Shiva', meaning: 'benign, auspicious', quality: 'auspicious' },
  { index: 20, name: 'Siddha', meaning: 'accomplished, perfected', quality: 'auspicious' },
  { index: 21, name: 'Sadhya', meaning: 'achievable', quality: 'auspicious' },
  { index: 22, name: 'Shubha', meaning: 'auspicious', quality: 'auspicious' },
  { index: 23, name: 'Shukla', meaning: 'bright, white', quality: 'auspicious' },
  { index: 24, name: 'Brahma', meaning: 'of Brahma (sacred, expansive)', quality: 'auspicious' },
  { index: 25, name: 'Indra', meaning: 'of Indra (lordly; also Aindra or Mahendra)', quality: 'auspicious' },
  { index: 26, name: 'Vaidhriti', meaning: 'disunion, holding apart', quality: 'inauspicious' },
]

/** The seven movable (chara) karanas, which cycle eight times through the month. */
export const KARANAS_MOVABLE: Karana[] = [
  { name: 'Bava', kind: 'movable', meaning: 'first of the movable karanas; generally auspicious' },
  { name: 'Balava', kind: 'movable', meaning: 'second movable karana; generally auspicious' },
  { name: 'Kaulava', kind: 'movable', meaning: 'third movable karana; generally auspicious' },
  { name: 'Taitila', kind: 'movable', meaning: 'fourth movable karana; generally auspicious' },
  { name: 'Garaja', kind: 'movable', meaning: 'fifth movable karana (also Gara); generally auspicious' },
  { name: 'Vanija', kind: 'movable', meaning: 'the trader; generally auspicious, especially for commerce' },
  { name: 'Vishti', kind: 'movable', meaning: 'forced labour; also called Bhadra and avoided for auspicious undertakings' },
]

/** The four fixed (sthira) karanas, which occur once a month around the new moon. */
export const KARANAS_FIXED: Karana[] = [
  { name: 'Shakuni', kind: 'fixed', meaning: 'the omen-bird; second half of krishna Chaturdashi' },
  { name: 'Chatushpada', kind: 'fixed', meaning: 'four-footed; first half of Amavasya' },
  { name: 'Naga', kind: 'fixed', meaning: 'the serpent; second half of Amavasya' },
  { name: 'Kimstughna', kind: 'fixed', meaning: 'etymology obscure; first half of shukla Pratipada' },
]

/**
 * Karana for half-tithi index i (0..59), counted from the new moon (Sun-Moon elongation / 6°).
 * 0 = Kimstughna; 1..56 cycle Bava..Vishti; 57 = Shakuni; 58 = Chatushpada; 59 = Naga.
 */
export function karanaForIndex(i: number): Karana {
  const n = ((Math.floor(i) % 60) + 60) % 60
  if (n === 0) return KARANAS_FIXED[3]
  if (n >= 57) return KARANAS_FIXED[n - 57]
  return KARANAS_MOVABLE[(n - 1) % 7]
}

export const VARAS: Vara[] = [
  { index: 0, name: 'Ravivara', lord: 'sun', english: 'Sunday' },
  { index: 1, name: 'Somavara', lord: 'moon', english: 'Monday' },
  { index: 2, name: 'Mangalavara', lord: 'mars', english: 'Tuesday' },
  { index: 3, name: 'Budhavara', lord: 'mercury', english: 'Wednesday' },
  { index: 4, name: 'Guruvara', lord: 'jupiter', english: 'Thursday' },
  { index: 5, name: 'Shukravara', lord: 'venus', english: 'Friday' },
  { index: 6, name: 'Shanivara', lord: 'saturn', english: 'Saturday' },
]

export const sources: Source[] = [
  {
    title: 'Rama Daivajna, Muhurta Chintamani (1600), shubhashubha prakarana: tithi lords',
    url: 'https://ficino.sourcelibrary.org/book/6990601c8cbcc9a4dba2c47a/page/6990601d8cbcc9a4dba2c48d',
    note:
      'Digitised edition seen via search snippet: Agni, Brahma, Gauri, Ganesha, Nagas, Kartikeya, Sun, Shiva, Durga, Yama, Vishvedevas, Vishnu, Kamadeva, Shiva, Moon. The verse gives the Moon for the 15th; the Pitris for Amavasya follows the widespread panchanga convention.',
  },
  {
    title: 'jyotisha (sanskrit-coders): TITHI, YOGA and KARANA name tables',
    url: 'https://github.com/sanskrit-coders/jyotisha',
    note:
      'Confirms the 27 yoga names in order (Vishkambha .. Vaidhriti, with Shubhra = Shukla and Mahendra = Indra) and the 60-slot karana layout: kimstughna, then bava..bhadra x8, then shakuni, catushpat, nagavan.',
  },
  {
    title: 'Nanda/Bhadra/Jaya/Rikta/Purna tithi groups',
    note: 'Standard in Muhurta literature and every panchanga; cross-checked against several panchanga sites via search.',
  },
  {
    title: 'Inauspicious nitya yogas',
    note:
      'The nine conventionally avoided yogas (Vishkambha, Atiganda, Shula, Ganda, Vyaghata, Vajra, Vyatipata, Parigha, Vaidhriti). Muhurta texts avoid only the opening ghatis of some (e.g. Vishkambha, Vajra) and the first half of Parigha, but all of Vyatipata and Vaidhriti.',
  },
]
