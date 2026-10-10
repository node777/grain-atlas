// The 28 Arabic lunar stations (manazil al-qamar), in the standard order beginning with al-Sharatan.
// Star identifications follow the al-Sufi / Ibn Qutayba tradition as summarised by Kunitzsch and the
// Stellarium "arabic_lunar_stations" sky culture; contested ones are flagged in `stars`.
// `hip` is a representative (usually the brightest or name-giving) star, checked against HYG v4.1.

import type { Manzil, Source } from './types'

export const MANAZIL: Manzil[] = [
  { index: 0, name: 'al-Sharatan', arabic: 'الشرطان', meaning: 'the two signs (markers)',
    stars: 'β and γ Ari (α Ari is sometimes included)', hip: 8903 },
  { index: 1, name: 'al-Butayn', arabic: 'البطين', meaning: 'the little belly (of the ram)',
    stars: 'ε, δ and ρ³ Ari (some tables use 35, 39, 41 Ari, the stars of Bharani)', hip: 14838 },
  { index: 2, name: 'al-Thurayya', arabic: 'الثريا', meaning: 'the many little ones (the Pleiades)',
    stars: 'the Pleiades cluster; η Tau (Alcyone) brightest', hip: 17702 },
  { index: 3, name: 'al-Dabaran', arabic: 'الدبران', meaning: 'the follower (of the Pleiades)',
    stars: 'α Tau (Aldebaran)', hip: 21421 },
  { index: 4, name: 'al-Haqa', arabic: 'الهقعة', meaning: 'the white mark (a whorl on a horse\'s flank)',
    stars: 'λ, φ¹ and φ² Ori (the head of Orion)', hip: 26207 },
  { index: 5, name: 'al-Hana', arabic: 'الهنعة', meaning: 'the brand or bend (on a camel\'s neck)',
    stars: 'γ and ξ Gem', hip: 31681 },
  { index: 6, name: 'al-Dhira', arabic: 'الذراع', meaning: 'the forearm (of the great Arab lion)',
    stars:
      'α and β CMi (Procyon, Gomeisa: the "contracted forearm") per Ibn Qutayba and al-Sufi; many later tables give α and β Gem (Castor, Pollux: the "extended forearm")',
    hip: 37279 },
  { index: 7, name: 'al-Nathra', arabic: 'النثرة', meaning: 'the gap / tip of the nose (of the lion)',
    stars: 'the Praesepe cluster (M44) with γ and δ Cnc' },
  { index: 8, name: 'al-Tarf', arabic: 'الطرف', meaning: 'the glance (eyes of the lion)',
    stars: 'κ Cnc and λ Leo (λ Leo carries the name Alterf); some sources give ε and ο Leo', hip: 46750 },
  { index: 9, name: 'al-Jabha', arabic: 'الجبهة', meaning: 'the forehead (of the lion)',
    stars: 'ζ, γ¹, η and α Leo (Regulus)', hip: 49669 },
  { index: 10, name: 'al-Zubra', arabic: 'الزبرة', meaning: 'the mane (of the lion); also al-Kharatan, the two ribs',
    stars: 'δ and θ Leo', hip: 54872 },
  { index: 11, name: 'al-Sarfa', arabic: 'الصرفة', meaning: 'the turning (of the weather)',
    stars: 'β Leo (Denebola)', hip: 57632 },
  { index: 12, name: 'al-Awwa', arabic: 'العواء', meaning: 'the barker (or the bend)',
    stars: 'β, η, γ, δ and ε Vir', hip: 57757 },
  { index: 13, name: 'al-Simak', arabic: 'السماك', meaning: 'the unarmed (high) one: al-simak al-azal',
    stars: 'α Vir (Spica)', hip: 65474 },
  { index: 14, name: 'al-Ghafr', arabic: 'الغفر', meaning: 'the covering',
    stars: 'ι, κ and λ Vir', hip: 69701 },
  { index: 15, name: 'al-Zubana', arabic: 'الزبانى', meaning: 'the two claws (of the scorpion)',
    stars: 'α² and β Lib', hip: 72622 },
  { index: 16, name: 'al-Iklil', arabic: 'الإكليل', meaning: 'the crown (diadem)',
    stars: 'β¹, δ and π Sco', hip: 78401 },
  { index: 17, name: 'al-Qalb', arabic: 'القلب', meaning: 'the heart (of the scorpion)',
    stars: 'α Sco (Antares)', hip: 80763 },
  { index: 18, name: 'al-Shawla', arabic: 'الشولة', meaning: 'the raised tail (sting)',
    stars: 'λ and υ Sco', hip: 85927 },
  { index: 19, name: 'al-Naaim', arabic: 'النعائم', meaning: 'the ostriches',
    stars: 'γ², δ, ε, η, σ, φ, τ and ζ Sgr (two groups of four)' },
  { index: 20, name: 'al-Balda', arabic: 'البلدة', meaning: 'the (empty) town / bare patch',
    stars: 'a starless area east of al-Naaim, near π Sgr (named Albaldah after it)', hip: 94141 },
  { index: 21, name: 'Sad al-Dhabih', arabic: 'سعد الذابح', meaning: 'the good fortune of the slaughterer',
    stars: 'α and β Cap', hip: 100345 },
  { index: 22, name: 'Sad Bula', arabic: 'سعد بلع', meaning: 'the good fortune of the swallower',
    stars: 'ε, μ and ν Aqr', hip: 102618 },
  { index: 23, name: 'Sad al-Suud', arabic: 'سعد السعود', meaning: 'the luckiest of the lucky',
    stars: 'β and ξ Aqr with c (46) Cap', hip: 106278 },
  { index: 24, name: 'Sad al-Akhbiya', arabic: 'سعد الأخبية', meaning: 'the good fortune of the tents',
    stars: 'γ, ζ, π and η Aqr', hip: 110395 },
  { index: 25, name: 'al-Fargh al-Muqaddam', arabic: 'الفرغ المقدم', meaning: 'the front spout (of the water bucket)',
    stars: 'α and β Peg', hip: 113963 },
  { index: 26, name: 'al-Fargh al-Muakhkhar', arabic: 'الفرغ المؤخر', meaning: 'the rear spout (of the water bucket)',
    stars: 'γ Peg and α And', hip: 1067 },
  { index: 27, name: 'Batn al-Hut', arabic: 'بطن الحوت', meaning: 'the belly of the fish (also al-Risha, the well rope)',
    stars: 'β And (Mirach) and the fish-shaped arc of stars in Andromeda and Pisces', hip: 5447 },
]

