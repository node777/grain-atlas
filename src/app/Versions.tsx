// The version you are reading, named the way grain names it, and the door to other versions:
// grain-ww's public seed, grain-os, any fork on GitHub, a folder of your own, or the bridge.

import { useState } from 'react'
import { useStore } from '@/core/store'
import { repo, loadRepo } from '@/grain/repo'
import { sources, remember, refKey, refLabel, KNOWN_REMOTES, type SourceRef } from '@/sources'
import { localSupported, pickLocalGrain, restoreLocalGrain } from '@/sources/local'
import { bridgeConfig, bridgeHealth } from '@/sources/bridge'
import { toast } from '@/ui/Toast'

export function switchTo(ref: SourceRef): void {
  remember(ref)
  loadRepo()
}

export function VersionBadge({ onOpen }: { onOpen: () => void }) {
  const r = useStore(repo, (x) => ({ v: x.versionInfo, origin: x.origin, phase: x.phase, progress: x.progress, writable: x.writable }))
  const label = r.v?.name ?? (r.origin.kind === 'github' ? r.origin.repo : r.origin.kind === 'local' ? r.origin.name : 'bridge')
  return (
    <button className="chip version-badge" onClick={onOpen} title={`${refLabel(r.origin)}${r.v ? ` -- ${r.v.detail}` : ''}. Switch versions.`}>
      <span className={`vb-dot ${r.writable ? 'writable' : ''}`} aria-hidden="true" />
      <span className="vb-name">{label}</span>
      <span className="faint">{r.origin.kind === 'github' ? r.origin.owner : r.origin.kind === 'local' ? 'local' : 'bridge'}</span>
      {r.phase === 'loading' && r.progress ? <span className="faint">{r.progress.toLocaleString()}</span> : null}
    </button>
  )
}

