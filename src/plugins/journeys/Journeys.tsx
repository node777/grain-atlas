// Journeys: walks through the tree that grain itself recommends. Reading a stop plants a seed;
// every stop read grows a grain on the journey's stalk; a full stalk is a harvest.
// No streaks and no clocks -- the road waits for you.

import { useMemo } from 'react'
import { useStore } from '@/core/store'
import { hrefFor, navigate } from '@/core/router'
import type { ViewProps } from '@/core/registry'
import { JOURNEYS, type Journey } from '@/grain/quests'
import { progress } from '@/grain/progress'
import { repo } from '@/grain/repo'
import { Character } from '@/voices/Character'
import { voiceById } from '@/voices/voices'
import './journeys.css'

export function Journeys(_: ViewProps) {
  const p = useStore(progress)
  const entries = useStore(repo, (s) => s.entries)
  const planted = Object.keys(p.seeds).length
  const harvested = Object.keys(p.harvested).length

  const doors = useMemo(() => [...entries.values()].filter((e) => /(^|\/)README\.md$/.test(e.path) && !p.seeds[e.path]), [entries, p.seeds])
  const wander = () => {
    if (!doors.length) return
    const d = doors[Math.floor(Math.random() * doors.length)]
    navigate('fields', '', { open: d.path, focus: d.path })
  }

  const start = (j: Journey) => {
    progress.set({ activeJourney: j.id })
    const next = j.stops.find((s) => !p.seeds[s.path]) ?? j.stops[0]
    navigate('fields', '', { open: next.path, focus: next.path })
  }

  return (
    <div className="journeys linen scroll">
      <header className="journeys-head">
        <div className="journeys-guide">
          <Character look={voiceById('kyli').look} size={92} title="Kyli" />
          <div className="guide-bubble panel linen-fine">
            <div className="sans faint" style={{ fontSize: 12 }}>Kyli, who teaches the walks</div>
            {planted === 0
              ? <>Today's walk has a few plays. Finish one before you stack the next -- <b>Three Doors</b> is a good first.</>
              : harvested > 0
                ? <>{harvested} {harvested === 1 ? 'walk' : 'walks'} harvested. Pick the next road, or wander off it for a while.</>
                : <>{planted} {planted === 1 ? 'seed' : 'seeds'} in the ground. Keep walking; the stalk fills one grain at a time.</>}
          </div>
        </div>
        <h1>Journeys</h1>
        <p className="muted">
          Walks through grain in the orders grain itself recommends. Reading a stop plants a seed in your field;
          finish a walk and it is harvested. Wander off the road whenever you like -- the road waits.
        </p>
        <div className="granary">
          <Stalk total={Math.max(12, planted)} done={planted} tall />
          <div>
            <div style={{ fontSize: 22 }}>{planted} {planted === 1 ? 'seed' : 'seeds'} planted, {harvested} {harvested === 1 ? 'harvest' : 'harvests'}</div>
            <div className="faint sans" style={{ fontSize: 13 }}>kept in this browser only</div>
            <button className="ascii-btn" onClick={wander} style={{ marginTop: 6 }}>[ wander to an unread door ]</button>
          </div>
        </div>
      </header>
      <div className="journey-grid">
        {JOURNEYS.map((j) => {
          const done = j.stops.filter((s) => p.seeds[s.path]).length
          const isActive = p.activeJourney === j.id
          const harvestedAt = p.harvested[j.id]
          return (
            <article key={j.id} className={`journey panel linen-fine${isActive ? ' active' : ''}`} style={{ ['--accent' as string]: `var(--el-${j.element})` }}>
              <div className="journey-top">
                <Stalk total={j.stops.length} done={done} />
                <div style={{ minWidth: 0 }}>
                  <h2>{j.title}</h2>
                  <p className="journey-inv">{j.invitation}</p>
                  <p className="sans faint" style={{ fontSize: 12, margin: 0 }}>
                    from <a href={hrefFor('read', j.source)}>{j.source}</a>, {done} of {j.stops.length} read
                  </p>
                </div>
              </div>
              <ol className="journey-stops">
                {j.stops.map((s) => (
                  <li key={s.path} className={p.seeds[s.path] ? 'read' : ''}>
                    <a href={hrefFor('fields', '', { open: s.path, focus: s.path })}>{s.note}</a>
                    {s.run && <code className="mono">{s.run}</code>}
                  </li>
                ))}
              </ol>
              {harvestedAt
                ? <p className="benediction">{j.benediction}</p>
                : <button className="chip journey-go" onClick={() => start(j)}>{done ? 'Continue the road' : 'Set out'}</button>}
            </article>
          )
        })}
      </div>
    </div>
  )
}

/** A wheat stalk with one grain per stop; read stops are filled gold. */
export function Stalk({ total, done, tall }: { total: number; done: number; tall?: boolean }) {
  const pairs = Math.ceil(total / 2)
  const h = tall ? 120 : 84
  const step = (h - 24) / Math.max(1, pairs)
  return (
    <svg width={tall ? 56 : 40} height={h} viewBox={`0 0 40 ${h}`} aria-label={`${done} of ${total}`} className="stalk">
      <path d={`M20 ${h - 2} V 10`} stroke="var(--brass-dim)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20 10 l0 -7 M16 12 l-3 -6 M24 12 l3 -6" stroke="var(--brass-dim)" strokeWidth="1.2" strokeLinecap="round" />
      {Array.from({ length: total }, (_, i) => {
        const row = Math.floor(i / 2)
        const left = i % 2 === 0
        const y = h - 16 - row * step
        const filled = i < done
        return (
          <ellipse
            key={i}
            cx={left ? 15 : 25}
            cy={y}
            rx="3.6"
            ry="6"
            transform={`rotate(${left ? -26 : 26} ${left ? 15 : 25} ${y})`}
            fill={filled ? 'var(--gold)' : 'transparent'}
            stroke={filled ? 'var(--brass-dim)' : 'var(--ink-3)'}
            strokeWidth="1"
          />
        )
      })}
    </svg>
  )
}
