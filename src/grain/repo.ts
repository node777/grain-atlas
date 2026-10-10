// The repo as the atlas knows it: every path, its kind, size, stamp, header and links.
//
// Loading order, gentlest first:
//   1. the almanac snapshot shipped with the site (data/almanac.json) -- zero API calls
//   2. one API call for the branch head; if grain has moved on, one more for the live tree
//   3. per-file headers fill in lazily as files are opened (raw host, outside the API quota)

import { createStore } from '@/core/store'
import { headSha, treeAt, commitInfo, fileText, rawUrl, type GitTreeEntry } from '@/github/client'
import { sources, refKey, type SourceRef } from '@/sources'
import { restoreLocalGrain, walk, readLocal, writeLocal, localHandle } from '@/sources/local'
import { bridgeList, bridgeRead, bridgeWrite } from '@/sources/bridge'
import { readVersion, type VersionInfo } from '@/sources/versions'
import { parseHeader, extractLinks, benediction, type TwoRoom } from './header'
import { parseStamp, stampFromPath, type Stamp } from './stamps'
import { FIELD_ROOMS } from './rooms'

export interface Meta {
  title?: string
  stampRaw?: string
  stampField?: string
  room?: TwoRoom
  statusText?: string
  voice?: string
  style?: string
  chapter?: string
  waymark?: string
  links?: string[]
  fieldLinks?: string[]
  benediction?: string
}

export interface Entry {
  path: string
  name: string
  kind: 'dir' | 'file' | 'link' | 'module'
  size: number
  blob?: string
  parent: string
  children: string[]
  files: number           // files beneath (1 for a file)
  meta?: Meta
}

export interface RepoState {
  phase: 'idle' | 'loading' | 'ready' | 'error' | 'needs-permission'
  source: 'snapshot' | 'live' | 'local' | 'bridge' | 'none'
  origin: SourceRef
  writable: boolean
  versionInfo?: VersionInfo
  progress?: number
  note?: string
  owner: string
  repo: string
  ref: string             // sha when known, else branch
  committed?: string
  subject?: string         // the head commit's subject, when known
  entries: Map<string, Entry>
  backlinks: Map<string, string[]>
  version: number         // bumps when entries change (for memoized views)
  error?: string
}

export const repo = createStore<RepoState>({
  phase: 'idle', source: 'none', origin: sources.get().active, writable: false,
  owner: '', repo: '', ref: '', entries: new Map(), backlinks: new Map(), version: 0,
})

interface AlmanacEntry {
  p: string; s: number; b: string; l?: 1; m?: 1; t?: string; st?: string; sf?: string; r?: TwoRoom; sx?: string
  v?: string; y?: string; c?: string; w?: string; k?: number[]; f?: string[]; bn?: string
}
interface Almanac { format: string; repo: string; branch: string; sha: string; committed: string; subject?: string; entries: AlmanacEntry[] }

function buildEntries(files: Array<{ path: string; size: number; blob?: string; kind: Entry['kind']; meta?: Meta }>): Map<string, Entry> {
  const map = new Map<string, Entry>()
  map.set('', { path: '', name: 'grain', kind: 'dir', size: 0, parent: '', children: [], files: 0 })
  const ensureDir = (path: string): Entry => {
    const hit = map.get(path)
    if (hit) return hit
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    const parent = ensureDir(parentPath)
    const e: Entry = { path, name: path.split('/').pop()!, kind: 'dir', size: 0, parent: parentPath, children: [], files: 0 }
    map.set(path, e)
    parent.children.push(path)
    return e
  }
  for (const f of files) {
    const parentPath = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
    const parent = ensureDir(parentPath)
    map.set(f.path, { path: f.path, name: f.path.split('/').pop()!, kind: f.kind, size: f.size, blob: f.blob, parent: parentPath, children: [], files: 1, meta: f.meta })
    parent.children.push(f.path)
  }
  // roll up counts and sizes; sort children dirs first, then by name
  const roll = (e: Entry): void => {
    if (e.kind !== 'dir') return
    let n = 0, s = 0
    for (const c of e.children) {
      const ce = map.get(c)!
      roll(ce)
      n += ce.files
      s += ce.size
    }
    e.files = n
    e.size = s
    e.children.sort((a, b) => {
      const A = map.get(a)!, B = map.get(b)!
      if ((A.kind === 'dir') !== (B.kind === 'dir')) return A.kind === 'dir' ? -1 : 1
      return A.name.localeCompare(B.name)
    })
  }
  roll(map.get('')!)
  return map
}

function backlinksOf(entries: Map<string, Entry>): Map<string, string[]> {
  const back = new Map<string, string[]>()
  for (const e of entries.values()) {
    for (const t of e.meta?.links ?? []) {
      const arr = back.get(t) ?? []
      arr.push(e.path)
      back.set(t, arr)
    }
  }
  return back
}

