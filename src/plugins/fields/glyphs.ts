// The map's vocabulary. Every file is drawn as one mark chosen by what kind of file it is, and
// the land between settlements is drawn in the old atlas manner: hachured peaks, molehill hills,
// round-crowned woods and grass tufts. Everything draws in pixel space around a centre, at a
// cell size `s` (pixels per file plot), so the same mark serves the tiles, the key and the hover.

export const Kind = { House: 0, Field: 1, Mill: 2, Forge: 3, Stone: 4, Tree: 5, Post: 6, Cairn: 7 } as const
export type Kind = (typeof Kind)[keyof typeof Kind]
export const KIND_COUNT = 8

/** What each mark stands for, for the key and the hover note. Order matches Kind. */
export const KIND_INFO: Array<{ name: string; means: string }> = [
  { name: 'house', means: 'a page of prose (md, txt, html)' },
  { name: 'field', means: "grain's own code (rye, rish, glow, kyri, brix)" },
  { name: 'mill', means: 'a script (sh, awk, nix, make, py)' },
  { name: 'workshop', means: 'foreign code (c, zig, swift, rs, ts)' },
  { name: 'standing stone', means: 'data or config (json, toml, manifests)' },
  { name: 'tree', means: 'an image or other media' },
  { name: 'signpost', means: 'a link to somewhere else' },
  { name: 'cairn', means: 'anything else' },
]

const EXT: Record<string, Kind> = Object.create(null)
const put = (k: Kind, list: string) => { for (const e of list.split(' ')) EXT[e] = k }
put(Kind.House, 'md mdc mdx txt text html htm rst adoc org tex rtf')
put(Kind.Field, 'rye rish rishi glow kyri brix brush arbor peal')
put(Kind.Mill, 'sh bash zsh fish awk jq mk make nix run py rb pl ps1 lua bat cmd')
put(Kind.Forge, 'c h cc cpp cxx hpp hh zig swift rs go ts tsx js jsx mjs cjs java kt scala ld s asm wasm m mm cs hs ml ex erl')
put(Kind.Stone, 'json jsonl toml yaml yml tsv csv plist manifest input example sha256 lock ini cfg conf xml env template pre_seed bin file expected golden out snap dat db sql proto')
put(Kind.Tree, 'svg png jpg jpeg gif webp ico bmp tif tiff pdf mp3 wav ogg flac mp4 mov webm ttf otf woff woff2 psd')

const PROSE_NAMES = /^(readme|license|licence|changelog|notice|authors|contributing|copying|todo)$/i
const MILL_NAMES = /^(makefile|justfile|dockerfile|rakefile|gnumakefile|procfile)$/i

/** The mark for a file, from its name (and whether it is a link). Grows with grain: an unknown
 *  extension is a cairn until it is named here. */
export function kindOf(path: string, isLink = false): Kind {
  if (isLink) return Kind.Post
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  if (dot >= 0) {
    const k = EXT[name.slice(dot + 1).toLowerCase()]
    if (k !== undefined) return k
  }
  const stem = dot > 0 ? name.slice(0, dot) : name
  if (PROSE_NAMES.test(stem)) return Kind.House
  if (MILL_NAMES.test(stem)) return Kind.Mill
  return Kind.Cairn
}

/** Settlements fill from the middle out in this order: the town core, then its trades, then
 *  the farmland, then stones, signposts and trees at the edge. */
export const KIND_RANK: number[] = [0, 3, 2, 1, 4, 6, 5, 4]
/** Marks that stand on a street grid (buildings); the rest tile the ground between. */
export const BUILT: boolean[] = [true, false, true, true, false, false, false, false]

export interface Ink {
  ink: string       // line
  land: string      // paper of the land
  sea: string       // water
  roof: string      // madder
  roof2: string     // annatto
  wheat: string     // weld
  green: string     // sage
  stone: string     // a grey for stones
  dim: string       // ink-3
  shade: string     // the shadow side of a peak
  night?: boolean   // drawn light on dark (Hearth): washes go softer
}

