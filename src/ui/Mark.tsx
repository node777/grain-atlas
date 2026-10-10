// The atlas mark: a wheat ear whose crown is a star -- grain's wheat stalk, pointed at the sky.

export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke="var(--brass)" strokeWidth="2.6" strokeLinecap="round">
        <path d="M32 58V16" />
      </g>
      <g fill="var(--gold)" stroke="var(--brass-dim)" strokeWidth="1.2">
        {[22, 34, 46].map((y) => (
          <g key={y}>
            <ellipse cx="25.5" cy={y} rx="5" ry="7.5" transform={`rotate(-28 25.5 ${y})`} />
            <ellipse cx="38.5" cy={y} rx="5" ry="7.5" transform={`rotate(28 38.5 ${y})`} />
          </g>
        ))}
      </g>
      <path d="M32 3 L33.6 8.4 L39 10 L33.6 11.6 L32 17 L30.4 11.6 L25 10 L30.4 8.4 Z" fill="var(--star)" />
    </svg>
  )
}
