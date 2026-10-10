// Painting the Fields. Sea first (rhumb lines and range rings), then each island: soundings,
// coast, offshore waves, rooms with their furrows, and the mist over rooms not yet walked.
// Names go last, through one label board, so nothing written on the map sits on anything else:
// region titles first (set on an arc like a chart's), then plots by size, then single grains.
//
// The camera transform is held in module state and applied inline, so the hot loops over plots
// and grains allocate nothing per frame.

import type { CanvasApi } from '@/ui/useCanvas'
import { journeyById } from '@/grain/quests'
import { hash, type Plot, type World } from './layout'
import { LabelBoard, textWidth, fontAt } from './labels'
import type { FieldsNames } from './prefs'

export interface Geo {
  hulls: Path2D[]                       // per land, in world coordinates
  waves: Float32Array[]                 // per land: [angle, reach, size] triplets
  rooms: Plot[]                         // every top-level plot, the root's threshold included
  roomOf: Map<string, Plot>             // top-level path -> room
  titleOrder: number[]                  // lands: the Front Door, then biggest first
  bounds: { x0: number; y0: number; x1: number; y1: number }
}

export function buildGeo(world: World): Geo {
  const hulls = world.regions.map((land) => {
    const p = new Path2D()
    land.hull.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)))
    p.closePath()
    return p
  })
  const waves = world.regions.map((land) => {
    const id = land.region.id
    const n = land.hull.length
    const count = 7 + Math.floor(hash(id + ':w') * 4)
    const out = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(((i + hash(id + ':' + i) * 0.7) / count) * n) % n
      const [hx, hy] = land.hull[idx]
      out[i * 3] = Math.atan2(hy - land.y, hx - land.x)
      out[i * 3 + 1] = Math.hypot(hx - land.x, hy - land.y)
      out[i * 3 + 2] = 0.6 + hash(id + ':z' + i) * 0.8
    }
    return out
  })
  const rooms: Plot[] = []
  const roomOf = new Map<string, Plot>()
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const land of world.regions) {
    for (const [x, y] of land.hull) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    for (const room of land.rooms) {
      rooms.push(room)
      roomOf.set(room.path, room)
    }
  }
  const titleOrder = world.regions.map((_, i) => i)
    .sort((a, b) => (world.regions[a].region.ring === 0 ? -1 : 0) - (world.regions[b].region.ring === 0 ? -1 : 0) || world.regions[b].r - world.regions[a].r)
  return { hulls, waves, rooms, roomOf, titleOrder, bounds: { x0, y0, x1, y1 } }
}

/** The top-level room a file belongs to ('' for the root's own files). */
export const roomOfFile = (path: string) => (path.includes('/') ? path.slice(0, path.indexOf('/')) : '')
/** The top-level room a plot (a folder) sits in. */
export const roomOfPlot = (path: string) => (path.includes('/') ? path.slice(0, path.indexOf('/')) : path)

export interface Scene {
  C: Record<string, string>
  stone: boolean
  seeds: Record<string, number>
  activeJourney?: string
  selected: Plot | null
  hovered: Plot | null
  pulse: number                         // 0..1 through the hover pulse, or -1 for none
  discovered: Set<string>               // room paths with at least one planted seed
  fog: HTMLCanvasElement | null         // a tile of soft cloud, tinted for the mode
  names?: FieldsNames                   // default 'all'
  mist?: boolean                        // default true
}

// ---- frame state (module-level so hot loops allocate nothing; the map view reads it too)
export let K = 1, OX = 0, OY = 0, W = 0, H = 0
export const board = new LabelBoard()
let fogPattern: CanvasPattern | null = null
let fogSource: HTMLCanvasElement | null = null

interface Label { kind: 0 | 1; text: string; sub: string; x: number; y: number; r: number; size: number; depth: number; pr: number }
const pool: Label[] = []
let nL = 0
const sortLabels = (a: Label, b: Label) => b.pr - a.pr
function pushLabel(): Label {
  let L = pool[nL]
  if (!L) { L = { kind: 0, text: '', sub: '', x: 0, y: 0, r: 0, size: 0, depth: 0, pr: 0 }; pool[nL] = L }
  nL++
  return L
}