/** Fill colour of a mark when it is too small to draw: the land-use tint. */
export function kindTint(k: Kind, I: Ink): string {
  switch (k) {
    case Kind.House: return I.roof
    case Kind.Forge: return I.roof2
    case Kind.Mill: return I.roof2
    case Kind.Field: return I.wheat
    case Kind.Tree: return I.green
    case Kind.Stone: return I.stone
    default: return I.dim
  }
}

/** One file's mark, centred at (x, y), in a cell `s` pixels wide. `h` is the file's own hash
 *  (0..1) for small variations; `rot` the street grid's bearing (fields run with it). */
export function drawGlyph(g: CanvasRenderingContext2D, k: Kind, x: number, y: number, s: number, h: number, rot: number, I: Ink): void {
  const lw = Math.max(0.6, Math.min(1.3, s * 0.07))
  g.lineWidth = lw
  g.strokeStyle = I.ink
  switch (k) {
    case Kind.House: return house(g, x, y, s * (0.86 + h * 0.22), h, I.roof, I)
    case Kind.Forge: return forge(g, x, y, s, h, I)
    case Kind.Mill: return mill(g, x, y, s, h, I)
    case Kind.Field: return field(g, x, y, s, h, rot, I)
    case Kind.Stone: return stone(g, x, y, s, h, I)
    case Kind.Tree: return tree(g, x, y + s * 0.12, s * 0.42 * (0.85 + h * 0.3), I)
    case Kind.Post: return post(g, x, y, s, h, I)
    default: return cairn(g, x, y, s, I)
  }
}

function house(g: CanvasRenderingContext2D, x: number, y: number, s: number, h: number, roof: string, I: Ink) {
  const w = s * (h > 0.7 ? 0.7 : 0.58), bh = s * 0.32, rh = s * 0.28
  const x0 = x - w / 2, base = y + s * 0.24, top = base - bh
  g.beginPath()
  g.rect(x0, top, w, bh)
  g.fillStyle = I.land
  g.fill()
  g.stroke()
  g.beginPath()
  g.moveTo(x0 - s * 0.05, top)
  g.lineTo(x0 + w * (h > 0.85 ? 0.3 : 0.5), top - rh)
  if (h > 0.85) g.lineTo(x0 + w * 0.7, top - rh)
  g.lineTo(x0 + w + s * 0.05, top)
  g.closePath()
  g.fillStyle = roof
  g.fill()
  g.stroke()
  if (s > 14) {
    // a door
    g.beginPath()
    g.moveTo(x - s * 0.04, base); g.lineTo(x - s * 0.04, base - bh * 0.55); g.lineTo(x + s * 0.06, base - bh * 0.55); g.lineTo(x + s * 0.06, base)
    g.stroke()
  }
}

function forge(g: CanvasRenderingContext2D, x: number, y: number, s: number, h: number, I: Ink) {
  // a long low workshop with a chimney, a curl of smoke above
  const w = s * 0.66, bh = s * 0.26, base = y + s * 0.24, top = base - bh
  g.beginPath()
  g.rect(x - s * 0.18, top - s * 0.32, s * 0.1, s * 0.3)
  g.fillStyle = I.land; g.fill(); g.stroke()
  g.beginPath()
  g.moveTo(x - w / 2, base); g.lineTo(x - w / 2, top); g.lineTo(x - w / 2 + s * 0.08, top - s * 0.16)
  g.lineTo(x + w / 2 - s * 0.08, top - s * 0.16); g.lineTo(x + w / 2, top); g.lineTo(x + w / 2, base); g.closePath()
  g.fillStyle = I.land; g.fill(); g.stroke()
  g.beginPath()
  g.moveTo(x - w / 2 + s * 0.08, top - s * 0.16); g.lineTo(x + w / 2 - s * 0.08, top - s * 0.16); g.lineTo(x + w / 2, top); g.lineTo(x - w / 2, top); g.closePath()
  g.fillStyle = I.roof2; g.fill(); g.stroke()
  if (s > 9) {
    g.beginPath()
    const sx = x - s * 0.13, sy = top - s * 0.36
    g.moveTo(sx, sy)
    g.bezierCurveTo(sx + s * 0.12, sy - s * 0.08, sx - s * 0.06, sy - s * 0.16, sx + s * (0.08 + h * 0.06), sy - s * 0.26)
    g.globalAlpha *= 0.6
    g.stroke()
    g.globalAlpha /= 0.6
  }
}

