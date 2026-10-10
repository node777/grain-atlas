// One-clock stamps: grain names its moments YYYYMMDD.HHMMSS (version form) and
// YYYYMMDD-HHMMSS_sprig (filename form). "Later is always larger."
// See context/specs/20260627-102012_one-clock-naming-law.md in grain.
//
// A stamp is wall-clock time on the maintainer's host, and the host's zone changed over the
// seasons. CLOCK_SEASONS records those seatings so a stamp can become a real instant.
// An explicit zone word next to a stamp (UDT, UTC, EDT, EST, PDT, PST) always wins.

export interface ClockSeason {
  from: string            // first stamp governed (inclusive), YYYYMMDDHHMMSS
  zone: string            // IANA zone
  label: string
  source: string          // grain path that seats it
}

export const CLOCK_SEASONS: ClockSeason[] = [
  { from: '00000000000000', zone: 'UTC', label: 'UDT (UTC)', source: 'context/specs/20260627-102012_one-clock-naming-law.md' },
  { from: '20260713201910', zone: 'America/Los_Angeles', label: 'Pacific', source: 'context/specs/20260713-201910_pacific-time-local-clone-convention.md' },
  { from: '20260717003132', zone: 'America/New_York', label: 'Eastern', source: 'context/specs/20260717-003132_eastern-time-framework-host-convention.md' },
  { from: '20260720232932', zone: 'UTC', label: 'UDT (UTC)', source: 'context/specs/20260720-232932_udt-framework-host-convention.md' },
  { from: '20260722125845', zone: 'America/New_York', label: 'Eastern', source: 'context/specs/20260722-125845_edt-framework-host-convention.md' },
]

const ZONE_WORDS: Record<string, string> = {
  UDT: 'UTC', UTC: 'UTC', GMT: 'UTC', Z: 'UTC',
  EDT: 'America/New_York', EST: 'America/New_York', ET: 'America/New_York',
  PDT: 'America/Los_Angeles', PST: 'America/Los_Angeles', PT: 'America/Los_Angeles',
  IST: 'Asia/Kolkata',
}

export type StampSource = 'filename' | 'header' | 'inline' | 'commit' | 'version'

export interface Stamp {
  raw: string             // as written, e.g. "20260823.034321"
  digits: string          // YYYYMMDDHHMMSS (time zero-filled when absent)
  hasTime: boolean
  zone: string            // IANA zone used to read it
  zoneLabel: string
  zoneExplicit: boolean
  date: Date              // the instant
  source: StampSource
}

/** Matches YYYYMMDD.HHMMSS, YYYYMMDD-HHMMSS, YYYYMMDD_HHMMSS or a bare YYYYMMDD. */
export const STAMP_RE = /(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[.\-_T]([01]\d|2[0-3])([0-5]\d)([0-5]\d))?(?!\d)/g

export function seasonFor(digits: string): ClockSeason {
  let s = CLOCK_SEASONS[0]
  for (const c of CLOCK_SEASONS) if (digits >= c.from) s = c
  return s
}

/** Offset in minutes of an IANA zone at an instant (positive east of UTC). */
const formatters = new Map<string, Intl.DateTimeFormat>()
export function zoneOffsetMinutes(zone: string, at: Date): number {
  if (zone === 'UTC') return 0
  let dtf = formatters.get(zone)
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    formatters.set(zone, dtf)
  }
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]))
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return Math.round((asUtc - at.getTime()) / 60000)
}

/** Interpret wall-clock fields in an IANA zone as an instant. */
export function wallToInstant(y: number, mo: number, d: number, h: number, mi: number, s: number, zone: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  let off = zoneOffsetMinutes(zone, new Date(guess))
  let t = guess - off * 60000
  const off2 = zoneOffsetMinutes(zone, new Date(t))
  if (off2 !== off) { off = off2; t = guess - off * 60000 }
  return new Date(t)
}

export function parseStamp(text: string, source: StampSource, zoneHint?: string): Stamp | null {
  STAMP_RE.lastIndex = 0
  const m = STAMP_RE.exec(text)
  if (!m) return null
  const [raw, y, mo, d, h, mi, s] = m
  const hasTime = h !== undefined
  const digits = `${y}${mo}${d}${hasTime ? `${h}${mi}${s}` : '000000'}`
  // look for a zone word just after the stamp, e.g. "20260627.102012 UDT" or "(EDT)"
  const after = text.slice((m.index ?? 0) + raw.length, (m.index ?? 0) + raw.length + 8)
  const zm = /^[\s`(]*\b(UDT|UTC|GMT|EDT|EST|PDT|PST|IST)\b/.exec(after)
  const explicit = zm ? ZONE_WORDS[zm[1]] : zoneHint ? ZONE_WORDS[zoneHint] : undefined
  const season = seasonFor(digits)
  const zone = explicit ?? season.zone
  const date = wallToInstant(+y, +mo, +d, hasTime ? +h : 12, hasTime ? +mi : 0, hasTime ? +s : 0, zone)
  return {
    raw, digits, hasTime, zone,
    zoneLabel: explicit ? (zm?.[1] ?? zoneHint ?? zone) : season.label,
    zoneExplicit: !!explicit,
    date, source,
  }
}

/** All stamps in a run of text (for inline linking in the reader). */
export function findStamps(text: string): Array<{ index: number; length: number; raw: string }> {
  const out: Array<{ index: number; length: number; raw: string }> = []
  STAMP_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = STAMP_RE.exec(text))) out.push({ index: m.index, length: m[0].length, raw: m[0] })
  return out
}

/** The one-clock form of an instant read on a given zone's wall. */
export function toStamp(date: Date, zone = 'America/New_York'): string {
  const off = zoneOffsetMinutes(zone, date)
  const w = new Date(date.getTime() + off * 60000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${w.getUTCFullYear()}${p(w.getUTCMonth() + 1)}${p(w.getUTCDate())}.${p(w.getUTCHours())}${p(w.getUTCMinutes())}${p(w.getUTCSeconds())}`
}

/** Birth stamp of a path from its filename (e.g. foundations/20260823-034321_the-return.md). */
export function stampFromPath(path: string): Stamp | null {
  const base = path.split('/').pop() ?? path
  return parseStamp(base, 'filename') ?? null
}

/** Humanized sprig (the words after the stamp) for a stamped filename. */
export function sprigOf(path: string): string {
  const base = (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '')
  return base.replace(/^\d{8}(?:[-_.]\d{6})?[_-]?/, '').replace(/[-_]+/g, ' ').trim() || base
}
