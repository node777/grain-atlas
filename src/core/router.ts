// Hash routes, so the static site deep-links anywhere without a server:
//   #/<view>/<path...>?key=value
// e.g. #/fields, #/ledger/foundations, #/read/MAP.md, #/sky?t=2026-08-23T07:43:21Z&from=MAP.md

import { useSyncExternalStore } from 'react'

export interface Route {
  view: string
  path: string
  params: Record<string, string>
}

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '')
  const [pathPart, query = ''] = h.split('?')
  const segs = pathPart.split('/').filter(Boolean).map(decodeURIComponent)
  const params: Record<string, string> = {}
  new URLSearchParams(query).forEach((v, k) => { params[k] = v })
  return { view: segs[0] ?? '', path: segs.slice(1).join('/'), params }
}

export function hrefFor(view: string, path = '', params: Record<string, string | undefined> = {}): string {
  const p = path ? '/' + path.split('/').map(encodeURIComponent).join('/') : ''
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, v)
  const qs = q.toString()
  return `#/${view}${p}${qs ? '?' + qs : ''}`
}

export function navigate(view: string, path = '', params: Record<string, string | undefined> = {}): void {
  location.hash = hrefFor(view, path, params)
}

let current = parseHash(typeof location !== 'undefined' ? location.hash : '')
const subs = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    current = parseHash(location.hash)
    subs.forEach((f) => f())
  })
}

export const getRoute = () => current
export function useRoute(): Route {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => current)
}
