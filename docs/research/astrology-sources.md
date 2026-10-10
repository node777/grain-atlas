# Astrology reference data: sources, checks and decisions

This file covers the modules in `src/astro/data/`: `grahas.ts`, `rashis.ts`, `nakshatras.ts`, `panchanga.ts`, `chinese.ts`, `arabic.ts`, `hellenistic.ts`, `western.ts` and `meanings.ts`. It records what was checked, how, and every point where sources disagree, with the choice we made.

## How the research was done (and its limits)

This build environment could not fetch most web pages. Wikipedia, archive.org, wisdomlib, SIMBAD and the journal sites were all blocked, and the page-fetch tool failed on DNS. What did work:

- **Web search result snippets**, used for spot checks of BPHS verses, Muhurta Chintamani lists, nakshatra classes and Chinese determinative history. A snippet is a summary of a page, not the page itself. Anything resting only on a snippet is marked that way below.
- **Git clones of primary data repositories**, read locally:
  - `astronexus/HYG-Database`: the HYG v4.1 catalogue, which cross-indexes Hipparcos, Bayer and Flamsteed designations. **Every HIP number in the modules was looked up here** by designation and constellation, and ecliptic longitudes were computed from it.
  - `aloistr/swisseph`: Astrodienst's Swiss Ephemeris. Its `sefstars.txt` names several nakshatra stars, and `doc/swisseph.htm` §2.8 discusses ayanamsas, including the Lahiri, Chitrapaksha, Revati and Pushya definitions.
  - `Stellarium/stellarium-skycultures`: the `indian`, `chinese` and `arabic_lunar_stations` sky cultures. Their star lines give HIP numbers, and the descriptions draw on Sun & Kistemaker for China and on al-Sufi and Ibn Qutayba for the manazil.
  - `sanskrit-coders/jyotisha`: Devanagari and IAST name tables for nakshatras, tithis, yogas, karanas and rashis.
- **Standard texts I know well**: BPHS (Santhanam translation), Brihat Jataka, Muhurta Chintamani, Ptolemy's Tetrabiblos (Robbins), Dorotheus, al-Biruni and Burgess's Surya Siddhanta. These are used where no fetch was possible, and are marked "from the standard text" in the module `sources`.

**Bottom line:** the star identifications and HIP numbers rest on solid machine-readable checks. The classical-text facts come from well-known standard lists, spot-checked through snippets. If you need verse-level certainty, re-check the items flagged below against the printed texts.

## What was verified, module by module

### grahas.ts
- **Exaltation and debilitation degrees**: Sun Aries 10°, Moon Taurus 3°, Mars Capricorn 28°, Mercury Virgo 15°, Jupiter Cancer 5°, Venus Pisces 27°, Saturn Libra 20°, with debilitation at the same degree in the opposite sign. This is the standard BPHS 3 list. A script checks the opposition and degree match.
- **Moolatrikona** (BPHS 3.51-54): Sun Leo 0-20; Moon Taurus 3-30; Mars Aries 0-12; Mercury Virgo 15-20; Jupiter Sagittarius 0-10; Venus Libra 0-15; Saturn Aquarius 0-20.
  - The Sanskrit of 3.51 and 3.54 was seen in snippets. It uses *nakhāṃśa* (20) for the Sun and Saturn, *tithyaṃśa* (15) for Venus, and *tryaṃśa* (3) for the Moon's exaltation, with "*trikoṇam apare*" (the rest is moolatrikona).
- **Naisargika friendships**: BPHS's table for the seven planets. A script checks that each planet's friends, neutrals and enemies together cover the other six exactly once.
- **Vimshottari**: Ketu 7, Venus 20, Sun 6, Moon 10, Mars 7, Rahu 18, Jupiter 16, Saturn 19, Mercury 17, totalling 120.
- **Gunas**: Sun, Moon and Jupiter sattva; Mercury and Venus rajas; Mars and Saturn tamas.
- **Tattvas** (BPHS): Mars agni, Mercury prithvi, Jupiter akasha, Venus jala, Saturn vayu.
- **Deities** (BPHS): Agni, Varuna, Skanda, Vishnu, Indra, Shachi, Brahma.
- **Colours**: Brihat Jataka 2.

