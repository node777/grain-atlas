// The Ledger: the tree as a programmer holds it -- folders on the left, a sortable table on the
// right, every row with its moment in Vedic terms and as a datetime, and search over all paths.

import { useMemo, useState } from 'react'
import { useStore } from '@/core/store'
import { hrefFor, navigate } from '@/core/router'
import type { ViewProps } from '@/core/registry'
import { repo, stampOf, type Entry } from '@/grain/repo'
import { regionOf } from '@/grain/rooms'
import { Stamp } from '@/ui/Stamp'
import { roomWord } from '@/grain/header'
import { formatSize } from '@/app/Folio'
import { progress } from '@/grain/progress'
import './ledger.css'

type SortKey = 'name' | 'moment' | 'size'

export function Ledger({ route }: ViewProps) {
  const r = useStore(repo, (s) => ({ entries: s.entries, version: s.version, phase: s.phase, error: s.error }))
  const seeds = useStore(progress, (p) => p.seeds)
  const dirPath = r.entries.get(route.path)?.kind === 'dir' ? route.path : ''
  const dir = r.entries.get(dirPath)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })

  const rows = useMemo(() => {
    let list: Entry[]
    const q = query.trim().toLowerCase()
    if (q) {
      const terms = q.split(/\s+/)
      list = []
      for (const e of r.entries.values()) {
        if (!e.path) continue
        const hay = `${e.path} ${e.meta?.title ?? ''}`.toLowerCase()
        if (terms.every((t) => hay.includes(t))) list.push(e)
        if (list.length > 400) break
      }
    } else {
      list = (dir?.children ?? []).map((c) => r.entries.get(c)!).filter(Boolean)
    }
    const val = (e: Entry): number | string => {
      if (sort.key === 'size') return e.size
      if (sort.key === 'moment') return stampOf(e)?.date.getTime() ?? 0
      return (e.kind === 'dir' ? '0' : '1') + e.name.toLowerCase()
    }
    return [...list].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir)
  }, [r.version, dirPath, query, sort])

  const head = (key: SortKey, label: string) => (
    <th>
      <button className="th-btn" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : key === 'name' ? 1 : -1 }))}>
        {label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  )

  if (r.phase === 'error' && !dir) return <div className="empty">The tree could not be read. {r.error}</div>
  if (!dir) return <div className="empty">Reading the tree…</div>

  const open = (e: Entry) => {
    if (e.kind === 'dir') navigate('ledger', e.path)
    else navigate('ledger', dirPath, { open: e.path })
  }

  return (
    <div className="ledger linen">
      <aside className="ledger-tree scroll" aria-label="Folders">
        <TreeNode entries={r.entries} path="" depth={0} current={dirPath} />
      </aside>
      <section className="ledger-main">
        <div className="ledger-bar">
          <nav className="crumbs">
            <a href={hrefFor('ledger')}>grain</a>
            {dirPath && dirPath.split('/').map((c, i, all) => {
              const p = all.slice(0, i + 1).join('/')
              return <span key={p}>/ <a href={hrefFor('ledger', p)}>{c}</a></span>
            })}
          </nav>
          <span className="faint sans" style={{ fontSize: 13 }}>
            {dir.files.toLocaleString()} files{dirPath ? `, in ${regionOf(dirPath + '/x').name}` : ''}
          </span>
          <span style={{ flex: 1 }} />
          <input
            type="search" placeholder="Search every path and title" value={query}
            onChange={(e) => setQuery(e.target.value)} aria-label="Search paths" style={{ width: 'min(340px, 50vw)' }}
          />
        </div>
        <div className="scroll" style={{ flex: 1 }}>
          <table className="ledger-table">
            <thead>
              <tr>{head('name', 'Name')}<th className="hide-sm">Room</th>{head('moment', 'Moment')}{head('size', 'Size')}</tr>
            </thead>
            <tbody>
              {dirPath && !query && (
                <tr className="row-dir" onClick={() => navigate('ledger', dir.parent)}><td colSpan={4}><span className="glyph">↰</span> up</td></tr>
              )}
              {rows.map((e) => (
                <tr key={e.path} className={e.kind === 'dir' ? 'row-dir' : ''} onClick={() => open(e)}>
                  <td>
                    <span className="glyph" aria-hidden="true">{e.kind === 'dir' ? '▸' : seeds[e.path] ? '✦' : '·'}</span>
                    <a href={e.kind === 'dir' ? hrefFor('ledger', e.path) : hrefFor('ledger', dirPath, { open: e.path })} onClick={(ev) => ev.preventDefault()}>
                      {query ? e.path : e.name}{e.kind === 'dir' ? '/' : ''}
                    </a>
                    {e.meta?.title && <div className="row-title">{e.meta.title}</div>}
                  </td>
                  <td className="hide-sm">{e.meta?.room ? <span className="room-tag" data-room={e.meta.room} title={e.meta.statusText}>{roomWord(e.meta.room, e.meta.statusText)}</span> : e.kind === 'dir' ? <span className="faint">{e.files}</span> : null}</td>
                  <td onClick={(ev) => ev.stopPropagation()}>{e.kind !== 'dir' && stampOf(e) ? <Stamp stamp={stampOf(e)} from={e.path} /> : null}</td>
                  <td className="mono faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatSize(e.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="empty">Nothing here answers to that.</p>}
        </div>
      </section>
    </div>
  )
}

function TreeNode({ entries, path, depth, current }: { entries: Map<string, Entry>; path: string; depth: number; current: string }) {
  const e = entries.get(path)!
  const openByDefault = depth === 0 || current === path || current.startsWith(path + '/')
  const [open, setOpen] = useState(openByDefault)
  const dirs = e.children.filter((c) => entries.get(c)?.kind === 'dir')
  return (
    <div>
      <div className={`tree-row${current === path ? ' on' : ''}`} style={{ paddingLeft: 8 + depth * 12 }}>
        {dirs.length > 0
          ? <button className="tree-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Fold' : 'Unfold'}>{open ? '▾' : '▸'}</button>
          : <span className="tree-toggle" />}
        <a href={hrefFor('ledger', path)}>{path ? e.name : 'grain'}</a>
        <span className="tree-count">{e.files}</span>
      </div>
      {open && dirs.map((d) => <TreeNode key={d} entries={entries} path={d} depth={depth + 1} current={current} />)}
    </div>
  )
}
