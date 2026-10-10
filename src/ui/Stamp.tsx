// Every timestamp in the atlas reads two ways at once: in Vedic terms (the Moon's nakshatra and
// pada, and the tithi) and as a plain datetime. Clicking it opens the sky of that moment.

import { useStore } from '@/core/store'
import { settings } from '@/core/settings'
import { navigate } from '@/core/router'
import { quickMoment, quickLine, plainDate, varaName } from '@/astro/describe'
import type { Stamp as StampT } from '@/grain/stamps'
import { MoonGlyph } from './MoonGlyph'

interface Props {
  stamp: StampT | null
  from?: string           // the path this moment belongs to
  inline?: boolean        // inside prose: show the stamp as written
  label?: string
}

export function Stamp({ stamp, from, inline, label }: Props) {
  const place = useStore(settings, (s) => s.place)
  const ayan = useStore(settings, (s) => s.ayanamsa)
  if (!stamp) return <span className="faint sans" style={{ fontSize: 12 }}>no stamp</span>
  const q = quickMoment(stamp.date, place.lon, ayan)
  const vedic = quickLine(q)
  const civil = plainDate(stamp.date, { zone: stamp.zone === 'UTC' ? 'UTC' : stamp.zone })
  const title =
    `${vedic}, ${varaName(q.vara)}\n` +
    `${civil} (as written, ${stamp.zoneLabel}${stamp.zoneExplicit ? '' : ' by grain\'s clock season'})\n` +
    `${plainDate(stamp.date)} (your clock)\n` +
    `grain stamp ${stamp.raw} from the ${stamp.source}${stamp.hasTime ? '' : ' (date only, read at noon)'}\n` +
    'Open the sky of this moment'
  const open = (ev: React.MouseEvent) => {
    ev.preventDefault()
    ev.stopPropagation()
    navigate('sky', '', { t: stamp.date.toISOString(), from })
  }
  if (inline) {
    return (
      <button className="stamp inline" title={title} onClick={open}>
        {stamp.raw}
      </button>
    )
  }
  return (
    <button className="stamp" title={title} onClick={open} aria-label={`${label ?? 'Moment'}: ${vedic}, ${civil}. Open its sky.`}>
      <MoonGlyph elongation={q.elongation} />
      <span className="vedic">{vedic}</span>
      <span className="civil">{civil}</span>
    </button>
  )
}
