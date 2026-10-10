// Markdown, set on linen. Internal links stay inside the atlas, images read from the tree,
// links into the maintainer's field are marked as out of reach, and every one-clock stamp in the
// prose becomes a door into the sky of its moment.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { resolveLink } from '@/grain/header'
import { repo, isFieldRoom, assetUrl } from '@/grain/repo'
import { parseStamp } from '@/grain/stamps'
import { hrefFor, navigate } from '@/core/router'
import type { FileContext } from '@/core/registry'
import { setupLanguages, languageFor } from './languages'
import { quickMoment, quickLine } from '@/astro/describe'
import { settings } from '@/core/settings'

const hljs = setupLanguages()

function makeMarked(path: string) {
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
        // Relative images are left for fixMedia, which asks the active version for a loadable URL.
        return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ''} loading="lazy">`
      },
    },
  })
  return m
}

// Relative image paths must not reach the browser as src: it would ask the atlas's own server
// for them. Park them in data-src, and fixMedia hands over a loadable URL.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  const el = node as Element
  if (el.tagName === 'IMG') {
    const src = el.getAttribute('src')
    if (src && !isAbsolute(src)) { el.setAttribute('data-src', src); el.removeAttribute('src') }
  } else if (el.tagName === 'SOURCE') {
    const set = el.getAttribute('srcset')
    if (set && !isAbsolute(set.trim())) { el.setAttribute('data-srcset', set); el.removeAttribute('srcset') }
  }
})

function isAbsolute(u: string): boolean { return /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u) }

/** github.com/o/r/blob/ref/path  ->  raw.githubusercontent.com/o/r/ref/path (an <img> can load it) */
const rawGithub = (u: string) => u.replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/, 'https://raw.githubusercontent.com/$1/$2/$3')

/**
 * Pages mix Markdown images with raw HTML (<img>, <picture><source>, <a>), and GitHub resolves
 * their relative paths against the page. Do the same here: images and sources load from the
 * active version (GitHub, a local folder or the bridge), and relative links stay in the atlas.
 * A picture that cannot load shows its words in a small frame instead of a broken icon.
 */
/**
 * A picture standing alone in its paragraph gets its words beneath it, as GitHub shows a title on
 * hover: some of grain's pictures are deliberately dark (its logo is a charcoal band on black),
 * and the caption says so.
 */
function captionIfAlone(img: HTMLImageElement): void {
  const p = img.parentElement
  if (!img.alt || !p || img.closest('a') || p.textContent?.trim() || p.querySelectorAll('img').length > 1) return
  const cap = document.createElement('span')
  cap.className = 'img-caption'
  cap.textContent = img.alt
  img.after(cap)
}

function fixMedia(root: HTMLElement, path: string): void {
  const entries = repo.get().entries
  for (const img of root.querySelectorAll<HTMLImageElement>('img')) {
    if (img.dataset.fixed) continue
    img.dataset.fixed = '1'
    img.addEventListener('error', () => {
      if (img.dataset.failed) return
      img.dataset.failed = '1'
      const span = document.createElement('span')
      span.className = 'img-missing'
      span.textContent = img.alt || img.getAttribute('src')?.split('/').pop() || 'an image'
      span.title = `${img.getAttribute('src') ?? ''} could not be loaded`
      img.replaceWith(span)
    }, { once: true })
    captionIfAlone(img)
    const parked = img.dataset.src
    const src = parked ?? img.getAttribute('src') ?? ''
    if (!src) continue
    if (!parked) { const raw = rawGithub(src); if (raw !== src) img.src = raw; continue }
    const target = resolveLink(path, src)
    if (!target) { img.dispatchEvent(new Event('error')); continue }
    assetUrl(target).then((u) => { img.src = u }).catch(() => img.dispatchEvent(new Event('error')))
  }
  for (const source of root.querySelectorAll<HTMLSourceElement>('source[data-srcset]')) {
    const first = (source.dataset.srcset ?? '').trim().split(/\s+/)[0]
    const target = first ? resolveLink(path, first) : null
    if (!target) { source.remove(); continue }
    assetUrl(target).then((u) => source.setAttribute('srcset', u)).catch(() => source.remove())
  }
  // raw-HTML anchors (Markdown links were already rewritten by the renderer)
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = a.getAttribute('href') ?? ''
    if (!href || href.startsWith('#') || isAbsolute(href)) {
      if (isAbsolute(href) && !a.target) { a.target = '_blank'; a.rel = 'noreferrer' }
      continue
    }
    const target = resolveLink(path, href)
    if (target && entries.has(target)) { a.setAttribute('href', hrefFor('read', target)); continue }
    a.removeAttribute('href')
    a.className = 'field-link'
    a.title = `${target ?? href} ${target && isFieldRoom(target) ? 'rests in the maintainer\'s field' : 'is not in this tree'}`
  }
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

export function Markdown({ path, text, embedded }: FileContext) {
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(() => {
    const full = text.length > 600_000 ? text.slice(0, 600_000) + '\n\n*… the page continues beyond what the atlas unrolls at once.*' : text
    const { body, fields } = liftHeader(full, !embedded)
    const m = makeMarked(path)
    const head = fields.length
      ? `<dl class="page-fields">${fields.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${m.parseInline(v) as string}</dd>`).join('')}</dl>`
      : ''
    const out = head + (m.parse(body) as string)
    return DOMPurify.sanitize(out, { ADD_ATTR: ['target', 'data-anchor', 'data-lang', 'align'] })
  }, [path, text, embedded])

  useEffect(() => {
    if (!ref.current) return
    fixMedia(ref.current, path)
    linkStamps(ref.current)
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

export function ImageView({ path, text }: FileContext) {
  // SVG draws from its own text; anything else loads from the active version (GitHub, folder, bridge).
  const svg = path.toLowerCase().endsWith('.svg') && text ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}` : ''
  const about = svg ? svgAbout(text) : ''
  const [src, setSrc] = useState(svg)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
    if (svg) { setSrc(svg); return }
    let live = true
    assetUrl(path).then((u) => { if (live) setSrc(u) }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [path, svg])
  if (failed) return <p className="img-missing">{path.split('/').pop()} could not be loaded from this version.</p>
  return (
    <figure className="image-view">
      {src && <img src={src} alt={path} onError={() => setFailed(true)} />}
      <figcaption className="faint sans">{about || path.split('/').pop()}</figcaption>
    </figure>
  )
}

/** An SVG's own words for itself: its aria-label, else its <title>. */
function svgAbout(text: string): string {
  const head = text.slice(0, 4000)
  const m = /aria-label="([^"]+)"/.exec(head) ?? /<title>([^<]+)<\/title>/.exec(head)
  return m ? m[1].trim() : ''
}