function mill(g: CanvasRenderingContext2D, x: number, y: number, s: number, h: number, I: Ink) {
  // a tower mill: a stout dyed tower under a pale cap, four short sails set as an X above it
  const base = y + s * 0.32, top = y - s * 0.06
  const hx = x, hy = top - s * 0.06, L = s * 0.27, a0 = Math.PI / 4 + (h - 0.5) * 0.5
  const ga = g.globalAlpha
  g.globalAlpha = ga * 0.75
  for (let i = 0; i < 4; i++) {
    const a = a0 + (i * Math.PI) / 2
    const c = Math.cos(a), sn = Math.sin(a), nx = -sn, ny = c
    const w = Math.max(0.8, s * 0.06)
    g.beginPath()
    g.moveTo(hx + c * L * 0.25, hy + sn * L * 0.25)
    g.lineTo(hx + c * L, hy + sn * L)
    g.lineTo(hx + c * L + nx * w, hy + sn * L + ny * w)
    g.lineTo(hx + c * L * 0.25 + nx * w, hy + sn * L * 0.25 + ny * w)
    g.closePath()
    g.fillStyle = I.land; g.fill(); g.stroke()
  }
  g.globalAlpha = ga
  g.beginPath()
  g.moveTo(x - s * 0.2, base); g.lineTo(x - s * 0.13, top); g.lineTo(x + s * 0.13, top); g.lineTo(x + s * 0.2, base); g.closePath()
  g.fillStyle = I.roof2; g.fill(); g.stroke()
  g.beginPath()
  g.moveTo(x - s * 0.15, top); g.quadraticCurveTo(x, top - s * 0.17, x + s * 0.15, top); g.closePath()
  g.fillStyle = I.land; g.fill(); g.stroke()
  if (s > 12) {
    g.beginPath(); g.rect(x - s * 0.035, base - s * 0.14, s * 0.07, s * 0.14); g.fillStyle = I.land; g.fill(); g.stroke()
  }
}

function field(g: CanvasRenderingContext2D, x: number, y: number, s: number, h: number, rot: number, I: Ink) {
  // a parcel of tilled ground, slightly out of true, furrowed with or across the grid
  const half = s * 0.47
  const c = Math.cos(rot), sn = Math.sin(rot)
  const j = (n: number) => (((h * 9301 + n * 49297) % 1) - 0.5) * s * 0.08
  const P = [[-half + j(1), -half + j(2)], [half + j(3), -half + j(4)], [half + j(5), half + j(6)], [-half + j(7), half + j(8)]]
  g.beginPath()
  for (let i = 0; i < 4; i++) {
    const px = x + P[i][0] * c - P[i][1] * sn, py = y + P[i][0] * sn + P[i][1] * c
    if (i) g.lineTo(px, py); else g.moveTo(px, py)
  }
  g.closePath()
  const tone = h < 0.62 ? I.wheat : I.green
  g.fillStyle = tone
  const ga = g.globalAlpha
  // some parcels lie fallow (no wash), the rest in a spread of tones
  if (((h * 7919) % 1) > 0.18) {
    g.globalAlpha = ga * (0.12 + ((h * 3571) % 1) * 0.34) * (I.night ? 0.75 : 1)
    g.fill()
  }
  g.globalAlpha = ga * 0.3
  g.stroke()
  if (s > 6) {
    // furrows run edge to edge of the parcel's own square, with the grid or across it
    const fa = rot + (h > 0.5 ? Math.PI / 2 : 0)
    const fc = Math.cos(fa), fs = Math.sin(fa)
    const inner = half * 0.9
    const gap = Math.max(2.2, s / (s > 18 ? 7 : 4.5))
    g.beginPath()
    for (let t = -inner + gap * 0.5; t < inner; t += gap) {
      g.moveTo(x + t * fc - inner * fs, y + t * fs + inner * fc)
      g.lineTo(x + t * fc + inner * fs, y + t * fs - inner * fc)
    }
    const lw = g.lineWidth
    g.globalAlpha = ga * (I.night ? 0.22 : 0.36)
    g.strokeStyle = I.ink
    g.lineWidth = Math.max(0.5, lw * 0.7)
    g.stroke()
    g.lineWidth = lw
  }
  g.globalAlpha = ga
}

