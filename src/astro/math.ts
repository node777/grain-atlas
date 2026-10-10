// Small angle helpers shared by every astro module. Degrees everywhere unless named *Rad.

export const DEG = Math.PI / 180
export const RAD = 180 / Math.PI

export const norm360 = (x: number): number => ((x % 360) + 360) % 360
export const norm180 = (x: number): number => {
  const n = norm360(x)
  return n > 180 ? n - 360 : n
}

export const sin = (d: number) => Math.sin(d * DEG)
export const cos = (d: number) => Math.cos(d * DEG)
export const tan = (d: number) => Math.tan(d * DEG)
export const atan2 = (y: number, x: number) => Math.atan2(y, x) * RAD
export const asin = (x: number) => Math.asin(Math.max(-1, Math.min(1, x))) * RAD

/** Julian Day (UT) of a JS Date. */
export const jdOf = (date: Date): number => date.getTime() / 86400000 + 2440587.5
export const dateOfJd = (jd: number): Date => new Date((jd - 2440587.5) * 86400000)

/** Julian centuries from J2000.0 for a JD. */
export const centuries = (jd: number): number => (jd - 2451545.0) / 36525

/** Format degrees within a sign (or any arc) as 12°34'. */
export function dms(deg: number, withSeconds = false): string {
  const sign = deg < 0 ? '-' : ''
  let a = Math.abs(deg)
  let d = Math.floor(a)
  a = (a - d) * 60
  let m = Math.floor(a)
  let s = Math.round((a - m) * 60)
  if (s === 60) { s = 0; m += 1 }
  if (m === 60) { m = 0; d += 1 }
  const mm = String(m).padStart(2, '0')
  return withSeconds
    ? `${sign}${d}°${mm}′${String(s).padStart(2, '0')}″`
    : `${sign}${d}°${mm}′`
}
