// The Bench: where you try grain's formats, find the line that runs a script, keep your own
// notes pinned to places and moments, and see what is planned for running Rishi in the page.

import { useMemo, useState } from 'react'
import { createStore, useStore } from '@/core/store'
import { hrefFor } from '@/core/router'
import type { ViewProps } from '@/core/registry'
import { repo, stampOf } from '@/grain/repo'
import { parseKyri, KYRI_SAMPLE } from '@/grain/kyri'
import { parseHeader } from '@/grain/header'
import { parseStamp, toStamp, sprigOf } from '@/grain/stamps'
import { runLine, expectation } from './commands'
import { Stamp } from '@/ui/Stamp'
import { toast } from '@/ui/Toast'
import './bench.css'

type Tab = 'formats' | 'run' | 'notes' | 'rishi'

interface Note { id: string; text: string; at: number; path?: string; moment?: string }
const notes = createStore<{ list: Note[] }>({ list: [] }, 'grain-atlas:notes')

export function Bench({ route }: ViewProps) {
  const [tab, setTab] = useState<Tab>((route.path as Tab) || 'formats')
  return (
    <div className="bench linen scroll">
      <header className="bench-head">
        <h1>The Bench</h1>
        <p className="muted">Try grain's formats in the page, copy the line that runs a script, and keep notes of your own.</p>
        <div className="dial-row">
          {([['formats', 'Format playground'], ['run', 'Run lines'], ['notes', 'Notes'], ['rishi', 'Rishi in the page']] as Array<[Tab, string]>).map(([id, label]) => (
            <a key={id} className="chip" aria-pressed={tab === id} href={hrefFor('bench', id)} onClick={() => setTab(id)}>{label}</a>
          ))}
        </div>
      </header>
      {tab === 'formats' && <Formats />}
      {tab === 'run' && <RunLines />}
      {tab === 'notes' && <Notes />}
      {tab === 'rishi' && <RishiPlan />}
    </div>
  )
}