### rashis.ts
- Lords, odd-masculine/even-feminine gender, and movable/fixed/dual nature follow BPHS 4.
- Directions repeat east, south, west, north from Aries.
- Body parts follow the Kalapurusha map of Brihat Jataka 1.4.
- A script checks that each rashi's lord lists that rashi in `owns`.

### nakshatras.ts
Each row was cross-checked against at least two independent listings:

| Field | Sources compared |
|---|---|
| Deity | Muhurta Chintamani list; panchanga summaries via search; Taittiriya Samhita via EJVS (differences noted below) |
| Gana | Standard ashtakuta table; script confirms 9 deva, 9 manushya, 9 rakshasa |
| Yoni | Standard ashtakuta table; script confirms the 13 male/female pairs plus mongoose |
| Nature (7 classes) | Drik Panchang seven-category page; several panchanga summaries; counts 4/5/5/2/3/4/4 |
| Lord | Vimshottari sequence, checked by script |
| Yogatara | Burgess (from the standard text), Swiss Ephemeris `sefstars.txt`, Stellarium `indian` star lines, Narayan IJHS 45.4 (snippet) |
| HIP | HYG v4.1 (all) |
| Devanagari | jyotisha name table, plus standard spellings (see below) |

- **`taittiriyaIndex`** = `(index + 25) % 27`, which gives Krittika 0, Rohini 1, Ashvini 25 and Bharani 26.
- **`xiu` and `manzil`** come from the conventional one-to-one alignment of the three 28-mansion systems, with Abhijit taking the extra slot: Ashvini to Lou and al-Sharatan, Chitra to Jiao and al-Simak.
  - The alignment is confirmed by shared stars at many points: Ashvini and Lou are both β Ari; Bharani and Wei are both 35 Ari; Purva Bhadrapada, Shi and al-Fargh al-Muqaddam all use α Peg; Uttara Bhadrapada, Bi and al-Fargh al-Muakhkhar all use γ Peg.
- **The HIP numbers you listed all check out**: Spica 65474, Regulus 49669, Aldebaran 21421, Antares 80763, Arcturus 69673, Altair 97649, Pollux 37826, Alcyone 17702, β Ari 8903, Vega 91262.

### panchanga.ts
- **Tithi deities**: the Muhurta Chintamani verse (snippet of a digitised edition), see below.
- **Tithi groups**: nanda, bhadra, jaya, rikta and purna follow `n % 5` within each fortnight.
- **Yoga names and order**: match the jyotisha table, where Shubhra = Shukla and Mahendra = Indra.
- **Karana mapping**: matches jyotisha's 60-slot table exactly. A script confirms Kimstughna ×1, each movable karana ×8, then Shakuni, Chatushpada and Naga ×1.

### chinese.ts
- **Determinatives** from Stellarium `chinese` (after Sun & Kistemaker) and Chinese Wikipedia (snippets). Era differences are described below.
- **Stems, branches and five-phase cycles** are standard. A script checks that `ganzhi(0)` = 甲子 and `ganzhi(59)` = 癸亥.

### arabic.ts
- Order and names follow the Stellarium `arabic_lunar_stations` sky culture (al-Sufi and Ibn Qutayba based), Kunitzsch at second hand, and Lane's Lexicon.
- Representative HIP numbers come from HYG.

### hellenistic.ts
- **Egyptian terms**: a script checks that each sign has five planets ending at 30°. The per-planet totals are Saturn 57, Jupiter 79, Mars 66, Venus 82 and Mercury 76, summing to 360. These are the classical totals, a strong check on the table.
- **Chaldean faces**: run without a break from Mars at Aries I to Mars at Pisces III.
- **Planetary hours**: a script confirms that 24 Chaldean steps land on the next weekday's ruler.

### western.ts and meanings.ts
- Standard tables.
- The ayanamsa facts come from the Swiss Ephemeris documentation.

## Disagreements and the choices made

### Grahas
1. **Rahu and Ketu exaltation.**
   - Taurus/Scorpio is attributed to BPHS, Sarvartha Chintamani and Bhavartha Ratnakara. Gemini/Sagittarius comes from Prashna Bhairava and some North Indian practice.
   - One secondary source even claims BPHS is silent on the matter.
   - **Choice:** Taurus/Scorpio as the most common view. The **20°** deep-exaltation degree is a later convention with no classical verse we could find; `degree` is required by `types.ts`, so it is filled but flagged in `keywords`.
