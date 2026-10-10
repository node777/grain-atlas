// The readings of one moment: its panchanga, its chart, its dasha, its other skies, and the
// pages of grain born under the same star.

import { useMemo, useState } from 'react'
import { useStore } from '@/core/store'
import { settings, type Lens } from '@/core/settings'
import { hrefFor } from '@/core/router'
import type { FullMoment } from '@/astro/describe'
import { nakshatraIast, plainDate, quickMoment, tithiName, varaName } from '@/astro/describe'
import { MASAS, MUHURTAS, SAMVATSARAS } from '@/astro/panchanga'
import { vimshottari, activeChain } from '@/astro/dasha'
import { aspects, decanOf, fourPillars, lotOfFortune, isDiurnal, manzilOf, SOLAR_TERMS, tropicalSign } from '@/astro/traditions'
import { dms, norm360 } from '@/astro/math'
import { zoneOffsetMinutes } from '@/grain/stamps'
import { NAKSHATRAS } from '@/astro/data/nakshatras'
import { RASHIS } from '@/astro/data/rashis'
import { GRAHAS } from '@/astro/data/grahas'
import { TITHIS, YOGAS, VARAS, karanaForIndex } from '@/astro/data/panchanga'
import { ganzhi, XIU } from '@/astro/data/chinese'
import { MANAZIL } from '@/astro/data/arabic'
import { DECANS, egyptianTermRuler } from '@/astro/data/hellenistic'
import type { GrahaId } from '@/astro/data/types'
import { repo, stampOf } from '@/grain/repo'
import { sprigOf } from '@/grain/stamps'
import { Stamp } from '@/ui/Stamp'

type Tab = 'panchanga' | 'chart' | 'dasha' | 'skies' | 'kin'
const TABS: Array<[Tab, string]> = [['panchanga', 'Panchanga'], ['chart', 'Chart'], ['dasha', 'Dasha'], ['skies', 'Other skies'], ['kin', 'Born under']]