export function VersionsPanel({ onClose }: { onClose?: () => void }) {
  const s = useStore(sources)
  const r = useStore(repo, (x) => ({ v: x.versionInfo, origin: x.origin, phase: x.phase, files: x.entries.get('')?.files ?? 0, note: x.note, writable: x.writable }))
  const b = useStore(bridgeConfig)
  const [fork, setFork] = useState('')
  const [branch, setBranch] = useState('main')
  const [busy, setBusy] = useState(false)
  const active = refKey(s.active)

  const openLocal = async () => {
    try {
      setBusy(true)
      const h = await pickLocalGrain()
      switchTo({ kind: 'local', name: h.name })
      onClose?.()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast((e as Error).message, 6000)
    } finally {
      setBusy(false)
    }
  }
  const reopenLocal = async () => {
    const h = await restoreLocalGrain(true)
    if (h) loadRepo()
    else toast('The browser did not grant access. Open the folder again.')
  }
  const connectBridge = async () => {
    try {
      const h = await bridgeHealth()
      toast(`Bridge answered from ${h.root}${h.claude ? `, with ${h.claude}` : ''}.`, 5000)
      switchTo({ kind: 'bridge' })
      onClose?.()
    } catch (e) {
      toast(`The bridge did not answer: ${(e as Error).message}`, 7000)
    }
  }
  const openFork = () => {
    const m = /^(?:https:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(fork.trim())
    if (!m) { toast('Write a repository as owner/name.'); return }
    switchTo({ kind: 'github', owner: m[1], repo: m[2], branch: branch.trim() || 'main' })
    onClose?.()
  }

  return (
    <div className="versions">
      <section className="panel linen-fine versions-now">
        <div className="sans faint" style={{ fontSize: 12 }}>you are reading</div>
        <div style={{ fontSize: 26 }}>{r.v?.name ?? '…'} <span className="faint" style={{ fontSize: 15 }}>{refLabel(r.origin)}</span></div>
        <p className="muted" style={{ margin: '2px 0 6px' }}>{r.v?.detail ?? (r.phase === 'loading' ? 'reading the tree…' : '')}</p>
        <div className="sans" style={{ fontSize: 13, display: 'grid', gap: 2 }}>
          {r.v?.commit && <span>commit <code className="mono">{r.v.commit.sha.slice(0, 10)}</code> -- {r.v.commit.subject}{r.v.commit.date ? `, ${new Date(r.v.commit.date).toLocaleString()}` : ''}</span>}
          {r.v?.descriptor && <span>.brix descriptor version <code className="mono">{r.v.descriptor}</code></span>}
          {r.v?.pier && <span>pier: {Object.entries(r.v.pier).slice(0, 6).map(([k, val]) => `${k} ${val}`).join('; ')}</span>}
          <span>{r.files.toLocaleString()} files; {r.writable ? 'writable -- agents and you can write here' : 'read-only -- writes become drafts'}</span>
          {r.v?.pointsTo && (
            <span>
              This repository is a pointer.{' '}
              <button className="ascii-btn" onClick={() => { const [o, n] = r.v!.pointsTo!.split('/'); switchTo({ kind: 'github', owner: o, repo: n, branch: 'main' }) }}>[ follow it to {r.v.pointsTo} ]</button>
            </span>
          )}
          {r.phase === 'needs-permission' && <button className="chip" onClick={reopenLocal}>Let the atlas read the folder again</button>}
        </div>
      </section>

      <section>
        <h3>grain's own versions</h3>
        <div className="versions-list">
          {KNOWN_REMOTES.map((k) => {
            const ref: SourceRef = { kind: 'github', owner: k.owner, repo: k.repo, branch: k.branch }
            const on = refKey(ref) === active
            return (
              <button key={refKey(ref)} className={`version-row panel${on ? ' on' : ''}`} onClick={() => { switchTo(ref); onClose?.() }}>
                <b>{k.owner}/{k.repo}</b><span className="faint">{k.note}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h3>Your own grain</h3>
        <p className="muted" style={{ marginTop: 0 }}>Open your clone of grain to see your version on the map, and to let you and the voices write into it.</p>
        <div className="dial-row">
          <button className="chip" disabled={!localSupported() || busy} onClick={openLocal} title={localSupported() ? '' : 'This browser cannot open folders; use Chrome, Edge, Arc or Brave, or the bridge.'}>Open a folder on this computer</button>
        </div>
        <details style={{ marginTop: 10 }}>
          <summary className="sans" style={{ cursor: 'pointer' }}>Or connect through the bridge (Claude Code on your machine)</summary>
          <p className="muted">Run <code className="mono">node scripts/bridge.mjs ~/grain</code> from a copy of the atlas repository. It prints a token. The bridge lets voices hand work to Claude Code in your checkout, with your own login.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label className="field">Bridge address<input value={b.url} onChange={(e) => bridgeConfig.set({ url: e.target.value })} /></label>
            <label className="field">Token<input type="password" value={b.token} onChange={(e) => bridgeConfig.set({ token: e.target.value })} /></label>
          </div>
          <button className="chip" style={{ marginTop: 8 }} onClick={connectBridge}>Connect</button>
        </details>
      </section>

      <section>
        <h3>A fork on GitHub</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <label className="field">owner/name<input value={fork} placeholder="someone/grain" onChange={(e) => setFork(e.target.value)} /></label>
          <label className="field">branch<input value={branch} onChange={(e) => setBranch(e.target.value)} /></label>
          <button className="chip" onClick={openFork}>Open</button>
        </div>
      </section>

      {s.recent.length > 0 && (
        <section>
          <h3>Recently opened</h3>
          <div className="versions-list">
            {s.recent.map((ref) => (
              <button key={refKey(ref)} className={`version-row panel${refKey(ref) === active ? ' on' : ''}`} onClick={() => { switchTo(ref); onClose?.() }}>
                <b>{refLabel(ref)}</b>{ref.kind === 'github' && <span className="faint">{ref.branch}</span>}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
