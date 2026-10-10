// The map's names, set live each frame through the shared label board, biggest first so the
// important names always find room: region titles, provinces (the rooms) in spaced capitals,
// rivers along their course and lakes across their water, settlements beside their footprint,
// and, close in, single files beside their marks.

import type { World } from './layout'
import { K, OX, OY, W, H, board, regionTitle, type Geo, type Scene } from './draw'
import { textWidth, fontAt } from './labels'
import type { Atlas } from './atlas'
import { CELL, plotX, plotY } from './terrain'
import { markSize, type Ink, type Kind } from './glyphs'
import type { FieldsNames } from './prefs'

const SERIF = '400 {s} Vollkorn, Georgia, serif'
const ITALIC = 'italic {s} Vollkorn, Georgia, serif'
const CAPS = '500 {s} Vollkorn, Georgia, serif'

export function drawMapNames(ctx: CanvasRenderingContext2D, world: World, geo: Geo, at: Atlas, sc: Scene, names: FieldsNames, hoverMark: number, I: Ink) {
  for (const li of geo.titleOrder) regionTitle(ctx, world.regions[li], sc.C)
  provinceNames(ctx, world, I)
  waterNames(ctx, at, I)
  settlementNames(ctx, at, sc, I)
  if (names === 'all') fileNames(ctx, at, sc, hoverMark, I)
}

const onScreen = (x: number, y: number, r: number) => x + r >= 0 && x - r <= W && y + r >= 0 && y - r <= H

/** The rooms, in spaced capitals across their ground. */
function provinceNames(ctx: CanvasRenderingContext2D, world: World, I: Ink) {
  const rooms = world.regions.flatMap((land) => land.rooms)
    .filter((room) => room.r * K >= 34 && onScreen(plotX(room) * K + OX, plotY(room) * K + OY, room.r * K))
    .sort((a, b) => b.r - a.r)
  for (const room of rooms) {
    const R = room.r * K
    const size = Math.max(10, Math.min(24, R * 0.075)), track = size * 0.32
    const text = (room.path ? room.name : 'the threshold').toUpperCase()
    let tw = -track
    for (const ch of text) tw += textWidth(ctx, CAPS, ch, size) + track
    const x = plotX(room) * K + OX, y = plotY(room) * K + OY
    const yy = [y, y - R * 0.45, y + R * 0.45].find((yy) => board.place(x - tw / 2 - 4, yy - size * 0.75, x + tw / 2 + 4, yy + size * 0.35))
    if (yy === undefined) continue
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.strokeStyle = I.land
    ctx.lineWidth = 3.5
    ctx.globalAlpha = 0.85
    spaced(ctx, text, x, yy, fontAt(CAPS, size), track, true)
    ctx.globalAlpha = 0.78
    ctx.fillStyle = I.ink
    spaced(ctx, text, x, yy, fontAt(CAPS, size), track)
    ctx.restore()
  }
}

/** Lakes named across their water; rivers along their course, main rivers first, and the wider
 *  a river the larger its name. */
function waterNames(ctx: CanvasRenderingContext2D, at: Atlas, I: Ink) {
  for (const l of at.lakes) {
    const r = l.r * K, x = l.x * K + OX, y = l.y * K + OY
    if (r < 26 || !onScreen(x, y, 0)) continue
    const size = Math.max(10.5, Math.min(18, r * 0.2)), track = size * 0.18
    let tw = -track
    for (const ch of l.name) tw += textWidth(ctx, ITALIC, ch, size) + track
    if (tw > r * 2.2 || !board.place(x - tw / 2 - 2, y - size * 0.8, x + tw / 2 + 2, y + size * 0.3)) continue
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.strokeStyle = I.sea; ctx.lineWidth = 3; ctx.globalAlpha = 0.8
    spaced(ctx, l.name, x, y + size * 0.3, fontAt(ITALIC, size), track, true)
    ctx.fillStyle = I.ink; ctx.globalAlpha = 0.85
    spaced(ctx, l.name, x, y + size * 0.3, fontAt(ITALIC, size), track)
    ctx.restore()
  }
  const rivers = at.rivers.filter((r) => r.main || CELL * K > 2.2).sort((a, b) => Number(b.main) - Number(a.main))
  for (const r of rivers) {
    // the river's course on screen, thinned to a point every few pixels
    const xs: number[] = [], ys: number[] = []
    let wsum = 0, lx = -1e9, ly = -1e9
    for (let i = 0; i < r.pts.length / 2; i++) {
      const x = r.pts[i * 2] * K + OX, y = r.pts[i * 2 + 1] * K + OY
      if (!onScreen(x, y, 40)) {
        if (xs.length > 1) break
        xs.length = 0; ys.length = 0
        continue
      }
      if (Math.hypot(x - lx, y - ly) < 5) continue
      xs.push(x); ys.push(y); lx = x; ly = y
      wsum += r.w[i] * K
    }
    const wpx = xs.length ? wsum / xs.length : 1
    const size = r.main ? Math.max(11, Math.min(17, 10 + wpx * 0.6)) : Math.max(9.5, Math.min(13, 9 + wpx * 0.5))
    alongCurve(ctx, xs, ys, r.name, ITALIC, size, wpx / 2 + 3, I.ink, I.land)
  }
}

