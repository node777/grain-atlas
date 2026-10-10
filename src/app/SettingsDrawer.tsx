import { useEffect } from 'react'
import { useStore } from '@/core/store'
import { companion, setCompanion } from '@/voices/companion'
import { settings, type Settings } from '@/core/settings'
import { VersionsPanel } from './Versions'
import { rate } from '@/github/client'
import { loadRepo } from '@/grain/repo'
import { CITIES, nearestCity } from '@/astro/cities'
import { AYANAMSAS } from '@/astro/ayanamsa'
import { UJJAIN } from '@/astro/positions'

export function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const s = useStore(settings)
  const r = useStore(rate)
  const set = (p: Partial<Settings>) => settings.set(p)
  const companionOn = useStore(companion, (x) => x.on)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1000) / 1000
        const lon = Math.round(pos.coords.longitude * 1000) / 1000
        const near = nearestCity(lat, lon)
        set({ place: { lat, lon, name: near && near.km < 60 ? near.name : 'Your place' }, placeSource: 'geolocation' })
      },
      () => set({ placeSource: 'fallback' }),
    )
  }

  return (
    <div role="dialog" aria-label="Settings" style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', justifyContent: 'flex-end', background: 'var(--veil)' }} onClick={onClose}>
      <div className="linen-fine panel drawer" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, fontWeight: 400, fontSize: 26 }}>Settings</h2>
          <span style={{ flex: 1 }} />
          <button className="ascii-btn" onClick={onClose}>[ close ]</button>
        </div>

        <section style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0, fontWeight: 400 }}>Where the sky is cast</h3>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            {s.place.name} at {s.place.lat.toFixed(3)}°, {s.place.lon.toFixed(3)}°
            {s.placeSource === 'fallback' && ' -- Ujjain, the traditional meridian of Jyotish, until you choose a place.'}
            {s.placeSource === 'geolocation' && ' -- from your browser, kept only here.'}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="chip" onClick={useMyLocation}>Use my location</button>
            <button className="chip" onClick={() => set({ place: UJJAIN, placeSource: 'manual' })}>Ujjain</button>
          </div>
          <label className="field">A city
            <select value={s.place.name} onChange={(e) => {
              const c = CITIES.find((x) => x[0] === e.target.value)
              if (c) set({ place: { name: c[0], lat: c[1], lon: c[2] }, placeSource: 'manual' })
            }}>
              {!CITIES.some((c) => c[0] === s.place.name) && <option value={s.place.name}>{s.place.name}</option>}
              {CITIES.map((c) => <option key={c[0]} value={c[0]}>{c[0]}</option>)}
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
            <label className="field">Latitude
              <input type="number" step="0.001" value={s.place.lat} onChange={(e) => set({ place: { ...s.place, lat: +e.target.value, name: 'Custom place' }, placeSource: 'manual' })} />
            </label>
            <label className="field">Longitude (east +)
              <input type="number" step="0.001" value={s.place.lon} onChange={(e) => set({ place: { ...s.place, lon: +e.target.value, name: 'Custom place' }, placeSource: 'manual' })} />
            </label>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0, fontWeight: 400 }}>How the sky is read</h3>
          <label className="field">Zodiac lens
            <select value={s.lens} onChange={(e) => set({ lens: e.target.value as Settings['lens'] })}>
              <option value="jyotish">Jyotish -- sidereal signs and nakshatras</option>
              <option value="grain">grain's hybrid -- tropical signs, sidereal nakshatras</option>
              <option value="western">Western -- tropical throughout</option>
            </select>
          </label>
          <label className="field">Ayanamsa
            <select value={s.ayanamsa} onChange={(e) => set({ ayanamsa: e.target.value as Settings['ayanamsa'] })}>
              {AYANAMSAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label className="field">Counting the nakshatras
            <select value={s.nakshatraOrder} onChange={(e) => set({ nakshatraOrder: e.target.value as Settings['nakshatraOrder'] })}>
              <option value="ashvini">From Ashvini (the almanac order)</option>
              <option value="krittika">From Krittika (the Taittiriya Brahmana, as grain counts)</option>
            </select>
          </label>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0, fontWeight: 400 }}>Cloth</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="chip" aria-pressed={s.mode === 'hearth'} onClick={() => set({ mode: 'hearth' })}>Hearth (night)</button>
            <button className="chip" aria-pressed={s.mode === 'stone'} onClick={() => set({ mode: 'stone' })}>Stone (day)</button>
            <button className="chip" aria-pressed={s.motion === 'still'} onClick={() => set({ motion: s.motion === 'still' ? 'full' : 'still' })}>Still motion</button>
            <button className="chip" aria-pressed={companionOn} onClick={() => setCompanion(!companionOn)} title="The voice in the corner of every view; also the face button in the header">Companion</button>
            <button className="chip" onClick={() => { set({ introSeen: false }); location.hash = '#/intro' }}>Replay the opening</button>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0, fontWeight: 400 }}>Which grain</h3>
          <VersionsPanel />
          <label className="field">GitHub token (optional, stays in this browser)
            <input type="password" value={s.token} placeholder="raises the hourly limit from 60 to 5,000" onChange={(e) => set({ token: e.target.value })} />
          </label>
          <p className="faint sans" style={{ margin: 0, fontSize: 12.5 }}>
            API calls left this hour: {r.remaining} of {r.limit}
            {r.reset ? `, renewing ${new Date(r.reset).toLocaleTimeString()}` : ''}. {r.lastError ?? ''}
          </p>
          <button className="chip" onClick={() => loadRepo()}>Read the tree again</button>
        </section>
      </div>
    </div>
  )
}
