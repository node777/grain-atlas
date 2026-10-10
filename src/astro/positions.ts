// Where everything stands at one instant, seen from one place on Earth.
//
// Positions come from astronomy-engine (VSOP87 / ELP-based, arcsecond-class for planets in
// 1700–2200), converted to the true ecliptic of date. Sidereal longitudes subtract the chosen
// true ayanamsa. Rahu is the true lunar node, the node the
// grain caster also uses (swe.TRUE_NODE), computed as the osculating node; Ketu stands opposite.

import * as A from 'astronomy-engine'
import { ayanamsa, type AyanamsaId } from './ayanamsa'
import { atan2, centuries, cos, jdOf, norm360, sin, tan } from './math'
import type { GrahaId } from './data/types'

export interface Place {
  lat: number
  lon: number             // east positive
  name: string
  elevation?: number
}

export const UJJAIN: Place = { lat: 23.1793, lon: 75.7849, name: 'Ujjain' }

export interface BodyPosition {
  id: GrahaId | 'uranus' | 'neptune' | 'pluto'
  tropical: number        // ecliptic longitude of date, degrees
  sidereal: number
  latitude: number        // ecliptic latitude
  speed: number           // degrees per day in longitude (negative = retrograde)
  retrograde: boolean
  ra: number              // right ascension of date, degrees
  dec: number
  alt: number             // altitude above horizon for the place
  az: number
}

export interface SkyMoment {
  date: Date
  jd: number
  place: Place
  ayanamsaId: AyanamsaId
  ayanamsa: number
  obliquity: number       // true obliquity of date
  lst: number             // local apparent sidereal time, degrees
  ascendant: { tropical: number; sidereal: number }
  midheaven: { tropical: number; sidereal: number }
  bodies: BodyPosition[]
}

const BODY_MAP: Array<[BodyPosition['id'], A.Body]> = [
  ['sun', A.Body.Sun], ['moon', A.Body.Moon], ['mercury', A.Body.Mercury],
  ['venus', A.Body.Venus], ['mars', A.Body.Mars], ['jupiter', A.Body.Jupiter],
  ['saturn', A.Body.Saturn], ['uranus', A.Body.Uranus], ['neptune', A.Body.Neptune],
  ['pluto', A.Body.Pluto],
]

/** Apparent geocentric ecliptic longitude/latitude of date. */
function eclipticOf(body: A.Body, date: Date): { lon: number; lat: number } {
  if (body === A.Body.Moon) {
    const m = A.EclipticGeoMoon(date)
    return { lon: norm360(m.lon), lat: m.lat }
  }
  if (body === A.Body.Sun) {
    const s = A.SunPosition(date)
    return { lon: norm360(s.elon), lat: s.elat }
  }
  const e = A.Ecliptic(A.GeoVector(body, date, true))
  return { lon: norm360(e.elon), lat: e.elat }
}

/**
 * True (osculating) lunar ascending node, tropical longitude of date: the node of the plane
 * through the Moon's geocentric position and velocity -- what Swiss Ephemeris calls TRUE_NODE.
 */
export function osculatingNode(date: Date): number {
  const st = A.GeoMoonState(date)
  const rot = A.Rotation_EQJ_ECT(date)
  const t = st.t
  const r = A.RotateVector(rot, new A.Vector(st.x, st.y, st.z, t))
  const v = A.RotateVector(rot, new A.Vector(st.vx, st.vy, st.vz, t))
  const hx = r.y * v.z - r.z * v.y
  const hy = r.z * v.x - r.x * v.z
  return norm360(atan2(hx, -hy))
}

/** Meeus' five-term true-node series (agrees with the osculating node to ~0.15°). */
export function trueNode(jd: number): number {
  const T = centuries(jd)
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T
  const F = 93.272095 + 483202.0175233 * T - 0.0036539 * T * T
  const meanNode = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441
  const corr =
    -1.4979 * sin(2 * (D - F)) -
    0.15 * sin(M) -
    0.1226 * sin(2 * D) +
    0.1176 * sin(2 * F) -
    0.0801 * sin(2 * (Mp - F))
  return norm360(meanNode + corr)
}

export function meanNode(jd: number): number {
  const T = centuries(jd)
  return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441)
}

/** Ascendant and midheaven (tropical) from local sidereal time, latitude and obliquity. */
export function angles(lstDeg: number, lat: number, eps: number) {
  const asc = norm360(atan2(cos(lstDeg), -(sin(lstDeg) * cos(eps) + tan(lat) * sin(eps))))
  const mc = norm360(atan2(sin(lstDeg), cos(lstDeg) * cos(eps)))
  return { asc, mc }
}

function eclToEq(lon: number, lat: number, eps: number) {
  const ra = norm360(atan2(sin(lon) * cos(eps) - tan(lat) * sin(eps), cos(lon)))
  const dec = Math.asin(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon)) * (180 / Math.PI)
  return { ra, dec }
}

export function eqToHorizon(ra: number, dec: number, lst: number, lat: number) {
  const H = lst - ra
  const alt = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H)) * (180 / Math.PI)
  const az = norm360(atan2(-cos(dec) * sin(H), sin(dec) * cos(lat) - cos(dec) * sin(lat) * cos(H)))
  return { alt, az }
}

export function castSky(date: Date, place: Place, ayanamsaId: AyanamsaId = 'lahiri'): SkyMoment {
  const jd = jdOf(date)
  const tilt = A.e_tilt(A.MakeTime(date))
  // astronomy-engine longitudes are true-of-date (they include nutation), so subtract the true
  // ayanamsa (mean + nutation in longitude) and nutation cancels out of sidereal positions.
  const ayan = ayanamsaId === 'none' ? 0 : ayanamsa(jd, ayanamsaId) + tilt.dpsi / 3600
  const eps = tilt.tobl
  const lst = norm360(A.SiderealTime(date) * 15 + place.lon)
  const { asc, mc } = angles(lst, place.lat, eps)
  const later = new Date(date.getTime() + 3600_000)

  const make = (id: BodyPosition['id'], lon: number, lat: number, lon2: number): BodyPosition => {
    let speed = (lon2 - lon) * 24
    if (speed > 180 * 24) speed -= 360 * 24
    if (speed < -180 * 24) speed += 360 * 24
    const { ra, dec } = eclToEq(lon, lat, eps)
    const { alt, az } = eqToHorizon(ra, dec, lst, place.lat)
    return {
      id, tropical: lon, sidereal: norm360(lon - ayan), latitude: lat, speed,
      retrograde: speed < 0, ra, dec, alt, az,
    }
  }

  const bodies: BodyPosition[] = BODY_MAP.map(([id, b]) => {
    const p = eclipticOf(b, date)
    const q = eclipticOf(b, later)
    return make(id, p.lon, p.lat, q.lon)
  })
  const rahu = osculatingNode(date)
  const rahu2 = osculatingNode(later)
  bodies.push(make('rahu', rahu, 0, rahu2))
  bodies.push(make('ketu', norm360(rahu + 180), 0, norm360(rahu2 + 180)))

  return {
    date, jd, place, ayanamsaId, ayanamsa: ayan, obliquity: eps, lst,
    ascendant: { tropical: asc, sidereal: norm360(asc - ayan) },
    midheaven: { tropical: mc, sidereal: norm360(mc - ayan) },
    bodies,
  }
}

export const body = (sky: SkyMoment, id: BodyPosition['id']): BodyPosition => {
  const b = sky.bodies.find((x) => x.id === id)
  if (!b) throw new Error(`no body ${id}`)
  return b
}

export const GRAHA_ORDER: GrahaId[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu']