/** Settlements, biggest first, beside their footprint (a river town's above or below its water). */
function settlementNames(ctx: CanvasRenderingContext2D, at: Atlas, sc: Scene, I: Ink) {
  const towns = at.settlements.filter((st) => {
    if (st.plot.depth === 0 && !st.plot.children.length) return false     // a room that is one town: its province name says it
    const x = st.x * K + OX, y = st.y * K + OY, r = st.r * K
    if (x + r < -60 || x - r > W + 60 || y + r < -20 || y - r > H + 20) return false
    return r > 9 || (st.n >= 40 && r > 3.5)
  }).sort((a, b) => b.n - a.n)
  for (const st of towns) {
    const x = st.x * K + OX, y = st.y * K + OY, r = Math.max(5, st.r * K)
    const size = Math.max(10.5, Math.min(17, 9 + Math.log2(st.n + 1) * 1.1))
    const face = st.river ? ITALIC : SERIF
    const tw = textWidth(ctx, face, st.plot.name, size)
    const spots: Array<[number, number]> = st.river
      ? [[x - tw / 2, y - r - size * 0.4], [x - tw / 2, y + r + size * 0.9]]
      : [[x + r * 0.75 + 5, y + size * 0.32], [x - r * 0.75 - 5 - tw, y + size * 0.32], [x - tw / 2, y + r + size], [x - tw / 2, y - r - size * 0.35]]
    const spot = spots.find(([lx, ly]) => lx + tw >= 0 && lx <= W && ly >= 0 && ly <= H && board.place(lx - 3, ly - size * 0.85, lx + tw + 3, ly + size * 0.3))
    if (spot) haloText(ctx, st.plot.name, spot[0], spot[1], fontAt(face, size), sc.hovered === st.plot ? sc.C['--gold'] : I.ink, I.land, 3.2)
  }
}

/** Single files, once their marks are big enough to name; a little air round each name, so a
 *  crowded street is named sparingly. The mark under the hand is always named first. */
function fileNames(ctx: CanvasRenderingContext2D, at: Atlas, sc: Scene, hoverMark: number, I: Ink) {
  const cellPx = CELL * K
  if (cellPx < 21) return
  const list: number[] = []
  at.glyphs.each(-OX / K, -OY / K, (W - OX) / K, (H - OY) / K, (i) => list.push(i))
  if (list.length > 2500) return
  if (hoverMark >= 0) list.unshift(hoverMark)
  const size = Math.min(13, 9.5 + (cellPx - 21) * 0.06), font = fontAt(ITALIC, size)
  for (let q = 0; q < list.length; q++) {
    const i = list[q]
    if (q > 0 && i === hoverMark) continue
    const x = at.gx[i] * K + OX, y = at.gy[i] * K + OY
    if (x < -40 || x > W + 40 || y < 0 || y > H) continue
    const name = at.path[i].slice(at.path[i].lastIndexOf('/') + 1)
    const text = name.length > 30 ? name.slice(0, 29) + '…' : name
    const tw = textWidth(ctx, ITALIC, text, size)
    const gw = markSize(at.kind[i] as Kind, cellPx, at.scale[i])
    const spot = ([[x + gw * 0.45 + 3, y + size * 0.35], [x - gw * 0.45 - 3 - tw, y + size * 0.35], [x - tw / 2, y + gw * 0.5 + size]] as const)
      .find(([lx, ly]) => board.place(lx - 6, ly - size * 1.2, lx + tw + 6, ly + size * 0.6))
    if (spot) haloText(ctx, text, spot[0], spot[1], font, i === hoverMark ? sc.C['--gold'] : sc.C['--ink-2'], I.land, 3)
  }
}