const ROOM_FACE = '600 {s} "Public Sans", sans-serif'
const PLOT_FACE = '400 {s} "Public Sans", sans-serif'
const COUNT_FACE = '400 {s} "Public Sans", sans-serif'
const GRAIN_FACE = '400 {s} "Source Code Pro", monospace'
const REGION_FACE = 'italic {s} Vollkorn, Georgia, serif'

/** Set the frame's camera state, clear the label board and fix the mist to the land. Both views
 *  start every frame here. */
export function beginFrame(ctx: CanvasRenderingContext2D, a: CanvasApi, world: World, sc: Scene): void {
  const { w, h } = a.size.current
  const cam = a.camera.current
  K = cam.k; W = w; H = h
  OX = w / 2 - cam.x * K; OY = h / 2 - cam.y * K
  nL = 0
  board.reset(w, h)
  ctx.lineJoin = 'round'
  if (sc.fog !== fogSource) { fogSource = sc.fog; fogPattern = sc.fog ? ctx.createPattern(sc.fog, 'repeat') : null }
  if (fogPattern) {
    // one tile spans a fixed stretch of land, so the mist does not swim as you pan
    const t = (world.radius * 0.22 * K) / 256
    fogPattern.setTransform(new DOMMatrix([t, 0, 0, t, OX, OY]))
  }
  // keep names out from under the minimap, the legend and the view's own controls
  board.add(w - 216, 0, w, 236)
  board.add(w / 2 - 300, h - 34, w / 2 + 300, h)
  board.add(0, 0, 250, 56)
}

