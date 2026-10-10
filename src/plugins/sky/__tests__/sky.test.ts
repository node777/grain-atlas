import { describe, expect, it } from 'vitest'
import * as A from 'astronomy-engine'
import { castSky, UJJAIN, type Place } from '@/astro/positions'
import { unit } from '../catalog'
import { eclVec, framesAt, hdVec, horVec, makeProj, mul, project, type V3 } from '../projection'
import { astrolabeFit, limbCodec } from '../instrument'

const ist = (iso: string) => new Date(iso + '+05:30')
const D = 180 / Math.PI
const altAz = (v: V3) => ({ alt: Math.asin(v[2]) * D, az: ((Math.atan2(-v[1], v[0]) * D) % 360 + 360) % 360 })
const angDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180

describe('the sky frames against astronomy-engine', () => {
  it('Vega from Ujjain: the catalogue-to-horizon matrix matches DefineStar + Horizon', () => {
    // Vega, J2000: RA 18h 36m 56.336s, Dec +38° 47′ 01.28″ (SIMBAD)
    const ra = (18 + 36 / 60 + 56.336 / 3600) * 15, dec = 38 + 47 / 60 + 1.28 / 3600
    const date = ist('2026-10-10T21:00:00')
    const F = framesAt(date, UJJAIN.lat, UJJAIN.lon)
    const mine = altAz(mul(F.eqj, unit(ra, dec)))
    A.DefineStar(A.Body.Star1, ra / 15, dec, 25)
    const obs = new A.Observer(UJJAIN.lat, UJJAIN.lon, 0)
    const eq = A.Equator(A.Body.Star1, date, obs, true, false)
    const hor = A.Horizon(date, obs, eq.ra, eq.dec)
    // aberration (about 20″) is the only term between them
    expect(Math.abs(mine.alt - hor.altitude)).toBeLessThan(0.02)
    expect(Math.abs(angDiff(mine.az, hor.azimuth))).toBeLessThan(0.03)
  })

  it('the Sun through the ecliptic-of-date matrix lands where castSky and astronomy-engine put it', () => {
    const date = ist('2024-04-13T12:00:00')
    const sky = castSky(date, UJJAIN)
    const sun = sky.bodies.find((b) => b.id === 'sun')!
    const F = framesAt(date, UJJAIN.lat, UJJAIN.lon)
    const mine = altAz(mul(F.ect, eclVec(sun.tropical, sun.latitude)))
    const obs = new A.Observer(UJJAIN.lat, UJJAIN.lon, 0)
    const eq = A.Equator(A.Body.Sun, date, obs, true, true)
    const hor = A.Horizon(date, obs, eq.ra, eq.dec)
    expect(Math.abs(mine.alt - hor.altitude)).toBeLessThan(0.02)
    expect(Math.abs(angDiff(mine.az, hor.azimuth))).toBeLessThan(0.05)
    expect(Math.abs(mine.alt - sun.alt)).toBeLessThan(0.02)
  })

  it('Mesha Sankranti 2024 (13 April, 21:15 IST, Drik Panchang, Lahiri): the Sun at 0° sidereal', () => {
    const sun = castSky(ist('2024-04-13T21:15:00'), UJJAIN).bodies.find((b) => b.id === 'sun')!
    expect(Math.abs(angDiff(sun.sidereal, 0))).toBeLessThan(0.05)
  })

  it('the lagna drawn on the ecliptic sits on the eastern horizon', () => {
    const DELHI: Place = { lat: 28.6139, lon: 77.209, name: 'Delhi' }
    for (const iso of ['2026-10-10T06:00:00', '2026-10-10T18:30:00', '2027-03-01T23:10:00']) {
      const date = ist(iso)
      const sky = castSky(date, DELHI)
      const F = framesAt(date, DELHI.lat, DELHI.lon)
      const v = altAz(mul(F.ect, eclVec(sky.ascendant.tropical, 0)))
      expect(Math.abs(v.alt)).toBeLessThan(0.02)
      expect(v.az).toBeGreaterThan(0)
      expect(v.az).toBeLessThan(180)
    }
  })

  it('hdVec puts the pole and the zenith where they belong', () => {
    const z = hdVec(0, UJJAIN.lat, UJJAIN.lat)
    expect(z[2]).toBeCloseTo(1, 9)
    const pole = altAz(hdVec(123, 90, UJJAIN.lat))
    expect(pole.alt).toBeCloseTo(UJJAIN.lat, 9)
  })
})

