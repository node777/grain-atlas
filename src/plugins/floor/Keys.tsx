import { useState } from 'react'
import { useStore } from '@/core/store'
import { agentSettings } from '@/agent/runtime'
import { MODELS, EFFORTS, type Effort } from '@/agent/models'
import { bridgeConfig, bridgeHealth } from '@/sources/bridge'
import { toast } from '@/ui/Toast'

export function Keys() {
  const s = useStore(agentSettings)
  const b = useStore(bridgeConfig)
  const [show, setShow] = useState(false)
  const set = (p: Partial<typeof s>) => agentSettings.set(p)
  const test = async () => {
    try {
      const h = await bridgeHealth()
      toast(`The bridge answered from ${h.root}${h.claude ? ` with ${h.claude}` : '; Claude Code was not found on its PATH'}.`, 6000)
    } catch (e) {
      toast(`No answer: ${(e as Error).message}`, 6000)
    }
  }
  return (
    <div className="keys">
      <section className="panel linen-fine">
        <h2>How the voices wake</h2>
        <label className="radio"><input type="radio" checked={s.backend === 'api'} onChange={() => set({ backend: 'api' })} /> <b>Claude API, from this page</b> -- with your own Anthropic API key; the voices use the atlas's watering tools on the version you are reading.</label>
        <label className="radio"><input type="radio" checked={s.backend === 'bridge'} onChange={() => set({ backend: 'bridge' })} /> <b>Claude Code, on your machine</b> -- through the bridge; the voices work in your checkout with Claude Code's own tools and your Claude Code login.</label>
      </section>

      <section className="panel linen-fine">
        <h2>Claude API</h2>
        <label className="field">Anthropic API key
          <div className="dial-row"><input type={show ? 'text' : 'password'} value={s.apiKey} onChange={(e) => set({ apiKey: e.target.value })} placeholder="sk-ant-..." style={{ flex: 1 }} /><button className="ascii-btn" onClick={() => setShow(!show)}>[ {show ? 'hide' : 'show'} ]</button></div>
        </label>
        <p className="faint sans" style={{ fontSize: 12.5, margin: 0 }}>
          Stored only in this browser's local storage and sent only to api.anthropic.com. Anyone with access to this browser profile can read it;
          use a key with a spend limit set in your Anthropic console, and clear it here when you are done.
        </p>
        <div className="keys-grid">
          <label className="field">Voice model<select value={s.model} onChange={(e) => set({ model: e.target.value })}>{MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} -- {m.note}</option>)}</select></label>
          <label className="field">Hand model<select value={s.handModel} onChange={(e) => set({ handModel: e.target.value })}>{MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} -- {m.note}</option>)}</select></label>
          <label className="field">Voice effort<select value={s.effort} onChange={(e) => set({ effort: e.target.value as Effort })}>{EFFORTS.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="field">Hand effort<select value={s.handEffort} onChange={(e) => set({ handEffort: e.target.value as Effort })}>{EFFORTS.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="field">Thresh when context passes (tokens)<input type="number" min={20000} step={10000} value={s.threshAt} onChange={(e) => set({ threshAt: +e.target.value })} /></label>
        </div>
        <label className="radio"><input type="checkbox" checked={s.fallbacks} onChange={(e) => set({ fallbacks: e.target.checked })} /> If a model declines a request, let the API retry it on a suitable fallback model (server-side fallback, on by default).</label>
      </section>

      <section className="panel linen-fine">
        <h2>The bridge</h2>
        <p className="muted" style={{ margin: 0 }}>From a copy of this atlas's repository, run <code className="mono">node scripts/bridge.mjs ~/grain</code>. It listens on 127.0.0.1 only and prints a token.</p>
        <div className="keys-grid">
          <label className="field">Address<input value={b.url} onChange={(e) => bridgeConfig.set({ url: e.target.value })} /></label>
          <label className="field">Token<input type="password" value={b.token} onChange={(e) => bridgeConfig.set({ token: e.target.value })} /></label>
        </div>
        <button className="chip" onClick={test}>Test the bridge</button>
      </section>
    </div>
  )
}
