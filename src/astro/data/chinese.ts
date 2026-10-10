// Chinese calendar-astronomy reference tables: the 28 xiu (lunar lodges), ten heavenly stems,
// twelve earthly branches and the five phases (wuxing).
//
// Determinative stars (juxing) are the Han-to-Yuan set fixed with the Taichu calendar (104 BCE).
// From the late-Ming Chongzhen calendar reform onward, three determinatives were reassigned
// because precession had pushed Zi's star past Shen's: those later stars are named in brackets.
// HIP numbers were checked against the HYG v4.1 catalogue (Hipparcos cross-index).

import type { ChineseBranch, ChineseStem, Source, Xiu } from './types'

export const XIU: Xiu[] = [
  // Azure Dragon of the East
  { index: 0, pinyin: 'Jiao', hanzi: '角', meaning: 'Horn', palace: 'Azure Dragon (East)',
    determinative: { name: 'α Vir (Spica)', hip: 65474 }, element: 'Wood (Jupiter)', animal: 'flood dragon (jiao)' },
  { index: 1, pinyin: 'Kang', hanzi: '亢', meaning: 'Neck', palace: 'Azure Dragon (East)',
    determinative: { name: 'κ Vir', hip: 69427 }, element: 'Metal (Venus)', animal: 'dragon' },
  { index: 2, pinyin: 'Di', hanzi: '氐', meaning: 'Root', palace: 'Azure Dragon (East)',
    determinative: { name: 'α² Lib (Zubenelgenubi)', hip: 72622 }, element: 'Earth (Saturn)', animal: 'badger' },
  { index: 3, pinyin: 'Fang', hanzi: '房', meaning: 'Room', palace: 'Azure Dragon (East)',
    determinative: { name: 'π Sco', hip: 78265 }, element: 'Sun', animal: 'hare' },
  { index: 4, pinyin: 'Xin', hanzi: '心', meaning: 'Heart', palace: 'Azure Dragon (East)',
    determinative: { name: 'σ Sco', hip: 80112 }, element: 'Moon', animal: 'fox' },
  { index: 5, pinyin: 'Wei', hanzi: '尾', meaning: 'Tail', palace: 'Azure Dragon (East)',
    determinative: { name: 'μ¹ Sco', hip: 82514 }, element: 'Fire (Mars)', animal: 'tiger' },
  { index: 6, pinyin: 'Ji', hanzi: '箕', meaning: 'Winnowing Basket', palace: 'Azure Dragon (East)',
    determinative: { name: 'γ² Sgr (Alnasl)', hip: 88635 }, element: 'Water (Mercury)', animal: 'leopard' },
  // Black Tortoise of the North
  { index: 7, pinyin: 'Dou', hanzi: '斗', meaning: 'Dipper', palace: 'Black Tortoise (North)',
    determinative: { name: 'φ Sgr', hip: 92041 }, element: 'Wood (Jupiter)', animal: 'xiezhi (unicorn)' },
  { index: 8, pinyin: 'Niu', hanzi: '牛', meaning: 'Ox', palace: 'Black Tortoise (North)',
    determinative: { name: 'β Cap (Dabih)', hip: 100345 }, element: 'Metal (Venus)', animal: 'ox' },
  { index: 9, pinyin: 'Nü', hanzi: '女', meaning: 'Girl', palace: 'Black Tortoise (North)',
    determinative: { name: 'ε Aqr (Albali)', hip: 102618 }, element: 'Earth (Saturn)', animal: 'bat' },
  { index: 10, pinyin: 'Xu', hanzi: '虛', meaning: 'Emptiness', palace: 'Black Tortoise (North)',
    determinative: { name: 'β Aqr (Sadalsuud)', hip: 106278 }, element: 'Sun', animal: 'rat' },
  { index: 11, pinyin: 'Wei', hanzi: '危', meaning: 'Rooftop', palace: 'Black Tortoise (North)',
    determinative: { name: 'α Aqr (Sadalmelik)', hip: 109074 }, element: 'Moon', animal: 'swallow' },
  { index: 12, pinyin: 'Shi', hanzi: '室', meaning: 'Encampment', palace: 'Black Tortoise (North)',
    determinative: { name: 'α Peg (Markab)', hip: 113963 }, element: 'Fire (Mars)', animal: 'pig' },
  { index: 13, pinyin: 'Bi', hanzi: '壁', meaning: 'Wall', palace: 'Black Tortoise (North)',
    determinative: { name: 'γ Peg (Algenib)', hip: 1067 }, element: 'Water (Mercury)', animal: 'porcupine' },
  // White Tiger of the West
  { index: 14, pinyin: 'Kui', hanzi: '奎', meaning: 'Legs', palace: 'White Tiger (West)',
    determinative: { name: 'ζ And [η And from the Chongzhen reform]', hip: 3693 }, element: 'Wood (Jupiter)', animal: 'wolf' },
  { index: 15, pinyin: 'Lou', hanzi: '婁', meaning: 'Bond', palace: 'White Tiger (West)',
    determinative: { name: 'β Ari (Sheratan)', hip: 8903 }, element: 'Metal (Venus)', animal: 'dog' },
  { index: 16, pinyin: 'Wei', hanzi: '胃', meaning: 'Stomach', palace: 'White Tiger (West)',
    determinative: { name: '35 Ari', hip: 12719 }, element: 'Earth (Saturn)', animal: 'pheasant' },
  { index: 17, pinyin: 'Mao', hanzi: '昴', meaning: 'Hairy Head (the Pleiades)', palace: 'White Tiger (West)',
    determinative: { name: '17 Tau (Electra)', hip: 17499 }, element: 'Sun', animal: 'rooster' },
  { index: 18, pinyin: 'Bi', hanzi: '畢', meaning: 'Net', palace: 'White Tiger (West)',
    determinative: { name: 'ε Tau (Ain)', hip: 20889 }, element: 'Moon', animal: 'crow' },
  { index: 19, pinyin: 'Zi', hanzi: '觜', meaning: 'Turtle Beak', palace: 'White Tiger (West)',
    determinative: { name: 'φ¹ Ori [λ Ori from the Chongzhen reform]', hip: 26176 }, element: 'Fire (Mars)', animal: 'monkey' },
  { index: 20, pinyin: 'Shen', hanzi: '參', meaning: 'Three Stars', palace: 'White Tiger (West)',
    determinative: { name: 'δ Ori (Mintaka) [ζ Ori from the Chongzhen reform]', hip: 25930 }, element: 'Water (Mercury)', animal: 'ape' },
  // Vermilion Bird of the South
  { index: 21, pinyin: 'Jing', hanzi: '井', meaning: 'Well', palace: 'Vermilion Bird (South)',
    determinative: { name: 'μ Gem (Tejat)', hip: 30343 }, element: 'Wood (Jupiter)', animal: 'wild dog (an)' },
  { index: 22, pinyin: 'Gui', hanzi: '鬼', meaning: 'Ghost', palace: 'Vermilion Bird (South)',
    determinative: { name: 'θ Cnc', hip: 41822 }, element: 'Metal (Venus)', animal: 'goat' },
  { index: 23, pinyin: 'Liu', hanzi: '柳', meaning: 'Willow', palace: 'Vermilion Bird (South)',
    determinative: { name: 'δ Hya', hip: 42313 }, element: 'Earth (Saturn)', animal: 'river deer' },
  { index: 24, pinyin: 'Xing', hanzi: '星', meaning: 'Star', palace: 'Vermilion Bird (South)',
    determinative: { name: 'α Hya (Alphard)', hip: 46390 }, element: 'Sun', animal: 'horse' },
  { index: 25, pinyin: 'Zhang', hanzi: '張', meaning: 'Extended Net', palace: 'Vermilion Bird (South)',
    determinative: { name: 'υ¹ Hya', hip: 48356 }, element: 'Moon', animal: 'deer' },
  { index: 26, pinyin: 'Yi', hanzi: '翼', meaning: 'Wings', palace: 'Vermilion Bird (South)',
    determinative: { name: 'α Crt (Alkes)', hip: 53740 }, element: 'Fire (Mars)', animal: 'snake' },
  { index: 27, pinyin: 'Zhen', hanzi: '軫', meaning: 'Chariot', palace: 'Vermilion Bird (South)',
    determinative: { name: 'γ Crv (Gienah)', hip: 59803 }, element: 'Water (Mercury)', animal: 'earthworm' },
]

