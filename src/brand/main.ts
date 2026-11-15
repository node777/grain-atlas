import '@fontsource/jacquard-24'
import '@fontsource/xanh-mono'
import '@fontsource/xanh-mono/400-italic.css'
import '@fontsource/vt323'
import './brand.css'

import jacquardURL from '@fontsource/jacquard-24/files/jacquard-24-latin-400-normal.woff2?url'
import xanhURL from '@fontsource/xanh-mono/files/xanh-mono-latin-400-normal.woff2?url'
import xanhItalicURL from '@fontsource/xanh-mono/files/xanh-mono-latin-400-italic.woff2?url'
import vtURL from '@fontsource/vt323/files/vt323-latin-400-normal.woff2?url'
import oflJacquard from '@fontsource/jacquard-24/LICENSE?raw'
import oflXanh from '@fontsource/xanh-mono/LICENSE?raw'
import oflVT from '@fontsource/vt323/LICENSE?raw'

import { MARKS, TILT, cursorSVG, dataURI, kernelGroup, mark, markGroup, markSVG, pixelSVG, rasterise, setMark, tip } from './marks'
import { DEFAULT_TUNING, PROFILES, paletteGPL, tokens, tokensCSS, tokensJSON, type Profile, type Tuning } from './profiles'
import { fontDataURI, save, svgToPNG, zip, type ZipEntry } from './kit'
import { furrow, sheaf, sieve } from './os'

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[]
const root = document.documentElement

/* ---------------- tuning ---------------- */

const KEY = 'grain-brand-tuning'
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
let t: Tuning = { ...DEFAULT_TUNING, still: reduce, ...safeJSON(localStorage.getItem(KEY)) }

function safeJSON(s: string | null): Partial<Tuning> {
  try {
    return s ? JSON.parse(s) : {}
  } catch {
    return {}
  }
}

const profile = (): Profile => PROFILES.find((p) => p.key === t.profile && p.ready) ?? PROFILES[0]
const ground = () => profile()[t.ground]
const dye = (key = t.dye) => (profile().dyes.find((d) => d.key === key) ?? profile().dyes[0])[t.ground]
const ink = () => ground().ink
const paper = () => ground().page

function apply() {
  setMark(t.mark)
  const p = profile()
  for (const [k, v] of Object.entries(tokens(p, t.ground, t.dye))) root.style.setProperty(k, v)
  root.style.setProperty('--scale', String(t.scale))
  root.dataset.ground = t.ground
  root.dataset.profile = p.key
  root.toggleAttribute('data-still', t.still)
  root.toggleAttribute('data-texture', t.texture)
  $('meta[name="theme-color"]').setAttribute('content', paper())
  $$('[data-bind="profile"]').forEach((e) => (e.textContent = p.name))
  $$('[data-bind="draft"]').forEach((e) => (e.textContent = p.draft))
  $$('[data-bind="mark"]').forEach((e) => (e.textContent = mark().name))
  $$('[data-bind="mark-no"]').forEach((e) => (e.textContent = `${MARKS.indexOf(mark()) + 1}/${MARKS.length}`))
  localStorage.setItem(KEY, JSON.stringify(t))
  syncDock()
  render()
}

/* ---------------- marks ---------------- */

const mk = {
  pointer: (size: number, body = ink()) => markSVG({ body, cut: paper() }, { tilt: TILT, size }),
  upright: (size: number, body = ink()) => markSVG({ body, cut: paper() }, { size }),
  pixel: (n: number, size: number, body = ink(), withCut = true) =>
    pixelSVG(rasterise(n, TILT, withCut && n >= 24), { 1: body, 2: paper() }, size),
  icon: (size: number) => markSVG({ body: dye(), cut: profile().night.page }, { tilt: TILT, size, bg: profile().night.page, pad: 12 }),
  cursor: () => cursorSVG(ink(), paper()),
}

const measureCtx = document.createElement('canvas').getContext('2d')!
function measure(text: string, family: string, size: number) {
  measureCtx.font = `${size}px "${family}"`
  return measureCtx.measureText(text).width
}

