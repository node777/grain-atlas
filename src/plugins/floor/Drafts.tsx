import { useState } from 'react'
import { useStore } from '@/core/store'
import { hrefFor } from '@/core/router'
import { drafts, dropDraft } from '@/agent/drafts'
import { changes, repo, writeFile } from '@/grain/repo'
import { toast } from '@/ui/Toast'

export function Drafts() {
  const list = useStore(drafts, (s) => s.list)
  const ch = useStore(changes, (s) => s.list)
  const writable = useStore(repo, (s) => s.writable)
  const [open, setOpen] = useState<string | null>(null)

  const download = (path: string, text: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    a.download = path.split('/').pop() ?? 'draft.txt'
    a.click()
  }

  return (
    <div className="drafts">
      <section>
        <h2>Drafts</h2>
        <p className="muted" style={{ maxWidth: '68ch' }}>What the voices wrote while reading a version they cannot write. Review each one, then copy it, download it, or write it into your own grain once it is open.</p>
        {list.map((d) => (
          <div key={d.path} className="panel linen-fine draft">
            <div className="dial-row">
              <button className="ascii-btn" onClick={() => setOpen(open === d.path ? null : d.path)}>{open === d.path ? '[ fold ]' : '[ read ]'}</button>
              <span className="mono">{d.path}</span>
              <span className="faint sans" style={{ fontSize: 12 }}>by {d.by}, {new Date(d.at).toLocaleString()}, {d.text.length.toLocaleString()} characters{d.note ? ` -- ${d.note}` : ''}</span>
              <span style={{ flex: 1 }} />
              <button className="ascii-btn" onClick={() => { navigator.clipboard?.writeText(d.text); toast('Copied.') }}>[ copy ]</button>
              <button className="ascii-btn" onClick={() => download(d.path, d.text)}>[ download ]</button>
              <button className="ascii-btn" disabled={!writable} onClick={async () => { await writeFile(d.path, d.text, d.by); dropDraft(d.path); toast(`Wrote ${d.path}.`) }} title={writable ? '' : 'Open your own grain first'}>[ write it ]</button>
              <button className="ascii-btn" onClick={() => dropDraft(d.path)}>[ discard ]</button>
            </div>
            {open === d.path && <pre className="code mono" style={{ maxHeight: 420 }}>{d.text}</pre>}
          </div>
        ))}
        {!list.length && <p className="faint">No drafts waiting.</p>}
      </section>
      <section>
        <h2>Changes written</h2>
        <div className="change-list">
          {ch.map((c, i) => (
            <div key={i} className="sans change">
              <span className="faint">{new Date(c.at).toLocaleString()}</span>
              <a href={hrefFor('floor', 'drafts', { open: c.path })} className="mono">{c.path}</a>
              <span className="faint">{c.created ? 'new' : 'changed'} by {c.by}, {c.bytes.toLocaleString()} characters</span>
            </div>
          ))}
          {!ch.length && <p className="faint">Nothing written into a grain yet.</p>}
        </div>
      </section>
    </div>
  )
}