describe('the astrolabe', () => {
  it('the rule through the Sun reads its hour angle on the limb, ccw from noon in the north', () => {
    const date = ist('2026-10-10T15:40:00')
    const sky = castSky(date, UJJAIN)
    const F = framesAt(date, UJJAIN.lat, UJJAIN.lon)
    const view = { x: 0, y: 0, w: 900, h: 900 }
    const fit = astrolabeFit(view, sky.obliquity)
    const p = makeProj({ fwd: horVec(UJJAIN.lat, 0), up: [0, 0, 1], fov: fit.fov }, 900, 900, view, fit.centre)
    const c = project(p, mul(F.eqd, [0, 0, 1]), -0.999)!
    expect(Math.hypot(c[0] - fit.centre[0], c[1] - fit.centre[1])).toBeLessThan(1e-6) // the pin is the pole
    const sun = sky.bodies.find((b) => b.id === 'sun')!
    const s = project(p, mul(F.ect, eclVec(sun.tropical, sun.latitude)), -0.999)!
    const noon = project(p, hdVec(0, 0, UJJAIN.lat), -0.999)!
    const screen = (Math.atan2(noon[1] - c[1], noon[0] - c[0]) - Math.atan2(s[1] - c[1], s[0] - c[0])) * D
    const hourAngle = sky.lst - sun.ra
    expect(Math.abs(angDiff(screen, hourAngle))).toBeLessThan(0.05)
  })

  it('the limb, sized to fit, holds every graha inside it', () => {
    const view = { x: 0, y: 0, w: 1000, h: 845 }
    const fit = astrolabeFit(view, 23.44)
    expect(fit.fov).toBeGreaterThan(200)
    // the Moon's declination never passes 28.7°: inside the limb's 90 + ε + 5.5 from the pole
    expect(limbCodec(23.44) - 90).toBeGreaterThan(28.7)
  })
})

describe('the astrolabe in depth', () => {
  it('face-on, every layer lands exactly where it was drawn (perspective cancelled by its scale)', async () => {
    const { planeMatrix, fromPlane, depths, FACE_ON } = await import('../tilt')
    const D = depths(380)
    for (const z of [D.back, D.plate, D.rete, D.limb, D.top]) {
      const m = planeMatrix(FACE_ON, D.P, z)
      for (const [x, y] of [[0, 0], [250, -170], [-380, 300]]) {
        const [sx, sy] = fromPlane(m, x, y)
        expect(Math.abs(sx - x)).toBeLessThan(1e-9)
        expect(Math.abs(sy - y)).toBeLessThan(1e-9)
      }
    }
  })

  it('a pointer on the tilted instrument maps back to the point drawn under it', async () => {
    const { planeMatrix, fromPlane, toPlane, depths, REST_3D } = await import('../tilt')
    const D = depths(380)
    for (const t of [REST_3D, { ax: 55, ay: -40 }, { ax: -10, ay: 30 }]) {
      const m = planeMatrix(t, D.P, D.rete)
      for (const [x, y] of [[0, 0], [200, -150], [-300, 260]]) {
        const [sx, sy] = fromPlane(m, x, y)
        const [bx, by] = toPlane(m, sx, sy)
        expect(Math.abs(bx - x)).toBeLessThan(1e-6)
        expect(Math.abs(by - y)).toBeLessThan(1e-6)
      }
    }
  })

  it('the turning angle read on the tilted rete is the angle drawn (time is read off the plane)', async () => {
    const { planeMatrix, fromPlane, toPlane, depths, REST_3D } = await import('../tilt')
    const D = depths(380)
    const m = planeMatrix(REST_3D, D.P, D.rete)
    for (let a = 0; a < 360; a += 37) {
      const r = (a * Math.PI) / 180
      const [sx, sy] = fromPlane(m, Math.cos(r) * 250, Math.sin(r) * 250)
      const [x, y] = toPlane(m, sx, sy)
      expect(Math.abs(angDiff((Math.atan2(y, x) * 180) / Math.PI, a))).toBeLessThan(1e-6)
    }
  })
})
