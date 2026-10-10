import { useMemo, useState } from 'react'
import { useStore } from '@/core/store'
import type { Route } from '@/core/router'
import { threads, newThread, ask, stopThread, threshThread, deleteThread, type Thread } from '@/agent/threads'
import { agentSettings } from '@/agent/runtime'
import { allVoices, activeVoice, voiceById, userVoices } from '@/voices/voices'
import { Character } from '@/voices/Character'
import { Conversation } from '@/agent/ui/TurnView'
import { money } from '@/agent/gauge'

export function Talk({ route }: { route: Route }) {
  const t = useStore(threads)
  useStore(userVoices)
  const voiceId = useStore(activeVoice, (s) => s.id)
  const threshAt = useStore(agentSettings, (s) => s.threshAt)
  const [selected, setSelected] = useState<string | null>(route.params.thread ?? null)
  const [draft, setDraft] = useState('')
  const voice = voiceById(voiceId)
  const mine = useMemo(() => t.list.filter((x) => x.voiceId === voiceId), [t.list, voiceId])
  const thread: Thread | undefined = t.list.find((x) => x.id === selected) ?? mine[0]
  const running = thread ? !!t.running[thread.id] : false
  const fill = thread ? Math.min(1, thread.lastInputTokens / threshAt) : 0

  const send = () => {
    const text = draft.trim()
    if (!text) return
    const th = thread ?? newThread(voiceId)
    setSelected(th.id)
    setDraft('')
    ask(th.id, text)
  }
  const doThresh = async () => {
    if (!thread) return
    const fresh = await threshThread(thread.id)
    if (fresh) setSelected(fresh.id)
  }

  return (
    <div className="talk">
      <aside className="talk-side">
        <div className="voice-roster">
          {allVoices().map((v) => (
            <button key={v.id} className={`voice-pick${v.id === voiceId ? ' on' : ''}`} onClick={() => { activeVoice.set({ id: v.id }); setSelected(null) }} title={`${v.name}: ${v.role}`}>
              <Character look={v.look} size={40} title={v.name} />
              <span>{v.name}</span>
            </button>
          ))}
        </div>
        <div className="thread-list">
          <button className="chip" onClick={() => setSelected(newThread(voiceId).id)}>New thread with {voice.name}</button>
          {mine.map((th) => (
            <div key={th.id} className={`thread-row${th.id === thread?.id ? ' on' : ''}`}>
              <button onClick={() => setSelected(th.id)}>
                <span>{th.title}</span>
                <span className="faint sans">{new Date(th.updatedAt).toLocaleDateString()} {th.cost ? money(th.cost) : ''}{th.from ? ', threshed' : ''}</span>
              </button>
              <button className="ascii-btn" title="Let this thread go" onClick={() => deleteThread(th.id)}>x</button>
            </div>
          ))}
        </div>
      </aside>
      <section className="talk-main">
        <div className="talk-voice">
          <Character look={voice.look} size={72} speaking={running} title={voice.name} />
          <div>
            <h2>{voice.name}</h2>
            <div className="muted">{voice.role}</div>
            <div className="tone-chips">{voice.tone.slice(0, 6).map((x) => <span key={x}>{x}</span>)}</div>
          </div>
        </div>
        <div className="talk-log scroll">
          {thread && thread.turns.length ? <Conversation thread={thread} /> : (
            <div className="talk-empty">
              <p style={{ fontStyle: 'italic' }}>{voice.phrases[0] ?? `${voice.name} is listening.`}</p>
              <p className="muted">Ask {voice.name} to explain a room, plan a change, draft a page, or keep a note. {voice.name} can read the whole tree, send hands to read for it, and remember across threads.</p>
            </div>
          )}
        </div>
        <div className="talk-input">
          <div className="context-meter" title={`${thread?.lastInputTokens.toLocaleString() ?? 0} tokens of context on the last request; thresh at ${threshAt.toLocaleString()}`}>
            <div style={{ width: `${fill * 100}%`, background: fill > 0.85 ? 'var(--annatto)' : 'var(--brass)' }} />
          </div>
          <textarea
            value={draft} rows={3} placeholder={`Speak to ${voice.name}…  (Enter to send, Shift+Enter for a new line)`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <div className="dial-row">
            {running
              ? <button className="chip" onClick={() => thread && stopThread(thread.id)}>Stop</button>
              : <button className="chip go" onClick={send} disabled={!draft.trim()}>Send</button>}
            <button className="chip" onClick={doThresh} disabled={!thread || !thread.api.length || running} title="Distil this thread into sheaves and a summary, and begin a fresh, light thread from it">
              Thresh {fill > 0.85 ? '(the thread is heavy)' : ''}
            </button>
            <span className="faint sans" style={{ fontSize: 12 }}>{thread ? `${thread.lastInputTokens.toLocaleString()} tokens of context, ${money(thread.cost)} so far` : ''}</span>
          </div>
        </div>
      </section>
    </div>
  )
}