export function drawFields(ctx: CanvasRenderingContext2D, a: CanvasApi, world: World, geo: Geo, sc: Scene): void {
  beginFrame(ctx, a, world, sc)
  const { w, h } = a.size.current
  const C = sc.C

  // ---- sea: rhumb lines from the Front Door, and range rings
  ctx.save()
  ctx.strokeStyle = C['--rule']
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 0.6
  ctx.setLineDash([2, 6])
  ctx.beginPath()
  for (let i = 0; i < 32; i++) {
    const t = (i / 32) * Math.PI * 2
    ctx.moveTo(OX, OY)
    ctx.lineTo(OX + Math.cos(t) * 4000, OY + Math.sin(t) * 4000)
  }
  ctx.stroke()
  ctx.setLineDash([])
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath()
    ctx.arc(OX, OY, world.radius * 0.36 * i * K, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()

  // ---- land
  for (let li = 0; li < world.regions.length; li++) {
    const land = world.regions[li]
    const cx = land.x * K + OX, cy = land.y * K + OY, Rv = land.r * 1.3 * K
    if (cx + Rv < -20 || cx - Rv > w + 20 || cy + Rv < -20 || cy - Rv > h + 20) continue
    const accent = C[`--el-${land.region.element}`]
    const path = geo.hulls[li]

    ctx.save()
    ctx.translate(OX, OY)
    ctx.scale(K, K)
    // contour rings, like soundings around an island
    ctx.strokeStyle = accent
    for (let ring = 3; ring >= 1; ring--) {
      const s = 1 + ring * 0.035
      ctx.save()
      ctx.translate(land.x, land.y)
      ctx.scale(s, s)
      ctx.translate(-land.x, -land.y)
      ctx.globalAlpha = 0.12 / ring + 0.04
      ctx.lineWidth = 1 / (K * s)
      ctx.stroke(path)
      ctx.restore()
    }
    ctx.fillStyle = C['--surface']
    ctx.globalAlpha = 0.55
    ctx.fill(path)
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1.2 / K
    ctx.stroke(path)
    ctx.restore()

    drawWaves(ctx, geo.waves[li], cx, cy, land.r * K, accent)

    for (const room of land.rooms) {
      drawPlot(ctx, room, accent, 0, sc)
      drawWeather(ctx, room, sc)
    }
  }

  // ---- planted seeds glow gold
  drawSeeds(ctx, world.index, sc)

  // ---- the hovered plot answers with one soft ring
  if (sc.hovered && sc.pulse >= 0) drawPulse(ctx, sc.hovered.x, sc.hovered.y, sc.hovered.r, sc)

  // ---- the road of the active journey (its stops claim their room on the label board)
  const j = sc.activeJourney ? journeyById(sc.activeJourney) : undefined
  if (j) drawRoad(ctx, j.stops, world.index, sc)

  // ---- names: region titles, then plots by size, then grains
  if (sc.names === 'none') return
  for (const li of geo.titleOrder) regionTitle(ctx, world.regions[li], C)
  const list = pool.slice(0, nL).sort(sortLabels)
  for (const L of list) {
    if (L.kind === 0) plotLabel(ctx, L, C)
    else grainLabel(ctx, L, C)
  }
}

/** Planted seeds (files read) glow gold wherever the view has set them. */
export function drawSeeds(ctx: CanvasRenderingContext2D, index: Map<string, { x: number; y: number }>, sc: Scene) {
  ctx.fillStyle = sc.C['--gold']
  const seedR = Math.max(4, 7 * Math.min(1, K)), coreR = Math.max(1.6, 2.6 * Math.min(1.5, K))
  for (const p in sc.seeds) {
    const at = index.get(p)
    if (!at) continue
    const x = at.x * K + OX, y = at.y * K + OY
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue
    ctx.globalAlpha = 0.25
    ctx.beginPath(); ctx.arc(x, y, seedR, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    ctx.beginPath(); ctx.arc(x, y, coreR, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
}

/** One soft gold ring spreading from a circle in world coordinates (the hover answer). */
export function drawPulse(ctx: CanvasRenderingContext2D, wx: number, wy: number, wr: number, sc: Scene) {
  const x = wx * K + OX, y = wy * K + OY, R = wr * K
  const u = 1 - Math.pow(1 - sc.pulse, 3)
  ctx.save()
  ctx.strokeStyle = sc.C['--gold']
  ctx.globalAlpha = 0.55 * Math.pow(1 - sc.pulse, 1.4)
  ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.arc(x, y, R + 3 + u * Math.min(18, 6 + R * 0.12), 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}

// ------------------------------------------------------------------ islands

function drawWaves(ctx: CanvasRenderingContext2D, waves: Float32Array, cx: number, cy: number, Rs: number, accent: string) {
  // ripples offshore only at the middle distance: too small to read far out, noise up close
  const f = Math.min(1, Math.max(0, (Rs - 80) / 80)) * Math.min(1, Math.max(0, (2200 - Rs) / 900))
  if (f <= 0.01) return
  ctx.save()
  ctx.strokeStyle = accent
  ctx.lineCap = 'round'
  ctx.lineWidth = 1
  for (let i = 0; i < waves.length; i += 3) {
    const ang = waves[i], reach = waves[i + 1] * K, sz = waves[i + 2]
    // three ripples running with the coast, each shorter and fainter than the one inside it
    for (let r = 0; r < 3; r++) {
      const rr = reach + 10 + 5 * sz + r * 5
      const span = ((12 + 10 * sz) * (1 - r * 0.3)) / rr
      ctx.globalAlpha = (0.46 - r * 0.13) * f
      ctx.beginPath(); ctx.arc(cx, cy, rr, ang - span, ang + span); ctx.stroke()
    }
  }
  ctx.restore()
}

/** Mist over a room not yet walked; a clear, faintly lit field over one that has been. */
export function drawWeather(ctx: CanvasRenderingContext2D, room: Plot, sc: Scene) {
  const x = room.x * K + OX, y = room.y * K + OY, R = room.r * K
  if (R < 3 || x + R < 0 || x - R > W || y + R < 0 || y - R > H) return
  const C = sc.C
  if (sc.discovered.has(room.path)) {
    ctx.save()
    ctx.fillStyle = C['--gold']
    ctx.globalAlpha = 0.05
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = C['--gold']
    ctx.globalAlpha = 0.22
    ctx.lineWidth = Math.min(6, Math.max(2, R * 0.05))
    ctx.beginPath(); ctx.arc(x, y, R + ctx.lineWidth * 0.5 + 1, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
    return
  }
  if (sc.mist === false) return
  // the mist thins as you come close, so a room can always be read once you are inside it
  const near = Math.min(W, H)
  const thin = Math.min(1, Math.max(0, (1.5 * near - R) / (0.8 * near)))
  const peek = sc.hovered && roomOfPlot(sc.hovered.path) === room.path ? 0.5 : 1
  const alpha = thin * peek
  if (alpha <= 0.01) return
  ctx.save()
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2)
  ctx.globalAlpha = (sc.stone ? 0.3 : 0.26) * alpha
  ctx.fillStyle = sc.stone ? C['--surface-2'] : C['--ink-3']
  ctx.fill()
  if (fogPattern) {
    // drifting cloud texture, fixed to the land so it travels with the map
    ctx.globalAlpha = (sc.stone ? 0.75 : 0.85) * alpha
    ctx.fillStyle = fogPattern
    ctx.fill()
  }
  ctx.restore()
}

function drawPlot(ctx: CanvasRenderingContext2D, p: Plot, accent: string, depth: number, sc: Scene) {
  const x = p.x * K + OX, y = p.y * K + OY, R = p.r * K
  if (x + R < -10 || x - R > W + 10 || y + R < -10 || y - R > H + 10) return
  const C = sc.C
  if (R < 1.2) {
    ctx.fillStyle = accent
    ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6)
    return
  }
  const hot = sc.hovered === p
  // the field: a rounded plot with furrows
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, R, 0, Math.PI * 2)
  ctx.fillStyle = depth === 0 ? C['--page'] : C['--surface-2']
  ctx.globalAlpha = depth === 0 ? 0.85 : 0.5
  ctx.fill()
  if (hot) {
    ctx.fillStyle = C['--gold']
    ctx.globalAlpha = 0.08
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.clip()
  const gap = Math.max(4, Math.min(9, R / 6))
  ctx.strokeStyle = accent
  ctx.globalAlpha = (depth === 0 ? 0.32 : 0.22) * (hot ? 1.5 : 1)
  ctx.lineWidth = 1
  ctx.translate(x, y)
  ctx.rotate(p.furrow)
  ctx.beginPath()
  for (let fx = -R; fx <= R; fx += gap) { ctx.moveTo(fx, -R); ctx.lineTo(fx, R) }
  ctx.stroke()
  ctx.restore()

  ctx.beginPath()
  ctx.arc(x, y, R, 0, Math.PI * 2)
  const sel = sc.selected === p
  ctx.strokeStyle = sel || hot ? C['--gold'] : accent
  ctx.lineWidth = sel ? 2.4 : (depth === 0 ? 1.4 : 0.9) + (hot ? 0.6 : 0)
  ctx.globalAlpha = hot ? 1 : 0.85
  ctx.stroke()
  ctx.globalAlpha = 1

  // inside: sub-plots once there is room, grains once they can be seen
  if (R > 34) for (const c of p.children) drawPlot(ctx, c, accent, depth + 1, sc)
  if (R > 46 && p.grains.length) {
    const gr = Math.max(1.2, Math.min(4.5, 2.2 * K))
    ctx.fillStyle = C['--gold']
    ctx.strokeStyle = C['--brass-dim']
    ctx.lineWidth = 0.6
    const named = gr > 3.6
    for (const g of p.grains) {
      const qx = g.x * K + OX, qy = g.y * K + OY
      if (qx < -6 || qx > W + 6 || qy < -6 || qy > H + 6) continue
      ctx.beginPath()
      ctx.ellipse(qx, qy, gr * 0.62, gr, g.a, 0, Math.PI * 2)
      ctx.fill()
      if (gr > 2.5) ctx.stroke()
      if (named && sc.names !== 'places') {
        const L = pushLabel()
        L.kind = 1; L.text = g.name; L.sub = ''; L.x = qx; L.y = qy; L.r = gr; L.size = 11; L.depth = depth + 1; L.pr = -1
      }
    }
  }

  if (R > 16) {
    const L = pushLabel()
    L.kind = 0; L.text = p.name; L.sub = p.files > 1 ? String(p.files) : ''; L.x = x; L.y = y; L.r = R
    L.size = depth === 0 ? Math.max(11, Math.min(20, R * 0.2)) : Math.max(10, Math.min(15, R * 0.16))
    L.depth = depth
    // bigger plots win; the one under the hand always gets its name
    L.pr = R + (hot ? 1e7 : 0)
  }
}

export function drawRoad(ctx: CanvasRenderingContext2D, stops: Array<{ path: string }>, index: Map<string, { x: number; y: number }>, sc: Scene) {
  const C = sc.C
  ctx.save()
  ctx.strokeStyle = C['--invite']
  ctx.lineWidth = 2
  ctx.setLineDash([6, 6])
  ctx.beginPath()
  let px = 0, py = 0, first = true
  for (const st of stops) {
    const p = index.get(st.path)
    if (!p) continue
    const x = p.x * K + OX, y = p.y * K + OY
    if (first) { ctx.moveTo(x, y); first = false }
    else ctx.quadraticCurveTo((px + x) / 2 + (y - py) * 0.18, (py + y) / 2 - (x - px) * 0.18, x, y)
    px = x; py = y
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.font = '600 11px "Public Sans", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  stops.forEach((st, i) => {
    const p = index.get(st.path)
    if (!p) return
    const x = p.x * K + OX, y = p.y * K + OY
    const done = !!sc.seeds[st.path]
    ctx.fillStyle = done ? C['--gold'] : C['--page']
    ctx.strokeStyle = C['--invite']
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = done ? C['--page'] : C['--invite']
    ctx.fillText(String(i + 1), x, y + 0.5)
    board.add(x - 11, y - 11, x + 11, y + 11)
  })
  ctx.restore()
}

// ------------------------------------------------------------------ names

/** A region's name set along a gentle arc over its island; under it, or beside it, when crowded. */
export function regionTitle(ctx: CanvasRenderingContext2D, land: World['regions'][number], C: Record<string, string>) {
  const Rs = land.r * K
  const cx = land.x * K + OX, cy = land.y * K + OY
  if (cx < -Rs * 2 - 400 || cx > W + Rs * 2 + 400) return
  const text = land.region.name
  // spots in order of preference: arched over, arched under, smaller arches, then level beside
  // (beside only for small islands, where a level name cannot be mistaken for a neighbour's)
  let overOut = false
  for (let spot = 0; spot < 6; spot++) {
    if (spot > 3 && Rs > 90) break
    if (overOut && spot !== 1 && spot !== 3) continue
    const size = Math.max(15, Math.min(46, Rs * 0.17)) * (spot === 2 || spot === 3 ? 0.82 : spot > 3 ? 0.88 : 1)
    const track = size * 0.08
    let total = -track
    for (let i = 0; i < text.length; i++) total += textWidth(ctx, REGION_FACE, text[i], size) + track
    const arched = spot < 4
    const over = spot === 0 || spot === 2
    const Ra = Math.max(Rs * 1.9, total * 1.15, 240)
    const half = arched ? total / (2 * Ra) : 0
    const sag = Ra * (1 - Math.cos(half))
    let x0: number, x1: number, y0: number, y1: number, base: number, startX = 0
    if (arched) {
      base = over ? (land.y - land.r * 1.04) * K + OY - 2 : (land.y + land.r * 1.04) * K + OY + size * 0.95
      x0 = cx - total / 2 - 4; x1 = cx + total / 2 + 4
      y0 = over ? base - size * 0.92 : base - sag - size * 0.92
      y1 = over ? base + sag + size * 0.2 : base + size * 0.25
    } else {
      base = cy + size * 0.3
      startX = spot === 4 ? cx + Rs * 1.08 + 10 : cx - Rs * 1.08 - 10 - total
      x0 = startX - 4; x1 = startX + total + 4
      y0 = base - size * 0.92; y1 = base + size * 0.25
    }
    // a title is never cut by the edge: an arch that leaves the view gives way to the other side
    if (y0 < 2 || y1 > H - 2 || x0 < 2 || x1 > W - 2) {
      if (spot === 0) overOut = true
      continue
    }
    if (!board.place(x0, y0, x1, y1)) continue
    ctx.save()
    ctx.font = fontAt(REGION_FACE, size)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = C['--ink']
    ctx.strokeStyle = C['--page']
    ctx.lineWidth = Math.max(3, size * 0.14)
    const faded = Rs > 900
    const ccy = over ? base + Ra : base - Ra
    let acc = 0
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      const cw = textWidth(ctx, REGION_FACE, ch, size)
      let px: number, py: number, rot: number
      if (arched) {
        const th = over ? -Math.PI / 2 - half + (acc + cw / 2) / Ra : Math.PI / 2 + half - (acc + cw / 2) / Ra
        px = cx + Ra * Math.cos(th); py = ccy + Ra * Math.sin(th)
        rot = over ? th + Math.PI / 2 : th - Math.PI / 2
      } else {
        px = startX + acc + cw / 2; py = base; rot = 0
      }
      ctx.translate(px, py)
      ctx.rotate(rot)
      ctx.globalAlpha = faded ? 0.2 : 0.5
      ctx.strokeText(ch, 0, 0)
      ctx.globalAlpha = faded ? 0.35 : 0.94
      ctx.fillText(ch, 0, 0)
      ctx.rotate(-rot)
      ctx.translate(-px, -py)
      acc += cw + track
    }
    ctx.restore()
    return
  }
}

function plotLabel(ctx: CanvasRenderingContext2D, L: Label, C: Record<string, string>) {
  const face = L.depth === 0 ? ROOM_FACE : PLOT_FACE
  const size = L.size, subSize = size * 0.8
  const nameW = textWidth(ctx, face, L.text, size)
  const subW = L.sub ? textWidth(ctx, COUNT_FACE, L.sub, subSize) : 0
  const gap = L.sub ? size * 0.32 : 0
  const tw = nameW + gap + subW
  const hh = size * 1.3
  const R = L.r
  const big = R > 140
  for (let c = 0; c < 3; c++) {
    const y = big
      ? (c === 0 ? L.y - R + size * 1.4 : c === 1 ? L.y + R - size * 1.4 : L.y)
      : (c === 0 ? L.y : c === 1 ? L.y + R + size * 0.85 : L.y - R - size * 0.85)
    const x0 = L.x - tw / 2
    if (x0 + tw < 0 || x0 > W || y + hh < 0 || y - hh > H) continue
    if (!board.place(x0 - 3, y - hh / 2, x0 + tw + 3, y + hh / 2)) continue
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = C['--page']
    ctx.font = fontAt(face, size)
    ctx.globalAlpha = 0.9
    ctx.strokeText(L.text, x0, y)
    ctx.globalAlpha = 1
    ctx.fillStyle = C['--ink']
    ctx.fillText(L.text, x0, y)
    if (L.sub) {
      ctx.font = fontAt(COUNT_FACE, subSize)
      ctx.globalAlpha = 0.9
      ctx.strokeText(L.sub, x0 + nameW + gap, y + size * 0.06)
      ctx.globalAlpha = 1
      ctx.fillStyle = C['--ink-2']
      ctx.fillText(L.sub, x0 + nameW + gap, y + size * 0.06)
    }
    return
  }
}

function grainLabel(ctx: CanvasRenderingContext2D, L: Label, C: Record<string, string>) {
  const tw = textWidth(ctx, GRAIN_FACE, L.text, L.size)
  const hh = 13
  for (let c = 0; c < 2; c++) {
    const x0 = c === 0 ? L.x + L.r + 4 : L.x - L.r - 4 - tw
    if (x0 + tw < 0 || x0 > W || L.y < 0 || L.y > H) return
    if (!board.place(x0 - 1, L.y - hh / 2, x0 + tw + 1, L.y + hh / 2)) continue
    ctx.font = fontAt(GRAIN_FACE, L.size)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = C['--ink-2']
    ctx.fillText(L.text, x0, L.y)
    return
  }
}
