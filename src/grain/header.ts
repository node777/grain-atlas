// Reads the header a grain page wears under its title:
//
//   # The Return That Feeds Everyone
//   **Language:** EN
//   **Stamp:** `20260823.034321` - **Voice:** Kyri
//   **Status:** Mixed -- the method is checkable, the horizon is vision
//
// and the internal links a page makes. Self-contained (no imports) so the build-time almanac
// script can import this file directly with Node's type stripping.

export type TwoRoom = 'checkable' | 'vision' | 'mixed' | 'living' | 'research' | 'landed' | 'proposed' | 'other'

export interface PageHeader {
  title?: string
  fields: Record<string, string>
  status?: { text: string; room: TwoRoom }
  stampRaw?: string           // first stamp found in Stamp / Last updated / Version / Date
  stampField?: string
}

const FIELD_RE = /\*\*([A-Z][A-Za-z ']{1,30}):\*\*\s*/g

export function parseHeader(text: string, maxLines = 40): PageHeader {
  const lines = text.split(/\r?\n/, maxLines)
  const header: PageHeader = { fields: {} }
  for (const line of lines) {
    if (!header.title) {
      const t = /^#\s+(.+?)\s*#*$/.exec(line)
      if (t) { header.title = t[1].replace(/`/g, ''); continue }
    }
    if (!line.includes(':**')) continue
    // A line may carry several fields: **A:** x - **B:** y
    const marks: Array<{ key: string; start: number; end: number }> = []
    FIELD_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = FIELD_RE.exec(line))) marks.push({ key: m[1].trim(), start: m.index, end: m.index + m[0].length })
    marks.forEach((mk, i) => {
      const until = i + 1 < marks.length ? marks[i + 1].start : line.length
      const value = line.slice(mk.end, until).replace(/\s+[-·|]\s*$/, '').trim()
      if (!(mk.key in header.fields)) header.fields[mk.key] = value
    })
  }
  const status = header.fields['Status'] ?? header.fields['Room']
  if (status) header.status = { text: status, room: roomOf(status) }
  for (const key of ['Stamp', 'Last updated', 'Version', 'Date', 'Stamp of founding']) {
    const v = header.fields[key]
    const s = v && /\b20\d{6}(?:[.\-_]\d{6})?\b/.exec(v)
    if (s) { header.stampRaw = s[0]; header.stampField = key; break }
  }
  return header
}

export function roomOf(status: string): TwoRoom {
  const s = status.toLowerCase()
  const first = s.replace(/[*`_]/g, '').trim().split(/[\s\-—–:;,(]+/)[0]
  const order: TwoRoom[] = ['checkable', 'vision', 'mixed', 'living', 'research', 'landed', 'proposed']
  if (order.includes(first as TwoRoom)) return first as TwoRoom
  for (const r of ['mixed', 'checkable', 'vision'] as TwoRoom[]) if (s.includes(r)) return r
  if (s.includes('adopted') || s.includes('seated')) return 'landed'
  if (s.includes('design')) return 'proposed'
  return 'other'
}

/** Resolve a relative link target against the page's own directory. */
export function resolveLink(from: string, target: string): string | null {
  if (/^[a-z]+:/i.test(target) || target.startsWith('#') || target.startsWith('//')) return null
  const clean = target.split('#')[0].split('?')[0]
  if (!clean) return null
  const base = clean.startsWith('/') ? [] : from.split('/').slice(0, -1)
  for (const part of clean.replace(/^\//, '').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') base.pop()
    else base.push(part)
  }
  return base.join('/').replace(/\/$/, '')
}

const LINK_RE = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const CODE_PATH_RE = /`((?:[a-z0-9._-]+\/)+[a-z0-9._-]+\.(?:md|rye|rish|glow|kyri|brix|sh))`/gi

/** Internal targets a page points at: markdown links, plus backticked repo paths. */
export function extractLinks(from: string, text: string): string[] {
  const out = new Set<string>()
  LINK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = LINK_RE.exec(text))) {
    const r = resolveLink(from, m[1])
    if (r) out.add(r)
  }
  CODE_PATH_RE.lastIndex = 0
  while ((m = CODE_PATH_RE.exec(text))) out.add(m[1].replace(/^\.\//, ''))
  out.delete(from)
  return [...out]
}

/** The closing benediction, if the page ends with one ("May ..."). */
export function benediction(text: string): string | undefined {
  const tail = text.trimEnd().split(/\r?\n/).slice(-6).reverse()
  for (const line of tail) {
    const l = line.replace(/^[*_\s]+|[*_\s]+$/g, '')
    if (/^May\b/.test(l)) return l
  }
  return undefined
}

/** The word to show for a page's room: the Two Rooms name, or the page's own first word. */
export function roomWord(room: TwoRoom | undefined, status?: string): string {
  if (room && room !== 'other') return room
  const w = (status ?? '').replace(/[*`_]/g, '').trim().split(/[\s\-—–:;,(.]+/)[0]?.toLowerCase()
  return w && w.length <= 16 ? w : 'unmarked'
}
