// What an agent knows before it reads anything: a compact orientation to grain (stable, so it is
// cached across requests) and a short note about where the reader is standing (per turn).

import { repo } from '@/grain/repo'
import { REGIONS } from '@/grain/rooms'
import { JOURNEYS } from '@/grain/quests'
import { getRoute } from '@/core/router'
import { toStamp } from '@/grain/stamps'

let seedCache: { key: string; text: string } | null = null

/** grain's seed context: stable for a given version of the tree. */
export function seedContext(): string {
  const r = repo.get()
  const key = `${r.ref}:${r.entries.size}:${r.versionInfo?.name ?? ''}`
  if (seedCache?.key === key) return seedCache.text
  const e = r.entries
  const count = (room: string) => e.get(room)?.files ?? 0
  const regions = REGIONS.map((g) => {
    const rooms = g.rooms.filter((x) => x && e.has(x)).map((x) => `${x} (${count(x)})`)
    return `- ${g.name}: ${g.motto}. ${rooms.join(', ') || 'the root files'}`
  }).join('\n')
  const starts = JOURNEYS.map((j) => `- ${j.title}: ${j.stops.map((s) => s.path).join(' -> ')}`).join('\n')
  const v = r.versionInfo
  const text = `# grain, in brief

grain is an operating system and civic application built in the open. Its tree is organised into rooms
(top-level folders) that MAP.md groups into regions. You are working on this version:
${v ? `${v.name} -- ${v.detail}` : r.origin.kind === 'github' ? `${r.owner}/${r.repo}` : 'a local checkout'}${r.writable ? ' (writable: write_page writes to disk)' : ' (read-only: writes become drafts for review)'}.
The tree has ${(e.get('')?.files ?? 0).toLocaleString()} files.

## Regions and rooms (file counts)
${regions}

## Where grain asks a newcomer to start
${starts}

## Habits of the tree
- Moments are named by one-clock stamps: YYYYMMDD.HHMMSS (version form) and YYYYMMDD-HHMMSS_sprig.md
  (filename form), read on the maintainer's wall clock (America/New_York today). Use stamp_now for new ones.
- A markdown page opens with a title and header lines such as **Status:**, **Stamp:**, **Voice:**, **Style:**.
  Status names its room: checkable (a witness proves it), vision (designed, not built), or mixed.
- grain's own languages: Rye (.rye, bounded systems language, Zig syntax), Rishi (.rish, the shell),
  Glow (.glow, Hoon-like runes), Kyri and Brix (.kyri/.brix, line notations: key then value).
- A witness is a small program that prints a line starting GREEN when its promise holds.
- Links to SOURCE.md, construction/, session-logs/ and context/LEXICON.md point into the maintainer's
  private field and are absent from the public seed.
- grain's ethos: bound everything, prove claims with witnesses, write warmly and plainly, build nothing
  that destroys. Safety first, performance second, joy third.

## How to work
- Orient with map_tree and search_tree before reading; read narrowly with read_page ranges.
- Send hands (send_hand) for reading-heavy or parallel work so your own context stays light.
- Bind durable findings as sheaves; recall them instead of re-reading.
- Say what you changed with paths. Mark designs that are not yet proven as vision.
`
  seedCache = { key, text }
  return text
}

/** Where the reader stands right now (route, open page), for the opening of a task. */
export function focusNote(): string {
  const route = getRoute()
  const open = route.view === 'read' ? route.path : route.params.open
  const bits = [`The reader is in the ${route.view || 'fields'} view.`]
  if (open) bits.push(`They have ${open} open.`)
  if (route.view === 'ledger' && route.path) bits.push(`The ledger shows ${route.path}.`)
  if (route.view === 'sky' && route.params.t) bits.push(`The sky shows ${route.params.t}${route.params.from ? ` (the moment of ${route.params.from})` : ''}.`)
  bits.push(`Now: ${toStamp(new Date())} on grain's clock.`)
  return bits.join(' ')
}
