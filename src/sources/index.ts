// Which grain the atlas is reading: a repository on GitHub (grain-ww/grain, grain-os/grain, a
// fork), a folder on your own disk, or a checkout reached through the bridge. Each one is a
// version of grain, and each version carries a name read from the tree itself (see versions.ts).

import { createStore } from '@/core/store'

export type SourceRef =
  | { kind: 'github'; owner: string; repo: string; branch: string }
  | { kind: 'local'; name: string }
  | { kind: 'bridge' }

export interface KnownRemote { owner: string; repo: string; branch: string; note: string }

/** The grains named in grain's own pages. grain-os/grain is a pointer to the public seed. */
export const KNOWN_REMOTES: KnownRemote[] = [
  { owner: 'grain-ww', repo: 'grain', branch: 'main', note: 'the public seed, sown from the maintainer\'s field' },
  { owner: 'grain-os', repo: 'grain', branch: 'main', note: 'the template home; today a pointer to grain-ww/grain' },
]

export interface SourcesState {
  active: SourceRef
  recent: SourceRef[]      // other grains you have opened (forks, local folders)
}

export const sources = createStore<SourcesState>({
  active: { kind: 'github', owner: 'grain-ww', repo: 'grain', branch: 'main' },
  recent: [],
}, 'grain-atlas:sources')

export const refKey = (r: SourceRef) =>
  r.kind === 'github' ? `gh:${r.owner}/${r.repo}@${r.branch}` : r.kind === 'local' ? `local:${r.name}` : 'bridge'

export const refLabel = (r: SourceRef) =>
  r.kind === 'github' ? `${r.owner}/${r.repo}` : r.kind === 'local' ? `${r.name} (this computer)` : 'your checkout (bridge)'

export function remember(r: SourceRef): void {
  const s = sources.get()
  const recent = [r, ...s.recent.filter((x) => refKey(x) !== refKey(r))].slice(0, 8)
  sources.set({ active: r, recent })
}

export const isWritable = (r: SourceRef) => r.kind !== 'github'
