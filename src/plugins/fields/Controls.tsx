// The Fields' own small controls: which view (bubbles or map), and a fold of settings with the
// map's key. Everything here writes the fields store, which keeps it in this browser.

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/core/store'
import { fieldsPrefs, type FieldsNames, type FieldsPrefs } from './prefs'
import { drawGlyph, mountain, tree, inkFrom, KIND_INFO, KIND_COUNT, Kind } from './glyphs'

const NAMES: Array<[FieldsNames, string]> = [['all', 'All'], ['places', 'Places'], ['none', 'None']]

function Seg<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: Array<[T, string, JSX.Element?]>; onChange: (v: T) => void
}) {
  return (
    <div className="fields-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text, icon]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>
          {icon}{text}
        </button>
      ))}
    </div>
  )
}

function Toggle({ label, hint, on, disabled, set }: { label: string; hint: string; on: boolean; disabled?: boolean; set: (v: boolean) => void }) {
  return (
    <label className="fields-toggle" aria-disabled={disabled || undefined} title={hint}>
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => set(!on)}><i /></button>
    </label>
  )
}

/** A key entry: the mark drawn by the same code that draws the map. */
function KeyMark({ draw, C, stone }: { draw: (g: CanvasRenderingContext2D, I: ReturnType<typeof inkFrom>) => void; C: Record<string, string>; stone: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = 26 * dpr; cv.height = 22 * dpr
    const g = cv.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, 26, 22)
    g.lineJoin = 'round'; g.lineCap = 'round'
    g.lineWidth = 0.9
    g.strokeStyle = C['--ink']
    draw(g, inkFrom(C, stone))
  }, [C, stone, draw])
  return <canvas ref={ref} style={{ width: 26, height: 22 }} aria-hidden="true" />
}

const KIND_DRAW = Array.from({ length: KIND_COUNT }, (_, k) => k === Kind.Landmark
  ? (g: CanvasRenderingContext2D, I: ReturnType<typeof inkFrom>) => drawGlyph(g, Kind.Landmark, 14, 12, 15, 0.4, 0.2, I, 1)
  : (g: CanvasRenderingContext2D, I: ReturnType<typeof inkFrom>) => drawGlyph(g, k as Kind, 13, 12, 18, 0.4, 0.2, I))
/** Buildings first, landmark to watchtower, then the ground and its odds and ends. */
const KEY_ORDER = [Kind.Landmark, Kind.House, Kind.Archive, Kind.Court, Kind.Forge, Kind.Mill, Kind.Tower, Kind.Field, Kind.Stone, Kind.Tree, Kind.Post, Kind.Cairn]
const drawRange = (g: CanvasRenderingContext2D, I: ReturnType<typeof inkFrom>) => { mountain(g, 9, 18, 7, 0.3, I, 1); mountain(g, 17, 19, 6, 0.7, I, 1) }
const drawWood = (g: CanvasRenderingContext2D, I: ReturnType<typeof inkFrom>) => { tree(g, 8, 10, 4.5, I); tree(g, 17, 9, 4, I); tree(g, 13, 14, 4.5, I) }
const drawRiver = (g: CanvasRenderingContext2D, I: ReturnType<typeof inkFrom>) => {
  // a stream that rises thin and widens: banks in ink, water between
  g.lineCap = 'round'
  const seg = [[2, 17, 4, 14], [4, 14, 8, 9], [8, 9, 13, 10], [13, 10, 18, 13], [18, 13, 24, 9]] as const
  seg.forEach(([a, b, c, d], i) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.lineWidth = 0.9 + i * 0.7 + (i > 1 ? 2 : 0); g.strokeStyle = I.ink; g.stroke() })
  seg.forEach(([a, b, c, d], i) => { if (i < 2) return; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.lineWidth = 0.9 + i * 0.7; g.strokeStyle = I.sea; g.stroke() })
}
const drawLake = (g: CanvasRenderingContext2D, I: ReturnType<typeof inkFrom>) => {
  g.beginPath()
  const pts = [[4, 11], [7, 6], [13, 5], [16, 8], [21, 6], [24, 11], [20, 16], [13, 17], [8, 16]]
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.closePath()
  g.fillStyle = I.sea; g.fill(); g.lineWidth = 1; g.strokeStyle = I.ink; g.stroke()
  g.beginPath(); g.ellipse(14, 11, 6, 3, 0, 0, Math.PI * 2); g.globalAlpha = 0.4; g.lineWidth = 0.6; g.stroke(); g.globalAlpha = 1
}


