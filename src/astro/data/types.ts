// Shared shapes for every astrological reference table in the atlas.
// Tables live beside this file, one tradition per module, each with a `sources` export
// naming where its facts come from. Engine code (src/astro/*.ts) reads only these shapes.

export type GrahaId =
  | 'sun' | 'moon' | 'mars' | 'mercury' | 'jupiter' | 'venus' | 'saturn' | 'rahu' | 'ketu'

export type Element = 'fire' | 'earth' | 'air' | 'water'
export type Modality = 'cardinal' | 'fixed' | 'mutable'

export interface Source {
  title: string
  url?: string
  note?: string
}

export interface Graha {
  id: GrahaId
  name: string            // Sanskrit, ASCII (e.g. "Surya")
  iast: string            // e.g. "Sūrya"
  devanagari: string
  english: string         // e.g. "Sun"
  glyph: string           // Unicode astronomical symbol
  nature: 'benefic' | 'malefic' | 'mixed'
  element?: string        // tattva (agni, prithvi, vayu, jala, akasha)
  guna?: 'sattva' | 'rajas' | 'tamas'
  day?: string            // weekday ruled
  color?: string          // traditional color word
  gem?: string
  metal?: string
  deity?: string
  exaltation?: { rashi: number; degree: number }   // rashi index 0 = Mesha/Aries
  debilitation?: { rashi: number; degree: number }
  moolatrikona?: { rashi: number; from: number; to: number }
  owns: number[]          // rashi indices ruled
  friends: GrahaId[]
  neutrals: GrahaId[]
  enemies: GrahaId[]
  dashaYears: number      // Vimshottari period length
  karakas: string[]       // significations
  keywords: string[]
}

export interface Rashi {
  index: number           // 0 = Mesha / Aries
  name: string            // Sanskrit ASCII
  iast: string
  devanagari: string
  western: string         // Aries ...
  glyph: string
  symbol: string          // the ram ...
  element: Element
  modality: Modality
  lord: GrahaId
  gender: 'masculine' | 'feminine'
  direction?: string
  bodyPart?: string
  keywords: string[]
}

export interface Nakshatra {
  index: number           // 0 = Ashvini (almanac order); spans index*13°20' sidereal
  taittiriyaIndex: number // position in the Krittika-first Taittiriya Brahmana roster (0 = Krittika)
  name: string
  iast: string
  devanagari: string
  meaning: string         // literal meaning of the name
  deity: string
  symbol: string
  lord: GrahaId           // Vimshottari lord
  gana: 'deva' | 'manushya' | 'rakshasa'
  yoni: string            // animal
  nature: string          // e.g. "light/swift (laghu/kshipra)"
  guna?: string
  caste?: string
  direction?: string
  yogatara: { name: string; bayer?: string; hip?: number; note?: string }
  xiu?: { name: string; hanzi: string; meaning: string }      // nearest Chinese lunar lodge
  manzil?: { name: string; arabic: string; meaning: string }  // nearest Arabic lunar station
  keywords: string[]
  essence: string         // one-line gloss in our own words
}

export interface Tithi {
  index: number           // 0..29 ; 0-14 shukla (waxing), 15-29 krishna (waning)
  name: string            // Pratipada ... Purnima / Amavasya
  paksha: 'shukla' | 'krishna'
  deity: string
  group: 'nanda' | 'bhadra' | 'jaya' | 'rikta' | 'purna'
  keywords: string[]
}

export interface Yoga {
  index: number           // 0..26 nitya yogas
  name: string
  meaning: string
  quality: 'auspicious' | 'inauspicious' | 'mixed'
}

export interface Karana {
  name: string
  kind: 'movable' | 'fixed'
  meaning: string
}

export interface Vara {
  index: number           // 0 = Sunday (Ravivara)
  name: string
  lord: GrahaId
  english: string
}

export interface Xiu {      // Chinese 28 lunar lodges
  index: number           // 0 = Jiao (Horn)
  pinyin: string
  hanzi: string
  meaning: string
  palace: 'Azure Dragon (East)' | 'Black Tortoise (North)' | 'White Tiger (West)' | 'Vermilion Bird (South)'
  determinative: { name: string; hip?: number }
  element?: string
  animal?: string
}

export interface Manzil {   // Arabic 28 lunar stations
  index: number           // 0 = al-Sharatain
  name: string
  arabic: string
  meaning: string
  stars: string
  hip?: number
}

export interface Decan {
  sign: number            // tropical sign index 0 = Aries
  decan: 0 | 1 | 2
  chaldeanRuler: string   // Chaldean-order (Hellenistic "faces") planet
  triplicityRuler?: string
  egyptianName?: string
  note?: string
}

export interface ChineseStem { index: number; pinyin: string; hanzi: string; element: string; polarity: 'yang' | 'yin' }
export interface ChineseBranch { index: number; pinyin: string; hanzi: string; animal: string; element: string; hours: string }