export const sources: Source[] = [
  {
    title: 'Stellarium sky culture "arabic_lunar_stations" (description.md, index.json)',
    url: 'https://github.com/Stellarium/stellarium-skycultures/tree/master/arabic_lunar_stations',
    note:
      'List of the 28 stations with al-Sufi based identifications. Its prose swaps the stars of the two Farghs; its index.json has them right (front = β/α Peg, rear = α And/γ Peg), which we follow.',
  },
  {
    title: 'Paul Kunitzsch, Untersuchungen zur Sternnomenklatur der Araber (1961) and later papers',
    note: 'Standard philological reference for manazil star identifications; cited at second hand (not available in this environment).',
  },
  {
    title: "E. W. Lane, Arabic-English Lexicon (entry on al-shi'ra)",
    url: 'https://www.laneslexicon.com/word/الشعرى/n22475',
    note: 'Places Procyon in al-dhira al-maqbuda (the contracted forearm), supporting the CMi reading of al-Dhira.',
  },
  {
    title: 'IAU WGSN star names (Sheratan, Botein, Alterf, Albaldah, Albali, Sadalsuud, Sadachbia)',
    note: 'Modern official names that preserve manazil names on specific stars; used as a tie-breaker for representative HIP numbers.',
  },
  {
    title: 'HYG star database v4.1',
    url: 'https://github.com/astronexus/HYG-Database',
  },
]