function stone(g: CanvasRenderingContext2D, x: number, y: number, s: number, h: number, I: Ink) {
  // a standing stone with its shadow side hatched
  const w = s * (0.18 + h * 0.08), tall = s * (0.42 + h * 0.18), base = y + s * 0.26
  g.beginPath()
  g.moveTo(x - w, base)
  g.quadraticCurveTo(x - w * 1.1, base - tall * 0.8, x - w * 0.2, base - tall)
  g.quadraticCurveTo(x + w * 1.1, base - tall * 0.95, x + w, base)
  g.closePath()
  g.fillStyle = I.stone
  g.fill()
  g.stroke()
  if (s > 10) {
    g.beginPath()
    for (let i = 1; i < 4; i++) { const t = i / 4; g.moveTo(x + w * 0.2, base - tall * t); g.lineTo(x + w * 0.85, base - tall * t + w * 0.4) }
    g.globalAlpha *= 0.5; g.stroke(); g.globalAlpha /= 0.5
  }
  g.beginPath(); g.moveTo(x - w * 1.6, base); g.lineTo(x + w * 1.8, base); g.stroke()
}

function post(g: CanvasRenderingContext2D, x: number, y: number, s: number, h: number, I: Ink) {
  const base = y + s * 0.28, top = y - s * 0.3
  g.beginPath(); g.moveTo(x, base); g.lineTo(x, top); g.stroke()
  const d = h > 0.5 ? 1 : -1
  g.beginPath()
  g.moveTo(x, top + s * 0.04); g.lineTo(x + d * s * 0.28, top + s * 0.04); g.lineTo(x + d * s * 0.36, top + s * 0.1)
  g.lineTo(x + d * s * 0.28, top + s * 0.16); g.lineTo(x, top + s * 0.16)
  g.moveTo(x, top + s * 0.24); g.lineTo(x - d * s * 0.22, top + s * 0.24); g.lineTo(x - d * s * 0.3, top + s * 0.3)
  g.lineTo(x - d * s * 0.22, top + s * 0.36); g.lineTo(x, top + s * 0.36)
  g.fillStyle = I.land; g.fill(); g.stroke()
}

function cairn(g: CanvasRenderingContext2D, x: number, y: number, s: number, I: Ink) {
  g.fillStyle = I.stone
  const r = s * 0.12
  for (const [dx, dy, rr] of [[-0.12, 0.18, 1], [0.12, 0.18, 1], [0, 0.0, 0.9], [0, -0.16, 0.7]]) {
    g.beginPath(); g.ellipse(x + dx * s, y + dy * s, r * rr * 1.25, r * rr, 0, 0, Math.PI * 2); g.fill(); g.stroke()
  }
}

/** A round-crowned tree, the crown's shadow side drawn with a heavier arc. */
export function tree(g: CanvasRenderingContext2D, x: number, y: number, r: number, I: Ink): void {
  g.beginPath()
  g.moveTo(x, y + r * 0.6); g.lineTo(x, y + r * 1.3)
  g.stroke()
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fillStyle = I.green
  const ga = g.globalAlpha
  g.globalAlpha = ga * 0.42
  g.fill()
  g.globalAlpha = ga
  g.fillStyle = I.land
  g.globalAlpha = ga * 0.5
  g.fill()
  g.globalAlpha = ga * (I.night ? 0.7 : 1)
  g.stroke()
  g.beginPath()
  g.arc(x, y, r * 0.8, 0.1, Math.PI * 0.9)
  g.globalAlpha = ga * 0.6
  g.stroke()
  g.globalAlpha = ga
}

// ------------------------------------------------------------------ terrain