function fromAlmanac(a: Almanac): Map<string, Entry> {
  const paths = a.entries.map((e) => e.p)
  return buildEntries(a.entries.map((e) => ({
    path: e.p, size: e.s, blob: e.b, kind: e.l ? 'link' : e.m ? 'module' : 'file',
    meta: {
      title: e.t, stampRaw: e.st, stampField: e.sf, room: e.r, statusText: e.sx, voice: e.v, style: e.y,
      chapter: e.c, waymark: e.w, links: e.k?.map((i) => paths[i]), fieldLinks: e.f, benediction: e.bn,
    },
  })))
}

function fromTree(tree: GitTreeEntry[], prior?: Map<string, Entry>): Map<string, Entry> {
  return buildEntries(tree.filter((t) => t.type !== 'tree').map((t) => {
    const old = prior?.get(t.path)
    const sameBlob = old?.blob && t.sha.startsWith(old.blob)
    return {
      path: t.path, size: t.size ?? 0, blob: t.sha.slice(0, 12),
      kind: t.mode === '120000' ? 'link' : t.type === 'commit' ? 'module' : 'file',
      meta: sameBlob ? old?.meta : undefined,
    }
  }))
}

let loadToken = 0

export async function loadRepo(): Promise<void> {
  const origin = sources.get().active
  const token = ++loadToken
  const stale = () => token !== loadToken
  repo.set({
    phase: 'loading', origin, writable: origin.kind !== 'github', error: undefined, note: undefined, versionInfo: undefined,
    owner: origin.kind === 'github' ? origin.owner : '', repo: origin.kind === 'github' ? origin.repo : '',
    ref: origin.kind === 'github' ? origin.branch : '', entries: new Map(), backlinks: new Map(), progress: undefined,
  })
  try {
    if (origin.kind === 'github') await loadGithub(origin, stale)
    else if (origin.kind === 'local') await loadLocal(stale)
    else await loadBridge(stale)
  } catch (e) {
    if (!stale() && repo.get().phase !== 'ready') repo.set({ phase: 'error', error: (e as Error).message })
  }
  if (!stale() && repo.get().phase === 'ready') {
    readVersion(origin).then((v) => { if (!stale()) repo.set({ versionInfo: v }) }).catch(() => undefined)
  }
}