export function FieldsControls({ C, stone }: { C: Record<string, string>; stone: boolean }) {
  const p = useStore(fieldsPrefs)
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<FieldsPrefs>) => fieldsPrefs.set(patch)
  const map = p.view === 'map'
  const panelRef = useRef<HTMLDivElement>(null)

  // a press anywhere else folds the settings away
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!panelRef.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [open])

  return (
    <div className="fields-ctl" ref={panelRef}>
      <div className="fields-ctl-bar panel linen-fine">
        <Seg label="View" value={p.view} onChange={(view) => set({ view })} options={[
          ['map', 'Map', <svg key="m" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 12 L5 4 L7.5 8 L9.5 5.5 L13 12 Z" /><path d="M4.3 5.4 L5 4 L5.8 5.3" /></svg>],
          ['bubbles', 'Bubbles', <svg key="b" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="5" cy="8" r="4" /><circle cx="10.5" cy="4.5" r="2.6" /><circle cx="11" cy="11" r="1.8" /></svg>],
        ]} />
        <button type="button" className="fields-ctl-more" aria-expanded={open} aria-label="Field settings" title="Field settings"
          onClick={() => setOpen((o) => !o)}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" /><circle cx="10.5" cy="4.5" r="1.6" /><circle cx="5.5" cy="11.5" r="1.6" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="fields-ctl-panel panel linen-fine sans" role="group" aria-label="Field settings">
          <div className="fields-ctl-row">
            <span>Names</span>
            <Seg label="Names" value={p.names} options={NAMES} onChange={(names) => set({ names })} />
          </div>
          <Toggle label="Mist over unwalked rooms" hint="Rooms you have not read in lie under a warm mist" on={p.mist} set={(mist) => set({ mist })} />
          <Toggle label="Relief" hint="Map view: mountains where folders run deep, hills and woods between" on={p.relief} disabled={!map} set={(relief) => set({ relief })} />
          <Toggle label="Rose and rhumb lines" hint="Map view: the compass rose, its wind lines and the title cartouche" on={p.sea} disabled={!map} set={(sea) => set({ sea })} />
          {map && (
            <div className="fields-key">
              <div className="faint" style={{ fontSize: 11.5, margin: '2px 0 4px' }}>The key: one mark is one file</div>
              <ul>
                {KEY_ORDER.map((i) => (
                  <li key={KIND_INFO[i].name}><KeyMark draw={KIND_DRAW[i]} C={C} stone={stone} /><span><b>{KIND_INFO[i].name}</b> {KIND_INFO[i].means}</span></li>
                ))}
                <li><KeyMark draw={drawRiver} C={C} stone={stone} /><span><b>river</b> a run of dated files, flowing by time from a spring in the hills, wider for every file it passes</span></li>
                <li><KeyMark draw={drawLake} C={C} stone={stone} /><span><b>lake</b> where a river cannot reach the sea; a tarn where a deep folder's beck rises</span></li>
                <li><KeyMark draw={drawRange} C={C} stone={stone} /><span><b>mountains</b> where folders nest deep and wide</span></li>
                <li><KeyMark draw={drawWood} C={C} stone={stone} /><span><b>woods</b> the open country between rooms</span></li>
              </ul>
            </div>
          )}
          <div className="faint" style={{ fontSize: 11.5 }}>Press <span className="kbd">M</span> to switch views</div>
        </div>
      )}
    </div>
  )
}
