// Sheaves: the agents' long memory. A sheaf is one bound bundle of what was learned -- a fact, a
// decision, a plan, a summary of a threshed thread -- kept small and findable so an agent can
// begin a fresh, light thread and still know what matters. Recall is by word overlap, weighted
// toward recent and often-used sheaves. Kept in this browser; exportable as a .kyri page.

import { createStore } from '@/core/store'

export type SheafKind = 'fact' | 'decision' | 'plan' | 'summary' | 'note' | 'preference'

export interface Sheaf {
  id: string
  kind: SheafKind
  text: string
  tags: string[]
  paths: string[]
  voice: string
  at: number
  uses: number
}

const MAX = 2000

export const sheaves = createStore<{ list: Sheaf[] }>({ list: [] }, 'grain-atlas:sheaves')

export function bind(s: Omit<Sheaf, 'id' | 'at' | 'uses'>): Sheaf {
  const sheaf: Sheaf = { ...s, id: `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), uses: 0 }
  sheaves.set((st) => ({ list: [sheaf, ...st.list].slice(0, MAX) }))
  return sheaf
}

export function unbind(id: string): void {
  sheaves.set((st) => ({ list: st.list.filter((x) => x.id !== id) }))
}

const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9_./-]+/).filter((w) => w.length > 2))

/** The k sheaves most relevant to a query (and optionally a voice). */
export function recall(query: string, k = 8, voice?: string): Sheaf[] {
  const q = words(query)
  const now = Date.now()
  const scored = sheaves.get().list.map((s) => {
    const w = words(`${s.text} ${s.tags.join(' ')} ${s.paths.join(' ')}`)
    let overlap = 0
    for (const x of q) if (w.has(x)) overlap++
    const ageDays = (now - s.at) / 86400000
    const score = overlap * 2 + Math.log1p(s.uses) * 0.5 + 1 / (1 + ageDays) + (voice && s.voice === voice ? 0.5 : 0)
      + (s.kind === 'preference' || s.kind === 'decision' ? 0.4 : 0)
    return { s, score, overlap }
  })
  const hits = scored.filter((x) => x.overlap > 0 || x.s.kind === 'preference').sort((a, b) => b.score - a.score).slice(0, k).map((x) => x.s)
  if (hits.length) {
    const ids = new Set(hits.map((h) => h.id))
    sheaves.set((st) => ({ list: st.list.map((x) => (ids.has(x.id) ? { ...x, uses: x.uses + 1 } : x)) }))
  }
  return hits
}

export function sheavesAsKyri(list: Sheaf[]): string {
  const lines = ['# atlas sheaves -- memory bound by the agents of the Grain Atlas', 'format atlas-sheaves-v1']
  for (const s of list) {
    lines.push('', `sheaf ${s.id}`, `kind ${s.kind}`, `voice ${s.voice}`, `at ${new Date(s.at).toISOString()}`)
    if (s.tags.length) lines.push(`tags ${s.tags.join(' ')}`)
    for (const p of s.paths) lines.push(`path ${p}`)
    for (const l of s.text.split('\n')) lines.push(`text ${l}`)
  }
  return lines.join('\n') + '\n'
}
