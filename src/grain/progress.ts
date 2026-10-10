// What this reader has walked: seeds planted by reading, journeys harvested. Kept locally.

import { createStore } from '@/core/store'
import { JOURNEYS } from './quests'

export interface Progress {
  seeds: Record<string, number>       // path -> first read (ms)
  harvested: Record<string, number>   // journey id -> completed (ms)
  activeJourney?: string
}

export const progress = createStore<Progress>({ seeds: {}, harvested: {} }, 'grain-atlas:progress')

export function plant(path: string): { newSeed: boolean; harvested?: string } {
  const p = progress.get()
  if (p.seeds[path]) return { newSeed: false }
  const seeds = { ...p.seeds, [path]: Date.now() }
  const harvested = { ...p.harvested }
  let done: string | undefined
  for (const j of JOURNEYS) {
    if (harvested[j.id]) continue
    if (j.stops.every((s) => seeds[s.path])) { harvested[j.id] = Date.now(); done = j.id }
  }
  progress.set({ seeds, harvested })
  return { newSeed: true, harvested: done }
}

export const journeyProgress = (id: string, seeds = progress.get().seeds) => {
  const j = JOURNEYS.find((x) => x.id === id)
  if (!j) return { done: 0, total: 0 }
  return { done: j.stops.filter((s) => seeds[s.path]).length, total: j.stops.length }
}
