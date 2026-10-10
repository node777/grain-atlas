// The present moment, named the Vedic way, ticking once a minute. Click to open today's sky.

import { useEffect, useState } from 'react'
import { useStore } from '@/core/store'
import { settings } from '@/core/settings'
import { navigate } from '@/core/router'
import { quickMoment, nakshatraIast, tithiName } from '@/astro/describe'
import { MoonGlyph } from '@/ui/MoonGlyph'

export function NowChip() {
  const [now, setNow] = useState(() => new Date())
  const place = useStore(settings, (s) => s.place)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const q = quickMoment(now, place.lon)
  return (
    <button
      className="chip"
      title={`Now at ${place.name}: Moon in ${nakshatraIast(q.nakshatra)}, pada ${q.pada}; ${tithiName(q.tithi)}. Open the sky now.`}
      onClick={() => navigate('sky', '', {})}
    >
      <MoonGlyph elongation={q.elongation} size={16} />
      <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic' }}>{nakshatraIast(q.nakshatra)} {q.pada}</span>
      <span className="faint">{place.name}</span>
    </button>
  )
}
