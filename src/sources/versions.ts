// Reading a version's own name from the tree. See docs/research/versions.md.
//
// grain names things rather than numbering them:
//   - The public seed (grain-ww/grain) is re-sown on each publish as one parentless commit, and
//     that commit's subject is the seed's name -- a phase word chosen by hand and never reused:
//     crashed-meteor, crashed-wave (20260912), incense (20261007, also the README badge and the
//     CHANGELOG's "incense phase").
//   - grain-os/grain is a pointer at the seed.
//   - A ship is a full working copy of the maintainer's field, named for an aroma and checked out
//     as grain-<ship> (incense is the captain).
//   - A pier is a machine and its home checkout; GLOW_PROFILE.kyri / GLOW_HOST.kyri (gitignored,
//     from the .template files) carry the keeper's handle, voice, timezone and their own seed name.
//   - The "git nib" is the 10-character HEAD commit.

import { commitInfo, fileText, headSha } from '@/github/client'
import { repo } from '@/grain/repo'
import { restoreLocalGrain, readGitFile, readLocal } from './local'
import { bridgeGit, bridgeRead, bridgeHealth } from './bridge'
import type { SourceRef } from './index'

export const SHIPS = ['incense', 'pheromone', 'petrichor', 'bakery', 'diffuser', 'grass', 'copal', 'patchouli']
/** The seed's names so far, oldest first (from grain's git-signing and mechanism-sentence rules). */
export const SEED_NAMES = ['Grain OS --', 'grain-ww --', 'crashed-meteor', 'crashed-wave', 'incense']

export interface VersionInfo {
  name: string              // the name to show: a seed, a ship, a pier, a branch
  kind: 'seed' | 'pointer' | 'pier' | 'ship' | 'fork' | 'checkout'
  nib?: string              // the git nib: 10-character HEAD
  detail: string            // one plain line
  commit?: { sha: string; subject: string; date?: string; author?: string }
  descriptor?: string       // .brix version stamp
  pier?: Record<string, string>   // fields read from GLOW_PROFILE.kyri / GLOW_HOST.kyri
  pointsTo?: string         // for pointer repos, the repo they name
  dirty?: number            // files changed in a working tree (bridge)
}

/** Key/value lines of a .kyri file (comments and blanks skipped). */
export function kyriFields(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const t = raw.trim()
    if (!t || t.startsWith('#') || t.startsWith('::')) continue
    const m = /^(\S+)\s+(.*)$/.exec(t)
    if (m && !(m[1] in out)) out[m[1]] = m[2]
  }
  return out
}

const brixVersion = (text: string) => /^version\s+(\S+)/m.exec(text)?.[1]

/** A one-word lowercase commit subject is a ship's name in grain's habit ("incense"). */
const shipName = (subject: string) => (/^[a-z][a-z-]{2,24}$/.test(subject.trim()) ? subject.trim() : null)

function pointerTarget(readme: string): string | undefined {
  const m = /pointer to (?:that|the) seed|public seed is\s+https:\/\/github\.com\/([\w.-]+\/[\w.-]+)/i.exec(readme)
  const url = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)/.exec(readme)
  return m ? url?.[1] : undefined
}

async function pierFields(read: (p: string) => Promise<string | null>): Promise<Record<string, string> | undefined> {
  const out: Record<string, string> = {}
  for (const f of ['GLOW_PROFILE.kyri', 'GLOW_HOST.kyri']) {
    const t = await read(f)
    if (t) Object.assign(out, kyriFields(t))
  }
  return Object.keys(out).length ? out : undefined
}

