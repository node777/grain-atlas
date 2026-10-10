// Drafts: what an agent wrote while reading a version it cannot write (a GitHub repository).
// They wait here to be reviewed, copied, downloaded, or written into your own grain later.

import { createStore } from '@/core/store'

export interface Draft { path: string; text: string; by: string; at: number; note?: string; base?: string }

export const drafts = createStore<{ list: Draft[] }>({ list: [] }, 'grain-atlas:drafts')

export function keepDraft(d: Omit<Draft, 'at'>): void {
  drafts.set((s) => ({ list: [{ ...d, at: Date.now() }, ...s.list.filter((x) => x.path !== d.path)].slice(0, 200) }))
}

export function dropDraft(path: string): void {
  drafts.set((s) => ({ list: s.list.filter((x) => x.path !== path) }))
}

export const draftFor = (path: string) => drafts.get().list.find((d) => d.path === path)
