// A tiny observable store. Each feature keeps its own store; React reads with useStore.

import { useRef, useSyncExternalStore } from 'react'

export interface Store<T> {
  get(): T
  set(next: Partial<T> | ((prev: T) => Partial<T>)): void
  subscribe(fn: () => void): () => void
}

export function createStore<T extends object>(initial: T, persistKey?: string): Store<T> {
  let state = initial
  if (persistKey) {
    try {
      const raw = localStorage.getItem(persistKey)
      if (raw) state = { ...initial, ...JSON.parse(raw) }
    } catch { /* storage may be unavailable; run from defaults */ }
  }
  const subs = new Set<() => void>()
  return {
    get: () => state,
    set(next) {
      const patch = typeof next === 'function' ? next(state) : next
      state = { ...state, ...patch }
      if (persistKey) {
        try { localStorage.setItem(persistKey, JSON.stringify(state)) } catch { /* ignore */ }
      }
      subs.forEach((f) => f())
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false
  return true
}

/** Read a store, optionally through a selector. Selections are cached and compared shallowly,
 *  so a selector may build a small object without causing a render loop. */
export function useStore<T extends object, S = T>(store: Store<T>, select?: (s: T) => S): S {
  const cache = useRef<{ state: T; sel: S } | null>(null)
  const getSnapshot = (): S => {
    const state = store.get()
    if (!select) return state as unknown as S
    const c = cache.current
    if (c && c.state === state) return c.sel
    const next = select(state)
    if (c && shallowEqual(c.sel, next)) {
      cache.current = { state, sel: c.sel }
      return c.sel
    }
    cache.current = { state, sel: next }
    return next
  }
  return useSyncExternalStore(store.subscribe, getSnapshot)
}
