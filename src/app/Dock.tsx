// The dock: the current voice, always at hand. Ask it about the page you are on or the words you
// have selected, keep a note, look over its notes and drafts, or build something -- from any view
// of the atlas. It can be tucked into its burrow in the header (see voices/companion.ts).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/core/store'
import { hrefFor, useRoute } from '@/core/router'
import { activeVoice, voiceById, allVoices, userVoices } from '@/voices/voices'
import { Character } from '@/voices/Character'
import { companion, leaping, setCompanion, landLeap, leapFrames } from '@/voices/companion'
import { threads, newThread, ask, stopThread, loadThreads } from '@/agent/threads'
import { agentSettings } from '@/agent/runtime'
import { MODELS, EFFORTS, type Effort } from '@/agent/models'
import { gauge, money } from '@/agent/gauge'
import { sheaves, bind, unbind } from '@/agent/sheaves'
import { drafts } from '@/agent/drafts'
import { Conversation } from '@/agent/ui/TurnView'
import { prefersStill } from '@/core/settings'

const FACE = 64
type Tab = 'talk' | 'notes' | 'drafts'

/** Text the reader has selected on the page, outside the dock itself. */
function useSelection(): string {
  const [sel, setSel] = useState('')
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const on = () => {
      clearTimeout(t)
      t = setTimeout(() => {
        const s = window.getSelection()
        const inDock = s?.anchorNode && (s.anchorNode.parentElement?.closest('.dock') ?? null)
        if (!inDock) setSel((s?.toString() ?? '').trim().slice(0, 4000))
      }, 160)
    }
    document.addEventListener('selectionchange', on)
    return () => { document.removeEventListener('selectionchange', on); clearTimeout(t) }
  }, [])
  return sel
}

