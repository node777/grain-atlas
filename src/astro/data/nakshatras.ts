// The 27 nakshatras in almanac (Ashvini-first) order, plus Abhijit, the intercalary 28th.
//
// Deities: the Jyotish/Muhurta list (Muhurta Chintamani, nakshatra prakarana), which differs from the
//   Taittiriya Samhita 4.4.10 list in a few places (see docs/research/astrology-sources.md).
// Gana, yoni and Vimshottari lords: the standard ashtakuta tables, cross-checked across panchanga sources.
// Nature: the seven Muhurta classes (dhruva, chara, ugra, mishra, laghu, mridu, tikshna).
// Yogataras: Surya Siddhanta identifications as given by Burgess (1860) and Pingree & Morrissey (1989),
//   cross-checked against the Swiss Ephemeris sefstars.txt; HIP numbers from HYG v4.1.
// xiu / manzil: the conventional one-to-one alignment of the three 28-mansion systems, with Abhijit
//   taking the extra slot. It is a correspondence of sequence and approximate sky region, not identity.

import type { GrahaId, Nakshatra, Source } from './types'
import { XIU } from './chinese'
import { MANAZIL } from './arabic'

const LORDS: GrahaId[] = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury']

/** Position of a nakshatra in the 28-member list that includes Abhijit after Uttara Ashadha. */
function pos28(index27: number): number {
  return index27 <= 20 ? index27 : index27 + 1
}
function xiuFor(p28: number): Nakshatra['xiu'] {
  const x = XIU[(p28 + 15) % 28] // Ashvini aligns with Lou (index 15); Chitra with Jiao (0)
  return { name: x.pinyin, hanzi: x.hanzi, meaning: x.meaning }
}
function manzilFor(p28: number): Nakshatra['manzil'] {
  const m = MANAZIL[p28]
  return { name: m.name, arabic: m.arabic, meaning: m.meaning }
}

type Row = Omit<Nakshatra, 'index' | 'taittiriyaIndex' | 'lord' | 'xiu' | 'manzil'>