export async function readVersion(ref: SourceRef): Promise<VersionInfo> {
  if (ref.kind === 'github') {
    const r = repo.get()
    const known = r.subject && /^[0-9a-f]{40}$/.test(r.ref) ? { sha: r.ref, subject: r.subject, date: r.committed } : undefined
    const head = known ?? (await fetchHead(ref))
    const readme = await fileText(ref.owner, ref.repo, head?.sha ?? ref.branch, 'README.md').catch(() => '')
    const target = readme.length < 2000 ? pointerTarget(readme) : undefined
    if (target) {
      return { name: 'pointer', kind: 'pointer', detail: `points to ${target}`, pointsTo: target, commit: head }
    }
    const brix = await fileText(ref.owner, ref.repo, head?.sha ?? ref.branch, '.brix').catch(() => '')
    const ship = head ? shipName(head.subject) : null
    const isSeed = ref.owner === 'grain-ww' && ref.repo === 'grain'
    return {
      name: ship ?? (head ? head.sha.slice(0, 7) : ref.branch),
      kind: isSeed ? 'seed' : 'fork',
      nib: head?.sha.slice(0, 10),
      detail: isSeed
        ? ship ? `the public seed "${ship}"${SHIPS.includes(ship) ? `, named with the captain ship of the Earth fleet` : ''}` : 'the public seed'
        : ship ? `a fork, last named "${ship}"` : `a fork of grain on ${ref.branch}`,
      commit: head,
      descriptor: brixVersion(brix),
    }
  }

  if (ref.kind === 'local') {
    const h = await restoreLocalGrain(false)
    if (!h) return { name: ref.name, kind: 'pier', detail: 'a folder on this computer (waiting for permission)' }
    const readText = async (p: string) => { try { return await (await readLocal(h, p)).text() } catch { return null } }
    const headRef = (await readGitFile(h, 'HEAD'))?.trim() ?? ''
    const branch = headRef.startsWith('ref:') ? headRef.replace(/^ref:\s*refs\/heads\//, '') : headRef.slice(0, 7)
    const log = (await readGitFile(h, 'logs/HEAD')) ?? ''
    const last = log.trim().split('\n').pop() ?? ''
    // reflog line: <old> <new> <name> <email> <time> <tz>\t<message>
    const [meta, message = ''] = last.split('\t')
    const sha = meta?.split(' ')[1] ?? ''
    const subject = message.replace(/^(commit|commit \(initial\)|merge [^:]+|checkout|pull|reset):\s*/, '')
    const pier = await pierFields(readText)
    const brix = (await readText('.brix')) ?? ''
    const config = (await readGitFile(h, 'config')) ?? ''
    const remote = /url\s*=\s*(\S+)/.exec(config)?.[1] ?? ''
    const shipMatch = /^grain-([a-z]+)$/.exec(ref.name)
    const isShip = !!shipMatch && SHIPS.includes(shipMatch[1])
    const seedClone = /grain-ww\/grain/.test(remote)
    const single = log.trim().split('\n').filter(Boolean).length <= 1 && /commit \(initial\)/.test(last)
    const kind: VersionInfo['kind'] = isShip ? 'ship' : 'pier'
    const name = single && subject ? subject : isShip ? shipMatch![1] : ref.name
    const bits = [
      isShip ? `ship ${shipMatch![1]}` : single ? `seed "${subject}"` : `pier ${ref.name}`,
      branch && `on ${branch}`,
      seedClone && 'cloned from the public seed',
      pier?.voice && `voice ${pier.voice}`,
      pier?.seed_root_subject && `your seed name "${pier.seed_root_subject}"`,
    ].filter(Boolean)
    return {
      name, kind, nib: sha ? sha.slice(0, 10) : undefined,
      detail: bits.join(', ') + (subject && !single ? ` -- last: ${subject}` : ''),
      commit: sha ? { sha, subject } : undefined,
      descriptor: brixVersion(brix),
      pier,
    }
  }

  const g = await bridgeGit()
  const readText = async (p: string) => { try { return await bridgeRead(p) } catch { return null } }
  const pier = await pierFields(readText)
  const brix = (await readText('.brix')) ?? ''
  const dirty = g.status ? g.status.split('\n').filter(Boolean).length : 0
  const folder = (await bridgeHealth().catch(() => null))?.root.split(/[\\/]/).pop() ?? ''
  const ship = /^grain-([a-z]+)$/.exec(folder)?.[1]
  return {
    name: ship && SHIPS.includes(ship) ? ship : folder || g.branch,
    kind: ship && SHIPS.includes(ship) ? 'ship' : 'checkout',
    nib: g.head.slice(0, 10),
    detail: `your checkout through the bridge, on ${g.branch}${dirty ? `, ${dirty} files changed` : ''}`,
    commit: { sha: g.head, subject: g.subject },
    descriptor: brixVersion(brix),
    pier,
    dirty,
  }
}

async function fetchHead(ref: Extract<SourceRef, { kind: 'github' }>) {
  try {
    const sha = await headSha(ref.owner, ref.repo, ref.branch)
    const info = await commitInfo(ref.owner, ref.repo, sha)
    return { sha, subject: info.message.split('\n')[0], date: info.date, author: info.author }
  } catch {
    return undefined
  }
}