/** the lockups, as SVG. `faces` is an embedded @font-face block for downloads. */
function lockup(kind: 'h' | 'v', faces = '', colours = { body: ink(), cut: paper(), tld: ground().ink2 }): { svg: string; w: number; h: number } {
  const defs = faces ? `<defs><style>${faces}</style></defs>` : ''
  const g = (x: number, y: number, s: number) =>
    `<g transform="translate(${x} ${y}) scale(${s / 64})">${markGroup({ body: colours.body, cut: colours.cut }, TILT)}</g>`
  if (kind === 'h') {
    const wG = measure('grain', 'Jacquard 24', 120)
    const wT = measure('.school', 'VT323', 46)
    const w = Math.ceil(112 + wG + 4 + wT + 6)
    const h = 120
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${defs}` +
      g(-4, 6, 112) +
      `<text x="108" y="94" font-family="'Jacquard 24'" font-size="120" fill="${colours.body}">grain</text>` +
      `<text x="${108 + wG + 4}" y="94" font-family="VT323" font-size="46" fill="${colours.tld}">.school</text></svg>`
    return { svg, w, h }
  }
  const wG = measure('grain', 'Jacquard 24', 120)
  const w = Math.ceil(Math.max(wG, 200) + 40)
  const h = 300
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${defs}` +
    g(w / 2 - 70, 6, 140) +
    `<text x="${w / 2}" y="242" text-anchor="middle" font-family="'Jacquard 24'" font-size="120" fill="${colours.body}">grain</text>` +
    `<text x="${w / 2}" y="284" text-anchor="middle" font-family="VT323" font-size="34" letter-spacing="10" fill="${colours.tld}">SCHOOL</text></svg>`
  return { svg, w, h }
}

async function faces(which: ('display' | 'text' | 'textItalic' | 'console')[]) {
  const map = {
    display: ["'Jacquard 24'", jacquardURL, 'normal'],
    text: ["'Xanh Mono'", xanhURL, 'normal'],
    textItalic: ["'Xanh Mono'", xanhItalicURL, 'italic'],
    console: ['VT323', vtURL, 'normal'],
  } as const
  const out = await Promise.all(
    which.map(async (k) => `@font-face{font-family:${map[k][0]};font-style:${map[k][2]};src:url(${await fontDataURI(map[k][1])}) format('woff2')}`),
  )
  return out.join('')
}

function fill(el: HTMLElement) {
  const kind = el.dataset.mark!
  const size = Number(el.dataset.size ?? 96)
  const accent = el.closest('.cover, .social, .w-cards, .mo, .os, .colophon, .field, .card') ? dye() : ink()
  let svg = ''
  if (kind === 'pointer' && el.dataset.ink === 'paper') svg = markSVG({ body: paper(), cut: dye() }, { tilt: TILT, size })
  else if (kind === 'pointer') svg = mk.pointer(size, el.closest('.rail-mark') ? ink() : accent)
  else if (kind === 'upright') svg = mk.upright(size, accent)
  else if (kind === 'pixel16') svg = mk.pixel(16, size)
  else if (kind === 'pixel12') svg = mk.pixel(12, size, dye())
  else if (kind === 'icon') svg = mk.icon(size)
  else if (kind === 'cursor') svg = mk.cursor().svg.replace('width="32" height="32"', 'width="64" height="64"')
  else if (kind === 'lockup') svg = lockup('h').svg.replace(/width="\d+" height="\d+"/, `height="${size}"`)
  else if (kind === 'stack') svg = lockup('v').svg.replace(/width="\d+" height="\d+"/, `height="${size}"`)
  el.innerHTML = svg
}

/* ---------------- sections ---------------- */

function anatomy() {
  const a = dye()
  const g = ground()
  const def = mark()
  const t = tip()
  const grid = Array.from({ length: 9 }, (_, k) => k * 8)
    .map((v) => `<line x1="${v}" y1="0" x2="${v}" y2="64"/><line x1="0" y1="${v}" x2="64" y2="${v}"/>`)
    .join('')
  const labels = def.labels
    .map(([text, x, y], k) => {
      const ly = 14 + k * 20
      return `<polyline points="${x},${y} ${66},${ly} ${70},${ly}" fill="none" stroke="${g.ink3}" stroke-width=".25"/><text x="72" y="${ly + 1.4}">${text}</text>`
    })
    .join('')
  $('[data-anatomy]').innerHTML = `
  <svg viewBox="-26 -8 116 80" role="img" aria-label="Construction of the ${def.name.toLowerCase()} mark">
    <g stroke="${g.rule}" stroke-width=".25">${grid}</g>
    <g opacity=".5">${markGroup({ body: 'none', cut: 'none' }, TILT).replace('<g ', `<g fill="none" stroke="${a}" stroke-width=".5" stroke-dasharray="1.2 1.2" `)}</g>
    <g opacity=".92">${markGroup({ body: ink(), cut: paper() })}</g>
    <path d="M32 18 A14 14 0 0 0 24.6 20.1" fill="none" stroke="${a}" stroke-width=".5"/>
    <line x1="32" y1="32" x2="32" y2="-4" stroke="${a}" stroke-width=".3"/>
    <line x1="32" y1="32" x2="${t.x}" y2="${t.y}" stroke="${a}" stroke-width=".3"/>
    <circle cx="${t.x}" cy="${t.y}" r="1.4" fill="${a}"/>
    <g font-family="VT323" font-size="4" fill="${g.ink2}">
      <text x="${t.x - 2.5}" y="${t.y + 1}" text-anchor="end">hotspot</text>
      <text x="14" y="24" fill="${a}">−32°</text>
      ${labels}
      <text x="0" y="70" fill="${g.ink3}">64 units · 8-unit grid · ${def.name.toLowerCase()}</text>
    </g>
  </svg>`
  $('[data-anatomy-notes]').innerHTML = def.anatomy.map(([k, v]) => `<dt class="console">${k}</dt><dd>${v}</dd>`).join('')
}

function candidates() {
  $('[data-candidates]').innerHTML = MARKS.map(
    (m, k) => `<button class="cand" data-pick-mark="${m.key}" aria-pressed="${m.key === mark().key}">
      <span>${markSVG({ body: ink(), cut: paper() }, { tilt: TILT, size: 92, def: m })}</span>
      <b class="console">${String(k + 1).padStart(2, '0')} · ${m.name}</b><i>${m.note}</i></button>`,
  ).join('')
}

function ladder() {
  const steps = [8, 12, 16, 24]
  $('[data-ladder]').innerHTML =
    steps.map((n) => `<figure>${mk.pixel(n, 88)}<figcaption class="console">${n} cells</figcaption></figure>`).join('') +
    `<figure>${mk.pointer(88)}<figcaption class="console">vector</figcaption></figure>`
}

function roomAndDonts() {
  const i = ink()
  $('[data-room]').innerHTML = `
    <svg viewBox="-20 -20 104 104">
      <rect x="-14" y="-14" width="92" height="92" rx="4" fill="none" stroke="${dye()}" stroke-width=".6" stroke-dasharray="2 2"/>
      <rect x="4" y="4" width="56" height="56" fill="none" stroke="${ground().rule}" stroke-width=".4"/>
      ${markGroup({ body: i, cut: paper() }, TILT)}
      <g font-family="VT323" font-size="5" fill="${ground().ink3}"><text x="-12" y="-16">½ grain</text></g>
    </svg>`
  const bad = (art: string, label: string) =>
    `<figure class="dont"><div>${art}<i class="strike"></i></div><figcaption class="console">${label}</figcaption></figure>`
  const g = (inner: string) => `<svg viewBox="0 0 64 64" width="72" height="72">${inner}</svg>`
  $('[data-donts]').innerHTML = [
    bad(g(`<g transform="translate(-16 0) scale(1.5 1)">${markGroup({ body: i, cut: paper() }, TILT)}</g>`), 'stretch it'),
    bad(g(`<g fill="none" stroke="${i}" stroke-width="1.6">${markGroup({ body: 'none', cut: 'none' }, TILT)}</g>`), 'outline it'),
    bad(g(`<g transform="rotate(58 32 32)">${markGroup({ body: i, cut: paper() })}</g>`), 'lean it another way'),
    bad(g(markGroup({ body: '#3d6fb0', cut: paper() }, TILT)), 'dye it blue'),
    bad(
      g(
        `<g transform="translate(8 8) scale(.42)">${markGroup({ body: i, cut: paper() }, -20)}</g><g transform="translate(30 8) scale(.42)">${markGroup({ body: i, cut: paper() }, 20)}</g><g transform="translate(19 30) scale(.42)">${markGroup({ body: i, cut: paper() })}</g>`,
      ),
      'crowd it',
    ),
    bad(g(`<g filter="drop-shadow(2px 3px 2px rgba(0,0,0,.5))">${markGroup({ body: i, cut: paper() }, TILT)}</g>`), 'give it effects'),
  ].join('')
}

function letters() {
  const p = profile()
  const sample = { display: 'grain', text: 'Grain & tree', console: '> sow 04' }
  const glyphs = 'abcdefghijklm nopqrstuvwxyz ABCDEFGHIJKLM NOPQRSTUVWXYZ 0123456789 &?!·—“”'
  $('[data-letters]').innerHTML = p.letters
    .map(
      (l) => `
    <article class="letter letter-${l.role}">
      <p class="console role">${l.role}</p>
      <div class="sample" style="font-family:${l.css}" contenteditable="true" spellcheck="false">${sample[l.role]}</div>
      <h4>${l.family}</h4>
      <p class="glyphs" style="font-family:${l.css}">${glyphs}</p>
      <dl>
        <dt class="console">use</dt><dd>${l.use}</dd>
        <dt class="console">why</dt><dd>${l.why}</dd>
        <dt class="console">after</dt><dd>${l.after} <span class="from">(from the brief)</span></dd>
        <dt class="console">by</dt><dd>${l.foundry}</dd>
      </dl>
      <span class="gets"><button data-get="font-${l.role}.woff2">woff2</button>${
        l.role === 'text' ? '<button data-get="font-text-italic.woff2">italic</button>' : ''
      }<button data-get="ofl-${l.role}.txt">licence</button></span>
    </article>`,
    )
    .join('')
  const rows: [string, string, string, number][] = [
    ['display', 'xl', 'grain', 96],
    ['display', 'l', 'Sowing in rows', 56],
    ['display', 'm', 'The granary', 36],
    ['text', 'l', 'A row is a promise.', 22],
    ['text', 'm', 'A row is a promise to come back.', 17],
    ['text', 's', 'Captions and the small print.', 14],
    ['console', 'l', '06:40 · 15.11.2026', 28],
    ['console', 'm', 'labels · buttons · prompt', 20],
  ]
  $('[data-scale]').innerHTML = rows
    .map(
      ([role, step, text, px]) =>
        `<tr><td class="console">${role} ${step}</td><td class="console px">${px}</td><td style="font-family:var(--font-${role});font-size:calc(${px}px * var(--scale))">${text}</td></tr>`,
    )
    .join('')
}

function contrast(a: string, b: string) {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

function dyes() {
  const p = profile()
  const sw = (hex: string, label: string, cls = '') => `<button class="sw ${cls}" data-copy="${hex}" style="--c:${hex}"><i></i><span class="console">${label}</span><span class="console hex">${hex}</span></button>`
  $('[data-grounds]').innerHTML = (['day', 'night'] as const)
    .map((k) => {
      const g = p[k]
      return `<div class="ground" style="background:${g.page};color:${g.ink}">
        <p class="console gk" style="color:${g.ink3}">${k === 'day' ? 'by day' : 'by night'}</p>
        <h4 style="font-family:var(--font-display)">${g.name}</h4>
        <div class="layers"><span style="background:${g.page}"></span><span style="background:${g.surface}"></span><span style="background:${g.surface2}"></span></div>
        <p class="inks"><span style="color:${g.ink}">ink</span> <span style="color:${g.ink2}">ink 2</span> <span style="color:${g.ink3}">ink 3</span></p>
        <div class="gsw">${sw(g.page, 'page')}${sw(g.surface, 'surface')}${sw(g.surface2, 'surface 2')}${sw(g.rule, 'rule')}${sw(g.ink, 'ink')}${sw(g.ink2, 'ink 2')}${sw(g.ink3, 'ink 3')}</div>
      </div>`
    })
    .join('')
  $('[data-dyes]').innerHTML = p.dyes
    .map(
      (d) => `<div class="dye ${d.key === t.dye ? 'on' : ''}">
        <div class="dye-chips">
          <button data-copy="${d.day}" style="background:${p.day.page}"><i style="background:${d.day}"></i><span class="console" style="color:${p.day.ink2}">${d.day}</span><span class="console ratio" style="color:${p.day.ink3}">${contrast(d.day, p.day.page).toFixed(1)}:1</span></button>
          <button data-copy="${d.night}" style="background:${p.night.page}"><i style="background:${d.night}"></i><span class="console" style="color:${p.night.ink2}">${d.night}</span><span class="console ratio" style="color:${p.night.ink3}">${contrast(d.night, p.night.page).toFixed(1)}:1</span></button>
        </div>
        <h4>${d.name}</h4><p>${d.note}</p>
      </div>`,
    )
    .join('')
}

function pointers() {
  const c = mk.cursor()
  const link = cursorSVGFor(dye())
  $('[data-pointers]').innerHTML = [
    ['rest', c.svg, `url("${dataURI(c.svg)}") ${c.hot[0]} ${c.hot[1]}, default`],
    ['link', link.svg, `url("${dataURI(link.svg)}") ${link.hot[0]} ${link.hot[1]}, pointer`],
    ['busy', mk.pixel(12, 32, dye(), false), 'progress'],
    ['text', `<svg viewBox="0 0 32 32" width="32" height="32" shape-rendering="crispEdges"><rect x="15" y="5" width="2" height="22" fill="${ink()}"/><rect x="12" y="5" width="8" height="2" fill="${ink()}"/><rect x="12" y="25" width="8" height="2" fill="${ink()}"/><rect x="18" y="23" width="3" height="3" fill="${dye()}"/></svg>`, 'text'],
  ]
    .map(([n, svg, cur]) => `<div class="ptr ${n === 'busy' ? 'busy' : ''}" style='cursor:${cur}'><span>${svg}</span><span class="console">${n}</span></div>`)
    .join('')
}

function cursorSVGFor(body: string) {
  return cursorSVG(body, paper())
}

function motion() {
  $('[data-sprout]').innerHTML = sproutSVG(false)
  $('[data-thresh]').innerHTML = Array.from({ length: 7 }, (_, i) => `<i style="--i:${i}">${mk.pixel(12, 22, dye(), false)}</i>`).join('')
}

function sproutSVG(standalone: boolean) {
  const a = dye()
  const leaf = profile().dyes.find((d) => d.key === 'sage')![t.ground]
  const style = `<style>
    .sp{stroke-dasharray:40;stroke-dashoffset:40;animation:sp 3.2s cubic-bezier(.2,.7,.2,1) infinite}
    .lf{transform-box:fill-box;transform-origin:0% 100%;transform:scale(0);animation:lf 3.2s cubic-bezier(.2,.7,.2,1) infinite}
    .lf2{transform-origin:100% 100%;animation-delay:.15s}
    @keyframes sp{0%,12%{stroke-dashoffset:40}50%,88%{stroke-dashoffset:0}100%{stroke-dashoffset:0;opacity:0}}
    @keyframes lf{0%,40%{transform:scale(0)}62%,88%{transform:scale(1)}100%{transform:scale(1);opacity:0}}
    @media (prefers-reduced-motion: reduce){.sp,.lf{animation:none;stroke-dashoffset:0;transform:none}}
  </style>`
  const bg = standalone ? `<rect x="-40" y="-60" width="144" height="144" fill="${paper()}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -60 144 144" width="${standalone ? 512 : 150}" height="${standalone ? 512 : 150}">${style}${bg}
    <line x1="-30" y1="62" x2="94" y2="62" stroke="${ground().rule}" stroke-width="1"/>
    <g transform="translate(18 34) scale(.44)">${kernelGroup({ body: a, cut: paper() }, 70)}</g>
    <path class="sp" d="M34 44 C33 30 36 18 32 -4" fill="none" stroke="${leaf}" stroke-width="2.4" stroke-linecap="round"/>
    <path class="lf" d="M33 12 C40 4 50 4 54 6 C48 12 40 14 33 12Z" fill="${leaf}"/>
    <path class="lf lf2" d="M33 2 C26 -6 16 -6 12 -4 C18 2 26 4 33 2Z" fill="${leaf}"/>
  </svg>`
}

function settleSVG() {
  const style = `<style>
    .s{animation:s 3s cubic-bezier(.2,.7,.2,1) infinite}
    @keyframes s{0%{transform:translateY(-70px);opacity:0}10%{opacity:1}42%{transform:translateY(0)}50%{transform:translateY(-6px)}58%,90%{transform:translateY(0);opacity:1}100%{transform:translateY(0);opacity:0}}
    @media (prefers-reduced-motion: reduce){.s{animation:none}}
  </style>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="512" height="512">${style}
    <rect width="160" height="160" fill="${paper()}"/><line x1="30" y1="122" x2="130" y2="122" stroke="${ground().rule}"/>
    <g class="s"><g transform="translate(46 44) scale(1.1)">${markGroup({ body: dye(), cut: paper() }, TILT)}</g></g></svg>`
}

function threshSVG() {
  const cells = Array.from({ length: 7 }, (_, i) => {
    const px = pixelSVG(rasterise(12, TILT, false, false, MARKS[2]), { 1: dye() }, 22).replace('<svg ', `<svg x="${12 + i * 30}" y="20" `)
    return `<g class="t" style="animation-delay:${i * 0.12}s">${px}</g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 234 62" width="468" height="124"><style>
    .t{animation:t 1.4s ease-in-out infinite}
    @keyframes t{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-12px)}}
    @media (prefers-reduced-motion: reduce){.t{animation:none}}
  </style><rect width="234" height="62" fill="${paper()}"/>${cells}</svg>`
}

/* ---- print pieces: drawn as SVG so they download at size ---- */

function cardSVG(side: 'front' | 'back', faceCSS = '') {
  const p = profile()
  const day = p.day, night = p.night
  const a = p.dyes.find((d) => d.key === t.dye)!
  const defs = faceCSS ? `<defs><style>${faceCSS}</style></defs>` : ''
  if (side === 'front') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1050 600" width="1050" height="600">${defs}
      <rect width="1050" height="600" fill="${day.page}"/>
      <g transform="translate(96 170) scale(${220 / 64})">${markGroup({ body: a.day, cut: day.page }, TILT)}</g>
      <text x="350" y="370" font-family="'Jacquard 24'" font-size="220" fill="${day.ink}">grain</text>
      <text x="356" y="430" font-family="VT323" font-size="40" letter-spacing="14" fill="${day.ink3}">SCHOOL</text>
      <text x="954" y="548" text-anchor="end" font-family="VT323" font-size="28" fill="${day.ink3}">a grain is a tree you can hold</text></svg>`
  }
  const row = (y: number, k: string, v: string) =>
    `<text x="96" y="${y}" font-family="VT323" font-size="30" fill="${night.ink3}">${k}</text><text x="270" y="${y}" font-family="'Xanh Mono'" font-size="32" fill="${night.ink}">${v}</text>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1050 600" width="1050" height="600">${defs}
    <rect width="1050" height="600" fill="${night.page}"/>
    <text x="96" y="168" font-family="'Xanh Mono'" font-size="64" fill="${night.ink}">Wren Ashby</text>
    <text x="96" y="214" font-family="'Xanh Mono'" font-style="italic" font-size="34" fill="${a.night}">steward of the winter term</text>
    <line x1="96" y1="270" x2="954" y2="270" stroke="${night.rule}" stroke-width="2" stroke-dasharray="2 10" stroke-linecap="round"/>
    ${row(350, 'mail', 'wren@grain.school')}${row(400, 'post', 'the granary, row 4')}${row(450, 'web', 'grain.school/~wren')}
    <g transform="translate(866 446) scale(${96 / 64})">${markGroup({ body: a.night, cut: night.page }, TILT)}</g></svg>`
}

function posterSVG(faceCSS = '') {
  const p = profile()
  const g = p[t.ground]
  const a = dye()
  const defs = faceCSS ? `<defs><style>${faceCSS}</style></defs>` : ''
  const rule = Array.from({ length: 26 }, (_, i) => `<g transform="translate(${150 + i * 58} 2010) scale(.42)">${kernelGroup({ body: g.ink3, cut: g.page }, TILT)}</g>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 2400" width="1800" height="2400">${defs}
    <rect width="1800" height="2400" fill="${g.page}"/>
    <text x="150" y="230" font-family="VT323" font-size="56" letter-spacing="6" fill="${g.ink3}">GRAIN.SCHOOL · WINTER TERM · 2026</text>
    <g transform="translate(330 300) scale(${1140 / 64})">${markGroup({ body: a, cut: g.page }, TILT, 2.2)}</g>
    <text x="150" y="1700" font-family="'Jacquard 24'" font-size="240" fill="${g.ink}">A grain is a tree</text>
    <text x="150" y="1910" font-family="'Jacquard 24'" font-size="240" fill="${g.ink}">you can hold.</text>
    ${rule}
    <text x="150" y="2250" font-family="'Xanh Mono'" font-size="54" fill="${g.ink2}">Six weeks on keeping what you learn.</text>
    <text x="1650" y="2250" text-anchor="end" font-family="VT323" font-size="56" fill="${a}">opens 21.12</text></svg>`
}

function world() {
  $('[data-card="front"]').innerHTML = cardSVG('front')
  $('[data-card="back"]').innerHTML = cardSVG('back')
  $('[data-poster]').innerHTML = posterSVG()
  // a field: rows of leaning grains, a little uneven, as if sown by hand
  const fieldTile = (body: string, cut: string) => {
    let s = ''
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 6; c++) {
        const x = c * 40 + (r % 2) * 20 + rnd() * 6
        const y = r * 40 + rnd() * 6
        s += `<g transform="translate(${x} ${y}) scale(.3) rotate(${(rnd() - 0.5) * 16} 32 32)">${markGroup({ body, cut }, TILT)}</g>`
      }
    return dataURI(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">${s}</svg>`)
  }
  root.style.setProperty('--field', `url("${fieldTile(ground().rule, paper())}")`)
  root.style.setProperty('--field-dye', `url("${fieldTile(dye(), profile().night.page)}")`)
  // stickers
  const p = profile()
  $('[data-stickers]').innerHTML = `
    <span class="st st1">${markSVG({ body: dye(), cut: p.night.page }, { tilt: TILT, size: 120, bg: p.night.page, pad: 12 })}</span>
    <span class="st st2"><span>${mk.pixel(16, 34, p.day.ink)}</span><b>grain.school</b></span>
    <span class="st st3">${markSVG({ body: p.day.ink, cut: p.day.page }, { tilt: TILT, size: 92 })}</span>`
}

function interfaces() {
  const i = {
    grain: (s: number) => mk.pointer(s, dye()),
    pixel: (s: number) => mk.pixel(12, s, dye(), false),
    upright: (s: number) => mk.upright(s, dye()),
  }
  $('[data-os="furrow"]').innerHTML = furrow(i)
  $('[data-os="sheaf"]').innerHTML = sheaf(i)
  $('[data-os="sieve"]').innerHTML = sieve(i)
}

/* ---------------- downloads ---------------- */

const slug = () => `${profile().key}-${t.ground === 'day' ? 'linen' : 'hearth'}`

async function png(svg: string, w: number, h: number) {
  return svgToPNG(svg, w, h)
}

const files: Record<string, () => Promise<Blob | string>> = {
  'grain-pointer.svg': async () => mk.pointer(512),
  'grain-pointer.png': async () => png(mk.pointer(1024), 1024, 1024),
  'grain-upright.svg': async () => mk.upright(512),
  'grain-upright.png': async () => png(mk.upright(1024), 1024, 1024),
  'grain-pixel-16.svg': async () => mk.pixel(16, 512),
  'grain-pixel-16.png': async () => png(mk.pixel(16, 512), 512, 512),
  'grain-pixel-12.svg': async () => mk.pixel(12, 384, dye()),
  'grain-icon.svg': async () => mk.icon(512),
  'grain-icon.png': async () => png(mk.icon(1024), 1024, 1024),
  'grain-lockup.svg': async () => lockup('h', await faces(['display', 'console'])).svg,
  'grain-lockup.png': async () => {
    const l = lockup('h', await faces(['display', 'console']))
    return png(l.svg, l.w * 4, l.h * 4)
  },
  'grain-stacked.svg': async () => lockup('v', await faces(['display', 'console'])).svg,
  'grain-stacked.png': async () => {
    const l = lockup('v', await faces(['display', 'console']))
    return png(l.svg, l.w * 4, l.h * 4)
  },
  'grain-cursor.svg': async () => mk.cursor().svg,
  'grain-cursor.png': async () => png(mk.cursor().svg, 32, 32),
  'grain-cursor.css': async () => {
    const c = mk.cursor()
    return `/* the grain pointer; hotspot at the tip */\nhtml {\n  cursor: url("${dataURI(c.svg)}") ${c.hot[0]} ${c.hot[1]}, default;\n}\n`
  },
  'font-display.woff2': async () => (await fetch(jacquardURL)).blob(),
  'font-text.woff2': async () => (await fetch(xanhURL)).blob(),
  'font-text-italic.woff2': async () => (await fetch(xanhItalicURL)).blob(),
  'font-console.woff2': async () => (await fetch(vtURL)).blob(),
  'ofl-display.txt': async () => oflJacquard,
  'ofl-text.txt': async () => oflXanh,
  'ofl-console.txt': async () => oflVT,
  'grain-tokens.css': async () => tokensCSS(profile()),
  'grain-tokens.json': async () => tokensJSON(profile()),
  'grain.gpl': async () => paletteGPL(profile()),
  'grain-settle.svg': async () => settleSVG(),
  'grain-sprout.svg': async () => sproutSVG(true),
  'grain-thresh.svg': async () => threshSVG(),
  'grain-card-front.svg': async () => cardSVG('front', await faces(['display', 'console'])),
  'grain-card-back.svg': async () => cardSVG('back', await faces(['text', 'textItalic', 'console'])),
  'grain-poster.svg': async () => posterSVG(await faces(['display', 'text', 'console'])),
  'grain-brand-kit.zip': async () => {
    const dir = `grain-brand-${slug()}-${mark().key}`
    const plan: [string, string][] = [
      ['marks/grain-pointer.svg', 'grain-pointer.svg'],
      ['marks/grain-pointer.png', 'grain-pointer.png'],
      ['marks/grain-upright.svg', 'grain-upright.svg'],
      ['marks/grain-upright.png', 'grain-upright.png'],
      ['marks/grain-pixel-16.svg', 'grain-pixel-16.svg'],
      ['marks/grain-pixel-16.png', 'grain-pixel-16.png'],
      ['marks/grain-pixel-12.svg', 'grain-pixel-12.svg'],
      ['marks/grain-icon.svg', 'grain-icon.svg'],
      ['marks/grain-icon.png', 'grain-icon.png'],
      ['marks/grain-lockup.svg', 'grain-lockup.svg'],
      ['marks/grain-lockup.png', 'grain-lockup.png'],
      ['marks/grain-stacked.svg', 'grain-stacked.svg'],
      ['marks/grain-stacked.png', 'grain-stacked.png'],
      ['cursor/grain-cursor.svg', 'grain-cursor.svg'],
      ['cursor/grain-cursor.png', 'grain-cursor.png'],
      ['cursor/grain-cursor.css', 'grain-cursor.css'],
      ['fonts/Jacquard24-Regular.woff2', 'font-display.woff2'],
      ['fonts/XanhMono-Regular.woff2', 'font-text.woff2'],
      ['fonts/XanhMono-Italic.woff2', 'font-text-italic.woff2'],
      ['fonts/VT323-Regular.woff2', 'font-console.woff2'],
      ['fonts/OFL-Jacquard24.txt', 'ofl-display.txt'],
      ['fonts/OFL-XanhMono.txt', 'ofl-text.txt'],
      ['fonts/OFL-VT323.txt', 'ofl-console.txt'],
      ['colour/tokens.css', 'grain-tokens.css'],
      ['colour/tokens.json', 'grain-tokens.json'],
      ['colour/grain.gpl', 'grain.gpl'],
      ['motion/settle.svg', 'grain-settle.svg'],
      ['motion/sprout.svg', 'grain-sprout.svg'],
      ['motion/thresh.svg', 'grain-thresh.svg'],
      ['print/card-front.svg', 'grain-card-front.svg'],
      ['print/card-back.svg', 'grain-card-back.svg'],
      ['print/poster-18x24.svg', 'grain-poster.svg'],
    ]
    const entries: ZipEntry[] = []
    for (const [path, key] of plan) entries.push({ name: `${dir}/${path}`, data: await files[key]() })
    for (const m of MARKS) {
      entries.push({ name: `${dir}/marks/candidates/${m.key}-pointer.svg`, data: markSVG({ body: ink(), cut: paper() }, { tilt: TILT, size: 512, def: m }) })
      entries.push({ name: `${dir}/marks/candidates/${m.key}-upright.svg`, data: markSVG({ body: ink(), cut: paper() }, { size: 512, def: m }) })
    }
    entries.push({ name: `${dir}/README.txt`, data: readme() })
    return zip(entries)
  },
}

function readme() {
  const p = profile()
  return `grain.school brand kit
profile: ${p.name} (${p.draft}), ${t.ground === 'day' ? p.day.name : p.night.name} ground, ${t.dye} dye

marks/   the ${mark().name.toLowerCase()}: pointer (primary), upright, pixel cuts, icon, lockups;
         candidates/ holds all ${MARKS.length} candidate marks
cursor/  the grain pointer as a 32 px cursor, with a CSS line; hotspot at the tip
fonts/   ${p.letters.map((l) => `${l.family} (${l.role})`).join(', ')}; SIL Open Font License, see OFL-*.txt
colour/  tokens.css, tokens.json, and a GIMP/Inkscape/Krita palette
motion/  settle, sprout, thresh as animated SVG (they hold still under reduced motion)
print/   business card front and back (3.5 x 2 in at 300 dpi) and an 18 x 24 in poster

Lockups and print files carry their fonts inside the SVG. If an editor will not read them,
install the fonts from fonts/ first.

Drafted with DJINN.
`
}

const kitTree = () =>
  [
    [`grain-brand-${slug()}/`, ''],
    ['marks/', `${mark().name.toLowerCase()}: pointer · upright · pixel · icon · lockups`],
    ['marks/candidates/', MARKS.map((m) => m.key).join(' · ')],
    ['cursor/', 'svg · png · css'],
    ['fonts/', 'Jacquard 24 · Xanh Mono · VT323 · licences'],
    ['colour/', 'tokens.css · tokens.json · grain.gpl'],
    ['motion/', 'settle · sprout · thresh'],
    ['print/', 'card front · card back · poster'],
  ]
    .map(([k, v], i) => `<li class="${i ? '' : 'root'}"><b>${k}</b><span>${v}</span></li>`)
    .join('')

let toastTimer = 0
function toast(msg: string) {
  const el = $('[data-toast]')
  el.textContent = msg
  el.classList.add('on')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.classList.remove('on'), 1800)
}

document.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement
  const get = target.closest<HTMLElement>('[data-get]')
  if (get) {
    const name = get.dataset.get!
    const make = files[name]
    if (!make) return
    get.setAttribute('aria-busy', 'true')
    try {
      const data = await make()
      const type = name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : 'text/plain'
      const out = name.startsWith('font-') || name.startsWith('ofl-') || name.endsWith('.gpl') ? name : name.replace(/^grain-/, `grain-${slug()}-`)
      save(out, data, type)
      toast(`saved ${out}`)
    } catch (err) {
      toast('could not make that file')
      console.error(err)
    } finally {
      get.removeAttribute('aria-busy')
    }
    return
  }
  const copy = target.closest<HTMLElement>('[data-copy]')
  if (copy) {
    await navigator.clipboard?.writeText(copy.dataset.copy!).catch(() => {})
    toast(`copied ${copy.dataset.copy}`)
  }
})

