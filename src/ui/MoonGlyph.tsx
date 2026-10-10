// The Moon as it stood: a small disc lit by elongation (0° new, 180° full), waxing on the right.

export function MoonGlyph({ elongation, size = 18 }: { elongation: number; size?: number }) {
  const r = size / 2 - 1
  const c = size / 2
  const e = ((elongation % 360) + 360) % 360
  const k = Math.cos((e * Math.PI) / 180) // 1 new, -1 full
  const waxing = e < 180
  // terminator ellipse x-radius
  const rx = Math.abs(k) * r
  const lit = waxing ? 1 : 0
  // Path: outer half-circle on the lit side, then terminator back.
  const sweepOuter = lit
  const sweepTerm = k > 0 ? (waxing ? 0 : 1) : (waxing ? 1 : 0)
  const d = `M ${c} ${c - r} A ${r} ${r} 0 0 ${sweepOuter} ${c} ${c + r} A ${rx} ${r} 0 0 ${sweepTerm} ${c} ${c - r} Z`
  return (
    <svg className="moon" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={c} cy={c} r={r} fill="var(--sky-haze)" stroke="var(--brass-dim)" strokeWidth="0.8" />
      <path d={d} fill="var(--star)" opacity="0.92" />
    </svg>
  )
}
