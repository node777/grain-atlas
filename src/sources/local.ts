// A grain on your own disk, opened through the browser's File System Access API (Chromium
// browsers). The handle is kept in IndexedDB so the folder can be reopened after a reload;
// the browser asks again for permission when it needs to.

import { kvGet, kvSet } from '@/github/kv'

// Minimal typings: the File System Access API is not in TypeScript's DOM lib everywhere.
interface FSHandle { kind: 'file' | 'directory'; name: string }
export interface FSFileHandle extends FSHandle {
  kind: 'file'
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>
}
export interface FSDirHandle extends FSHandle {
  kind: 'directory'
  values(): AsyncIterable<FSFileHandle | FSDirHandle>
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FSDirHandle>
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FSFileHandle>
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

declare global {
  interface Window { showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FSDirHandle> }
}

export const localSupported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

const HANDLE_KEY = 'local-grain-handle'
const SKIP = new Set(['.git', 'node_modules', '.zig-cache', 'zig-out', '.cache', 'dist', 'target'])

let current: FSDirHandle | null = null

export async function pickLocalGrain(): Promise<FSDirHandle> {
  if (!window.showDirectoryPicker) throw new Error('This browser cannot open folders. Chrome, Edge, Arc and Brave can.')
  const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'grain' })
  current = h
  await kvSet(HANDLE_KEY, h)
  return h
}

export async function restoreLocalGrain(interactive = false): Promise<FSDirHandle | null> {
  if (current) return current
  const h = await kvGet<FSDirHandle>(HANDLE_KEY)
  if (!h) return null
  const state = await h.queryPermission?.({ mode: 'readwrite' })
  if (state === 'granted') { current = h; return h }
  if (interactive) {
    const asked = await h.requestPermission?.({ mode: 'readwrite' })
    if (asked === 'granted') { current = h; return h }
  }
  return null
}

export const localHandle = () => current

export interface LocalFile { path: string; size: number; kind: 'file' }

/** Walk the folder, skipping build and VCS directories. Bounded to 40,000 files. */
export async function walk(root: FSDirHandle, onProgress?: (n: number) => void): Promise<LocalFile[]> {
  const out: LocalFile[] = []
  const stack: Array<[FSDirHandle, string]> = [[root, '']]
  while (stack.length && out.length < 40_000) {
    const [dir, prefix] = stack.pop()!
    for await (const entry of dir.values()) {
      if (entry.kind === 'directory') {
        if (!SKIP.has(entry.name)) stack.push([entry, prefix + entry.name + '/'])
      } else {
        const f = await entry.getFile()
        out.push({ path: prefix + entry.name, size: f.size, kind: 'file' })
        if (out.length % 500 === 0) onProgress?.(out.length)
      }
    }
  }
  return out
}

async function resolveDir(root: FSDirHandle, parts: string[], create: boolean): Promise<FSDirHandle> {
  let d = root
  for (const p of parts) d = await d.getDirectoryHandle(p, { create })
  return d
}

function safeParts(path: string): string[] {
  const parts = path.split('/').filter((p) => p && p !== '.')
  if (parts.some((p) => p === '..')) throw new Error(`refusing a path that climbs out of the tree: ${path}`)
  return parts
}

export async function readLocal(root: FSDirHandle, path: string): Promise<File> {
  const parts = safeParts(path)
  const dir = await resolveDir(root, parts.slice(0, -1), false)
  const fh = await dir.getFileHandle(parts[parts.length - 1])
  return fh.getFile()
}

export async function writeLocal(root: FSDirHandle, path: string, text: string): Promise<void> {
  const parts = safeParts(path)
  const dir = await resolveDir(root, parts.slice(0, -1), true)
  const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true })
  const w = await fh.createWritable()
  await w.write(text)
  await w.close()
}

/** Read a file inside .git without walking it (HEAD, logs/HEAD, config). */
export async function readGitFile(root: FSDirHandle, path: string): Promise<string | null> {
  try {
    const git = await root.getDirectoryHandle('.git')
    const parts = safeParts(path)
    const dir = await resolveDir(git, parts.slice(0, -1), false)
    const fh = await dir.getFileHandle(parts[parts.length - 1])
    return await (await fh.getFile()).text()
  } catch {
    return null
  }
}