/** A peak in the old manner: a sharp outline, the lit flank bare, the shadow flank hatched. */
export function mountain(g: CanvasRenderingContext2D, x: number, y: number, m: number, h: number, I: Ink, shade: number): void {
  const hgt = m * (0.95 + h * 0.5)
  const px = x - m * (0.1 + h * 0.18)
  const L = x - m, R = x + m
  g.beginPath()
  g.moveTo(L, y)
  g.quadraticCurveTo(L + (px - L) * 0.55, y - hgt * 0.62, px, y - hgt)
  g.quadraticCurveTo(px + (R - px) * 0.42, y - hgt * 0.62, R, y)
  g.fillStyle = I.land
  g.fill()
  // shadow flank: the right-hand half of the peak, toned and hatched down its slope
  g.beginPath()
  g.moveTo(px, y - hgt)
  g.quadraticCurveTo(px + (R - px) * 0.42, y - hgt * 0.62, R, y)
  g.lineTo(px + (R - px) * 0.08, y)
  g.closePath()
  g.fillStyle = I.shade
  g.globalAlpha = 0.12 * shade
  g.fill()
  g.globalAlpha = 0.5 * shade
  g.beginPath()
  const n = Math.max(2, Math.min(8, Math.round(m / 3.6)))
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1)
    // a point on the flank's curve, and a stroke from it down toward the foot
    const u = 1 - t
    const cx = u * u * px + 2 * u * t * (px + (R - px) * 0.42) + t * t * R
    const cy = u * u * (y - hgt) + 2 * u * t * (y - hgt * 0.62) + t * t * y
    g.moveTo(cx - m * 0.03, cy + hgt * 0.04)
    g.lineTo(cx - m * 0.03 - (cx - px) * 0.25, y - hgt * 0.04)
  }
  const lw = g.lineWidth
  g.lineWidth = Math.max(0.5, lw * 0.7)
  g.stroke()
  g.lineWidth = lw
  g.globalAlpha = 1
  g.beginPath()
  g.moveTo(L, y)
  g.quadraticCurveTo(L + (px - L) * 0.55, y - hgt * 0.62, px, y - hgt)
  g.quadraticCurveTo(px + (R - px) * 0.42, y - hgt * 0.62, R, y)
  g.stroke()
  if (m > 9) {
    // a spur down the lit flank
    g.beginPath()
    g.moveTo(px - m * 0.04, y - hgt * 0.8)
    g.quadraticCurveTo(px - m * 0.25, y - hgt * 0.45, px - m * (0.22 + h * 0.2), y - hgt * 0.12)
    g.globalAlpha = 0.45
    g.stroke()
    g.globalAlpha = 1
  }
}

/** A low hill: a molehill arc with a few strokes of shade. */
export function hill(g: CanvasRenderingContext2D, x: number, y: number, m: number, h: number, I: Ink): void {
  const hgt = m * (0.42 + h * 0.2)
  g.beginPath()
  g.moveTo(x - m, y)
  g.bezierCurveTo(x - m * 0.6, y - hgt * 1.3, x + m * 0.5, y - hgt * 1.3, x + m, y)
  g.fillStyle = I.land
  g.fill()
  g.stroke()
  g.beginPath()
  for (let i = 0; i < 3; i++) {
    const sx = x + m * (0.25 + i * 0.22)
    g.moveTo(sx, y - hgt * (0.75 - i * 0.22)); g.lineTo(sx - m * 0.08, y - hgt * 0.1)
  }
  g.globalAlpha = 0.5
  g.stroke()
  g.globalAlpha = 1
}

/** A tuft of grass for open meadow. */
export function tuft(g: CanvasRenderingContext2D, x: number, y: number, m: number): void {
  g.beginPath()
  g.moveTo(x - m * 0.5, y - m * 0.5); g.lineTo(x - m * 0.2, y)
  g.moveTo(x, y - m * 0.75); g.lineTo(x, y)
  g.moveTo(x + m * 0.5, y - m * 0.5); g.lineTo(x + m * 0.2, y)
  g.stroke()
}
