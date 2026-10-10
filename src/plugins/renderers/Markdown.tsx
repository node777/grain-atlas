// Markdown, set on linen. Internal links stay inside the atlas, images read from the tree,
// links into the maintainer's field are marked as out of reach, and every one-clock stamp in the
// prose becomes a door into the sky of its moment.

import { useEffect, useMemo, useRef } from 'react'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { resolveLink } from '@/grain/header'
import { repo, isFieldRoom } from '@/grain/repo'
import { parseStamp } from '@/grain/stamps'
import { hrefFor, navigate } from '@/core/router'
import type { FileContext } from '@/core/registry'
import { setupLanguages, languageFor } from './languages'
import { quickMoment, quickLine } from '@/astro/describe'
import { settings } from '@/core/settings'

const hljs = setupLanguages()

function makeMarked(path: string, rawBase: string) {
  const entries = repo.get().entries
  const m = new Marked({ gfm: true, breaks: false })
  m.use({
    renderer: {
      code({ text, lang }) {
        const l = (lang ?? '').trim().toLowerCase()
        const name = l === 'rish' ? 'rishi' : l === 'brix' || l === 'kyri' ? 'kyri' : l === 'zig' ? 'rye' : l
        const html = name && hljs.getLanguage(name)
          ? hljs.highlight(text, { language: name, ignoreIllegals: true }).value
          : escapeHtml(text)
        return `<pre class="code"><code class="hljs" data-lang="${escapeHtml(l)}">${html}</code></pre>`
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens)
        const t = title ? ` title="${escapeHtml(title)}"` : ''
        if (/^(https?:|mailto:)/i.test(href)) return `<a href="${escapeHtml(href)}"${t} target="_blank" rel="noreferrer">${inner}</a>`
        if (href.startsWith('#')) return `<a href="#" data-anchor="${escapeHtml(href.slice(1))}"${t}>${inner}</a>`
        const target = resolveLink(path, href)
        if (!target) return inner
        if (!entries.has(target)) {
          const why = isFieldRoom(target) ? 'rests in the maintainer\'s field' : 'is not in this tree'
          return `<span class="field-link" title="${escapeHtml(target)} ${why}">${inner}</span>`
        }
        return `<a href="${hrefFor('read', target)}"${t}>${inner}</a>`
      },
      image({ href, title, text }) {
        const local = resolveLink(path, href) ?? href
        // raw.githubusercontent serves SVG as text/plain, which an <img> refuses; jsDelivr's GitHub
        // mirror serves it as an image.
        const target = /^(https?:|data:)/.test(href) ? href
          : /\.svg$/i.test(local) ? `${cdnBase(rawBase)}/${local}` : `${rawBase}/${local}`
        return `<img src="${escapeHtml(target)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ''} loading="lazy">`
      },
    },
  })
  return m
}

