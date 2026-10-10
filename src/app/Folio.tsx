// The folio: a page of grain, opened over whatever map you are standing on.

import { useEffect, useState } from 'react'
import { hrefFor, navigate, type Route } from '@/core/router'
import { rendererFor } from '@/core/registry'
import { useStore } from '@/core/store'
import { repo, readFile, stampOf, sowingStamp, isFieldRoom, type Entry } from '@/grain/repo'
import { rawUrl, webUrl } from '@/github/client'
import { parseHeader } from '@/grain/header'
import { sprigOf } from '@/grain/stamps'
import { regionOf } from '@/grain/rooms'
import { plant } from '@/grain/progress'
import { journeyById } from '@/grain/quests'
import { Stamp } from '@/ui/Stamp'
import { roomWord } from '@/grain/header'
import { toast } from '@/ui/Toast'
import { runLine } from '@/plugins/bench/commands'
import { Character } from '@/voices/Character'
import { lookForName, voiceByName, activeVoice, voiceById } from '@/voices/voices'
import { askCompanion } from '@/voices/companion'

/** The voice a page is written in, with its face; click to wake that voice in the dock. */
function VoiceTag({ name }: { name: string }) {
  const first = name.split(/[\s,(]/)[0]
  const known = voiceByName(first)
  return (
    <button className="voice-tag" title={known ? `${known.name}: ${known.role}. Wake ${known.name}.` : `written in the voice ${name}`} onClick={() => known && activeVoice.set({ id: known.id })}>
      <Character look={lookForName(first)} size={30} title={first} />
      <span className="sans" style={{ fontSize: 13 }}>{name.length > 40 ? first : name}</span>
    </button>
  )
}

export function Folio({ path, route }: { path: string; route: Route }) {
  const r = useStore(repo, (s) => ({ entries: s.entries, version: s.version, owner: s.owner, repo: s.repo, ref: s.ref, backlinks: s.backlinks, phase: s.phase }))
  const entry = r.entries.get(path)
  const close = () => {
    if (route.view === 'read') navigate('fields', '', { focus: path })
    else navigate(route.view, route.path, { ...route.params, open: undefined })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const crumbs = path.split('/')
  return (
    <aside className="folio linen" aria-label={`Reading ${path}`}>
      <div className="folio-head">
        <nav className="crumbs" aria-label="Path">
          <a href={hrefFor('ledger')}>grain</a>
          {crumbs.map((c, i) => {
            const p = crumbs.slice(0, i + 1).join('/')
            return <span key={p}>/ <a href={hrefFor('ledger', p)}>{c}</a></span>
          })}
        </nav>
        <span style={{ flex: 1 }} />
        <AskButton path={path} isDir={entry?.kind === 'dir'} />
        {entry && r.owner && (
          <a className="ascii-btn" href={webUrl(r.owner, r.repo, r.ref, path, entry.kind === 'dir')} target="_blank" rel="noreferrer">[ on github ]</a>
        )}
        <button className="ascii-btn" onClick={close} aria-label="Close the folio">[ close ]</button>
      </div>
      <div className="folio-body">
        {!entry && r.phase !== 'ready' && <p className="muted">Reading the tree…</p>}
        {!entry && r.phase === 'ready' && <FieldRoom path={path} />}
        {entry?.kind === 'dir' && <DirPage entry={entry} />}
        {entry && entry.kind !== 'dir' && <FilePage entry={entry} />}
      </div>
    </aside>
  )
}

function FieldRoom({ path }: { path: string }) {
  const field = isFieldRoom(path)
  return (
    <div className="empty">
      <h2 style={{ fontWeight: 400 }}>{field ? 'This room rests in the field' : 'No such path in this tree'}</h2>
      <p className="mono faint">{path}</p>
      <p style={{ maxWidth: '52ch', margin: '0 auto' }}>
        {field
          ? 'grain keeps a few rooms in the maintainer\'s field -- session logs, construction, the lexicon, the vendored source. The public seed is projected from the rest, so links here point at a door the seed leaves behind.'
          : 'It may have moved, or it lives only in another grain. Try the ledger, or search from the fields.'}
      </p>
    </div>
  )
}

function DirPage({ entry }: { entry: Entry }) {
  const r = useStore(repo, (s) => s.entries)
  const readme = entry.children.find((c) => /\/?README\.md$/i.test(c))
  const region = regionOf(entry.path || 'README.md')
  return (
    <div>
      <p className="sans faint" style={{ margin: 0 }}>{region.name} -- {entry.files.toLocaleString()} files</p>
      <h1 style={{ fontWeight: 400, margin: '4px 0 18px', fontSize: 36 }}>{entry.path || 'grain'}</h1>
      <div style={{ columns: '2 220px', columnGap: 24, fontFamily: 'var(--mono)', fontSize: 13, marginBottom: 28 }}>
        {entry.children.map((c) => {
          const e = r.get(c)!
          return (
            <div key={c} style={{ breakInside: 'avoid', padding: '2px 0' }}>
              <a href={hrefFor('read', c)} style={{ color: e.kind === 'dir' ? 'var(--gold-ink)' : 'var(--ink-2)', textDecoration: 'none' }}>
                {e.name}{e.kind === 'dir' ? '/' : ''}
              </a>
              {e.kind === 'dir' && <span className="faint"> {e.files}</span>}
            </div>
          )
        })}
      </div>
      {readme && <FilePage entry={r.get(readme)!} embedded />}
    </div>
  )
}

function FilePage({ entry, embedded }: { entry: Entry; embedded?: boolean }) {
  const s = useStore(repo, (x) => ({ owner: x.owner, repo: x.repo, ref: x.ref, backlinks: x.backlinks, version: x.version }))
  const [text, setText] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setText(null)
    setErr(null)
    if (isBinary(entry.path) || entry.kind === 'module') setText('')
    else readFile(entry.path).then((t) => { if (live) setText(t) }).catch((e) => { if (live) setErr(e.message) })
    if (!embedded) {
      const res = plant(entry.path)
      if (res.harvested) {
        const j = journeyById(res.harvested)
        toast(`Harvest: ${j?.title}. ${j?.benediction ?? ''}`, 7000)
      } else if (res.newSeed) {
        toast('A seed is planted in your field.', 1800)
      }
    }
    return () => { live = false }
  }, [entry.path])

  const header = text && entry.path.endsWith('.md') ? parseHeader(text) : undefined
  const birth = stampOf(entry)
  const sowing = sowingStamp()
  const R = rendererFor(entry.path)
  const back = s.backlinks.get(entry.path) ?? []
  const fieldLinks = entry.meta?.fieldLinks ?? []
  const run = runLine(entry.path)

  return (
    <article>
      {!embedded && (
        <header style={{ marginBottom: 22 }}>
          <p className="sans faint" style={{ margin: 0, fontSize: 13 }}>{regionOf(entry.path).name}</p>
          <h1 style={{ fontWeight: 400, margin: '2px 0 10px', fontSize: 'clamp(26px, 3.4vw, 38px)', lineHeight: 1.15 }}>
            {header?.title ?? entry.meta?.title ?? sprigOf(entry.path)}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px', alignItems: 'center' }}>
            {birth
              ? <span className="sans faint" style={{ fontSize: 12 }}>{birth.source === 'filename' ? 'born' : `stamped (${entry.meta?.stampField ?? 'header'})`}<br /><Stamp stamp={birth} from={entry.path} /></span>
              : <span className="sans faint" style={{ fontSize: 12 }}>sown with the seed<br /><Stamp stamp={sowing} from={entry.path} /></span>}
            {header?.status && <span className="room-tag" data-room={header.status.room} title={header.status.text}>{roomWord(header.status.room, header.status.text)}</span>}
            {header?.fields['Voice'] && <VoiceTag name={header.fields['Voice'].replace(/`/g, '')} />}
            <span className="mono faint" style={{ fontSize: 12 }}>{formatSize(entry.size)}</span>
          </div>
          {run && (
            <div className="panel" style={{ marginTop: 14, padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'center', background: 'var(--sky)' }}>
              <code className="mono" style={{ color: 'var(--star)', fontSize: 13, overflowX: 'auto', whiteSpace: 'nowrap', flex: 1 }}>{run}</code>
              <button className="ascii-btn" onClick={() => { navigator.clipboard?.writeText(run); toast('Copied. Run it from the root of your grain clone.') }}>[ copy ]</button>
            </div>
          )}
        </header>
      )}
      {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
      {text === null && !err && <p className="muted">Unrolling the page…</p>}
      {text !== null && R && <R.component path={entry.path} text={text} rawUrl={rawUrl(s.owner, s.repo, s.ref, entry.path)} embedded={embedded} />}
      {!embedded && (back.length > 0 || fieldLinks.length > 0) && (
        <footer style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid var(--rule)', display: 'grid', gap: 14 }}>
          {back.length > 0 && (
            <div>
              <h3 style={{ fontWeight: 400, margin: '0 0 6px' }}>Pages that point here</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {back.slice(0, 60).map((b) => <a key={b} className="chip" href={hrefFor('read', b)} style={{ textDecoration: 'none' }}>{sprigOf(b)}</a>)}
                {back.length > 60 && <span className="faint">and {back.length - 60} more</span>}
              </div>
            </div>
          )}
          {fieldLinks.length > 0 && (
            <div>
              <h3 style={{ fontWeight: 400, margin: '0 0 6px' }}>Doors into the field (out of reach here)</h3>
              <p className="mono faint" style={{ fontSize: 12.5, margin: 0 }}>{fieldLinks.join('  ')}</p>
            </div>
          )}
        </footer>
      )}
    </article>
  )
}

export const isBinary = (p: string) => /\.(png|jpe?g|gif|webp|ico|peal|ogg|opus|wav|mp3|mp4|pdf|woff2?|ttf|otf|zip|gz|tar|bin|apk|wasm)$/i.test(p)

export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** Ask the companion about this page: it comes out of the header with a question ready. */
function AskButton({ path, isDir }: { path: string; isDir: boolean }) {
  const voice = voiceById(useStore(activeVoice, (s) => s.id))
  const name = path.split('/').pop() || 'grain'
  return (
    <button className="ascii-btn ask-btn" title={`Ask ${voice.name} about ${name}`} onClick={() => askCompanion(isDir
      ? `What is the ${path || 'root'} folder for, and where should I start reading in it?`
      : `Explain ${path} in plain words: what it is for, where it sits in grain, and what to read next.`)}>
      [ ask {voice.name} ]
    </button>
  )
}