export function Dock() {
  const route = useRoute()
  const voiceId = useStore(activeVoice, (s) => s.id)
  useStore(userVoices)
  const voice = voiceById(voiceId)
  const t = useStore(threads)
  const ag = useStore(agentSettings)
  const ready = ag.backend === 'bridge' || !!ag.apiKey
  const on = useStore(companion, (s) => s.on)
  const leap = useStore(leaping, (s) => s.leap)
  const g = useStore(gauge, (x) => ({ today: x.today, perDay: x.limits.perDay }))
  const notes = useStore(sheaves, (s) => s.list.filter((x) => x.voice === voice.name).slice(0, 30))
  const draftList = useStore(drafts, (s) => s.list)
  const selection = useSelection()
  const [open, setOpen] = useState(false)
  const [wide, setWide] = useState(false)
  const [tab, setTab] = useState<Tab>('talk')
  const [text, setText] = useState('')
  const [useSel, setUseSel] = useState(true)
  const [note, setNote] = useState('')
  const [seen, setSeen] = useState(-1)
  const [copied, setCopied] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { loadThreads() }, [])
  useEffect(() => { if (!on) setOpen(false) }, [on])
  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const thread = useMemo(() => t.list.find((x) => x.voiceId === voiceId && x.title.startsWith('dock: ')), [t.list, voiceId])
  const running = thread ? !!t.running[thread.id] : false
  const lastVoice = thread ? [...thread.turns].reverse().find((x) => x.role === 'voice') : undefined
  const thinking = running && !thread?.turns[thread.turns.length - 1]?.text
  const voiceTurns = thread ? thread.turns.filter((x) => x.role === 'voice' && !x.pending).length : 0
  useEffect(() => { setSeen(-1) }, [voiceId])
  useEffect(() => { if (open || (seen < 0 && t.loaded)) setSeen(voiceTurns) }, [open, voiceTurns, seen, t.loaded])
  const unread = !open && seen >= 0 && voiceTurns > seen && !running

  const openPath = route.view === 'read' ? route.path : route.params.open
  const hidden = route.view === 'floor' || route.view === 'intro'
  if (hidden) return <LeapLayer />

  const send = (msg = text) => {
    const m = msg.trim()
    if (!m) return
    const th = thread ?? newThread(voiceId, { title: `dock: ${voice.name}` })
    const withSel = useSel && selection ? `${m}\n\nThe words I have selected on the page:\n"""\n${selection}\n"""` : m
    setText('')
    setTab('talk')
    ask(th.id, withSel)
  }
  const fresh = () => { newThread(voiceId, { title: `dock: ${voice.name}` }); setSeen(0) }
  const copyLast = async () => {
    if (!lastVoice?.text) return
    try { await navigator.clipboard.writeText(lastVoice.text); setCopied(true); setTimeout(() => setCopied(false), 1400) } catch { /* no clipboard */ }
  }
  const name = openPath?.split('/').pop()
  const quick = [
    selection && useSel && ['Explain the selection', 'Explain the words I have selected, plainly, and say where in grain they lead.'],
    openPath && [`Explain ${name}`, `Explain the page I have open (${openPath}) in plain words: what it is for, where it sits in grain, and what to read next.`],
    openPath && ['Related pages', `Find the pages most closely related to ${openPath}: what links to it, what it links to, and its neighbours by subject. Give paths and one line each.`],
    openPath && ['Keep a note', `Bind a short sheaf (note) about ${openPath} capturing the one thing worth remembering from it.`],
    openPath && ['Draft a change', `Read ${openPath} and draft one small, worthwhile improvement to it. Write it with edit_page (it becomes a draft if this version is read-only) and tell me what you changed.`],
    !openPath && ['Where should I start?', 'I am new to grain. Look at where I am in the atlas and suggest the next three things to read or try, with paths.'],
    ['What changed lately?', 'What are the ten most recently stamped pages in grain, and what do they say about where the work is heading?'],
  ].filter(Boolean) as Array<[string, string]>
  const status = !ready ? 'asleep' : thinking ? 'thinking…' : running ? 'speaking…' : 'listening'

  return (
    <>
      <div className={`dock${open ? ' open' : ''}${on ? '' : ' off'}${leap ? ' leaping' : ''}`}>
        {open && on && (
          <div className={`dock-panel panel linen-fine${wide ? ' wide' : ''}`} role="dialog" aria-label={`${voice.name}, your companion`}>
            <div className="dock-head">
              <Character look={voice.look} size={34} speaking={running} thinking={thinking} title={voice.name} />
              <div className="dock-who">
                <select value={voiceId} onChange={(e) => activeVoice.set({ id: e.target.value })} aria-label="Voice">
                  {allVoices().map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <span className={`dock-status sans${running ? ' live' : ''}`}><i />{voice.name} is {status}</span>
              </div>
              <span style={{ flex: 1 }} />
              <button className="icon-btn dock-wide" title={wide ? 'Narrower' : 'Wider'} aria-label={wide ? 'Narrower' : 'Wider'} onClick={() => setWide(!wide)}>{wide ? '⇥' : '⇤'}</button>
              <a className="icon-btn" title="Open this conversation on the Threshing Floor" aria-label="Open on the floor" href={hrefFor('floor', 'talk', { thread: thread?.id })}>⤢</a>
              <button className="icon-btn" title={`Tuck ${voice.name} away (bring back from the header)`} aria-label={`Tuck ${voice.name} away`} onClick={() => { setOpen(false); setCompanion(false) }}>⌄</button>
              <button className="icon-btn" title="Close (Esc)" aria-label="Close" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="dock-tabs sans" role="tablist">
              {(['talk', 'notes', 'drafts'] as Tab[]).map((k) => (
                <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                  {k === 'talk' ? 'Talk' : k === 'notes' ? `Notes${notes.length ? ` · ${notes.length}` : ''}` : `Drafts${draftList.length ? ` · ${draftList.length}` : ''}`}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <select className="dock-mini" value={ag.model} onChange={(e) => agentSettings.set({ model: e.target.value })} aria-label="Model" title="Model">
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <select className="dock-mini" value={ag.effort} onChange={(e) => agentSettings.set({ effort: e.target.value as Effort })} aria-label="Effort" title="Effort">
                {EFFORTS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>

            {tab === 'talk' && (
              <>
                <div className="dock-log scroll">
                  {thread && thread.turns.length ? <Conversation thread={thread} compact /> : (
                    <div className="dock-hello">
                      <p className="muted" style={{ fontStyle: 'italic' }}>{voice.phrases[0] ?? `${voice.name} is listening.`}</p>
                      <p className="faint sans" style={{ fontSize: 12.5 }}>{voice.role}</p>
                    </div>
                  )}
                  {!ready && <p className="sans" style={{ fontSize: 13 }}>{voice.name} wakes with an API key or the bridge. <a href={hrefFor('floor', 'keys')}>Set it up</a>.</p>}
                </div>
                <div className="dock-context sans">
                  {openPath ? <span className="ctx" title={`${voice.name} knows you have this open`}>◧ {name}</span> : <span className="ctx faint">{route.view || 'fields'} view</span>}
                  {selection && (
                    <button className={`ctx${useSel ? ' on' : ''}`} onClick={() => setUseSel(!useSel)} title={useSel ? 'The selection goes with your next message; click to leave it out' : 'Click to send the selection with your next message'}>
                      ❝ {selection.length > 40 ? `${selection.slice(0, 38)}…` : selection} {useSel ? '✓' : ''}
                    </button>
                  )}
                  <span style={{ flex: 1 }} />
                  <span className="faint" title="Spent today against your daily limit">{money(g.today)} / {money(g.perDay)}</span>
                </div>
                <div className="dock-quick">{quick.map(([label, msg]) => <button key={label} className="ascii-btn" disabled={!ready || running} onClick={() => send(msg)}>[ {label} ]</button>)}</div>
                <div className="dock-input">
                  <textarea ref={input} rows={2} value={text} placeholder={`Ask ${voice.name}…  (Enter to send, Shift+Enter for a new line)`} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
                  <div className="dock-actions">
                    {running ? <button className="chip" onClick={() => thread && stopThread(thread.id)}>Stop</button> : <button className="chip go" disabled={!ready || !text.trim()} onClick={() => send()}>Ask</button>}
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="icon-btn" disabled={!lastVoice?.text} title="Copy the last answer" aria-label="Copy the last answer" onClick={copyLast}>{copied ? '✓' : '⧉'}</button>
                      <button className="icon-btn" disabled={running || !thread?.turns.length} title="Begin a fresh conversation" aria-label="New conversation" onClick={fresh}>＋</button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {tab === 'notes' && (
              <div className="dock-log scroll dock-notes">
                <form className="dock-note-form" onSubmit={(e) => { e.preventDefault(); if (note.trim()) { bind({ kind: 'note', text: note.trim(), tags: ['dock'], paths: openPath ? [openPath] : [], voice: voice.name }); setNote('') } }}>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={openPath ? `A note about ${name}…` : 'A note to keep…'} />
                  <button className="chip" disabled={!note.trim()}>Keep</button>
                </form>
                {notes.length === 0 && <p className="muted" style={{ fontStyle: 'italic' }}>{voice.name} has no notes yet. Notes you keep here, and sheaves {voice.name} binds while working, appear here and are recalled in later conversations.</p>}
                {notes.map((n) => (
                  <div key={n.id} className="dock-note">
                    <div className="faint sans" style={{ fontSize: 11.5 }}>{n.kind} · {new Date(n.at).toLocaleDateString()}{n.paths.map((p) => <a key={p} href={hrefFor(route.view === 'read' ? 'fields' : route.view || 'fields', route.path, { ...route.params, open: p })}> · {p.split('/').pop()}</a>)}</div>
                    <div>{n.text}</div>
                    <button className="ascii-btn" title="Let this note go" onClick={() => unbind(n.id)}>[ let go ]</button>
                  </div>
                ))}
                <a className="sans" style={{ fontSize: 12.5 }} href={hrefFor('floor', 'memory')}>All memory on the floor →</a>
              </div>
            )}

            {tab === 'drafts' && (
              <div className="dock-log scroll dock-notes">
                {draftList.length === 0 && <p className="muted" style={{ fontStyle: 'italic' }}>No drafts. When a voice changes a page on a read-only version, the change waits here as a draft.</p>}
                {draftList.slice(0, 30).map((d) => (
                  <div key={d.path} className="dock-note">
                    <div className="faint sans" style={{ fontSize: 11.5 }}>by {d.by} · {new Date(d.at).toLocaleString()}</div>
                    <div className="mono" style={{ fontSize: 13 }}>{d.path}</div>
                  </div>
                ))}
                <a className="sans" style={{ fontSize: 12.5 }} href={hrefFor('floor', 'drafts')}>Review drafts on the floor →</a>
              </div>
            )}
          </div>
        )}
        <button
          className="dock-face" onClick={() => setOpen(!open)} tabIndex={on ? 0 : -1} aria-hidden={!on}
          aria-label={`${open ? 'Close' : 'Open'} ${voice.name}`} title={`${voice.name}: ask about anything here`}
        >
          <Character look={voice.look} size={FACE} speaking={running} thinking={thinking} mood={unread ? 'happy' : 'idle'} title={voice.name} />
          {unread && <span className="dock-unread" aria-label="a new answer" />}
          {!open && <span className="dock-name sans">{voice.name}</span>}
        </button>
      </div>
      <LeapLayer />
    </>
  )
}

/** The header button: the companion's burrow. Click to call the voice out or tuck it away. */
export function CompanionButton() {
  const voiceId = useStore(activeVoice, (s) => s.id)
  useStore(userVoices)
  const voice = voiceById(voiceId)
  const on = useStore(companion, (s) => s.on)
  const leap = useStore(leaping, (s) => s.leap)
  const route = useRoute()
  const away = route.view === 'floor'
  return (
    <button
      className={`icon-btn companion-btn${on ? ' out' : ' home'}${leap ? ' leaping' : ''}`}
      onClick={() => setCompanion(!on)} disabled={away}
      title={away ? `${voice.name} is with you on the floor` : on ? `Tuck ${voice.name} away` : `Call ${voice.name} out`}
      aria-label={on ? `Hide the companion, ${voice.name}` : `Show the companion, ${voice.name}`} aria-pressed={on}
    >
      <Character look={voice.look} size={26} mood={on ? 'idle' : 'sleepy'} title={voice.name} />
    </button>
  )
}

/** The character in flight between the dock and the header. */
function LeapLayer() {
  const leap = useStore(leaping, (s) => s.leap)
  const voiceId = useStore(activeVoice, (s) => s.id)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!leap) return
    const el = ref.current
    if (!el || prefersStill() || !el.animate) { landLeap(); return }
    const a = el.animate(leapFrames(leap, FACE), { duration: 820, easing: 'linear', fill: 'forwards' })
    a.onfinish = () => landLeap()
    return () => a.cancel()
  }, [leap])
  if (!leap) return null
  return (
    <div ref={ref} className="leap" aria-hidden>
      <Character look={voiceById(voiceId).look} size={FACE} mood="happy" />
    </div>
  )
}
