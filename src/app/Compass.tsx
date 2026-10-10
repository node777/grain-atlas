// The compass rose: every view sits on a point of the rose. The needle turns to where you are.

import { useState } from 'react'
import { hrefFor } from '@/core/router'
import type { ViewDef } from '@/core/registry'

export function Compass({ views, current }: { views: ViewDef[]; current: string }) {
  const n = views.length
  const R = 70
  const c = 98
  const idx = Math.max(0, views.findIndex((v) => v.id === current))
  const needle = (360 / n) * idx
  const [open, setOpen] = useState(false)
  return (
    <nav
      className={`compass${open ? ' open' : ''}`}
      aria-label="Views"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}
    >
      <button className="compass-here sans" onClick={() => setOpen(!open)} aria-expanded={open}>
        {views[idx]?.title ?? 'Views'}
      </button>
      <svg viewBox="-46 -12 288 220">
        <circle cx={c} cy={c} r={R + 10} fill="var(--veil)" stroke="var(--rule)" />
        <circle cx={c} cy={c} r={R - 16} fill="none" stroke="var(--rule)" strokeDasharray="1 4" />
        {/* the rose: long cardinal points, short intercardinals */}
        <g opacity="0.85">
          {Array.from({ length: 8 }, (_, i) => {
            const long = i % 2 === 0
            const L = long ? 46 : 26
            const W = long ? 7 : 5
            return (
              <path
                key={i}
                d={`M ${c} ${c - L} L ${c + W} ${c} L ${c} ${c + 2} L ${c - W} ${c} Z`}
                fill={long ? 'var(--brass-dim)' : 'var(--surface-2)'}
                stroke="var(--brass-dim)"
                strokeWidth="0.6"
                transform={`rotate(${i * 45} ${c} ${c})`}
              />
            )
          })}
        </g>
        <g style={{ transition: 'transform var(--settle) var(--ease)', transformOrigin: `${c}px ${c}px`, transform: `rotate(${needle}deg)` }}>
          <path d={`M ${c} ${c - 52} L ${c + 3.5} ${c} L ${c - 3.5} ${c} Z`} fill="var(--gold)" />
          <circle cx={c} cy={c} r="4" fill="var(--gold)" stroke="var(--brass-dim)" />
        </g>
        {views.map((v, i) => {
          const a = ((360 / n) * i - 90) * (Math.PI / 180)
          const x = c + Math.cos(a) * R
          const y = c + Math.sin(a) * R
          const lx = c + Math.cos(a) * (R + 22)
          const ly = c + Math.sin(a) * (R + 22)
          const anchor = Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end'
          return (
            <a key={v.id} href={hrefFor(v.id)} aria-current={v.id === current ? 'page' : undefined}>
              <title>{`${v.title}: ${v.hint}`}</title>
              <circle className="point" cx={x} cy={y} r="7" strokeWidth="1.2" />
              <text className="label" x={lx} y={ly + 4} textAnchor={anchor}>{v.title}</text>
            </a>
          )
        })}
      </svg>
    </nav>
  )
}