const ROWS: Row[] = [
  {
    name: 'Ashvini', iast: 'Aśvinī', devanagari: 'अश्विनी', meaning: 'possessing horses (the horsewoman)',
    deity: 'the Ashvins (twin horse-headed physicians)', symbol: "a horse's head",
    gana: 'deva', yoni: 'horse (male)', nature: 'light/swift (laghu/kshipra)',
    yogatara: { name: 'Sheratan', bayer: 'β Ari', hip: 8903, note: 'Some modern authors take α Ari (Hamal, HIP 9884).' },
    keywords: ['speed', 'healing', 'beginnings', 'rescue'],
    essence: 'The first quick spark: help that arrives fast and sets things moving.',
  },
  {
    name: 'Bharani', iast: 'Bharaṇī', devanagari: 'भरणी', meaning: 'she who bears',
    deity: 'Yama', symbol: 'the yoni (womb)',
    gana: 'manushya', yoni: 'elephant (male)', nature: 'fierce (ugra/krura)',
    yogatara: {
      name: '35 Arietis', bayer: '35 Ari', hip: 12719,
      note: 'Debated: Burgess and most tables give 35 Ari; the IAU has named 41 Ari (HIP 13209) "Bharani" and the Swiss Ephemeris uses 41 Ari. The faint triangle 35/39/41 Ari forms the asterism.',
    },
    keywords: ['restraint', 'gestation', 'judgement', 'thresholds'],
    essence: 'Carrying a load to term: the discipline of holding something until it can be released.',
  },
  {
    name: 'Krittika', iast: 'Kṛttikā', devanagari: 'कृत्तिका', meaning: 'the cutters',
    deity: 'Agni', symbol: 'a razor or flame',
    gana: 'rakshasa', yoni: 'sheep (female)', nature: 'mixed (mishra/sadharana)',
    yogatara: {
      name: 'Alcyone', bayer: 'η Tau', hip: 17702,
      note: 'The brightest Pleiad, the usual identification; some scholars read the Surya Siddhanta coordinates as another Pleiad (e.g. Merope, HIP 17608).',
    },
    keywords: ['purification', 'sharpness', 'heat', 'critique'],
    essence: 'Fire that refines by cutting away what is not needed.',
  },
  {
    name: 'Rohini', iast: 'Rohiṇī', devanagari: 'रोहिणी', meaning: 'the red one',
    deity: 'Prajapati (Brahma)', symbol: 'an ox-cart or chariot',
    gana: 'manushya', yoni: 'serpent (male)', nature: 'fixed (dhruva/sthira)',
    yogatara: { name: 'Aldebaran', bayer: 'α Tau', hip: 21421 },
    keywords: ['fertility', 'growth', 'beauty', 'abundance'],
    essence: 'Rich ground in full growth; the Moon\'s favourite resting place.',
  },
  {
    name: 'Mrigashira', iast: 'Mṛgaśirā', devanagari: 'मृगशिरा', meaning: "the deer's head",
    deity: 'Soma', symbol: "a deer's head",
    gana: 'deva', yoni: 'serpent (female)', nature: 'soft (mridu/maitra)',
    yogatara: { name: 'Meissa', bayer: 'λ Ori', hip: 26207 },
    keywords: ['searching', 'curiosity', 'gentleness', 'wandering'],
    essence: 'The alert, gentle seeker following a scent across open country.',
  },
  {
    name: 'Ardra', iast: 'Ārdrā', devanagari: 'आर्द्रा', meaning: 'the moist one',
    deity: 'Rudra', symbol: 'a teardrop (also a gem)',
    gana: 'manushya', yoni: 'dog (female)', nature: 'sharp (tikshna/daruna)',
    yogatara: { name: 'Betelgeuse', bayer: 'α Ori', hip: 27989 },
    keywords: ['storms', 'grief', 'renewal', 'intensity'],
    essence: 'The storm that breaks things open so that something fresh can grow.',
  },
  {
    name: 'Punarvasu', iast: 'Punarvasu', devanagari: 'पुनर्वसु', meaning: 'good again (return of the light)',
    deity: 'Aditi', symbol: 'a quiver of arrows',
    gana: 'deva', yoni: 'cat (female)', nature: 'movable (chara/chala)',
    yogatara: { name: 'Pollux', bayer: 'β Gem', hip: 37826, note: 'Some take α Gem (Castor, HIP 36850).' },
    keywords: ['return', 'restoration', 'home', 'replenishment'],
    essence: 'Coming home after the storm and finding the stores refilled.',
  },
  {
    name: 'Pushya', iast: 'Puṣya', devanagari: 'पुष्य', meaning: 'nourishing (also called Tishya, the auspicious)',
    deity: 'Brihaspati', symbol: "a cow's udder (also a flower or circle)",
    gana: 'deva', yoni: 'sheep (male)', nature: 'light/swift (laghu/kshipra)',
    yogatara: { name: 'Asellus Australis', bayer: 'δ Cnc', hip: 42911, note: 'Siddhantas place it at 106°; the basis of the "Pushya-paksha" ayanamsa.' },
    keywords: ['nourishment', 'care', 'devotion', 'prosperity'],
    essence: 'Steady nourishment given freely; widely held the kindest nakshatra for beginnings.',
  },
  {
    name: 'Ashlesha', iast: 'Āśleṣā', devanagari: 'आश्लेषा', meaning: 'the embrace (the entwiner)',
    deity: 'the Sarpas (serpents)', symbol: 'a coiled serpent',
    gana: 'rakshasa', yoni: 'cat (male)', nature: 'sharp (tikshna/daruna)',
    yogatara: {
      name: 'ε Hydrae', bayer: 'ε Hya', hip: 43109,
      note: 'Debated: ε Hya (Burgess; IAU name "Ashlesha"); ζ Hya (HIP 43813) and α Cnc (Colebrooke, HIP 44066) have also been proposed.',
    },
    keywords: ['binding', 'hypnotic focus', 'secrecy', 'venom and medicine'],
    essence: 'The coil that holds tight: insight and danger in the same embrace.',
  },
  {
    name: 'Magha', iast: 'Maghā', devanagari: 'मघा', meaning: 'the bountiful (the mighty)',
    deity: 'the Pitris (ancestors)', symbol: 'a throne room or palanquin',
    gana: 'rakshasa', yoni: 'rat (male)', nature: 'fierce (ugra/krura)',
    yogatara: { name: 'Regulus', bayer: 'α Leo', hip: 49669 },
    keywords: ['lineage', 'rank', 'ceremony', 'inheritance'],
    essence: 'Sitting on the ancestral seat and answering to those who came before.',
  },
  {
    name: 'Purva Phalguni', iast: 'Pūrva Phalgunī', devanagari: 'पूर्वफल्गुनी', meaning: 'the former reddish one',
    deity: 'Bhaga', symbol: 'the front legs of a bed (a couch or hammock)',
    gana: 'manushya', yoni: 'rat (female)', nature: 'fierce (ugra/krura)',
    yogatara: { name: 'Zosma', bayer: 'δ Leo', hip: 54872 },
    keywords: ['pleasure', 'rest', 'romance', 'creativity'],
    essence: 'Ease after effort: enjoyment, affection and the fruits of good fortune.',
  },
  {
    name: 'Uttara Phalguni', iast: 'Uttara Phalgunī', devanagari: 'उत्तरफल्गुनी', meaning: 'the latter reddish one',
    deity: 'Aryaman', symbol: 'the back legs of a bed',
    gana: 'manushya', yoni: 'cow (bull)', nature: 'fixed (dhruva/sthira)',
    yogatara: { name: 'Denebola', bayer: 'β Leo', hip: 57632 },
    keywords: ['contracts', 'patronage', 'loyalty', 'marriage'],
    essence: 'The promise kept: alliances, agreements and generous support.',
  },
  {
    name: 'Hasta', iast: 'Hasta', devanagari: 'हस्त', meaning: 'the hand',
    deity: 'Savitr', symbol: 'an open hand',
    gana: 'deva', yoni: 'buffalo (female)', nature: 'light/swift (laghu/kshipra)',
    yogatara: { name: 'Algorab', bayer: 'δ Crv', hip: 60965, note: 'Some take γ Crv (Gienah, HIP 59803).' },
    keywords: ['dexterity', 'craft', 'humour', 'skilful means'],
    essence: 'Skill in the fingers: getting things done neatly and with good humour.',
  },
  {
    name: 'Chitra', iast: 'Citrā', devanagari: 'चित्रा', meaning: 'the bright (the brilliant, variegated)',
    deity: 'Tvashtr (Vishvakarma), the divine artificer', symbol: 'a bright jewel or pearl',
    gana: 'rakshasa', yoni: 'tiger (female)', nature: 'soft (mridu/maitra)',
    yogatara: { name: 'Spica', bayer: 'α Vir', hip: 65474, note: 'Anchor of the Lahiri (Chitrapaksha) ayanamsa: about 180° sidereal.' },
    keywords: ['design', 'brilliance', 'architecture', 'form'],
    essence: 'The master craftsman\'s jewel: beauty that is built, not found.',
  },
  {
    name: 'Svati', iast: 'Svātī', devanagari: 'स्वाती', meaning: 'the independent one (etymology uncertain)',
    deity: 'Vayu', symbol: 'a young shoot swaying in the wind (also coral)',
    gana: 'deva', yoni: 'buffalo (male)', nature: 'movable (chara/chala)',
    yogatara: { name: 'Arcturus', bayer: 'α Boo', hip: 69673, note: 'Lies some 31° north of the ecliptic.' },
    keywords: ['independence', 'trade', 'flexibility', 'dispersal'],
    essence: 'A seedling that bends in the wind without breaking, and travels with it.',
  },
  {
    name: 'Vishakha', iast: 'Viśākhā', devanagari: 'विशाखा', meaning: 'forked (two-branched)',
    deity: 'Indragni (Indra and Agni)', symbol: 'a triumphal archway (also a potter\'s wheel)',
    gana: 'rakshasa', yoni: 'tiger (male)', nature: 'mixed (mishra/sadharana)',
    yogatara: {
      name: 'ι¹ Librae', bayer: 'ι¹ Lib', hip: 74392,
      note: 'Debated: ι Lib fits the Surya Siddhanta coordinates (Pingree; Swiss Ephemeris); many popular tables give α² Lib (HIP 72622) or β Lib (HIP 74785).',
    },
    keywords: ['determination', 'goals', 'rivalry', 'harvest'],
    essence: 'Single-minded pursuit of a goal that has two branches to choose from.',
  },
  {
    name: 'Anuradha', iast: 'Anurādhā', devanagari: 'अनुराधा', meaning: 'following Radha (Vishakha)',
    deity: 'Mitra', symbol: 'a lotus (also a row of offerings)',
    gana: 'deva', yoni: 'deer (female)', nature: 'soft (mridu/maitra)',
    yogatara: { name: 'Dschubba', bayer: 'δ Sco', hip: 78401 },
    keywords: ['friendship', 'devotion', 'cooperation', 'perseverance'],
    essence: 'Friendship that flowers in hard places through loyalty and shared aims.',
  },
  {
    name: 'Jyeshtha', iast: 'Jyeṣṭhā', devanagari: 'ज्येष्ठा', meaning: 'the eldest',
    deity: 'Indra', symbol: 'a round earring (also an umbrella)',
    gana: 'rakshasa', yoni: 'deer (male)', nature: 'sharp (tikshna/daruna)',
    yogatara: { name: 'Antares', bayer: 'α Sco', hip: 80763 },
    keywords: ['seniority', 'protection', 'power', 'responsibility'],
    essence: 'The eldest who must defend the household, carrying both privilege and burden.',
  },
  {
    name: 'Mula', iast: 'Mūla', devanagari: 'मूल', meaning: 'the root',
    deity: 'Nirriti', symbol: 'a bunch of tied roots (also an elephant goad)',
    gana: 'rakshasa', yoni: 'dog (male)', nature: 'sharp (tikshna/daruna)',
    yogatara: { name: 'Shaula', bayer: 'λ Sco', hip: 85927, note: 'Some take the whole curl of the sting (ε to λ Sco).' },
    keywords: ['roots', 'investigation', 'uprooting', 'foundations'],
    essence: 'Digging to the root, even if it means pulling everything up.',
  },
  {
    name: 'Purva Ashadha', iast: 'Pūrvāṣāḍhā', devanagari: 'पूर्वाषाढा', meaning: 'the former invincible one',
    deity: 'Apah (the waters)', symbol: 'a winnowing fan (also an elephant tusk)',
    gana: 'manushya', yoni: 'monkey (male)', nature: 'fierce (ugra/krura)',
    yogatara: { name: 'Kaus Media', bayer: 'δ Sgr', hip: 89931 },
    keywords: ['conviction', 'purification', 'invigoration', 'early victory'],
    essence: 'The rising tide of conviction that will not be turned back.',
  },
  {
    name: 'Uttara Ashadha', iast: 'Uttarāṣāḍhā', devanagari: 'उत्तराषाढा', meaning: 'the latter invincible one',
    deity: 'the Vishvedevas (all-gods)', symbol: 'an elephant tusk (also the planks of a bed)',
    gana: 'manushya', yoni: 'mongoose', nature: 'fixed (dhruva/sthira)',
    yogatara: { name: 'Nunki', bayer: 'σ Sgr', hip: 92855, note: 'Some take ζ Sgr (Ascella, HIP 93506).' },
    keywords: ['final victory', 'integrity', 'endurance', 'universality'],
    essence: 'The victory that lasts because it was won fairly and for everyone.',
  },
  {
    name: 'Shravana', iast: 'Śravaṇa', devanagari: 'श्रवण', meaning: 'hearing (the ear)',
    deity: 'Vishnu', symbol: 'an ear (also three footprints)',
    gana: 'deva', yoni: 'monkey (female)', nature: 'movable (chara/chala)',
    yogatara: { name: 'Altair', bayer: 'α Aql', hip: 97649, note: 'About 29° north of the ecliptic.' },
    keywords: ['listening', 'learning', 'tradition', 'connection'],
    essence: 'Knowledge carried by listening: the oral thread that links generations.',
  },
  {
    name: 'Dhanishtha', iast: 'Dhaniṣṭhā', devanagari: 'धनिष्ठा', meaning: 'the wealthiest (older name Shravishtha, the most famous)',
    deity: 'the eight Vasus', symbol: 'a drum (mridanga)',
    gana: 'rakshasa', yoni: 'lion (female)', nature: 'movable (chara/chala)',
    yogatara: { name: 'Rotanev', bayer: 'β Del', hip: 101769, note: 'Some take α Del (Sualocin, HIP 101958).' },
    keywords: ['rhythm', 'wealth', 'music', 'group effort'],
    essence: 'Keeping time on the drum so that the whole company moves together.',
  },
  {
    name: 'Shatabhisha', iast: 'Śatabhiṣā', devanagari: 'शतभिषा', meaning: 'a hundred physicians (also Shatabhishaj)',
    deity: 'Varuna', symbol: 'an empty circle',
    gana: 'rakshasa', yoni: 'horse (female)', nature: 'movable (chara/chala)',
    yogatara: {
      name: 'λ Aquarii', bayer: 'λ Aqr', hip: 112961,
      note: 'Standard (Burgess; Swiss Ephemeris) though faint (mag 3.7); the Stellarium Indian sky culture uses γ Aqr (HIP 110395) instead.',
    },
    keywords: ['healing', 'solitude', 'mystery', 'containment'],
    essence: 'The sealed circle where a hundred remedies are kept, and kept secret.',
  },
  {
    name: 'Purva Bhadrapada', iast: 'Pūrva Bhādrapadā', devanagari: 'पूर्वभाद्रपदा', meaning: 'the former of the auspicious feet (Vedic Proshthapada)',
    deity: 'Aja Ekapada (the one-footed goat)', symbol: 'the front legs of a funeral cot (also a sword)',
    gana: 'manushya', yoni: 'lion (male)', nature: 'fierce (ugra/krura)',
    yogatara: {
      name: 'Markab', bayer: 'α Peg', hip: 113963,
      note: 'Debated: α Peg is usual; some take β Peg (Scheat, HIP 113881), which shares the asterism.',
    },
    keywords: ['intensity', 'austerity', 'transformation', 'fire'],
    essence: 'A scorching resolve that burns away comfort for the sake of a larger cause.',
  },
  {
    name: 'Uttara Bhadrapada', iast: 'Uttara Bhādrapadā', devanagari: 'उत्तरभाद्रपदा', meaning: 'the latter of the auspicious feet',
    deity: 'Ahirbudhnya (the serpent of the deep)', symbol: 'the back legs of a funeral cot (also twins)',
    gana: 'manushya', yoni: 'cow (female)', nature: 'fixed (dhruva/sthira)',
    yogatara: {
      name: 'Algenib', bayer: 'γ Peg', hip: 1067,
      note: 'Debated: γ Peg is usual (Burgess; Swiss Ephemeris); some take α And (Alpheratz, HIP 677).',
    },
    keywords: ['depth', 'stability', 'wisdom', 'calm'],
    essence: 'Still water over great depth: patience that holds immense power in reserve.',
  },
  {
    name: 'Revati', iast: 'Revatī', devanagari: 'रेवती', meaning: 'the wealthy (the prosperous)',
    deity: 'Pushan', symbol: 'a fish (also a drum)',
    gana: 'deva', yoni: 'elephant (female)', nature: 'soft (mridu/maitra)',
    yogatara: {
      name: 'ζ Piscium', bayer: 'ζ Psc', hip: 5737,
      note: 'Faint (mag 5.2); the Surya Siddhanta puts it at 359°50\' polar longitude. IAU name "Revati" (ζ Psc A).',
    },
    keywords: ['safe passage', 'nourishment', 'completion', 'guidance'],
    essence: 'The shepherd who sees travellers safely to the end of the road.',
  },
]