function Formats() {
  const [kyri, setKyri] = useState(KYRI_SAMPLE)
  const doc = useMemo(() => parseKyri(kyri), [kyri])
  const [stampIn, setStampIn] = useState('20260823.034321')
  const st = parseStamp(stampIn, 'inline')
  const [page, setPage] = useState('# A page of my own\n\n**Language:** EN\n**Stamp:** `20261010.093000`\n**Voice:** Kyri\n**Status:** Vision -- a first sketch\n\n---\n\nThe body begins here.\n\n*May it grow.*\n')
  const header = useMemo(() => parseHeader(page), [page])

  return (
    <div className="bench-grid">
      <section className="panel linen-fine bench-card">
        <h2>Kyri and Brix</h2>
        <p className="muted">Line-oriented records: a key, a space, a value. Comments start with <code>#</code>.</p>
        <textarea className="mono" value={kyri} onChange={(e) => setKyri(e.target.value)} rows={12} spellCheck={false} aria-label="Kyri text" />
        <p className="sans" style={{ fontSize: 13 }}>
          {doc.format ? <>format <b>{doc.format}</b>; </> : 'no format line; '}
          {doc.lines.length} records, {doc.comments} comments, {doc.keys.size} distinct keys
        </p>
        <table className="r-table">
          <thead><tr><th>line</th><th>key</th><th>value</th></tr></thead>
          <tbody>
            {doc.lines.slice(0, 60).map((l) => {
              const stampHit = /\b20\d{6}[.\-_]\d{6}\b/.exec(l.value)
              const target = repo.get().entries.get(l.value.trim())
              return (
                <tr key={l.n}>
                  <td className="mono faint">{l.n}</td>
                  <td className="mono">{l.key}</td>
                  <td>
                    {target ? <a href={hrefFor('read', l.value.trim())}>{l.value}</a> : l.value}
                    {stampHit && <div><Stamp stamp={parseStamp(stampHit[0], 'inline')} /></div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="panel linen-fine bench-card">
        <h2>One-clock stamps</h2>
        <p className="muted">grain names moments <code>YYYYMMDD.HHMMSS</code>, read on the maintainer's wall clock. Paste one to read it.</p>
        <input className="mono" value={stampIn} onChange={(e) => setStampIn(e.target.value)} aria-label="Stamp" />
        {st ? (
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            <Stamp stamp={st} />
            <span className="sans faint" style={{ fontSize: 13 }}>read as {st.zoneLabel}{st.zoneExplicit ? ' (named beside it)' : ' (grain\'s clock season for that date)'}; the instant is {st.date.toISOString()}</span>
          </div>
        ) : <p className="faint">Not a stamp yet.</p>}
        <div className="sans" style={{ marginTop: 12, fontSize: 13 }}>
          Now, on grain's wall (America/New_York): <code className="mono">{toStamp(new Date())}</code>
          <button className="ascii-btn" onClick={() => { navigator.clipboard?.writeText(toStamp(new Date())); toast('Copied the stamp.') }}>[ copy ]</button>
          <br />In filename form: <code className="mono">{toStamp(new Date()).replace('.', '-')}_your-sprig.md</code>
        </div>
      </section>

      <section className="panel linen-fine bench-card">
        <h2>A page's header</h2>
        <p className="muted">How the atlas reads the header under a page's title: its fields, its room, and its stamp.</p>
        <textarea className="mono" value={page} onChange={(e) => setPage(e.target.value)} rows={10} spellCheck={false} aria-label="Markdown page" />
        <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
          <div>title: <b style={{ fontWeight: 600 }}>{header.title ?? '(none)'}</b></div>
          {Object.entries(header.fields).map(([k, v]) => <div key={k} className="sans" style={{ fontSize: 13.5 }}><span className="faint">{k}:</span> {v}</div>)}
          {header.status && <div><span className="room-tag" data-room={header.status.room}>{header.status.room}</span></div>}
          {header.stampRaw && <div><Stamp stamp={parseStamp(header.stampRaw, 'header')} /></div>}
        </div>
      </section>
    </div>
  )
}

function RunLines() {
  const entries = useStore(repo, (s) => ({ entries: s.entries, version: s.version }))
  const [q, setQ] = useState('witness')
  const list = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    const out: string[] = []
    for (const e of entries.entries.values()) {
      if (e.kind === 'dir' || !runLine(e.path)) continue
      if (terms.every((t) => e.path.toLowerCase().includes(t))) out.push(e.path)
      if (out.length >= 120) break
    }
    return out
  }, [q, entries.version])
  return (
    <section className="bench-wide">
      <p className="muted" style={{ maxWidth: '64ch' }}>
        grain's scripts run on your own machine, from the root of your clone: Rishi and Rye compile natively, and the first hour
        (<a href={hrefFor('read', 'docs-geode/tutorials/the-first-hour.md')}>the-first-hour.md</a>) builds the tools. Find a script, copy its line, and watch for GREEN.
      </p>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search scripts and witnesses" style={{ width: 'min(480px, 100%)' }} aria-label="Search scripts" />
      <div className="run-list">
        {list.map((p) => (
          <div key={p} className="run-row panel">
            <div style={{ minWidth: 0 }}>
              <a href={hrefFor('bench', 'run', { open: p })} className="mono" style={{ fontSize: 13 }}>{p}</a>
              <div className="faint" style={{ fontSize: 13.5 }}>{expectation(p)}</div>
            </div>
            <code className="mono run-code">{runLine(p)}</code>
            <button className="ascii-btn" onClick={() => { navigator.clipboard?.writeText(runLine(p)!); toast('Copied. Run it from the root of your grain clone.') }}>[ copy ]</button>
          </div>
        ))}
        {list.length === 0 && <p className="faint">No scripts answer to that.</p>}
      </div>
    </section>
  )
}

function Notes() {
  const list = useStore(notes, (s) => s.list)
  const [text, setText] = useState('')
  const [path, setPath] = useState('')
  const add = () => {
    if (!text.trim()) return
    notes.set({ list: [{ id: String(Date.now()), text: text.trim(), at: Date.now(), path: path.trim() || undefined }, ...list] })
    setText('')
  }
  const exportMd = () => {
    const stamp = toStamp(new Date())
    const body = list.map((n) => {
      const where = n.path ? ` (on \`${n.path}\`)` : ''
      return `- \`${toStamp(new Date(n.at))}\`${where} -- ${n.text}`
    }).join('\n')
    const md = `# Notes from the atlas\n\n**Language:** EN\n**Stamp:** \`${stamp}\`\n**Status:** Vision -- notes and ideas, not yet checked\n\n---\n\n${body}\n\n*May the good ones take root.*\n`
    const blob = new Blob([md], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${stamp.replace('.', '-')}_atlas-notes.md`
    a.click()
  }
  return (
    <section className="bench-wide">
      <p className="muted" style={{ maxWidth: '64ch' }}>Ideas pinned to a place in the tree. They stay in this browser; export them as a grain-style page whenever you like.</p>
      <div className="panel linen-fine bench-card" style={{ maxWidth: 720 }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="An idea, a question, a thing to try" aria-label="Note" />
        <input className="mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder="pin to a path (optional), e.g. caravan/README.md" aria-label="Pin to path" />
        <div className="dial-row"><button className="chip" onClick={add}>Pin the note</button>{list.length > 0 && <button className="chip" onClick={exportMd}>Export as markdown</button>}</div>
      </div>
      <div style={{ display: 'grid', gap: 10, maxWidth: 720, marginTop: 14 }}>
        {list.map((n) => (
          <div key={n.id} className="panel linen-fine" style={{ padding: '10px 14px' }}>
            <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
            <div className="dial-row sans faint" style={{ fontSize: 12, marginTop: 4 }}>
              <span>{new Date(n.at).toLocaleString()}</span>
              {n.path && <a href={hrefFor('read', n.path)}>{sprigOf(n.path)}</a>}
              {n.path && stampOf(repo.get().entries.get(n.path)) && <Stamp stamp={stampOf(repo.get().entries.get(n.path))} from={n.path} />}
              <span style={{ flex: 1 }} />
              <button className="ascii-btn" onClick={() => notes.set({ list: list.filter((x) => x.id !== n.id) })}>[ let go ]</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function RishiPlan() {
  return (
    <section className="bench-wide prose" style={{ maxWidth: '66ch' }}>
      <p><span className="room-tag" data-room="vision">vision</span></p>
      <h2>Running Rishi in the page</h2>
      <p>
        Today grain's scripts run on your machine. A later bench could run them here, in two honest steps. The first is a
        small reader for the subset the first hour uses -- <code>let</code>, <code>say</code>, <code>assert ... else</code>, string
        interpolation -- written in TypeScript, with <code>run [...]</code> answered by a pretend file system built from the tree you
        are browsing. That is enough to watch <code>hello.rish</code> and simple witnesses print GREEN in the page.
      </p>
      <p>
        The second is the real thing: Rye builds on Zig, and Zig compiles to WebAssembly, so the Rishi shell itself could be built for
        <code> wasm32-wasi</code> and run against the same pretend file system. Every witness would then be a button.
      </p>
      <p>
        The plugin seat is ready: a bench plugin can register a <code>run</code> command for <code>.rish</code> files, and the reader
        will offer it beside the copy line.
      </p>
    </section>
  )
}
