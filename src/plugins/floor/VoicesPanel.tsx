// The roster of voices, and a place to seat a new one.

import { useMemo, useState } from 'react'
import { useStore } from '@/core/store'
import { hrefFor } from '@/core/router'
import type { ElementRow } from '@/core/settings'
import { GRAIN_VOICES, userVoices, seatVoice, releaseVoice, activeVoice, lookFromTone, eyeFor, type Look, type Voice } from '@/voices/voices'
import { Character } from '@/voices/Character'

const HEADS: Look['head'][] = ['round', 'seed', 'drop', 'bell', 'leaf', 'moon']
const CROWNS: Look['crown'][] = ['sprout', 'wheat', 'star', 'flame', 'ripple', 'antenna', 'halo', 'none']
const ELEMENTS: ElementRow[] = ['earth', 'water', 'fire', 'air', 'aether']

export function VoicesPanel() {
  const mine = useStore(userVoices, (s) => s.list)
  const active = useStore(activeVoice, (s) => s.id)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [tone, setTone] = useState('warm, curious, plain')
  const [element, setElement] = useState<ElementRow>('earth')
  const [head, setHead] = useState<Look['head']>('round')
  const [crown, setCrown] = useState<Look['crown']>('sprout')
  const [persona, setPersona] = useState('')
  const toneList = tone.split(',').map((x) => x.trim()).filter(Boolean)
  const look = useMemo(() => ({ ...lookFromTone(toneList, element, head, crown), eye: eyeFor(name || 'a new voice') }), [tone, element, head, crown, name])

  const seat = () => {
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    if (!id) return
    seatVoice({
      id: `you-${id}`, name: name.trim(), role: role.trim() || 'a voice of your own', tone: toneList, registers: ['Gauge'],
      element, phrases: [], persona: persona.trim() || `Speak in a voice that is ${toneList.join(', ')}.`, look,
      seated: new Date().toISOString(),
    })
    activeVoice.set({ id: `you-${id}` })
    setName(''); setRole(''); setPersona('')
  }

  const card = (v: Voice) => (
    <div key={v.id} className={`panel linen-fine voice-card${v.id === active ? ' on' : ''}`}>
      <Character look={v.look} size={84} title={v.name} />
      <div style={{ minWidth: 0 }}>
        <div className="sans faint" style={{ fontSize: 12 }}>{v.status}{v.pronouns ? `, ${v.pronouns}` : ''}{v.seated ? `, seated ${v.seated.slice(0, 8)}` : ''}{v.molted ? `, molted ${v.molted.slice(0, 8)}` : ''}</div>
        <h3>{v.name}</h3>
        <div className="muted" style={{ fontSize: 15 }}>{v.role}</div>
        <div className="tone-chips">{v.tone.map((x) => <span key={x}>{x}</span>)}</div>
        {v.phrases[0] && <p className="voice-phrase">"{v.phrases[0]}"</p>}
        <div className="dial-row">
          <button className="chip" aria-pressed={v.id === active} onClick={() => activeVoice.set({ id: v.id })}>{v.id === active ? 'speaking' : 'Wake'}</button>
          <a className="chip" href={hrefFor('floor', 'talk')} onClick={() => activeVoice.set({ id: v.id })}>Talk</a>
          {v.home && <a className="ascii-btn" href={hrefFor('read', v.home)}>[ its page ]</a>}
          {v.status === 'yours' && <button className="ascii-btn" onClick={() => releaseVoice(v.id)}>[ release ]</button>}
        </div>
      </div>
    </div>
  )

  return (
    <div className="voices-panel">
      <p className="muted" style={{ maxWidth: '70ch' }}>
        grain writes in voices. The lineage runs Reya, Reya 2, Rio 3, Quin, Riyo and Kyri (the sixth, so "Kyri 6"); Kyli is Kyri's sibling, Trey
        and Trya are nested voices, and Lattice, Scribble, Lantern and Ember are Kyri's faculties. Wake any of them to work beside you, or seat a
        voice of your own.
      </p>
      <div className="voice-grid">{[...GRAIN_VOICES, ...mine].map(card)}</div>
      <section className="panel linen-fine seat-voice">
        <div>
          <h2>Seat a new voice</h2>
          <div className="seat-grid">
            <label className="field">Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sora" /></label>
            <label className="field">Role<input value={role} onChange={(e) => setRole(e.target.value)} placeholder="what this voice is for" /></label>
            <label className="field">Tone (words, comma-separated)<input value={tone} onChange={(e) => setTone(e.target.value)} /></label>
            <label className="field">Element row<select value={element} onChange={(e) => setElement(e.target.value as ElementRow)}>{ELEMENTS.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="field">Head<select value={head} onChange={(e) => setHead(e.target.value as Look['head'])}>{HEADS.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="field">Crown<select value={crown} onChange={(e) => setCrown(e.target.value as Look['crown'])}>{CROWNS.map((x) => <option key={x}>{x}</option>)}</select></label>
          </div>
          <label className="field" style={{ marginTop: 8 }}>How it speaks<textarea rows={3} value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="A few sentences of character: what it cares about, how it talks, what it never forgets." /></label>
          <button className="chip go" style={{ marginTop: 10 }} disabled={!name.trim()} onClick={seat}>Seat {name.trim() || 'the voice'}</button>
          <p className="faint sans" style={{ fontSize: 12 }}>Kept in this browser. Seating a voice in grain itself is the maintainer's word, written in six places.</p>
        </div>
        <div className="seat-preview"><Character look={look} size={150} title={name || 'a new voice'} /><div style={{ fontSize: 20 }}>{name || '…'}</div></div>
      </section>
    </div>
  )
}