export const NAKSHATRAS: Nakshatra[] = ROWS.map((row, index) => {
  const p = pos28(index)
  return {
    index,
    taittiriyaIndex: (index + 25) % 27, // Krittika (2) -> 0, Ashvini (0) -> 25, Bharani (1) -> 26
    ...row,
    lord: LORDS[index % 9],
    xiu: xiuFor(p),
    manzil: manzilFor(p),
  }
})

/** Span of one nakshatra in degrees (13°20'). */
export const NAKSHATRA_SPAN = 360 / 27

/** Abhijit, the intercalary 28th nakshatra (no Vimshottari lord; not in the 27-fold division). */
export interface IntercalaryNakshatra
  extends Omit<Nakshatra, 'index' | 'taittiriyaIndex' | 'lord' | 'gana' | 'yoni'> {
  /** Sidereal span in decimal degrees: last quarter of Uttara Ashadha plus the first 1/15 of Shravana. */
  span: { startDeg: number; endDeg: number }
  lord: null
  yoni?: string
}

export const ABHIJIT: IntercalaryNakshatra = {
  name: 'Abhijit',
  iast: 'Abhijit',
  devanagari: 'अभिजित्',
  meaning: 'the victorious (the conquering)',
  deity: 'Brahma (Vidhi)',
  symbol: 'a triangle (also a three-cornered nut)',
  lord: null,
  yoni: 'mongoose (only in 28-nakshatra yoni schemes, paired with Uttara Ashadha)',
  nature: 'light/swift (laghu/kshipra)',
  span: { startDeg: 276 + 40 / 60, endDeg: 280 + 53 / 60 + 20 / 3600 },
  yogatara: { name: 'Vega', bayer: 'α Lyr', hip: 91262, note: 'About 62° north of the ecliptic, far from the band it names.' },
  xiu: xiuFor(21),
  manzil: manzilFor(21),
  keywords: ['victory', 'invincibility', 'auspicious timing', 'the midday muhurta'],
  essence: 'The unconquerable moment: the short window in which any undertaking can succeed.',
}

