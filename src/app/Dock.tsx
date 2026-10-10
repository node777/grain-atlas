// The dock: the current voice, always at hand. Ask it about the page you are on, have it keep a
// note, draft a change, or build something -- from any view of the atlas.

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/core/store'
import { hrefFor, useRoute } from '@/core/router'
import { activeVoice, voiceById, allVoices, userVoices } from '@/voices/voices'
import { Character } from '@/voices/Character'
import { threads, newThread, ask, stopThread, loadThreads } from '@/agent/threads'
import { agentSettings } from '@/agent/runtime'
import { Conversation } from '@/agent/ui/TurnView'

export function Dock() {
  const route = useRoute()
  const voiceId = useStore(activeVoice, (s) => s.id)
  useStore(userVoices)
  const voice = voiceById(voiceId)
  const t = useStore(threads)
  const ready = useStore(agentSettings, (s) => s.backend === 'bridge' || !!s.apiKey)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  useEffect(() => { if (open) loadThreads() }, [open])
  const thread = useMemo(() => t.list.find((x) => x.voiceId === voiceId && x.title.startsWith('dock: ')), [t.list, voiceId])
  const running = thread ? !!t.running[thread.id] : false
  const openPath = route.view === 'read' ? route.path : route.params.open
  if (route.view === 'floor' || route.view === 'intro') return null

  const send = (msg = text) => {
    const m = msg.trim()
    if (!m) return
    const th = thread ?? newThread(voiceId, { title: `dock: ${voice.name}` })
    setText('')
    ask(th.id, m)
  }
  const quick = [
    openPath && [`Explain ${openPath.split('/').pop()}`, `Explain the page I have open (${openPath}) in plain words: what it is for, where it sits in grain, and what to read next.`],
    openPath && ['Keep a note', `Bind a short sheaf (note) about ${openPath} capturing the one thing worth remembering from it.`],
    ['Where should I start?', 'I am new to grain. Look at where I am in the atlas and suggest the next three things to read or try, with paths.'],
    ['What changed lately?', 'What are the ten most recently stamped pages in grain, and what do they say about where the work is heading?'],
  ].filter(Boolean) as Array<[string, string]>

  return (
    <div className={`dock${open ? ' open' : ''}`}>
      {open && (
        <div className="dock-panel panel linen-fine">
          <div className="dock-head">
            <select value={voiceId} onChange={(e) => activeVoice.set({ id: e.target.value })} aria-label="Voice">
              {allVoices().map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <span className="faint sans" style={{ fontSize: 12 }}>{voice.role.slice(0, 60)}</span>
            <span style={{ flex: 1 }} />
            <a className="ascii-btn" href={hrefFor('floor', 'talk')}>[ floor ]</a>
            <button className="ascii-btn" onClick={() => setOpen(false)}>[ x ]</button>
          </div>
          <div className="dock-log scroll">
            {thread && thread.turns.length ? <Conversation thread={thread} compact /> : (
              <p className="muted" style={{ fontStyle: 'italic' }}>{voice.phrases[0] ?? `${voice.name} is listening.`}</p>
            )}
            {!ready && <p className="sans" style={{ fontSize: 13 }}>{voice.name} wakes with an API key or the bridge. <a href={hrefFor('floor', 'keys')}>Set it up</a>.</p>}
          </div>
          <div className="dock-quick">{quick.map(([label, msg]) => <button key={label} className="ascii-btn" disabled={!ready || running} onClick={() => send(msg)}>[ {label} ]</button>)}</div>
          <div className="dock-input">
            <textarea rows={2} value={text} placeholder={`Ask ${voice.name}…`} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
            {running ? <button className="chip" onClick={() => thread && stopThread(thread.id)}>Stop</button> : <button className="chip go" disabled={!ready || !text.trim()} onClick={() => send()}>Ask</button>}
          </div>
        </div>
      )}
      <button className="dock-face" onClick={() => setOpen(!open)} aria-label={`${open ? 'Close' : 'Open'} ${voice.name}`} title={`${voice.name}: ask about anything here`}>
        <Character look={voice.look} size={64} speaking={running} thinking={running && !thread?.turns[thread.turns.length - 1]?.text} title={voice.name} />
        {!open && <span className="dock-name sans">{voice.name}</span>}
      </button>
    </div>
  )
}
