import { useStore } from '@/core/store'
import { gauge, money, type Limits } from '@/agent/gauge'

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const u = Math.min(1, value / Math.max(0.0001, max))
  return (
    <div className="meter">
      <div className="sans" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span>{label}</span><span className="mono">{money(value)} / {money(max)}</span>
      </div>
      <div className="meter-bar"><div style={{ width: `${u * 100}%`, background: u > 0.85 ? 'var(--annatto)' : u > 0.6 ? 'var(--weld)' : 'var(--sage)' }} /></div>
    </div>
  )
}

export function GaugePanel() {
  const g = useStore(gauge)
  const today = g.day === new Date().toISOString().slice(0, 10) ? g.today : 0
  const setLimit = (k: keyof Limits, v: number) => gauge.set({ limits: { ...g.limits, [k]: v } })
  const cacheShare = g.tokensIn + g.cacheRead ? g.cacheRead / (g.tokensIn + g.cacheRead) : 0
  return (
    <div className="gauge-panel">
      <p className="muted" style={{ maxWidth: '68ch' }}>
        Every request the voices make is priced from its token usage and counted here. Before each request an agent asks the Gauge
        whether it may spend; past 80% of a limit it is told to wrap up, and at the limit it rests and reports. Set the limits to the
        size of the field you want to grow today.
      </p>
      <div className="gauge-grid">
        <section className="panel linen-fine" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <Meter label="Today" value={today} max={g.limits.perDay} />
          <div className="sans" style={{ fontSize: 13, display: 'grid', gap: 3 }}>
            <span>all time {money(g.allTime)}</span>
            <span>{g.requests.toLocaleString()} requests, {g.tokensIn.toLocaleString()} tokens in, {g.tokensOut.toLocaleString()} out</span>
            <span>{g.cacheRead.toLocaleString()} tokens read from cache ({Math.round(cacheShare * 100)}% of input -- grain's seed context is cached, so this rises as you work)</span>
          </div>
        </section>
        <section className="panel linen-fine" style={{ padding: 16, display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0, fontWeight: 400 }}>Limits</h3>
          <label className="field">Per day (USD)<input type="number" min={0} step={1} value={g.limits.perDay} onChange={(e) => setLimit('perDay', +e.target.value)} /></label>
          <label className="field">Per task or sowing (USD)<input type="number" min={0} step={0.5} value={g.limits.perRun} onChange={(e) => setLimit('perRun', +e.target.value)} /></label>
          <label className="field">Per agent (USD)<input type="number" min={0} step={0.25} value={g.limits.perAgent} onChange={(e) => setLimit('perAgent', +e.target.value)} /></label>
          <label className="field">Hands at once in a sowing<input type="number" min={1} max={16} value={g.limits.maxAgents} onChange={(e) => setLimit('maxAgents', +e.target.value)} /></label>
          <button className="ascii-btn" onClick={() => gauge.set({ today: 0, day: new Date().toISOString().slice(0, 10) })}>[ reset today's count ]</button>
        </section>
      </div>
      <p className="faint sans" style={{ fontSize: 12, maxWidth: '68ch' }}>
        Prices are Anthropic's list prices per million tokens (Opus 5.5 $4 in / $20 out, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50). Through the
        bridge, Claude Code reports its own cost for each run, and that is what is counted. Your provider's console remains the record of truth.
      </p>
    </div>
  )
}