/** https://raw.githubusercontent.com/o/r/ref  ->  https://cdn.jsdelivr.net/gh/o/r@ref */
function cdnBase(rawBase: string): string {
  const m = /raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(.+)$/.exec(rawBase)
  return m ? `https://cdn.jsdelivr.net/gh/${m[1]}/${m[2]}@${m[3]}` : rawBase
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Wrap one-clock stamps found in text nodes (outside code blocks) with stamp buttons. */
function linkStamps(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const hits: Text[] = []
  const re = /\b20\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[.\-_]([01]\d|2[0-3])[0-5]\d[0-5]\d\b/
  while (walker.nextNode()) {
    const n = walker.currentNode as Text
    if (n.parentElement?.closest('pre, a, button')) continue
    if (re.test(n.data)) hits.push(n)
  }
  const lon = settings.get().place.lon
  for (const n of hits) {
    const frag = document.createDocumentFragment()
    const reG = new RegExp(re.source, 'g')
    let last = 0
    let m: RegExpExecArray | null
    while ((m = reG.exec(n.data))) {
      frag.append(n.data.slice(last, m.index))
      const st = parseStamp(n.data.slice(m.index, m.index + 24), 'inline')
      const b = document.createElement('button')
      b.className = 'stamp inline'
      b.textContent = m[0]
      if (st) {
        b.dataset.t = st.date.toISOString()
        b.title = `${quickLine(quickMoment(st.date, lon))}\n${st.date.toUTCString()} (${st.zoneLabel})\nOpen the sky of this moment`
      }
      frag.append(b)
      last = m.index + m[0].length
    }
    frag.append(n.data.slice(last))
    n.replaceWith(frag)
  }
}

/**
 * Set the page's own header aside: drop the title when the folio already shows it, and gather
 * the **Key:** value lines under it into a small grid instead of one run-on paragraph.
 */
function liftHeader(text: string, dropTitle: boolean): { body: string; fields: Array<[string, string]> } {
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++
  if (dropTitle && /^#\s/.test(lines[i] ?? '')) lines.splice(i, 1)
  const isField = (l: string) => /^\*\*[A-Z][^*]{1,32}:\*\*/.test(l.trim())
  const h = lines.slice(0, 40).findIndex(isField)
  if (h < 0) return { body: lines.join('\n'), fields: [] }
  // the header block runs on through wrapped lines, and across blank lines while more fields follow
  let end = h
  while (end < lines.length) {
    const l = lines[end].trim()
    if (l === '---' || /^#{1,6}\s/.test(l)) break
    if (!l) {
      let k = end + 1
      while (k < lines.length && !lines[k].trim()) k++
      if (k < lines.length && isField(lines[k])) { end = k; continue }
      break
    }
    end++
  }
  const joined = lines.slice(h, end).filter((l) => l.trim()).join(' ')
  const fields: Array<[string, string]> = []
  for (const m of joined.matchAll(/\*\*([A-Z][^*]{1,32}):\*\*\s*(.*?)(?=\s*(?:[-·]\s*)?\*\*[A-Z][^*]{1,32}:\*\*|$)/g)) {
    fields.push([m[1], m[2].trim()])
  }
  return { body: [...lines.slice(0, h), ...lines.slice(end)].join('\n'), fields }
}

export function Markdown({ path, text, rawUrl, embedded }: FileContext) {
  const ref = useRef<HTMLDivElement>(null)
  const rawBase = rawUrl.slice(0, rawUrl.length - path.length - 1)
  const html = useMemo(() => {
    const full = text.length > 600_000 ? text.slice(0, 600_000) + '\n\n*… the page continues beyond what the atlas unrolls at once.*' : text
    const { body, fields } = liftHeader(full, !embedded)
    const m = makeMarked(path, rawBase)
    const head = fields.length
      ? `<dl class="page-fields">${fields.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${m.parseInline(v) as string}</dd>`).join('')}</dl>`
      : ''
    const out = head + (m.parse(body) as string)
    return DOMPurify.sanitize(out, { ADD_ATTR: ['target', 'data-anchor', 'data-lang'] })
  }, [path, text, rawBase, embedded])

  useEffect(() => {
    if (ref.current) linkStamps(ref.current)
  }, [html])

  const onClick = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement
    const stamp = el.closest<HTMLButtonElement>('button.stamp.inline')
    if (stamp?.dataset.t) {
      e.preventDefault()
      navigate('sky', '', { t: stamp.dataset.t, from: path })
      return
    }
    const anchor = el.closest<HTMLAnchorElement>('a[data-anchor]')
    if (anchor) {
      e.preventDefault()
      const id = anchor.dataset.anchor!
      const target = [...(ref.current?.querySelectorAll('h1,h2,h3,h4') ?? [])].find((h) => slug(h.textContent ?? '') === id)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return <div ref={ref} className="prose" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}

const slug = (s: string) => s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')

export function Code({ path, text }: FileContext) {
  const lang = languageFor(path)
  const html = useMemo(() => {
    const src = text.length > 400_000 ? text.slice(0, 400_000) : text
    return lang ? hljs.highlight(src, { language: lang, ignoreIllegals: true }).value : escapeHtml(src)
  }, [path, text, lang])
  const lines = useMemo(() => text.split('\n').length, [text])
  return (
    <div className="code-sheet">
      <div className="code-meta sans faint">{lang ?? 'plain text'} -- {lines.toLocaleString()} lines</div>
      <pre className="code numbered"><code className="hljs" dangerouslySetInnerHTML={{ __html: html }} /></pre>
    </div>
  )
}

export function ImageView({ path, rawUrl, text }: FileContext) {
  // raw.githubusercontent serves SVG as text/plain, so draw SVG from its own text.
  const src = path.toLowerCase().endsWith('.svg') && text ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}` : rawUrl
  return <img src={src} alt={path} style={{ maxWidth: '100%', borderRadius: 'var(--r2)', background: 'var(--sky)' }} />
}