export const STEMS: ChineseStem[] = [
  { index: 0, pinyin: 'jiǎ', hanzi: '甲', element: 'wood', polarity: 'yang' },
  { index: 1, pinyin: 'yǐ', hanzi: '乙', element: 'wood', polarity: 'yin' },
  { index: 2, pinyin: 'bǐng', hanzi: '丙', element: 'fire', polarity: 'yang' },
  { index: 3, pinyin: 'dīng', hanzi: '丁', element: 'fire', polarity: 'yin' },
  { index: 4, pinyin: 'wù', hanzi: '戊', element: 'earth', polarity: 'yang' },
  { index: 5, pinyin: 'jǐ', hanzi: '己', element: 'earth', polarity: 'yin' },
  { index: 6, pinyin: 'gēng', hanzi: '庚', element: 'metal', polarity: 'yang' },
  { index: 7, pinyin: 'xīn', hanzi: '辛', element: 'metal', polarity: 'yin' },
  { index: 8, pinyin: 'rén', hanzi: '壬', element: 'water', polarity: 'yang' },
  { index: 9, pinyin: 'guǐ', hanzi: '癸', element: 'water', polarity: 'yin' },
]

/** Branch hours are local clock hours of the double-hour (shichen); zi straddles midnight. */
export const BRANCHES: ChineseBranch[] = [
  { index: 0, pinyin: 'zǐ', hanzi: '子', animal: 'Rat', element: 'water', hours: '23:00-01:00' },
  { index: 1, pinyin: 'chǒu', hanzi: '丑', animal: 'Ox', element: 'earth', hours: '01:00-03:00' },
  { index: 2, pinyin: 'yín', hanzi: '寅', animal: 'Tiger', element: 'wood', hours: '03:00-05:00' },
  { index: 3, pinyin: 'mǎo', hanzi: '卯', animal: 'Rabbit', element: 'wood', hours: '05:00-07:00' },
  { index: 4, pinyin: 'chén', hanzi: '辰', animal: 'Dragon', element: 'earth', hours: '07:00-09:00' },
  { index: 5, pinyin: 'sì', hanzi: '巳', animal: 'Snake', element: 'fire', hours: '09:00-11:00' },
  { index: 6, pinyin: 'wǔ', hanzi: '午', animal: 'Horse', element: 'fire', hours: '11:00-13:00' },
  { index: 7, pinyin: 'wèi', hanzi: '未', animal: 'Goat', element: 'earth', hours: '13:00-15:00' },
  { index: 8, pinyin: 'shēn', hanzi: '申', animal: 'Monkey', element: 'metal', hours: '15:00-17:00' },
  { index: 9, pinyin: 'yǒu', hanzi: '酉', animal: 'Rooster', element: 'metal', hours: '17:00-19:00' },
  { index: 10, pinyin: 'xū', hanzi: '戌', animal: 'Dog', element: 'earth', hours: '19:00-21:00' },
  { index: 11, pinyin: 'hài', hanzi: '亥', animal: 'Pig', element: 'water', hours: '21:00-23:00' },
]