async function loadGithub(origin: Extract<SourceRef, { kind: 'github' }>, stale: () => boolean): Promise<void> {
  const { owner, repo: name, branch } = origin
  let entries: Map<string, Entry> | undefined
  let snapshotSha: string | undefined
  let committed: string | undefined

  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/almanac.json`, { cache: 'no-cache' })
    if (res.ok) {
      const a = (await res.json()) as Almanac
      if (a.repo.toLowerCase() === `${owner}/${name}`.toLowerCase() && a.branch === branch && !stale()) {
        entries = fromAlmanac(a)
        snapshotSha = a.sha
        committed = a.committed
        repo.set({ phase: 'ready', source: 'snapshot', ref: a.sha, committed, subject: a.subject, entries, backlinks: backlinksOf(entries), version: repo.get().version + 1 })
      }
    }
  } catch { /* no snapshot shipped; go live */ }

  try {
    const sha = await headSha(owner, name, branch)
    if (sha !== snapshotSha) {
      const tree = await treeAt(owner, name, sha)
      entries = fromTree(tree, entries)
      const info = await commitInfo(owner, name, sha).catch(() => undefined)
      if (stale()) return
      repo.set({
        phase: 'ready', source: 'live', ref: sha, committed: info?.date ?? committed, subject: info?.message.split('\n')[0], entries,
        backlinks: backlinksOf(entries), version: repo.get().version + 1,
        note: snapshotSha ? 'grain has grown since the snapshot; headers fill in as you read' : undefined,
      })
    }
  } catch (e) {
    if (stale()) return
    if (!entries) repo.set({ phase: 'error', error: (e as Error).message })
    else repo.set({ note: 'Reading from the snapshot; GitHub is resting for now.' })
  }
}

async function loadLocal(stale: () => boolean): Promise<void> {
  const h = await restoreLocalGrain(false)
  if (!h) {
    repo.set({ phase: 'needs-permission', note: 'Reopen your grain folder to let the atlas read it again.' })
    return
  }
  const files = await walk(h, (n) => { if (!stale()) repo.set({ progress: n }) })
  if (stale()) return
  const entries = buildEntries(files.map((f) => ({ path: f.path, size: f.size, kind: 'file' as const })))
  repo.set({ phase: 'ready', source: 'local', ref: 'working tree', entries, backlinks: new Map(), version: repo.get().version + 1, committed: new Date().toISOString() })
}

async function loadBridge(stale: () => boolean): Promise<void> {
  const files = await bridgeList()
  if (stale()) return
  const entries = buildEntries(files.map((f) => ({ path: f.path, size: f.size, kind: 'file' as const })))
  repo.set({ phase: 'ready', source: 'bridge', ref: 'working tree', entries, backlinks: new Map(), version: repo.get().version + 1, committed: new Date().toISOString() })
}

/** Raw text of a file from the active version, without folding anything into the map. */
async function rawText(path: string): Promise<string> {
  const s = repo.get()
  const o = s.origin
  if (o.kind === 'local') {
    const h = localHandle() ?? (await restoreLocalGrain(true))
    if (!h) throw new Error('The grain folder needs permission again.')
    return (await readLocal(h, path)).text()
  }
  if (o.kind === 'bridge') return bridgeRead(path)
  return fileText(s.owner, s.repo, s.ref, path, s.entries.get(path)?.blob)
}

/** Read a file and fold what it says about itself back into the map. */
export async function readFile(path: string): Promise<string> {
  const s = repo.get()
  const e = s.entries.get(path)
  const text = await rawText(path)
  if (e && path.endsWith('.md') && !e.meta?.title) {
    const h = parseHeader(text)
    const links = extractLinks(path, text)
    const known = links.filter((l) => s.entries.has(l))
    e.meta = {
      ...e.meta, title: h.title, stampRaw: h.stampRaw, stampField: h.stampField, room: h.status?.room,
      statusText: h.status?.text, voice: h.fields['Voice'], style: h.fields['Style'], links: known,
      fieldLinks: links.filter((l) => !s.entries.has(l) && !isDir(l)), benediction: benediction(text),
    }
    repo.set({ backlinks: backlinksOf(s.entries), version: s.version + 1 })
  }
  return text
}

export interface Change { path: string; at: number; by: string; bytes: number; created: boolean }
export const changes = createStore<{ list: Change[] }>({ list: [] }, 'grain-atlas:changes')

/**
 * Write a file into the active version (a local folder or the bridge checkout). A GitHub
 * version is read-only here; callers keep a draft instead (see agent drafts).
 */
export async function writeFile(path: string, text: string, by = 'you'): Promise<void> {
  const s = repo.get()
  const o = s.origin
  if (o.kind === 'github') throw new Error('This version is read from GitHub and cannot be written. Open your own grain (a local folder or the bridge) to write.')
  if (o.kind === 'local') {
    const h = localHandle() ?? (await restoreLocalGrain(true))
    if (!h) throw new Error('The grain folder needs permission again.')
    await writeLocal(h, path, text)
  } else {
    await bridgeWrite(path, text)
  }
  const created = !s.entries.has(path)
  if (created) {
    const all = [...s.entries.values()].filter((e) => e.kind !== 'dir').map((e) => ({ path: e.path, size: e.size, kind: e.kind, blob: e.blob, meta: e.meta }))
    all.push({ path, size: text.length, kind: 'file', blob: undefined, meta: undefined })
    const entries = buildEntries(all)
    repo.set({ entries, backlinks: backlinksOf(entries), version: s.version + 1 })
  } else {
    const e = s.entries.get(path)!
    e.size = text.length
    e.meta = undefined
    repo.set({ version: s.version + 1 })
  }
  changes.set((c) => ({ list: [{ path, at: Date.now(), by, bytes: text.length, created }, ...c.list].slice(0, 300) }))
}

const blobUrls = new Map<string, string>()

/** A URL an <img> or <audio> can load for a file in the active version. */
export async function assetUrl(path: string): Promise<string> {
  const s = repo.get()
  if (s.origin.kind === 'github') {
    if (/\.svg$/i.test(path)) return `https://cdn.jsdelivr.net/gh/${s.owner}/${s.repo}@${s.ref}/${path}`
    return rawUrl(s.owner, s.repo, s.ref, path)
  }
  const key = `${refKey(s.origin)}:${path}`
  const hit = blobUrls.get(key)
  if (hit) return hit
  let blob: Blob
  if (s.origin.kind === 'local') {
    const h = localHandle() ?? (await restoreLocalGrain(true))
    if (!h) throw new Error('The grain folder needs permission again.')
    blob = await readLocal(h, path)
    if (/\.svg$/i.test(path)) blob = new Blob([await blob.text()], { type: 'image/svg+xml' })
  } else {
    blob = new Blob([await bridgeRead(path)], { type: /\.svg$/i.test(path) ? 'image/svg+xml' : 'application/octet-stream' })
  }
  const url = URL.createObjectURL(blob)
  blobUrls.set(key, url)
  return url
}

const isDir = (p: string) => repo.get().entries.get(p)?.kind === 'dir'

const stampCache = new Map<string, Stamp | null>()

/** The moment a file names for itself: its filename stamp, else its header stamp. */
export function stampOf(e: Entry | undefined): Stamp | null {
  if (!e) return null
  const key = `${e.path}|${e.meta?.stampRaw ?? ''}`
  if (stampCache.has(key)) return stampCache.get(key)!
  const s = stampFromPath(e.path) ?? (e.meta?.stampRaw ? parseStamp(e.meta.stampRaw, e.meta.stampField === 'version' ? 'version' : 'header') : null)
  stampCache.set(key, s)
  return s
}

/** The commit date stands in when a file names no moment of its own. */
export function sowingStamp(): Stamp | null {
  const c = repo.get().committed
  if (!c) return null
  const d = new Date(c)
  return { raw: c, digits: '', hasTime: true, zone: 'UTC', zoneLabel: 'UTC', zoneExplicit: true, date: d, source: 'commit' }
}

export const isFieldRoom = (path: string) =>
  FIELD_ROOMS.some((f) => path === f || path.startsWith(f + '/'))

export const lookup = (path: string) => repo.get().entries.get(path)
