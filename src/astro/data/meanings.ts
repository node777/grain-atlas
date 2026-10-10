// Short descriptions of each tradition the atlas draws on, in our own words, with the caveats a
// reader needs before comparing them.

import type { Source } from './types'

export interface Tradition {
  id: 'jyotish' | 'hellenistic' | 'western' | 'chinese' | 'arabic'
  name: string
  zodiac: 'sidereal' | 'tropical' | 'equatorial lodges' | 'lunar stations'
  summary: string
  caveats: string[]
}

export const TRADITIONS: Tradition[] = [
  {
    id: 'jyotish',
    name: 'Jyotish (Indian astrology)',
    zodiac: 'sidereal',
    summary:
      'The astrology of the Sanskrit tradition, systematised in works such as the Brihat Parashara Hora Shastra and Varahamihira\'s Brihat Jataka. ' +
      'It uses a star-fixed (sidereal) zodiac, nine grahas including the lunar nodes Rahu and Ketu, and the 27 nakshatras, which drive the Vimshottari dasha periods and the daily panchanga. ' +
      'Electional practice (muhurta) combines tithi, vara, nakshatra, yoga and karana.',
    caveats: [
      'Sidereal positions depend on the chosen ayanamsa. The Indian government standard (Lahiri, from the 1955 Calendar Reform Committee) is meant to keep Spica (Chitra) at 180°; strictly it fixes 23°15\' on 21 March 1956, which leaves Spica a minute or so short of 180° in 2000. "True Chitrapaksha" holds Spica at exactly 180°.',
      'Lahiri and the tropical zodiac currently differ by about 24°, so most planets fall in the previous sign compared with a Western chart.',
      'Classical texts disagree on details (Rahu/Ketu dignities, some nakshatra stars and deities); our choices are documented in docs/research/astrology-sources.md.',
    ],
  },
  {
    id: 'hellenistic',
    name: 'Hellenistic astrology',
    zodiac: 'tropical',
    summary:
      'Horoscopic astrology as practised in the Greco-Roman world from roughly the 1st century BCE, known from Dorotheus, Ptolemy, Vettius Valens and others. ' +
      'It ranks planets by sect (day or night chart) and by layered dignities: domicile, exaltation, triplicity, terms (bounds) and decans (faces). ' +
      'Much of it passed into Persian, Arabic and later Indian practice.',
    caveats: [
      'Early authors used both sidereal and tropical reckonings; Ptolemy\'s tropical definition prevailed, and we present these tables tropically.',
      'Terms survive in several versions (Egyptian, Ptolemaic, Chaldean); we give the Egyptian set.',
    ],
  },
  {
    id: 'western',
    name: 'Western tropical astrology',
    zodiac: 'tropical',
    summary:
      'The medieval-to-modern European tradition descended from Hellenistic and Arabic sources, with signs measured from the March equinox so that Aries always begins at the start of northern spring. ' +
      'Modern practice adds Uranus, Neptune and Pluto as co-rulers and emphasises psychological interpretation and aspect patterns.',
    caveats: [
      'Because of precession, tropical signs no longer coincide with the constellations of the same name; the offset grows by about 1° every 72 years.',
      'Orbs and the status of minor aspects vary by school.',
    ],
  },
  {
    id: 'chinese',
    name: 'Chinese calendar astronomy',
    zodiac: 'equatorial lodges',
    summary:
      'Chinese astronomy divided the sky into 28 xiu (lodges) measured in right ascension from a determinative star, grouped under four directional animals. ' +
      'Time-keeping rests on the sexagenary cycle of ten heavenly stems and twelve earthly branches, interpreted through the five phases (wood, fire, earth, metal, water).',
    caveats: [
      'Xiu are equatorial segments of unequal width, not ecliptic divisions, so they only loosely match the nakshatras or manazil.',
      'Some determinative stars were reassigned in the late Ming reform (Kui, Zi, Shen); we give the older Han-to-Yuan set and note the later ones.',
      'Popular "Chinese zodiac" year animals follow the lunisolar or solar-term year, not the lodges.',
    ],
  },
  {
    id: 'arabic',
    name: 'Arabic lunar stations (manazil al-qamar)',
    zodiac: 'lunar stations',
    summary:
      'Pre-Islamic Arabian star lore marked 28 stations along the Moon\'s path; their dawn risings (anwa\') structured the agricultural and weather calendar. ' +
      'Later Islamic astronomers such as al-Sufi mapped them onto Ptolemaic stars, and medieval astrology used them as 12°51\' divisions of the zodiac for elections and talismans.',
    caveats: [
      'The traditional stations are star groups of varying size; the equal 360/28 division is a later astrological convention.',
      'Several stations (al-Dhira, al-Tarf, al-Butayn) have competing star identifications.',
    ],
  },
]

export const sources: Source[] = [
  {
    title: 'Swiss Ephemeris documentation, §2.8 "Sidereal ephemerides for astrology"',
    url: 'https://github.com/aloistr/swisseph/blob/master/doc/swisseph.htm',
    note:
      'Lahiri ayanamsa = 23°15\'00" on 21 Mar 1956 0h TDT (ICRC 1955), giving Spica 179°58\'59" in 2000; True Chitrapaksha keeps Spica at exactly 180°.',
  },
  {
    title: 'M. N. Saha & N. C. Lahiri, Report of the Calendar Reform Committee (CSIR, New Delhi, 1955)',
    note: 'Origin of the Indian national (Lahiri / Chitrapaksha) ayanamsa; cited via the Swiss Ephemeris documentation.',
  },
  {
    title: 'Stellarium sky culture descriptions (indian, chinese, arabic_lunar_stations)',
    url: 'https://github.com/Stellarium/stellarium-skycultures',
  },
]