/** Left-aligned text with a soft halo of the paper behind it. */
function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string, halo: string, width: number) {
  ctx.font = font
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.strokeStyle = halo
  ctx.lineWidth = width
  ctx.globalAlpha = 0.9
  ctx.strokeText(text, x, y)
  ctx.globalAlpha = 1
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

/** Set `text` along a screen-space polyline, a little to one side of it, reading left to right:
 *  the stretch chosen is the straightest one long enough, nearest the middle of what is on
 *  screen. Returns false (drawing nothing) when no stretch fits on the label board. */
function alongCurve(ctx: CanvasRenderingContext2D, xs: number[], ys: number[], text: string, face: string, size: number, lift: number, color: string, halo: string): boolean {
  const n = xs.length
  if (n < 2) return false
  const arc = [0]
  for (let i = 1; i < n; i++) arc.push(arc[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]))
  const track = size * 0.12
  const chars = [...text]
  const ws = chars.map((ch) => textWidth(ctx, face, ch, size))
  const tw = ws.reduce((s, w) => s + w + track, -track)
  const total = arc[n - 1]
  if (total < tw * 1.15) return false
  const at = (d: number): [number, number, number] => {
    let i = 1
    while (i < n - 1 && arc[i] < d) i++
    const u = (d - arc[i - 1]) / Math.max(1e-6, arc[i] - arc[i - 1])
    return [xs[i - 1] + (xs[i] - xs[i - 1]) * u, ys[i - 1] + (ys[i] - ys[i - 1]) * u, Math.atan2(ys[i] - ys[i - 1], xs[i] - xs[i - 1])]
  }
  // straight enough: the heading may turn no more than about thirty degrees across the name
  const straight = (s0: number) => {
    const a0 = at(s0)[2]
    for (let k = 1; k <= 6; k++) {
      const da = Math.atan2(Math.sin(at(s0 + (tw * k) / 6)[2] - a0), Math.cos(at(s0 + (tw * k) / 6)[2] - a0))
      if (Math.abs(da) > 0.55) return false
    }
    return true
  }
  const starts: number[] = []
  for (let d = 0; d + tw <= total; d += Math.max(12, tw * 0.25)) starts.push(d)
  starts.sort((a, b) => Math.abs(a + tw / 2 - total / 2) - Math.abs(b + tw / 2 - total / 2))
  for (const s0 of starts) {
    if (!straight(s0)) continue
    // read left to right whichever way the river runs
    const flip = Math.cos(at(s0 + tw / 2)[2]) < 0
    const glyphs: Array<[number, number, number, string]> = []
    let acc = 0
    for (let c = 0; c < chars.length; c++) {
      const [px, py, ang0] = at(flip ? s0 + tw - acc - ws[c] / 2 : s0 + acc + ws[c] / 2)
      const ang = flip ? ang0 + Math.PI : ang0
      // the baseline sits just above the river (up being square to the text, toward its tops)
      glyphs.push([px + Math.sin(ang) * lift, py - Math.cos(ang) * lift, ang, chars[c]])
      acc += ws[c] + track
    }
    const boxes = glyphs.map(([gx, gy, ang]) => {
      const cx = gx + Math.sin(ang) * size * 0.35, cy = gy - Math.cos(ang) * size * 0.35
      return [cx - size * 0.42, cy - size * 0.42, cx + size * 0.42, cy + size * 0.42] as const
    })
    if (boxes.some((b) => b[0] < 0 || b[2] > W || b[1] < 0 || b[3] > H || !board.fits(b[0], b[1], b[2], b[3]))) continue
    for (const b of boxes) board.add(b[0], b[1], b[2], b[3])
    ctx.save()
    ctx.font = fontAt(face, size)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.lineWidth = 3
    for (const [gx, gy, ang, ch] of glyphs) {
      ctx.translate(gx, gy); ctx.rotate(ang)
      ctx.strokeStyle = halo; ctx.globalAlpha = 0.85; ctx.strokeText(ch, 0, 0)
      ctx.fillStyle = color; ctx.globalAlpha = 1; ctx.fillText(ch, 0, 0)
      ctx.rotate(-ang); ctx.translate(-gx, -gy)
    }
    ctx.restore()
    return true
  }
  return false
}

/** Letter-spaced text centred on x, set one character at a time (canvas has no tracking). */
export function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, track: number, stroke = false) {
  ctx.font = font
  const chars = [...text]
  const ws = chars.map((ch) => ctx.measureText(ch).width)
  let pos = x - ws.reduce((s, w) => s + w + track, -track) / 2
  const align = ctx.textAlign
  ctx.textAlign = 'left'
  chars.forEach((ch, i) => {
    if (stroke) ctx.strokeText(ch, pos, y); else ctx.fillText(ch, pos, y)
    pos += ws[i] + track
  })
  ctx.textAlign = align
}