/* ---------------- the dock ---------------- */

function cycleMark(step: number) {
  const k = MARKS.findIndex((m) => m.key === t.mark)
  t.mark = MARKS[(k + step + MARKS.length) % MARKS.length].key
  apply()
}

document.addEventListener('click', (e) => {
  const el = e.target as HTMLElement
  const pick = el.closest<HTMLElement>('[data-pick-mark]')
  if (pick) {
    t.mark = pick.dataset.pickMark!
    apply()
    return
  }
  const cyc = el.closest<HTMLElement>('[data-cycle-mark]')
  if (cyc) cycleMark(Number(cyc.dataset.cycleMark))
})

document.addEventListener('keydown', (e) => {
  const el = e.target as HTMLElement
  if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.isContentEditable) return
  if (e.key === '[') cycleMark(-1)
  if (e.key === ']') cycleMark(1)
})

function buildDock() {
  const sel = $<HTMLSelectElement>('[data-tune="profile"]')
  sel.innerHTML = PROFILES.map((p) => `<option value="${p.key}" ${p.ready ? '' : 'disabled'}>${p.name} · ${p.draft}${p.ready ? '' : ' (soon)'}</option>`).join('')
  sel.addEventListener('change', () => {
    t.profile = sel.value
    apply()
  })
  $$('[data-tune-ground]').forEach((b) =>
    b.addEventListener('click', () => {
      t.ground = b.dataset.tuneGround as Tuning['ground']
      apply()
    }),
  )
  $$('[data-tune-scale]').forEach((b) =>
    b.addEventListener('click', () => {
      t.scale = Math.min(1.25, Math.max(0.875, +(t.scale + Number(b.dataset.tuneScale) * 0.0625).toFixed(4)))
      apply()
    }),
  )
  $$('[data-tune-toggle]').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.tuneToggle as 'texture' | 'still'
      t[k] = !t[k]
      apply()
    }),
  )
}

