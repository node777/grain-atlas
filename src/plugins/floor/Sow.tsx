// Sowing, drawn as a field: each plot is a furrow, and its stalk grows as its hand works.

import { useState } from 'react'
import { useStore } from '@/core/store'
import { sowings, sow, stopSowing, isSowing, type Plot, type Sowing } from '@/agent/sowing'
import { gauge, money } from '@/agent/gauge'
import { allVoices, activeVoice, voiceById } from '@/voices/voices'
import { Character } from '@/voices/Character'
import { Markdown } from '@/plugins/renderers/Markdown'

const SEEDS = [
  'Write a beginner-friendly tour of the Caravan module: what it supervises, how its witnesses prove it, and where a newcomer should read first.',
  'Survey every page that mentions the one-clock naming law and draft a single plain-language summary page with links.',
  'Find docs that link to missing field rooms and propose public-friendly replacements.',
]

export function Sow() {
  const list = useStore(sowings, (s) => s.list)
  const g = useStore(gauge)
  const voiceId = useStore(activeVoice, (s) => s.id)
  const [seed, setSeed] = useState('')
  const [cap, setCap] = useState(Math.min(5, g.limits.perRun * 2))
  const [agents, setAgents] = useState(g.limits.maxAgents)
  const [plots, setPlots] = useState(4)
  const [voice, setVoice] = useState(voiceId)

  const plant = () => {
    if (!seed.trim()) return
    sow({ seed: seed.trim(), voiceId: voice, cap, agents, maxPlots: plots })
    setSeed('')
  }

  return (
    <div className="sow">
      <section className="panel linen-fine sow-plant">
        <h2>Plant a seed</h2>
        <p className="muted">A seed is an idea, a task or a direction. The voice lays out plots, sends a hand to each, winnows what grows against grain's ethos, and writes a harvest note. It keeps to the limits you set here.</p>
        <textarea value={seed} onChange={(e) => setSeed(e.target.value)} rows={4} placeholder="What should grow?" />
        <div className="seed-ideas">{SEEDS.map((x) => <button key={x} className="ascii-btn" onClick={() => setSeed(x)}>[ {x.slice(0, 54)}… ]</button>)}</div>
        <div className="sow-dials">
          <label className="field">Voice
            <select value={voice} onChange={(e) => setVoice(e.target.value)}>{allVoices().map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          </label>
          <label className="field">Spend at most {money(cap)}
            <input type="range" min={0.5} max={50} step={0.5} value={cap} onChange={(e) => setCap(+e.target.value)} />
          </label>
          <label className="field">Hands at once: {agents}
            <input type="range" min={1} max={12} step={1} value={agents} onChange={(e) => setAgents(+e.target.value)} />
          </label>
          <label className="field">Plots at most: {plots}
            <input type="range" min={1} max={12} step={1} value={plots} onChange={(e) => setPlots(+e.target.value)} />
          </label>
        </div>
        <button className="chip go" onClick={plant} disabled={!seed.trim()}>Sow it</button>
      </section>
      {list.map((s) => <Field key={s.id} s={s} />)}
    </div>
  )
}

function Field({ s }: { s: Sowing }) {
  const voice = voiceById(s.voiceId)
  const live = isSowing(s.id)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section className="panel linen-fine sow-field">
      <header className="sow-field-head">
        <Character look={voice.look} size={48} speaking={live && s.phase === 'tending'} thinking={live && s.phase !== 'tending'} title={voice.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sans faint" style={{ fontSize: 12 }}>{new Date(s.started).toLocaleString()} -- {voice.name} -- {s.phase}</div>
          <h3>{s.seed}</h3>
          <div className="sans" style={{ fontSize: 13 }}>{money(s.cost)} of {money(s.cap)}, {s.plots.length} plots, {s.agents} hands at once</div>
        </div>
        {live && <button className="chip" onClick={() => stopSowing(s.id)}>Stop</button>}
      </header>
      {s.plan && <p className="sow-plan">{s.plan}</p>}
      <div className="furrows">
        {s.plots.map((p) => <Furrow key={p.id} p={p} onClick={() => setOpen(open === p.id ? null : p.id)} open={open === p.id} />)}
      </div>
      {s.harvest && (
        <details className="harvest" open>
          <summary className="sans">Harvest note {s.harvestPath ? `-- ${s.harvestPath}` : ''}</summary>
          <Markdown path={s.harvestPath ?? 'harvest.md'} text={s.harvest} rawUrl="" embedded />
        </details>
      )}
      <details>
        <summary className="sans faint" style={{ fontSize: 12 }}>field log ({s.log.length})</summary>
        <pre className="mono sow-log">{s.log.join('\n')}</pre>
      </details>
    </section>
  )
}

function Furrow({ p, onClick, open }: { p: Plot; onClick: () => void; open: boolean }) {
  const h = Math.min(1, p.tools / 24)
  return (
    <div className={`furrow ${p.state}`}>
      <button className="furrow-row" onClick={onClick}>
        <svg width="34" height="56" viewBox="0 0 34 56" aria-hidden="true" className="furrow-stalk">
          <line x1="17" y1="54" x2="17" y2={54 - 8 - h * 38} stroke="var(--brass-dim)" strokeWidth="2" strokeLinecap="round" />
          {Array.from({ length: Math.round(h * 6) }, (_, i) => (
            <g key={i}>
              <ellipse cx="13" cy={50 - 8 - i * 6.5} rx="2.6" ry="4.4" transform={`rotate(-26 13 ${50 - 8 - i * 6.5})`} fill={p.state === 'withered' ? 'var(--ink-3)' : 'var(--gold)'} />
              <ellipse cx="21" cy={50 - 8 - i * 6.5} rx="2.6" ry="4.4" transform={`rotate(26 21 ${50 - 8 - i * 6.5})`} fill={p.state === 'withered' ? 'var(--ink-3)' : 'var(--gold)'} />
            </g>
          ))}
          <line x1="2" y1="54.5" x2="32" y2="54.5" stroke="var(--rule)" strokeWidth="1.5" />
        </svg>
        <div style={{ minWidth: 0, textAlign: 'left' }}>
          <div>{p.title}</div>
          <div className="sans faint" style={{ fontSize: 12 }}>{p.state}, {p.tools} tool calls, {money(p.cost)}{p.log.length ? ` -- ${p.log[p.log.length - 1]}` : ''}</div>
        </div>
      </button>
      {open && (
        <div className="furrow-detail">
          <p className="sans" style={{ fontSize: 13 }}><b>Task:</b> {p.task}</p>
          <p className="sans" style={{ fontSize: 13 }}><b>Done when:</b> {p.done}</p>
          {p.report && <Markdown path="report.md" text={p.report} rawUrl="" embedded />}
          <pre className="mono sow-log">{p.log.join('\n')}</pre>
        </div>
      )}
    </div>
  )
}
