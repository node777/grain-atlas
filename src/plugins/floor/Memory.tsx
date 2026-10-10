import { useMemo, useState } from 'react'
import { useStore } from '@/core/store'
import { sheaves, unbind, bind, sheavesAsKyri, type SheafKind } from '@/agent/sheaves'
import { repo, writeFile } from '@/grain/repo'
import { activeVoice, voiceById } from '@/voices/voices'
import { toast } from '@/ui/Toast'

const KINDS: SheafKind[] = ['fact', 'decision', 'plan', 'summary', 'note', 'preference']

export function Memory() {
  const list = useStore(sheaves, (s) => s.list)
  const writable = useStore(repo, (s) => s.writable)
  const voiceId = useStore(activeVoice, (s) => s.id)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<SheafKind | ''>('')
  const [text, setText] = useState('')
  const [newKind, setNewKind] = useState<SheafKind>('preference')
  const shown = useMemo(() => list.filter((s) => (!kind || s.kind === kind) && (!q || `${s.text} ${s.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()))), [list, q, kind])

  const exportKyri = async (toTree: boolean) => {
    const text = sheavesAsKyri(list)
    if (toTree) {
      await writeFile('atlas-sheaves.kyri', text, 'the atlas')
      toast('Bound the sheaves into atlas-sheaves.kyri in your grain.')
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    a.download = 'atlas-sheaves.kyri'
    a.click()
  }

  return (
    <div className="memory">
      <p className="muted" style={{ maxWidth: '68ch' }}>
        Sheaves are the voices' long memory: short bundles of what was learned. A fresh thread recalls the few that fit its task instead of
        carrying every old word, so contexts stay light. Teach the voices your preferences here; they will keep to them.
      </p>
      <div className="panel linen-fine" style={{ padding: 12, display: 'grid', gap: 8, maxWidth: 760 }}>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Something every voice should remember, e.g. 'Prefer small pages; always add a Status line.'" />
        <div className="dial-row">
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as SheafKind)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          <button className="chip" disabled={!text.trim()} onClick={() => { bind({ kind: newKind, text: text.trim(), tags: [], paths: [], voice: voiceById(voiceId).name }); setText('') }}>Bind a sheaf</button>
          <span style={{ flex: 1 }} />
          <button className="chip" onClick={() => exportKyri(false)} disabled={!list.length}>Download .kyri</button>
          <button className="chip" onClick={() => exportKyri(true)} disabled={!list.length || !writable} title={writable ? '' : 'Open your own grain to write it there'}>Bind into my grain</button>
        </div>
      </div>
      <div className="dial-row" style={{ margin: '14px 0 8px' }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search sheaves" />
        <button className="chip" aria-pressed={!kind} onClick={() => setKind('')}>all {list.length}</button>
        {KINDS.map((k) => <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(kind === k ? '' : k)}>{k}</button>)}
      </div>
      <div className="sheaf-list">
        {shown.map((s) => (
          <div key={s.id} className="panel linen-fine sheaf">
            <div className="sans faint" style={{ fontSize: 12 }}>{s.kind} -- {s.voice} -- {new Date(s.at).toLocaleString()}{s.uses ? ` -- recalled ${s.uses}x` : ''}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{s.text}</div>
            {(s.tags.length > 0 || s.paths.length > 0) && <div className="mono faint" style={{ fontSize: 12 }}>{[...s.tags.map((t) => `#${t}`), ...s.paths].join('  ')}</div>}
            <button className="ascii-btn" onClick={() => unbind(s.id)}>[ unbind ]</button>
          </div>
        ))}
        {!shown.length && <p className="faint">No sheaves yet. The voices bind them as they work, and threshing a thread binds its grain.</p>}
      </div>
    </div>
  )
}
