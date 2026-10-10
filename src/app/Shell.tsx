import { useEffect, useState } from 'react'
import { useRoute, hrefFor, navigate } from '@/core/router'
import { allViews, findView } from '@/core/registry'
import { useStore } from '@/core/store'
import { settings, applyTheme } from '@/core/settings'
import { repo } from '@/grain/repo'
import { Compass } from './Compass'
import { NowChip } from './NowChip'
import { SettingsDrawer } from './SettingsDrawer'
import { Folio } from './Folio'
import { Toasts } from '@/ui/Toast'
import { Mark } from '@/ui/Mark'
import { Dock } from './Dock'
import { VersionBadge, VersionsPanel } from './Versions'

let lastBackground = 'fields'

export function Shell() {
  const route = useRoute()
  const s = useStore(settings)
  const r = useStore(repo, (x) => ({ phase: x.phase, source: x.source, note: x.note, error: x.error }))
  const [drawer, setDrawer] = useState(false)
  const [versions, setVersions] = useState(false)

  useEffect(() => applyTheme(s), [s.mode, s.element, s.motion])
  useEffect(() => {
    if (!route.view) navigate(s.introSeen ? 'fields' : 'intro')
  }, [route.view])

  const openPath = route.view === 'read' ? route.path : route.params.open
  const bgId = route.view === 'read' ? lastBackground : route.view
  if (route.view !== 'read' && route.view && route.view !== 'intro') lastBackground = route.view
  const view = findView(bgId) ?? findView('fields')
  const isIntro = route.view === 'intro'

  if (isIntro && view) {
    const V = view.component
    return <V route={route} />
  }

  return (
    <div className="atlas">
      <header className="topbar">
        <a className="wordmark" href={hrefFor('fields')} aria-label="Grain Atlas, the fields">
          <Mark size={22} />
          <span>Grain <em>Atlas</em></span>
        </a>
        <span className="here">
          {view && <><b>{view.title}</b> <span className="faint">-- {view.hint}</span></>}
        </span>
        <span className="spacer" />
        {r.phase === 'loading' && <span className="faint">reading the tree…</span>}
        {r.error && <span style={{ color: 'var(--red)' }} title={r.error}>[ tree unreachable ]</span>}
        {r.note && <span className="faint" title={r.note}>[ {r.source} ]</span>}
        <VersionBadge onOpen={() => setVersions(!versions)} />
        <NowChip />
        <button
          className="icon-btn"
          title={s.mode === 'hearth' ? 'Stone (day) mode' : 'Hearth (night) mode'}
          onClick={() => settings.set({ mode: s.mode === 'hearth' ? 'stone' : 'hearth' })}
        >
          {s.mode === 'hearth' ? '☾' : '☼'}
        </button>
        <button className="icon-btn" title="Settings: place, sky, repo" onClick={() => setDrawer(true)}>⚙</button>
      </header>
      <main className="atlas-stage">
        {view && <div className="view"><view.component route={route} /></div>}
        <Compass views={allViews().filter((v) => !v.hidden)} current={bgId} />
        {openPath !== undefined && openPath !== '' && <Folio path={openPath} route={route} />}
      </main>
      {drawer && <SettingsDrawer onClose={() => setDrawer(false)} />}
      {versions && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 44 }} onClick={() => setVersions(false)} />
          <div className="popover panel linen-fine" role="dialog" aria-label="Versions"><VersionsPanel onClose={() => setVersions(false)} /></div>
        </>
      )}
      <Dock />
      <Toasts />
    </div>
  )
}
