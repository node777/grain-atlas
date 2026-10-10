// The regions of the map, after grain's own MAP.md: seven rooms, the module ring that rings the
// language, the siloed study rooms, and the field rooms the public seed leaves behind.
// A new top-level folder that no region claims lands in "Uncharted", so the map grows with grain.

import type { ElementRow } from '@/core/settings'

export interface Region {
  id: string
  name: string
  motto: string           // plain line from MAP.md
  element: ElementRow     // colours the region on the map
  rooms: string[]         // top-level folders ('' = the root files)
  ring: number            // 0 centre, 1 inner, 2 outer, 3 far
  angle: number           // degrees on the world map, 0 = east, counter-clockwise
}

export const REGIONS: Region[] = [
  { id: 'front', name: 'The Front Door', motto: 'What orients a newcomer before they dive', element: 'earth',
    rooms: ['', 'assets'], ring: 0, angle: 0 },
  { id: 'law', name: 'The Law', motto: 'The disciplines kept on purpose', element: 'air',
    rooms: ['context', '.claude', '.cursor'], ring: 1, angle: 100 },
  { id: 'why', name: 'The Why', motto: 'The reasons beneath the work', element: 'aether',
    rooms: ['foundations'], ring: 1, angle: 50 },
  { id: 'language', name: 'The Language', motto: 'Glow, and the bounded Rye it lowers to', element: 'fire',
    rooms: ['glow', 'src', 'rye', 'rishi', 'brix', 'programming', 'encoding'], ring: 1, angle: 335 },
  { id: 'ring', name: 'The Module Ring', motto: 'The machinery, each home with its own witnesses', element: 'fire',
    rooms: ['mantra', 'comlink', 'tally', 'caravan', 'aurora', 'pond', 'mand', 'brushstroke', 'ember', 'kumara',
      'vault', 'settlement', 'mandate', 'image', 'lotus', 'mikrophone', 'constel', 'scribe', 'sundial',
      'granary', 'mandi', 'amphora', 'mycelium', 'lantern', 'lattice', 'scribble', 'cellar', 'dimeroll',
      'skate', 'surf', 'crypto', 'basin', 'bat', 'mitra', 'arbor', 'spellbook', 'biochemistry'],
    ring: 2, angle: 300 },
  { id: 'teaching', name: 'The Teaching', motto: 'Pages that teach only what runs', element: 'water',
    rooms: ['docs', 'docs-geode', 'manual', 'nixos-guide', 'pleac'], ring: 1, angle: 160 },
  { id: 'workrooms', name: 'The Workrooms', motto: 'Where the work is shaped and recorded -- mind the sawdust', element: 'earth',
    rooms: ['active-designing', 'active-development', 'waymarks', 'tools', 'press'], ring: 2, angle: 215 },
  { id: 'reading', name: 'The Reading Room', motto: 'The world, studied whole with thanks', element: 'water',
    rooms: ['external-research', 'gratitude'], ring: 2, angle: 130 },
  { id: 'study', name: 'The Study Rooms', motto: 'Self-contained, and worth reading if the code vanished', element: 'aether',
    rooms: ['classical-vedic-astrology', 'cubist-bhakti-astrology', 'shastra', 'risala', 'open', 'fleet',
      'frontier', 'ember-voices'], ring: 2, angle: 60 },
  { id: 'uncharted', name: 'Uncharted', motto: 'Rooms grown since this map was drawn', element: 'air',
    rooms: [], ring: 3, angle: 255 },
]

/** Rooms MAP.md names that live only in the maintainer's field, not in the public seed. */
export const FIELD_ROOMS = [
  'construction', 'session-logs', 'counsel', 'saga', 'expanding-prompts', 'linengrow', 'kyri',
  'keys', 'vendor', 'active-reviving', 'kyri-resins', 'upstream', 'rye-learning-process',
  'work-in-progress', 'SOURCE.md', 'template-manifest.kyri', 'context/LEXICON.md',
]

export function regionOf(path: string): Region {
  const top = path.includes('/') ? path.split('/')[0] : ''
  const topIsFile = !path.includes('/')
  for (const r of REGIONS) if (r.rooms.includes(topIsFile ? '' : top)) return r
  return REGIONS[REGIONS.length - 1]
}

export const regionById = (id: string) => REGIONS.find((r) => r.id === id)
