// GitHub, read gently. The unauthenticated REST quota is 60 requests an hour per IP, and a 304
// still counts unless a token is sent, so we cache by time and by content address instead of
// polling: a tree is fetched once per commit sha, a file once per blob sha.
//
// File bodies come from raw.githubusercontent.com, which is outside the REST quota.

import { createStore } from '@/core/store'
import { settings } from '@/core/settings'
import { kvGet, kvSet } from './kv'

export interface RateState { limit: number; remaining: number; reset: number; lastError?: string }
export const rate = createStore<RateState>({ limit: 60, remaining: 60, reset: 0 })

export interface GitTreeEntry { path: string; mode: string; type: 'blob' | 'tree' | 'commit'; sha: string; size?: number }

const API = 'https://api.github.com'

function headers(accept = 'application/vnd.github+json'): HeadersInit {
  const h: Record<string, string> = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' }
  const token = settings.get().token.trim()
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

function noteRate(res: Response): void {
  const limit = Number(res.headers.get('x-ratelimit-limit'))
  const remaining = Number(res.headers.get('x-ratelimit-remaining'))
  const reset = Number(res.headers.get('x-ratelimit-reset'))
  if (Number.isFinite(limit) && limit > 0) rate.set({ limit, remaining, reset: reset * 1000 })
}

export class GitHubError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

async function api(path: string, accept?: string): Promise<Response> {
  const res = await fetch(API + path, { headers: headers(accept) })
  noteRate(res)
  if (!res.ok) {
    const limited = res.status === 403 || res.status === 429
    const msg = limited
      ? 'GitHub asked us to slow down (hourly limit reached). A personal token in Settings raises it to 5,000.'
      : `GitHub answered ${res.status} for ${path}`
    rate.set({ lastError: msg })
    throw new GitHubError(msg, res.status)
  }
  return res
}

/** Head commit sha of a branch; cached ten minutes so reloads spend nothing. */
export async function headSha(owner: string, repo: string, branch: string): Promise<string> {
  const key = `head:${owner}/${repo}@${branch}`
  const hit = await kvGet<{ at: number; sha: string }>(key)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.sha
  try {
    const res = await api(`/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`, 'application/vnd.github.sha')
    const sha = (await res.text()).trim()
    await kvSet(key, { at: Date.now(), sha })
    return sha
  } catch (e) {
    if (hit) return hit.sha
    throw e
  }
}

/** The whole tree at a commit, in one request, cached forever by sha. */
export async function treeAt(owner: string, repo: string, sha: string): Promise<GitTreeEntry[]> {
  const key = `tree:${owner}/${repo}@${sha}`
  const hit = await kvGet<GitTreeEntry[]>(key)
  if (hit) return hit
  const res = await api(`/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`)
  const json = (await res.json()) as { tree: GitTreeEntry[]; truncated: boolean }
  const tree = json.tree.map(({ path, mode, type, sha, size }) => ({ path, mode, type, sha, size }))
  await kvSet(key, tree)
  return tree
}

export async function commitInfo(owner: string, repo: string, sha: string): Promise<{ date: string; message: string; author: string }> {
  const key = `commit:${owner}/${repo}@${sha}`
  const hit = await kvGet<{ date: string; message: string; author: string }>(key)
  if (hit) return hit
  const res = await api(`/repos/${owner}/${repo}/commits/${sha}`)
  const j = await res.json()
  const info = { date: j.commit.committer.date, message: j.commit.message, author: j.commit.author.name }
  await kvSet(key, info)
  return info
}

export const rawUrl = (owner: string, repo: string, ref: string, path: string) =>
  `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`

export const webUrl = (owner: string, repo: string, ref: string, path: string, isDir = false) =>
  `https://github.com/${owner}/${repo}/${isDir ? 'tree' : 'blob'}/${ref}/${path}`

/** File text by path; cached by blob sha when we know it (content never changes under a sha). */
export async function fileText(owner: string, repo: string, ref: string, path: string, blob?: string): Promise<string> {
  const key = blob ? `blob:${blob}` : `raw:${owner}/${repo}@${ref}:${path}`
  const hit = await kvGet<string>(key)
  if (hit !== undefined) return hit
  const res = await fetch(rawUrl(owner, repo, ref, path))
  if (!res.ok) throw new GitHubError(`Could not read ${path} (${res.status})`, res.status)
  const text = await res.text()
  if (text.length < 1_500_000) await kvSet(key, text)
  return text
}
