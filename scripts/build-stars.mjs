#!/usr/bin/env node
// Builds the sky data the atlas draws: star points, star names, constellation figures for
// several sky cultures, and the Milky Way outline. Run: npm run data:stars
//
// Sources (downloaded, never hot-linked at runtime):
//   HYG Database v4.1 -- astronexus, CC BY-SA 4.0 (derived star file shares alike)
//   Stellarium sky cultures -- modern (CC BY-SA 4.0), indian (CC BY-SA 4.0),
//     indian_nakshatras (CC BY 4.0), chinese (CC BY-SA 4.0)
//   d3-celestial mw.json -- Olaf Frohn, BSD-3-Clause (Milky Way outline after Vieira et al.)
// Attribution is written to public/data/sky/ATTRIBUTION.md.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = 'public/data/sky'
const CACHE = process.env.ATLAS_CACHE ?? '.cache/sky'
const MAG_LIMIT = 6.5

const SOURCES = {
  hyg: 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv',
  mw: 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/mw.json',
  culture: (id) => `https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/${id}/index.json`,
}
const CULTURES = [
  { id: 'modern', label: 'Modern (IAU)', license: 'CC BY-SA 4.0' },
  { id: 'indian', label: 'Indian (Vedic)', license: 'CC BY-SA 4.0' },
  { id: 'indian_nakshatras', label: 'Nakshatras (Tirupperunthurai carvings)', license: 'CC BY 4.0' },
  { id: 'chinese', label: 'Chinese', license: 'CC BY-SA 4.0' },
]

async function cached(url, name) {
  const file = join(CACHE, name)
  try { await access(file); return await readFile(file, 'utf8') } catch {}
  process.stdout.write(`fetching ${url}\n`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const text = await res.text()
  await mkdir(CACHE, { recursive: true })
  await writeFile(file, text)
  return text
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/)
  const head = lines[0].split(',').map((h) => h.replace(/"/g, ''))
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue
    // HYG has no embedded commas inside quoted fields except none in practice; split simply.
    const cells = lines[i].split(',').map((c) => c.replace(/^"|"$/g, ''))
    const o = {}
    head.forEach((h, k) => { o[h] = cells[k] })
    rows.push(o)
  }
  return rows
}

const r3 = (x) => Math.round(x * 1000) / 1000
const r2 = (x) => Math.round(x * 100) / 100

async function main() {
  await mkdir(OUT, { recursive: true })

  // ---- figures first, so we know which faint stars the lines need
  const figures = {}
  const needed = new Set()
  for (const c of CULTURES) {
    const json = JSON.parse(await cached(SOURCES.culture(c.id), `${c.id}.json`))
    const list = []
    for (const k of json.constellations ?? []) {
      const lines = (k.lines ?? [])
        .map((poly) => poly.filter((h) => typeof h === 'number' && Number.isInteger(h)))
        .filter((poly) => poly.length >= 2)
      if (!lines.length) continue
      lines.flat().forEach((h) => needed.add(h))
      list.push({
        id: k.id,
        name: k.common_name?.english ?? k.id,
        native: k.common_name?.native,
        pronounce: k.common_name?.pronounce,
        lines,
      })
    }
    figures[c.id] = { label: c.label, license: c.license, lunar: json.lunar_system ?? null, constellations: list }
  }

  // ---- stars
  const hyg = parseCsv(await cached(SOURCES.hyg, 'hygdata_v41.csv'))
  const stars = []
  const names = {}
  for (const s of hyg) {
    const hip = s.hip ? parseInt(s.hip, 10) : 0
    const mag = parseFloat(s.mag)
    if (s.proper === 'Sol' || !Number.isFinite(mag)) continue
    if (mag > MAG_LIMIT && !(hip && needed.has(hip))) continue
    const ra = parseFloat(s.ra) * 15
    const dec = parseFloat(s.dec)
    const ci = s.ci === '' ? 0.6 : parseFloat(s.ci)
    stars.push([r3(ra), r3(dec), r2(mag), r2(Number.isFinite(ci) ? ci : 0.6), hip])
    if (hip && (s.proper || s.bayer || s.flam)) {
      names[hip] = [s.proper || '', s.bayer || '', s.flam || '', s.con || '']
    }
  }
  stars.sort((a, b) => a[2] - b[2])
  const present = new Set(stars.map((s) => s[4]).filter(Boolean))
  for (const id of Object.keys(figures)) {
    for (const k of figures[id].constellations) {
      k.lines = k.lines.map((p) => p.filter((h) => present.has(h))).filter((p) => p.length >= 2)
    }
    figures[id].constellations = figures[id].constellations.filter((k) => k.lines.length)
  }

  await writeFile(join(OUT, 'stars.json'), JSON.stringify({
    fields: ['ra', 'dec', 'mag', 'ci', 'hip'], epoch: 'J2000', magLimit: MAG_LIMIT, rows: stars,
  }))
  await writeFile(join(OUT, 'starnames.json'), JSON.stringify(names))
  for (const [id, f] of Object.entries(figures)) {
    await writeFile(join(OUT, `figures-${id}.json`), JSON.stringify(f))
  }

  // ---- Milky Way: keep the outline polygons, rounded to 0.1°
  const mw = JSON.parse(await cached(SOURCES.mw, 'mw.json'))
  const mwOut = mw.features.map((f) => ({
    level: f.id,
    polys: f.geometry.coordinates.map((poly) =>
      poly.map((ring) => ring.filter((_, i) => i % 2 === 0).map(([l, b]) => [Math.round(l * 10) / 10, Math.round(b * 10) / 10]))),
  }))
  await writeFile(join(OUT, 'milkyway.json'), JSON.stringify(mwOut))

  await writeFile(join(OUT, 'ATTRIBUTION.md'), `# Sky data attribution

- **stars.json, starnames.json** -- derived from the HYG Database v4.1 by David Nash (astronexus),
  https://github.com/astronexus/HYG-Database, licensed CC BY-SA 4.0. This derived file is shared
  under the same license. Stars to magnitude ${MAG_LIMIT}, plus fainter stars named by a figure.
- **figures-modern.json** -- Stellarium sky culture "modern", CC BY-SA 4.0.
- **figures-indian.json** -- Stellarium sky culture "indian", CC BY-SA 4.0.
- **figures-indian_nakshatras.json** -- Stellarium sky culture "indian_nakshatras", CC BY 4.0
  (figures after the 10th-century Tirupperunthurai temple carvings).
- **figures-chinese.json** -- Stellarium sky culture "chinese", CC BY-SA 4.0.
  Stellarium: https://github.com/Stellarium/stellarium/tree/master/skycultures
- **milkyway.json** -- from d3-celestial by Olaf Frohn (BSD-3-Clause), outline after the
  Milky Way catalog of Vieira et al.; simplified (every second vertex, 0.1° rounding).

Figures were filtered to integer HIP references present in the star file; Gaia-only references
in the upstream data are dropped.
`)
  const counts = Object.fromEntries(Object.entries(figures).map(([k, v]) => [k, v.constellations.length]))
  console.log(`stars ${stars.length}, names ${Object.keys(names).length}, figures`, counts)
}

main().catch((e) => { console.error(e); process.exit(1) })
