// Loads the star catalogue and sky-culture figures shipped in public/data/sky
// (built by scripts/build-stars.mjs from HYG v4.1 and Stellarium; see ATTRIBUTION.md there).

export interface Star { ra: number; dec: number; mag: number; ci: number; hip: number; v: [number, number, number] }
export interface Figure { id: string; name: string; native?: string; lines: number[][] }
export interface Culture { id: string; label: string; license: string; constellations: Figure[]; lunar?: unknown }

export interface Catalog {
  stars: Star[]
  byHip: Map<number, Star>
  names: Record<string, [string, string, string, string]>
  milkyway: Array<{ level: number; polys: number[][][][] }>
  cultures: Record<string, Culture>
}

export const CULTURE_IDS = ['modern', 'indian', 'indian_nakshatras', 'chinese'] as const
export type CultureId = (typeof CULTURE_IDS)[number]

const D = Math.PI / 180
export const unit = (raDeg: number, decDeg: number): [number, number, number] => {
  const ra = raDeg * D, dec = decDeg * D
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]
}

let loading: Promise<Catalog> | null = null

export function loadCatalog(): Promise<Catalog> {
  if (loading) return loading
  const base = `${import.meta.env.BASE_URL}data/sky/`
  const get = (f: string) => fetch(base + f).then((r) => {
    if (!r.ok) throw new Error(`sky data missing: ${f}`)
    return r.json()
  })
  loading = Promise.all([
    get('stars.json'), get('starnames.json'), get('milkyway.json'),
    ...CULTURE_IDS.map((c) => get(`figures-${c}.json`)),
  ]).then(([s, names, mw, ...cultures]) => {
    const stars: Star[] = s.rows.map((r: number[]) => ({ ra: r[0], dec: r[1], mag: r[2], ci: r[3], hip: r[4], v: unit(r[0], r[1]) }))
    const byHip = new Map<number, Star>()
    for (const st of stars) if (st.hip) byHip.set(st.hip, st)
    const cs: Record<string, Culture> = {}
    CULTURE_IDS.forEach((id, i) => { cs[id] = { id, ...cultures[i] } })
    return { stars, byHip, names, milkyway: mw, cultures: cs }
  })
  return loading
}

/** A warm star colour from B−V: the palette stays blue-free, hot stars read as pale linen. */
export function starColor(ci: number): string {
  if (ci < 0) return '#f4f1ea'
  if (ci < 0.3) return '#f6efdd'
  if (ci < 0.6) return '#f6ead0'
  if (ci < 0.9) return '#f3dcae'
  if (ci < 1.3) return '#f1c98b'
  return '#eaa772'
}

export function starName(cat: Catalog, hip: number): string | undefined {
  const n = cat.names[hip]
  if (!n) return undefined
  if (n[0]) return n[0]
  if (n[1]) return `${greek(n[1])} ${n[3]}`
  if (n[2]) return `${n[2]} ${n[3]}`
  return undefined
}

const GREEK: Record<string, string> = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ', Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ',
  Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω',
}
const greek = (b: string) => {
  const m = /^([A-Za-z]+)(\d*)$/.exec(b)
  if (!m) return b
  return (GREEK[m[1]] ?? m[1]) + (m[2] ? m[2] : '')
}
