// The chart's furniture, drawn live over the tiles: a portolan's wind lines, the compass rose and
// the title cartouche. Each sits in a corner of open sea the atlas found for it, and claims its
// place on the label board so no name is written across it.

import { K, OX, OY, W, H, board } from './draw'
import { fontAt } from './labels'
import { spaced } from './maplabels'
import type { Ink } from './glyphs'

type Point = { x: number; y: number }

/** The wind lines from the rose: the eight winds in ink, half-winds in sage, quarters in madder. */
export function drawRhumbs(ctx: CanvasRenderingContext2D, rose: Point, C: Record<string, string>) {
  const x = rose.x * K + OX, y = rose.y * K + OY
  const L = Math.hypot(W, H) + Math.hypot(x - W / 2, y - H / 2)
  ctx.save()
  ctx.lineWidth = 0.7
  const tones = [C['--ink'], C['--madder'], C['--sage'], C['--madder']]
  tones.forEach((tone, t) => {
    ctx.strokeStyle = tone
    ctx.globalAlpha = t === 0 ? 0.2 : 0.22
    ctx.beginPath()
    for (let i = t; i < 32; i += 4) {
      const a = (i / 32) * Math.PI * 2
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L)
    }
    ctx.stroke()
  })
  ctx.restore()
}

/** A compass rose: a ringed card with degree ticks, eight half-points, four quarter-points and
 *  the four cardinals, north in madder. */
export function drawRose(ctx: CanvasRenderingContext2D, rose: Point, worldRadius: number, C: Record<string, string>, I: Ink) {
  const R = Math.max(Math.min(34, W * 0.06), Math.min(92, worldRadius * 0.055 * K))
  const x = rose.x * K + OX, y = rose.y * K + OY
  if (x < -R || x > W + R || y < -R - 20 || y > H + R) return
  board.add(x - R - 4, y - R - 22, x + R + 4, y + R + 4)
  ctx.save()
  ctx.translate(x, y)
  ctx.lineJoin = 'miter'
  ctx.fillStyle = I.land
  ctx.strokeStyle = I.ink
  ctx.globalAlpha = 0.92
  ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  ctx.lineWidth = 0.8
  ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(0, 0, R * 0.78, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath()
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2, r0 = i % 2 ? R * 0.81 : R * 0.79
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0)
    ctx.lineTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86)
  }
  ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1
  // a point is two triangles, the shadow side dark and the lit side bare
  const point = (ang: number, len: number, wid: number, dark: string) => {
    const c = Math.cos(ang), s = Math.sin(ang)
    for (const [side, fill] of [[1, dark], [-1, I.land]] as const) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(c * len, s * len); ctx.lineTo(-s * wid * side, c * wid * side); ctx.closePath()
      ctx.fillStyle = fill; ctx.fill(); ctx.stroke()
    }
  }
  for (let i = 0; i < 8; i++) point(((i + 0.5) / 8) * Math.PI * 2 - Math.PI / 2, R * 0.5, R * 0.06, I.dim)
  for (let i = 0; i < 4; i++) point(((i + 0.5) / 4) * Math.PI * 2 - Math.PI / 2, R * 0.68, R * 0.1, I.ink)
  for (let i = 0; i < 4; i++) point((i / 4) * Math.PI * 2 - Math.PI / 2, i === 0 ? R : R * 0.92, R * 0.13, i === 0 ? C['--madder'] : I.ink)
  ctx.beginPath(); ctx.arc(0, 0, R * 0.07, 0, Math.PI * 2)
  ctx.fillStyle = C['--gold']; ctx.fill(); ctx.stroke()
  ctx.font = fontAt('600 {s} Vollkorn, Georgia, serif', Math.max(12, R * 0.24))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = I.ink
  ctx.fillText('N', 0, -R - 4)
  ctx.restore()
}

/** The title on a scroll: a framed card with its ends rolled under. */
export function drawCartouche(ctx: CanvasRenderingContext2D, at: Point, worldRadius: number, I: Ink, stats: string) {
  const w = Math.max(Math.min(170, W * 0.3), Math.min(300, worldRadius * 0.16 * K)), h = w * 0.42
  const cx = at.x * K + OX, cy = at.y * K + OY
  const x = cx - w / 2, y = cy - h / 2
  if (x > W || x + w < 0 || y > H || y + h < 0) return
  board.add(x - 14, y - 6, x + w + 14, y + h + 6)
  ctx.save()
  ctx.lineWidth = 1
  ctx.strokeStyle = I.ink
  ctx.fillStyle = I.land
  const roll = h * 0.22
  for (const side of [-1, 1]) {
    const ex = (side < 0 ? x : x + w) + side * roll * 0.2
    ctx.beginPath(); ctx.ellipse(ex, y + h / 2, roll * 0.7, h * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(ex, y + h / 2, roll * 0.3, h * 0.22, 0, 0, Math.PI * 2)
    ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1
  }
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.roundRect(x + 4, y + 4, w - 8, h - 8, 3)
  ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = I.ink
  const big = h * 0.3
  spaced(ctx, 'GRAIN', cx, y + h * 0.43, fontAt('600 {s} Vollkorn, Georgia, serif', big), big * 0.32)
  ctx.font = fontAt('italic {s} Vollkorn, Georgia, serif', h * 0.15)
  ctx.fillText('the fields, set down as an atlas', cx, y + h * 0.66)
  ctx.font = fontAt('400 {s} Vollkorn, Georgia, serif', h * 0.11)
  ctx.globalAlpha = 0.75
  ctx.fillText(stats, cx, y + h * 0.84)
  ctx.font = fontAt('italic {s} Vollkorn, Georgia, serif', h * 0.085)
  ctx.globalAlpha = 0.5
  ctx.fillText('surveyed by DJINN', cx, y + h + h * 0.16)
  ctx.restore()
}
