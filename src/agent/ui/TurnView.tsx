// One conversation, drawn: the reader's words, the voice's answer (with its face), the tools it
// reached for and the hands it sent, folded so the talk stays readable.

import { useEffect, useMemo, useRef } from 'react'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { hrefFor } from '@/core/router'
import { useStore } from '@/core/store'
import { repo } from '@/grain/repo'
import type { Thread, Turn } from '../threads'
import { voiceById } from '@/voices/voices'
import { Character } from '@/voices/Character'
import { money } from '../gauge'

const md = new Marked({ gfm: true, breaks: true })

function Prose({ text }: { text: string }) {
  const entries = useStore(repo, (s) => s.entries)
  const html = useMemo(() => {
    // link bare grain paths the voice mentions
    const linked = text.replace(/`((?:[\w.-]+\/)+[\w.-]+\.[a-z]{1,6})`/g, (m, p) => (entries.has(p) ? `[\`${p}\`](${hrefFor('read', p)})` : m))
    return DOMPurify.sanitize(md.parse(linked) as string)
  }, [text, entries])
  return <div className="prose turn-prose" dangerouslySetInnerHTML={{ __html: html }} />
}

function ToolLine({ t }: { t: Turn['tools'][number] }) {
  return (
    <details className={`tool-line${t.error ? ' err' : ''}`}>
      <summary>
        <span className="mono">{t.hand ? '  ↳ ' : ''}{t.name}</span>
        <span className="faint"> {t.input}</span>
        {t.result === undefined && <span className="faint"> …</span>}
      </summary>
      {t.result && <pre className="mono tool-result">{t.result}</pre>}
    </details>
  )
}

export function TurnView({ turn, thread, compact }: { turn: Turn; thread: Thread; compact?: boolean }) {
  const voice = voiceById(thread.voiceId)
  if (turn.role === 'reader') {
    return <div className="turn turn-reader"><div className="turn-bubble">{turn.text}</div></div>
  }
  if (turn.role === 'notice') {
    return <div className="turn turn-notice"><Prose text={turn.text} /></div>
  }
  const speaking = !!turn.pending && turn.text.length > 0
  const thinking = !!turn.pending && !turn.text
  return (
    <div className="turn turn-voice">
      {!compact && <Character look={voice.look} size={46} speaking={speaking} thinking={thinking} title={voice.name} />}
      <div className="turn-body">
        <div className="turn-who sans">
          {voice.name}
          {turn.cost > 0 && <span className="faint"> {money(turn.cost)}</span>}
          {turn.pending && <span className="faint"> {thinking ? 'is thinking…' : 'is speaking…'}</span>}
        </div>
        {turn.thinking && (
          <details className="turn-thinking"><summary className="sans faint">thoughts</summary><Prose text={turn.thinking} /></details>
        )}
        {turn.hands.length > 0 && (
          <div className="turn-hands">
            {turn.hands.map((h) => (
              <details key={h.id} className="hand-card">
                <summary className="sans"><span className="hand-dot" data-done={!!h.report} /> a hand: {h.task.slice(0, 120)}</summary>
                {h.report ? <Prose text={h.report} /> : <p className="faint">working…</p>}
              </details>
            ))}
          </div>
        )}
        {turn.tools.length > 0 && (
          <div className="turn-tools">
            {turn.tools.slice(compact ? -4 : -40).map((t) => <ToolLine key={t.id} t={t} />)}
            {turn.tools.length > 40 && <span className="faint sans">and {turn.tools.length - 40} earlier</span>}
          </div>
        )}
        {turn.text ? <Prose text={turn.text} /> : turn.pending ? null : <p className="faint">(no words)</p>}
      </div>
    </div>
  )
}

export function Conversation({ thread, compact }: { thread: Thread; compact?: boolean }) {
  const end = useRef<HTMLDivElement>(null)
  const last = thread.turns[thread.turns.length - 1]
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [thread.turns.length, last?.text.length, last?.tools.length])
  return (
    <div className="conversation">
      {thread.turns.map((t) => <TurnView key={t.id} turn={t} thread={thread} compact={compact} />)}
      <div ref={end} />
    </div>
  )
}