2. **Node rulership.** BPHS 50.42 has Rahu owning Aquarius and Ketu owning Scorpio; some moderns give Virgo and Pisces. **Choice:** Aquarius/Scorpio. Node moolatrikona is omitted because the sources contradict each other: Gemini/Sagittarius, or Aquarius for Rahu.
3. **Node friendships.** BPHS gives none for the nodes, and later tables contradict each other. **Choice:** empty arrays, with the maxim "shanivad rahu, kujavat ketu" (Rahu behaves like Saturn, Ketu like Mars) noted in `keywords`.
4. **Moon moolatrikona.** **Choice:** Taurus 3-30 per BPHS 3.51. Some authors use 4-30 or 4-20.
5. **Sun and Moon tattva.** BPHS assigns tattvas only to the five star-planets. **Choice:** the conventional agni/jala, noted in a code comment.
6. **Metals.** Lists vary, and a Narada Purana list seen in a snippet differs for Mercury (lead) and Venus (bell-metal). **Choice:** the common remedial scheme, with variants flagged inline.
7. **Gems and node deities.** These come from the later remedial tradition, not BPHS, and are flagged.

### Nakshatras
1. **Yogatara identifications** (primary choice first):
   - **Bharani**: 35 Ari (Burgess, most tables) vs 41 Ari (IAU name "Bharani", Swiss Ephemeris).
   - **Krittika**: η Tau vs another Pleiad (Narayan's table gives Merope).
   - **Ashlesha**: ε Hya (IAU "Ashlesha") vs ζ Hya vs α Cnc (Colebrooke).
   - **Vishakha**: ι¹ Lib (fits the Surya Siddhanta coordinates; Pingree; Swiss Ephemeris) vs α² Lib or β Lib (popular tables).
   - **Shatabhisha**: λ Aqr (Burgess, Swiss Ephemeris) vs γ Aqr (Stellarium).
   - **Purva Bhadrapada**: α Peg vs β Peg.
   - **Uttara Bhadrapada**: γ Peg vs α And.
   - **Lesser variants** are recorded in each row's `note`: Ashvini β vs α Ari; Punarvasu β vs α Gem; Hasta δ vs γ Crv; Uttara Ashadha σ vs ζ Sgr; Dhanishtha β vs α Del.
2. **Deities**: the Jyotish list differs from Taittiriya Samhita 4.4.10.
   - In the Samhita, Chitra's deity is Indra, not Tvashtr; the Phalguni deities (Bhaga, Aryaman) are swapped; and some rows (e.g. Mula, Shatabhisha) differ.
   - **Choice:** the Jyotish/Muhurta list, since the app's engine is astrological.
3. **Taittiriya order and Abhijit.** Some Taittiriya Brahmana lists insert Abhijit between Uttara Ashadha and Shravana. As specified, `taittiriyaIndex` counts the 27 without Abhijit.
4. **Correspondences around Abhijit.** The ordinal alignment pairs Shravana (Altair) with Nü (ε Aqr) and Sad Bula. By sky position, Altair sits in the Niu lodge region. The three systems simply diverge where the Indian stars lie far north of the ecliptic (Vega, Altair, Delphinus). **Choice:** the conventional sequence alignment, documented as such.
5. **Krittika yoni.** Most tables give sheep; one gives goat. **Choice:** sheep.
6. **Spellings.**
   - **Svati, Purva and Uttara Phalguni:** we use स्वाती / Svātī and फल्गुनी / Phalgunī, the Vedic forms, which also appear in jyotisha. The forms स्वाति and फाल्गुनी are also common.
   - **Mula:** मूल (jyotisha has मूला).
   - **Shatabhisha:** शतभिषा (variant शतभिषक्).
   - **Other variants:** older names Tishya, Shravishtha, Proshthapada and Shatabhishaj appear in the `meaning` text. The Vedic/Tamil-tradition spellings अपभरणी and आश्रेषा (used by jyotisha) are not carried in the data.

### Panchanga
1. **The 15th tithi.** The Muhurta Chintamani verse gives the Moon (*śaśī*) for the 15th. **Choice:** Chandra for Purnima and the Pitris for Amavasya, the widespread panchanga convention. Amavasya keeps group `purna` by position, with a keyword noting that it is generally avoided for auspicious starts.
2. **Inauspicious yogas.** All nine are marked `inauspicious`. Muhurta texts actually reject only the opening ghatis of some, the first half of Parigha, and all of Vyatipata and Vaidhriti; this is recorded in `sources`.
3. **Karana glosses.** Etymologies of Bava, Balava, Kaulava, Taitila, Garaja and Kimstughna are obscure, so the glosses state only position and auspiciousness rather than invented meanings.

### Chinese
1. **Determinatives changed over time.**
   - **Han to Yuan (Taichu calendar), the set used:** Kui ζ And, Zi φ¹ Ori, Shen δ Ori.
   - **From the Chongzhen reform,** every determinative became the lodge's "first" star: Kui η And, Zi λ Ori, Shen ζ Ori. These are given in brackets.
   - **Mao** is 17 Tau (Electra, 昴宿一), not Alcyone.
2. **Dou.** Stellarium gives μ Sgr, but 斗宿一, the traditional determinative, is φ Sgr. **Choice:** φ Sgr.
3. **Seven luminaries and 28 animals.** This is a later (Tang and after) overlay, included in `element`/`animal` and flagged.

### Arabic
1. **al-Dhira.** Ibn Qutayba and al-Sufi, as followed by Stellarium, give α and β CMi (the "contracted forearm"); Lane's Lexicon agrees. Many later tables give α and β Gem. **Choice:** CMi, with Gem noted.
2. **al-Tarf.** κ Cnc and λ Leo (λ Leo is IAU "Alterf") vs ε and ο Leo (Stellarium prose). **Choice:** κ Cnc and λ Leo.
3. **al-Butayn.** ε, δ and ρ³ Ari vs 35, 39 and 41 Ari (Stellarium's star lines). **Choice:** ε, δ, ρ³, with HIP of δ Ari (IAU "Botein").
4. **The two Farghs.** Stellarium's prose swaps their stars, but its data is correct. **Choice:** front = α and β Peg; rear = γ Peg and α And.

### Hellenistic
1. **`triplicityRuler` on `Decan`** is the 1st/5th/9th-sign domicile lord, the Indian drekkana and modern "triplicity decan" scheme. It is not the Dorothean triplicity lord, which lives in `TRIPLICITIES`.
2. **`egyptianName`** is left empty. Decan names (Hephaistion, the Hermetic lists and the Egyptian star clocks) vary widely in transliteration and couldn't be verified here.
3. **Terms.** The Egyptian set is given; Ptolemy's own terms differ.

### Western
1. **Exaltation degrees** are the medieval values: Sun 19°, Jupiter 15°, Saturn 21°. These differ from the Indian Sun 10°, Jupiter 5° and Saturn 20°. Ptolemy gives signs only.
2. **Orbs.** Aspect orbs are typical modern values. The planetary orbs follow al-Biruni; Lilly differs slightly.
3. **Node exaltations** (Head in Gemini, Tail in Sagittarius) are medieval Western and not universal.

### Ayanamsa
- **Lahiri** (Calendar Reform Committee, 1955) is defined as 23°15'00" on 21 March 1956, 0h TDT. That puts Spica at 179°58'59" in J2000, close to but not exactly 180°.
- **"True Chitrapaksha"** holds Spica at exactly 180°.
- Our `meanings.ts` says Lahiri is "meant to keep Spica at 180°" and states the nuance explicitly.

## Unverified or weakly verified items

- **BPHS Mercury moolatrikona verse (3.53) and the node verses**: not seen directly. Values come from the standard Santhanam text.
- **Brihat Jataka colours, al-Biruni orbs, Dorotheus triplicities and the Egyptian terms**: taken from the standard texts without a fetch. The terms are strongly corroborated by their totals.
- **Zi's Han determinative (φ¹ Ori)**: rests on Chinese Wikipedia snippets saying the old determinatives are now called 奎宿二, 觜宿二 and 参宿三.
- **Pingree & Morrissey**: only the citation and secondary reports were seen, since the article is paywalled.
- **Nakshatra symbols and the `essence` glosses**: the symbols follow common Jyotish usage, with alternatives given. The glosses are original wording.
