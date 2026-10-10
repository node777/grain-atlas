// Ayanamsa: the arc between the tropical equinox and the sidereal zero point.
//
// Lahiri (Chitrapaksha) is the Indian Calendar Reform Committee standard (1955), defined so the
// star Chitra (Spica) sits near 180° sidereal. We follow the Swiss Ephemeris anchoring
// (SIDM_LAHIRI: 23.245524743° at JD 2435553.5, 1956-03-21) and carry it with the IAU 2006
// general precession in longitude, p_A = 5028.796195″T + 1.1054348″T². This agrees with
// Swiss Ephemeris' mean Lahiri to within an arcsecond or so across 1900–2100. The other systems
// use Swiss Ephemeris anchor values with the same precession, so treat them as close, not exact.

import { centuries } from './math'

export type AyanamsaId = 'lahiri' | 'raman' | 'krishnamurti' | 'fagan-bradley' | 'none'

interface AyanamsaDef { label: string; t0: number; value0: number; note: string }

const DEFS: Record<Exclude<AyanamsaId, 'none'>, AyanamsaDef> = {
  'lahiri': {
    label: 'Lahiri (Chitrapaksha)', t0: 2435553.5, value0: 23.245524743,
    note: 'Indian national standard; Spica near 180° sidereal.',
  },
  'raman': {
    label: 'B. V. Raman', t0: 2415020.0, value0: 21.014444,
    note: 'Used in Raman\'s school; about 1.5° less than Lahiri.',
  },
  'krishnamurti': {
    label: 'Krishnamurti (KP)', t0: 2415020.0, value0: 22.363889,
    note: 'Krishnamurti Paddhati; a few arcminutes from Lahiri.',
  },
  'fagan-bradley': {
    label: 'Fagan–Bradley', t0: 2433282.42346, value0: 24.042044444,
    note: 'Western sidereal standard.',
  },
}

const precessionArcsec = (T: number) => 5028.796195 * T + 1.1054348 * T * T

export function ayanamsa(jd: number, id: AyanamsaId = 'lahiri'): number {
  if (id === 'none') return 0
  const d = DEFS[id]
  return d.value0 + (precessionArcsec(centuries(jd)) - precessionArcsec(centuries(d.t0))) / 3600
}

export const AYANAMSAS = Object.entries(DEFS).map(([id, d]) => ({ id: id as AyanamsaId, ...d }))
