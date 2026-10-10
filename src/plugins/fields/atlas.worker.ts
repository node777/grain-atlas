// Builds the map off the main thread. The layout is worked out again here from the same tree
// (it is a pure function of the paths, so it comes out the same), the atlas is built on it, and
// the result goes back packed (atlasWire.ts) for the page to tie to its own world.

import type { Entry } from '@/grain/repo'
import { layoutWorld } from './layout'
import { buildAtlas } from './atlas'
import { packAtlas, type AtlasWire } from './atlasWire'

export interface AtlasRequest { id: number; entries: Map<string, Entry> }
export type AtlasReply = { id: number; wire: AtlasWire } | { id: number; error: string }

self.onmessage = (e: MessageEvent<AtlasRequest>) => {
  const { id, entries } = e.data
  try {
    const reply: AtlasReply = { id, wire: packAtlas(buildAtlas(layoutWorld(entries), entries)) }
    self.postMessage(reply)
  } catch (err) {
    self.postMessage({ id, error: String((err as Error)?.stack ?? err) } satisfies AtlasReply)
  }
}