export const sources: Source[] = [
  {
    title: 'Ebenezer Burgess (tr.), Surya Siddhanta: A Text-Book of Hindu Astronomy (JAOS 6, 1860), ch. 8',
    url: 'https://ia600705.us.archive.org/1/items/SuryaSiddhantaTranslation/surya_siddhanta_english_text.pdf',
    note: 'Yogatara coordinates and the classical identifications. Not fetched in this session (host blocked); identifications cross-checked against the two sources below.',
  },
  {
    title: 'D. Pingree & P. Morrissey, "On the Identification of the Yogataras of the Indian Naksatras", JHA 20 (1989) 99-119',
    url: 'https://journals.sagepub.com/doi/10.1177/002182868902000202',
    note: 'Paywalled; abstract and secondary citations only (e.g. Pingree uses ι Lib for Vishakha).',
  },
  {
    title: 'Swiss Ephemeris fixed-star file sefstars.txt (Astrodienst)',
    url: 'https://github.com/aloistr/swisseph/blob/master/ephe/sefstars.txt',
    note:
      'Named nakshatra stars: Ashvini β Ari, Bharani 41 Ari, Ashlesha ε Hya (and α Cnc "Colebrook"), Vishakha ι¹ Lib, Abhijit α Lyr, Shatabhisha λ Aqr, Purvabhadra α Peg, Uttarabhadra γ Peg, Revati ζ Psc.',
  },
  {
    title: 'Swiss Ephemeris documentation, §2.8.4-2.8.5 (Suryasiddhanta, Spica/Citra, Pushya and Revati ayanamsas)',
    url: 'https://github.com/aloistr/swisseph/blob/master/doc/swisseph.htm',
  },
  {
    title: 'Stellarium sky culture "indian" (index.json star lines)',
    url: 'https://github.com/Stellarium/stellarium-skycultures/tree/master/indian',
    note: 'Independent second listing of asterism stars by HIP; agrees on most yogatara HIPs, differs on Shatabhisha (γ Aqr) and Dhanishtha (α/δ Del).',
  },
  {
    title: 'A. Narayan, IJHS 45.4 (2010), table of nakshatra junction stars with Surya Siddhanta and J2000 coordinates',
    url: 'https://cahc.jainuniversity.ac.in/assets/ijhs/Vol45_4_1_ANarayan.pdf',
    note: 'Seen via search snippet only: confirms β Ari (Ashvini), 35 Ari (Bharani), δ Cnc (Pushya), α Tau (Rohini); gives Merope for Krittika.',
  },
  {
    title: 'HYG star database v4.1',
    url: 'https://github.com/astronexus/HYG-Database',
    note: 'All HIP numbers verified by Bayer/Flamsteed designation (Spica 65474, Regulus 49669, Aldebaran 21421, Antares 80763, Arcturus 69673, Altair 97649, Pollux 37826, Alcyone 17702, Sheratan 8903, Vega 91262).',
  },
  {
    title: 'Muhurta Chintamani (Rama Daivajna, 1600), nakshatra prakarana',
    note: 'Nakshatra deities and the seven nature classes; class membership cross-checked against drikpanchang.com\'s seven-category page and other panchanga summaries.',
  },
  {
    title: 'Drik Panchang, nakshatra seven-category classification',
    url: 'https://www.drikpanchang.com/panchang/nakshatra/classification/nakshatra-seven-category.html',
  },
  {
    title: 'Taittiriya Samhita 4.4.10 nakshatra-deity list (via EJVS article)',
    url: 'https://hasp.ub.uni-heidelberg.de/journals/ejvs/article/download/1522/10436/23236',
    note: 'Krittika-first Vedic order used for taittiriyaIndex. Its deity list differs from the Jyotish one (e.g. Chitra: Indra; Phalguni deities swapped).',
  },
  {
    title: 'jyotisha (sanskrit-coders) NAKSHATRA_NAMES table',
    url: 'https://github.com/sanskrit-coders/jyotisha',
    note: 'Devanagari cross-check (it uses Vedic/Tamil-tradition variants such as अपभरणी, आश्रेषा, श्रविष्ठा, प्रोष्ठपदा).',
  },
]
