// Asks for the map's atlas without freezing the page: the build (about a second for grain's
// nine thousand files, most of it routing rivers) runs in a worker, once per tree. Where workers
// are unavailable, or the worker fails, it is built here instead, as before.

import { useEffect, useState } from 'react'
import type { Entry } from '@/grain/repo'
import type { World } from './layout'
import { buildAtlas, type Atlas } from './atlas'
import { unpackAtlas } from './atlasWire'
import type { AtlasReply, AtlasRequest } from './atlas.worker'

const built = new WeakMap<World, Atlas>()
const pending = new WeakMap<World, Promise<Atlas>>()
let worker: Worker | null | undefined
let nextId = 0
const waiting = new Map<number, (reply: AtlasReply) => void>()

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    worker = new Worker(new URL('./atlas.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<AtlasReply>) => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id) }
    worker.onerror = () => { for (const done of waiting.values()) done({ id: -1, error: 'the atlas worker failed' }); waiting.clear(); worker = null }
  } catch {
    worker = null
  }
  return worker
}

/** The atlas for a world, built once (in a worker when it can be). */
export function atlasFor(world: World, entries: Map<string, Entry>): Promise<Atlas> {
  const done = built.get(world)
  if (done) return Promise.resolve(done)
  let p = pending.get(world)
  if (p) return p
  const keep = (at: Atlas) => { built.set(world, at); return at }
  const here = () => keep(buildAtlas(world, entries))
  const w = getWorker()
  p = !w ? Promise.resolve().then(here) : new Promise<Atlas>((resolve) => {
    const id = ++nextId
    waiting.set(id, (reply) => {
      const at = 'wire' in reply ? unpackAtlas(reply.wire, world) : null
      if ('error' in reply) console.warn('Building the map here instead:', reply.error)
      resolve(at ? keep(at) : here())
    })
    w.postMessage({ id, entries } satisfies AtlasRequest)
  })
  pending.set(world, p)
  return p
}

/** The atlas once it is ready (null until then, or when not wanted). */
export function useAtlas(world: World | null, entries: Map<string, Entry>, wanted: boolean): Atlas | null {
  const [, ready] = useState(0)
  const at = world && wanted ? built.get(world) ?? null : null
  useEffect(() => {
    if (!world || !wanted || built.has(world)) return
    let live = true
    atlasFor(world, entries).then(() => { if (live) ready((n) => n + 1) })
    return () => { live = false }
  }, [world, wanted])
  return at
}
