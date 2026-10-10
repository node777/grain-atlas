// The Threshing Floor: where grain is worked. On a threshing floor the harvest is beaten and
// winnowed so the grain falls clean and the chaff blows away -- here voices do the work, hands
// carry the heavy reading, sheaves keep what matters, and the Gauge keeps the spend honest.

import { useEffect, useState } from 'react'
import { useStore } from '@/core/store'
import { hrefFor } from '@/core/router'
import type { ViewProps } from '@/core/registry'
import { agentSettings } from '@/agent/runtime'
import { gauge, money } from '@/agent/gauge'
import { loadThreads } from '@/agent/threads'
import { repo } from '@/grain/repo'
import { Talk } from './Talk'
import { Sow } from './Sow'
import { Memory } from './Memory'
import { Drafts } from './Drafts'
import { GaugePanel } from './GaugePanel'
import { VoicesPanel } from './VoicesPanel'
import { Keys } from './Keys'
import './floor.css'

const TABS = [
  ['talk', 'Talk'], ['sow', 'Sow'], ['sheaves', 'Sheaves'], ['drafts', 'Drafts and changes'],
  ['gauge', 'Gauge'], ['voices', 'Voices'], ['keys', 'Keys'],
] as const
type Tab = (typeof TABS)[number][0]

export function Floor({ route }: ViewProps) {
  const tab = (TABS.some(([id]) => id === route.path) ? route.path : 'talk') as Tab
  const s = useStore(agentSettings, (x) => ({ key: x.apiKey, backend: x.backend }))
  const g = useStore(gauge)
  const v = useStore(repo, (x) => ({ name: x.versionInfo?.name, writable: x.writable }))
  useEffect(() => { loadThreads() }, [])
  const ready = s.backend === 'bridge' || !!s.key
  const [hint] = useState(() => !ready)

  return (
    <div className="floor linen">
      <header className="floor-head">
        <div>
          <h1>The Threshing Floor</h1>
          <p className="muted">Work grain with its voices. Hands carry the reading, sheaves keep what matters, the Gauge keeps the spend.</p>
        </div>
        <div className="floor-meta sans">
          <span>working on <b>{v.name ?? '…'}</b> {v.writable ? '(writable)' : '(read-only: writes become drafts)'}</span>
          <span>today {money(g.day === new Date().toISOString().slice(0, 10) ? g.today : 0)} of {money(g.limits.perDay)}</span>
          <span>{s.backend === 'bridge' ? 'through Claude Code (bridge)' : s.key ? 'Claude API' : 'no key yet'}</span>
        </div>
      </header>
      <nav className="floor-tabs" aria-label="Threshing floor">
        {TABS.map(([id, label]) => (
          <a key={id} className="chip" aria-pressed={tab === id} href={hrefFor('floor', id)}>{label}</a>
        ))}
      </nav>
      {hint && tab !== 'keys' && !ready && (
        <div className="panel linen-fine floor-hint">
          The voices wake with an Anthropic API key, or through Claude Code on your own machine. <a href={hrefFor('floor', 'keys')}>Set it up under Keys</a>.
        </div>
      )}
      <div className="floor-body">
        {tab === 'talk' && <Talk route={route} />}
        {tab === 'sow' && <Sow />}
        {tab === 'sheaves' && <Memory />}
        {tab === 'drafts' && <Drafts />}
        {tab === 'gauge' && <GaugePanel />}
        {tab === 'voices' && <VoicesPanel />}
        {tab === 'keys' && <Keys />}
      </div>
    </div>
  )
}