const NINE: GrahaId[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu']
const grahaOf = (id: string) => GRAHAS.find((g) => g.id === id)

export function Readings({ fm, from }: { fm: FullMoment; from?: string }) {
  const [tab, setTab] = useState<Tab>('panchanga')
  return (
    <div className="readings">
      <div className="readings-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className="chip" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="readings-body">
        {tab === 'panchanga' && <PanchangaPane fm={fm} />}
        {tab === 'chart' && <ChartPane fm={fm} />}
        {tab === 'dasha' && <DashaPane fm={fm} from={from} />}
        {tab === 'skies' && <SkiesPane fm={fm} />}
        {tab === 'kin' && <KinPane fm={fm} from={from} />}
      </div>
    </div>
  )
}

function Row({ k, v, note }: { k: string; v: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="r-row">
      <div className="r-k sans">{k}</div>
      <div className="r-v">{v}{note && <div className="r-note">{note}</div>}</div>
    </div>
  )
}

const time = (d: Date | null) => (d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : '--')

function PanchangaPane({ fm }: { fm: FullMoment }) {
  const { p } = fm
  const nak = NAKSHATRAS[p.nakshatra.index]
  const tithi = TITHIS[p.tithi.index]
  const yoga = YOGAS[p.yoga.index]
  const kar = karanaForIndex(p.karana.index)
  const vara = VARAS[p.vara.index]
  const order = useStore(settings, (s) => s.nakshatraOrder)
  const seat = order === 'krittika' ? (nak?.taittiriyaIndex ?? 0) + 1 : p.nakshatra.index + 1
  return (
    <div>
      <p className="r-lede">
        {fm.words.masa} masa, {tithiName(p.tithi.index)}, {varaName(p.vara.index)}, with the Moon in {nak?.iast}.
      </p>
      <h4>The five limbs</h4>
      <Row k="Tithi" v={<>{tithiName(p.tithi.index)} <span className="faint">({Math.round(p.tithi.fraction * 100)}% run)</span></>}
        note={tithi && <>deity {tithi.deity}; a {tithi.group} day. {tithi.keywords.join(', ')}.</>} />
      <Row k="Vara" v={<>{vara?.name} <span className="faint">({vara?.english})</span></>} note={<>ruled by {grahaOf(p.vara.lord)?.name}; the day turns at sunrise, not midnight.</>} />
      <Row k="Nakshatra" v={<>{nak?.iast} <span className="deva">{nak?.devanagari}</span>, pada {p.nakshatra.pada}</>}
        note={nak && <>seat {seat} of 27 ({order === 'krittika' ? 'from Krittika' : 'from Ashvini'}); deity {nak.deity}; symbol {nak.symbol}; lord {grahaOf(nak.lord)?.name}; {nak.gana} gana; {nak.nature}. <i>{nak.essence}</i></>} />
      <Row k="Yoga" v={yoga?.name} note={yoga && <>{yoga.meaning}; {yoga.quality}.</>} />
      <Row k="Karana" v={kar?.name} note={kar && <>{kar.kind}; {kar.meaning}</>} />
      <h4>The day's clocks</h4>
      <Row k="Sunrise" v={time(p.sunrise)} note={<>sunset {time(p.sunset)}; next sunrise {time(p.nextSunrise)}</>} />
      <Row k="Ghati" v={fm.words.ghati} note="one day is 60 ghati; one ghati is 24 minutes, or 60 pala" />
      <Row k="Muhurta" v={<>{MUHURTAS[p.muhurta.index]} <span className="faint">({p.muhurta.index + 1} of 30)</span></>} note="fifteen by day and fifteen by night; names vary a little between traditions" />
      <Row k="Hora" v={grahaOf(p.hora.lord)?.name} note="the planetary hour, stepping through the Chaldean order from the day's own lord" />
      {p.rahuKala && <Row k="Rahu kala" v={`${time(p.rahuKala.start)} to ${time(p.rahuKala.end)}`} note="an eighth of daylight held as inauspicious for new beginnings" />}
      <h4>The year</h4>
      <Row k="Masa" v={`${p.masa.adhika ? 'Adhika ' : ''}${MASAS[p.masa.index]}`} note={`amanta month, opened by the new moon of ${p.masa.newMoon.toLocaleDateString()}`} />
      <Row k="Samvat" v={`Vikram ${p.samvat.vikram}; Shaka ${p.samvat.shaka}`} note={`${SAMVATSARAS[p.samvat.samvatsara]} samvatsara (southern reckoning); Kali year ${p.samvat.kali}`} />
      <Row k="Ayanamsa" v={dms(fm.sky.ayanamsa, true)} note={`${fm.sky.ayanamsaId}, true of date`} />
    </div>
  )
}

function dignity(id: GrahaId, rashi: number, deg: number): string {
  const g = grahaOf(id)
  if (!g) return ''
  if (g.exaltation?.rashi === rashi) return Math.abs(deg - g.exaltation.degree) < 1 ? 'deep exaltation' : 'exalted'
  if (g.debilitation?.rashi === rashi) return 'debilitated'
  if (g.moolatrikona && g.moolatrikona.rashi === rashi && deg >= g.moolatrikona.from && deg < g.moolatrikona.to) return 'moolatrikona'
  if (g.owns.includes(rashi)) return 'own sign'
  const lord = RASHIS[rashi]?.lord
  if (!lord || lord === id) return ''
  if (g.friends.includes(lord)) return 'friend\'s sign'
  if (g.enemies.includes(lord)) return 'enemy\'s sign'
  return 'neutral sign'
}

function signLon(lens: Lens, trop: number, sid: number) {
  return lens === 'jyotish' ? sid : trop
}

function ChartPane({ fm }: { fm: FullMoment }) {
  const lens = useStore(settings, (s) => s.lens)
  const { sky } = fm
  const asc = signLon(lens, sky.ascendant.tropical, sky.ascendant.sidereal)
  const ascSign = Math.floor(asc / 30)
  const inSign: Record<number, string[]> = {}
  for (const id of NINE) {
    const b = sky.bodies.find((x) => x.id === id)!
    const r = Math.floor(signLon(lens, b.tropical, b.sidereal) / 30)
    ;(inSign[r] ??= []).push(id)
  }
  // South Indian chart: signs hold fixed squares; the ascendant is marked.
  const cell: Record<number, [number, number]> = {
    11: [0, 0], 0: [0, 1], 1: [0, 2], 2: [0, 3], 10: [1, 0], 3: [1, 3], 9: [2, 0], 4: [2, 3], 8: [3, 0], 7: [3, 1], 6: [3, 2], 5: [3, 3],
  }
  const abbr: Record<string, string> = { sun: 'Su', moon: 'Mo', mars: 'Ma', mercury: 'Me', jupiter: 'Ju', venus: 'Ve', saturn: 'Sa', rahu: 'Ra', ketu: 'Ke' }
  return (
    <div>
      <p className="r-lede">
        {lens === 'jyotish' && 'Sidereal signs (Lahiri unless changed), whole-sign houses from the lagna.'}
        {lens === 'grain' && 'grain\'s hybrid: tropical signs carry dignity, sidereal nakshatras carry the stars, whole-sign houses.'}
        {lens === 'western' && 'Tropical signs throughout, whole-sign houses.'}
      </p>
      <div className="si-chart" role="img" aria-label="South Indian chart">
        {Object.entries(cell).map(([r, [row, col]]) => {
          const ri = Number(r)
          return (
            <div key={r} className={`si-cell${ri === ascSign ? ' asc' : ''}`} style={{ gridRow: row + 1, gridColumn: col + 1 }}>
              <span className="si-sign">{RASHIS[ri]?.glyph} {lens === 'jyotish' ? RASHIS[ri]?.name : RASHIS[ri]?.western}</span>
              {ri === ascSign && <span className="si-asc">Lagna</span>}
              <span className="si-bodies">{(inSign[ri] ?? []).map((id) => abbr[id]).join(' ')}</span>
            </div>
          )
        })}
        <div className="si-centre" style={{ gridRow: '2 / 4', gridColumn: '2 / 4' }}>
          <div style={{ fontStyle: 'italic' }}>{fm.words.nakshatra}</div>
          <div className="faint sans" style={{ fontSize: 11.5 }}>{fm.words.tithi}</div>
          <div className="faint sans" style={{ fontSize: 11.5 }}>{fm.sky.place.name}</div>
        </div>
      </div>
      <table className="r-table">
        <thead><tr><th>Graha</th><th>Sign</th><th>Nakshatra</th><th>House</th><th>Dignity</th></tr></thead>
        <tbody>
          <tr>
            <td>Lagna</td>
            <td>{RASHIS[ascSign]?.glyph} {dms(asc % 30)}</td>
            <td>{nakshatraIast(Math.floor(sky.ascendant.sidereal / (360 / 27)))}</td>
            <td>1</td><td />
          </tr>
          {NINE.map((id) => {
            const b = sky.bodies.find((x) => x.id === id)!
            const lon = signLon(lens, b.tropical, b.sidereal)
            const r = Math.floor(lon / 30)
            const nk = Math.floor(b.sidereal / (360 / 27))
            const pada = Math.floor((b.sidereal % (360 / 27)) / (360 / 108)) + 1
            return (
              <tr key={id}>
                <td>{grahaOf(id)?.glyph} {grahaOf(id)?.name}{b.retrograde && id !== 'rahu' && id !== 'ketu' ? ' ℞' : ''}</td>
                <td>{RASHIS[r]?.glyph} {dms(lon % 30)}</td>
                <td>{nakshatraIast(nk)} {pada}</td>
                <td>{((r - ascSign + 12) % 12) + 1}</td>
                <td className="faint">{dignity(id, r, lon % 30)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DashaPane({ fm, from }: { fm: FullMoment; from?: string }) {
  const moon = fm.sky.bodies.find((b) => b.id === 'moon')!
  const periods = useMemo(() => vimshottari(fm.sky.date, moon.sidereal, 2), [fm.sky.date.getTime(), moon.sidereal])
  const now = new Date()
  const chain = activeChain(periods, now)
  return (
    <div>
      <p className="r-lede">
        Vimshottari: a 120-year round of planetary periods, entered through the lord of the Moon's nakshatra.
        {from ? ' Read this moment as the birth of the page, and here is where its periods stand today.' : ' Read this moment as a birth, and here is where its periods stand today.'}
      </p>
      {chain.length > 0 && (
        <p style={{ fontSize: 18 }}>
          Now running: <b style={{ fontWeight: 600 }}>{chain.map((c) => grahaOf(c.lord)?.name).join(' / ')}</b>
          <span className="faint sans" style={{ fontSize: 13 }}> until {chain[chain.length - 1].end.toLocaleDateString()}</span>
        </p>
      )}
      <ol className="dasha-list">
        {periods.map((pd) => {
          const on = now >= pd.start && now < pd.end
          return (
            <li key={pd.start.getTime()} className={on ? 'on' : ''}>
              <span>{grahaOf(pd.lord)?.glyph} {grahaOf(pd.lord)?.name}</span>
              <span className="faint mono">{pd.start.getFullYear()} to {pd.end.getFullYear()}</span>
              {on && pd.sub && (
                <div className="dasha-sub">
                  {pd.sub.map((s) => (
                    <span key={s.start.getTime()} className={now >= s.start && now < s.end ? 'on' : ''}>
                      {grahaOf(s.lord)?.name} {s.start.toLocaleDateString(undefined, { year: '2-digit', month: 'short' })}
                    </span>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <p className="faint sans" style={{ fontSize: 12 }}>Years of 365.25 days; the first period is shortened by the part of the nakshatra already crossed.</p>
    </div>
  )
}

function SkiesPane({ fm }: { fm: FullMoment }) {
  const { sky } = fm
  const sun = sky.bodies.find((b) => b.id === 'sun')!
  const moon = sky.bodies.find((b) => b.id === 'moon')!
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const offset = zoneOffsetMinutes(tz, sky.date) / 60
  const pillars = fourPillars(sky, offset)
  const asp = aspects(sky).slice(0, 8)
  const decan = DECANS[decanOf(sun.tropical)]
  const manzil = MANAZIL[manzilOf(moon.tropical)]
  const pillar = (i: number) => { const g = ganzhi(i); return `${g.stem.hanzi}${g.branch.hanzi} ${g.stem.pinyin}-${g.branch.pinyin}` }
  const lof = lotOfFortune(sky)
  const W = (lon: number) => `${RASHIS[tropicalSign(lon)]?.glyph} ${RASHIS[tropicalSign(lon)]?.western} ${dms(norm360(lon) % 30)}`
  const nak = NAKSHATRAS[Math.floor(moon.sidereal / (360 / 27))]
  return (
    <div>
      <h4>Western (tropical)</h4>
      <Row k="Sun" v={W(sun.tropical)} />
      <Row k="Moon" v={W(moon.tropical)} />
      <Row k="Ascendant" v={W(sky.ascendant.tropical)} note={`midheaven ${W(sky.midheaven.tropical)}`} />
      {asp.length > 0 && <Row k="Aspects" v={<span className="sans" style={{ fontSize: 13.5 }}>{asp.map((a) => `${cap(a.a)} ${a.aspect.glyph} ${cap(a.b)} (${a.orb.toFixed(1)}°)`).join(';  ')}</span>} />}
      <h4>Hellenistic</h4>
      <Row k="Sect" v={isDiurnal(sky) ? 'a day chart (the Sun above the horizon)' : 'a night chart (the Sun below the horizon)'} />
      <Row k="Sun's face" v={`${RASHIS[decan.sign]?.western} ${['I', 'II', 'III'][decan.decan]}, ruled by ${decan.chaldeanRuler}`} note={decan.egyptianName ? `the Egyptian decan ${decan.egyptianName}` : decan.note} />
      <Row k="Sun's bound" v={egyptianTermRuler(sun.tropical)} note="Egyptian terms" />
      <Row k="Lot of Fortune" v={W(lof)} />
      <h4>Chinese</h4>
      <Row k="Four pillars" v={<span className="sans" style={{ fontSize: 14 }}>year {pillar(pillars.year)}; month {pillar(pillars.month)}; day {pillar(pillars.day)}; hour {pillar(pillars.hour)}</span>}
        note={`the year of the ${ganzhi(pillars.year).branch.animal} (${ganzhi(pillars.year).stem.element}); solar term ${SOLAR_TERMS[pillars.solarTerm]}; reckoned in your zone, UTC${offset >= 0 ? '+' : ''}${offset}`} />
      {nak?.xiu && <Row k="Lunar lodge" v={`${nak.xiu.hanzi} ${nak.xiu.name}, ${nak.xiu.meaning}`} note="the xiu that corresponds to the Moon's nakshatra; the lodges proper are measured on the equator" />}
      <h4>Arabic</h4>
      <Row k="Manzil" v={`${manzil?.arabic} ${manzil?.name}`} note={`${manzil?.meaning}; ${manzil?.stars}. Equal stations of 12°51′ from tropical Aries.`} />
      <p className="faint sans" style={{ fontSize: 12, marginTop: 14 }}>
        {XIU.length} xiu, {MANAZIL.length} manazil, {NAKSHATRAS.length} nakshatras: three peoples dividing the Moon's month among the same stars.
      </p>
    </div>
  )
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

function KinPane({ fm, from }: { fm: FullMoment; from?: string }) {
  const r = useStore(repo, (s) => ({ entries: s.entries, version: s.version }))
  const lon = useStore(settings, (s) => s.place.lon)
  const target = fm.p.nakshatra.index
  const tithi = fm.p.tithi.index
  const kin = useMemo(() => {
    const same: string[] = []
    const sameTithi: string[] = []
    const day = fm.sky.date.toDateString()
    const sameDay: string[] = []
    for (const e of r.entries.values()) {
      if (e.kind === 'dir' || e.path === from) continue
      const st = stampOf(e)
      if (!st) continue
      const q = quickMoment(st.date, lon)
      if (q.nakshatra === target) same.push(e.path)
      if (q.tithi === tithi) sameTithi.push(e.path)
      if (st.date.toDateString() === day) sameDay.push(e.path)
    }
    return { same, sameTithi, sameDay }
  }, [r.version, target, tithi, from])
  const nak = NAKSHATRAS[target]
  const list = (paths: string[], max = 40) => (
    <div style={{ display: 'grid', gap: 4 }}>
      {paths.slice(0, max).map((p) => (
        <div key={p} className="kin-row">
          <a href={hrefFor('sky', '', { t: stampOf(r.entries.get(p))!.date.toISOString(), from: p })}>{sprigOf(p)}</a>
          <span className="faint mono" style={{ fontSize: 11 }}>{p.split('/')[0]}</span>
        </div>
      ))}
      {paths.length > max && <span className="faint">and {paths.length - max} more</span>}
    </div>
  )
  return (
    <div>
      <p className="r-lede">Pages of grain whose own stamps fall under the same sky.</p>
      <h4>Born under {nak?.iast} ({kin.same.length})</h4>
      {kin.same.length ? list(kin.same) : <p className="faint">None yet. A first page under {nak?.iast} is still to be written.</p>}
      <h4>Written on a {TITHIS[tithi]?.name} ({kin.sameTithi.length})</h4>
      {list(kin.sameTithi, 12)}
      {kin.sameDay.length > 0 && <><h4>Written the same day ({kin.sameDay.length})</h4>{list(kin.sameDay, 20)}</>}
    </div>
  )
}

export function MomentCard({ fm, from }: { fm: FullMoment; from?: string }) {
  const e = from ? repo.get().entries.get(from) : undefined
  return (
    <div className="moment-card">
      {e && (
        <div style={{ marginBottom: 8 }}>
          <div className="sans faint" style={{ fontSize: 12 }}>the sky of</div>
          <a href={hrefFor('sky', '', { t: fm.sky.date.toISOString(), from, open: from })} style={{ fontSize: 18, textDecoration: 'none' }}>{e.meta?.title ?? sprigOf(e.path)}</a>
          <div className="mono faint" style={{ fontSize: 11.5 }}>{e.path}</div>
        </div>
      )}
      <div style={{ fontSize: 20, fontStyle: 'italic' }}>{fm.words.nakshatra}</div>
      <div>{fm.words.tithi}, {fm.words.vara}</div>
      <div className="muted" style={{ fontSize: 15 }}>{fm.words.masa}, {fm.words.samvat}</div>
      <div className="mono faint" style={{ fontSize: 12, marginTop: 4 }}>{plainDate(fm.sky.date, { seconds: true })}</div>
      {e && stampOf(e) && <div style={{ marginTop: 6 }}><Stamp stamp={stampOf(e)} from={from} /></div>}
    </div>
  )
}
