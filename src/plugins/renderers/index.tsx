import type { AtlasPlugin, FileContext } from '@/core/registry'
import { Markdown, Code, ImageView } from './Markdown'
import { formatSize } from '@/app/Folio'
import { lookup } from '@/grain/repo'
import './prose.css'

function Binary({ path, rawUrl }: FileContext) {
  const e = lookup(path)
  const audio = /\.(peal|ogg|opus|wav|mp3)$/i.test(path)
  return (
    <div className="panel" style={{ padding: 20, display: 'grid', gap: 10 }}>
      {audio && (
        <>
          <p style={{ margin: 0 }}>{path.endsWith('.peal') ? 'A peal: grain\'s own audio mark, Opus in Ogg. The forge rings once.' : 'A sound.'}</p>
          <audio controls preload="none" src={rawUrl} style={{ width: '100%' }} />
        </>
      )}
      {!audio && <p style={{ margin: 0 }}>A binary file{e ? `, ${formatSize(e.size)}` : ''}. The atlas shows its place, not its bytes.</p>}
      <a className="ascii-btn" href={rawUrl} target="_blank" rel="noreferrer">[ open the raw bytes ]</a>
    </div>
  )
}

function Submodule({ path }: FileContext) {
  return <p className="muted">A submodule pointer: <span className="mono">{path}</span> names another repository, held by reference rather than copied in.</p>
}

const MD = /\.(md|markdown)$/i
const IMG = /\.(png|jpe?g|gif|webp|svg|ico)$/i
const BIN = /\.(peal|ogg|opus|wav|mp3|mp4|pdf|woff2?|ttf|otf|zip|gz|tar|bin|apk|wasm)$/i

export const renderersPlugin: AtlasPlugin = {
  id: 'renderers',
  title: 'Readers',
  description: 'How each kind of file is set on the page: markdown, grain languages, images, sound.',
  fileRenderers: [
    { id: 'markdown', priority: 10, test: (p) => MD.test(p), component: Markdown },
    { id: 'image', priority: 10, test: (p) => IMG.test(p), component: ImageView },
    { id: 'binary', priority: 10, test: (p) => BIN.test(p), component: Binary },
    { id: 'submodule', priority: 20, test: (p) => lookup(p)?.kind === 'module', component: Submodule },
    { id: 'code', priority: 1, test: () => true, component: Code },
  ],
}