export type PhaseId = 'wood' | 'fire' | 'earth' | 'metal' | 'water'

export interface FivePhase {
  id: PhaseId
  pinyin: string
  hanzi: string
  generates: PhaseId   // sheng (generating) cycle: this phase gives rise to ...
  overcomes: PhaseId   // ke (overcoming) cycle: this phase restrains ...
  direction: string
  season: string
  color: string
  planet: string
}

export const FIVE_PHASES: FivePhase[] = [
  { id: 'wood', pinyin: 'mù', hanzi: '木', generates: 'fire', overcomes: 'earth',
    direction: 'east', season: 'spring', color: 'green-blue (qing)', planet: 'Jupiter' },
  { id: 'fire', pinyin: 'huǒ', hanzi: '火', generates: 'earth', overcomes: 'metal',
    direction: 'south', season: 'summer', color: 'red', planet: 'Mars' },
  { id: 'earth', pinyin: 'tǔ', hanzi: '土', generates: 'metal', overcomes: 'water',
    direction: 'centre', season: 'late summer (or the last 18 days of each season)', color: 'yellow', planet: 'Saturn' },
  { id: 'metal', pinyin: 'jīn', hanzi: '金', generates: 'water', overcomes: 'wood',
    direction: 'west', season: 'autumn', color: 'white', planet: 'Venus' },
  { id: 'water', pinyin: 'shuǐ', hanzi: '水', generates: 'wood', overcomes: 'fire',
    direction: 'north', season: 'winter', color: 'black', planet: 'Mercury' },
]

/** Sexagenary (ganzhi) pair for index 0..59: 0 = jiazi (甲子). */
export function ganzhi(i: number): { stem: ChineseStem; branch: ChineseBranch } {
  const n = ((i % 60) + 60) % 60
  return { stem: STEMS[n % 10], branch: BRANCHES[n % 12] }
}

export const sources: Source[] = [
  {
    title: 'Sun Xiaochun & Jacob Kistemaker, The Chinese Sky during the Han (Brill, 2007)',
    note: 'Standard reference for Han-era asterisms and determinatives; cited via the Stellarium "chinese" sky culture, which draws on it.',
  },
  {
    title: 'Stellarium sky culture "chinese" (description.md and index.json)',
    url: 'https://github.com/Stellarium/stellarium-skycultures/tree/master/chinese',
    note:
      'Lodge names, Four Symbols, seven-luminary cycle, determinative table. Disagrees with us on Dou (gives μ Sgr; Dou\'s first star 斗宿一 is φ Sgr) and mixes eras for Kui/Zi/Shen.',
  },
  {
    title: 'Chinese Wikipedia, 二十八宿 and 二十八宿中西星名对照表',
    url: 'https://zh.wikipedia.org/zh-hans/二十八宿',
    note:
      'Via search snippets: Taichu-calendar determinatives used until the Yuan; in Ming-Qing the Kui, Zi and Shen determinatives were changed, the old ones now being numbered 奎宿二 (ζ And), 觜宿二 (φ¹ Ori), 参宿三 (δ Ori); from the Chongzhen calendar every determinative is the lodge\'s "first" star.',
  },
  {
    title: 'HYG star database v4.1 (Hipparcos/Yale/Gliese)',
    url: 'https://github.com/astronexus/HYG-Database',
    note: 'Every HIP number above was looked up by Bayer/Flamsteed designation and constellation.',
  },
  {
    title: 'Seven-luminary and 28-animal cycle',
    note: 'Late (Tang and after) calendrical overlay, not part of the Han lodge system; given for reference only.',
  },
]