function syncDock() {
  const p = profile()
  $<HTMLSelectElement>('[data-tune="profile"]').value = p.key
  $$('[data-tune-ground]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tuneGround === t.ground)))
  $('[data-tune-dyes]').innerHTML = p.dyes
    .map((d) => `<button class="dk-dye" data-dye="${d.key}" aria-pressed="${d.key === t.dye}" title="${d.name}" style="--c:${d[t.ground]}"><span class="sr">${d.name}</span></button>`)
    .join('')
  $$('[data-dye]').forEach((b) =>
    b.addEventListener('click', () => {
      t.dye = b.dataset.dye!
      apply()
    }),
  )
  $('[data-scale-out]').textContent = String(Math.round(t.scale * 100))
  const tex = $('[data-tune-toggle="texture"]')
  tex.setAttribute('aria-pressed', String(t.texture))
  tex.textContent = t.texture ? 'on' : 'off'
  const still = $('[data-tune-toggle="still"]')
  still.setAttribute('aria-pressed', String(t.still))
  still.textContent = t.still ? 'still' : 'moving'
}

/* ---------------- render ---------------- */

function render() {
  $$('[data-mark]').forEach(fill)
  anatomy()
  candidates()
  ladder()
  roomAndDonts()
  letters()
  dyes()
  pointers()
  motion()
  world()
  interfaces()
  $$('[data-mark]').forEach(fill) // marks inside the freshly drawn sections
  $('[data-kit-tree]').innerHTML = kitTree()
  const c = mk.cursor()
  root.style.setProperty('--cursor', `url("${dataURI(c.svg)}") ${c.hot[0]} ${c.hot[1]}, default`)
  const l = cursorSVGFor(dye())
  root.style.setProperty('--cursor-link', `url("${dataURI(l.svg)}") ${l.hot[0]} ${l.hot[1]}, pointer`)
  $<HTMLLinkElement>('#favicon').href = dataURI(mk.icon(64))
}

/* rail: mark the section in view */
function rail() {
  const links = new Map($$<HTMLAnchorElement>('.rail a[href^="#"]').map((a) => [a.getAttribute('href')!.slice(1), a]))
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es) if (e.isIntersecting) links.forEach((a, id) => a.classList.toggle('here', id === e.target.id))
    },
    { rootMargin: '-45% 0px -50% 0px' },
  )
  $$('main > section, main > header').forEach((s) => io.observe(s))
}

async function start() {
  await Promise.all([
    document.fonts.load('120px "Jacquard 24"'),
    document.fonts.load('46px "VT323"'),
    document.fonts.load('20px "Xanh Mono"'),
  ]).catch(() => {})
  buildDock()
  apply()
  rail()
  root.classList.add('ready')
}

start()
