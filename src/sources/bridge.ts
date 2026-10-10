// The bridge: a small companion program (scripts/bridge.mjs) you run beside your own grain
// checkout. It lets the atlas read and write that checkout and hand work to Claude Code on your
// machine, using your own Claude Code login. It listens only on 127.0.0.1 and answers only to
// requests carrying the token it prints when it starts.

import { createStore } from '@/core/store'

export interface BridgeConfig { url: string; token: string }
export const bridgeConfig = createStore<BridgeConfig>({ url: 'http://127.0.0.1:7351', token: '' }, 'grain-atlas:bridge')

export interface BridgeHealth { ok: boolean; root: string; claude: string | null; version: string; name?: string }

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, token } = bridgeConfig.get()
  const res = await fetch(url.replace(/\/$/, '') + path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`bridge answered ${res.status}: ${await res.text().catch(() => '')}`)
  return res
}

export async function bridgeHealth(): Promise<BridgeHealth> {
  return (await call('/health')).json()
}

export async function bridgeList(): Promise<Array<{ path: string; size: number }>> {
  return (await call('/fs/list')).json()
}

export async function bridgeRead(path: string): Promise<string> {
  return (await call(`/fs/read?path=${encodeURIComponent(path)}`)).text()
}

/** A file's bytes, for images and other binary files. */
export async function bridgeBlob(path: string): Promise<Blob> {
  return (await call(`/fs/raw?path=${encodeURIComponent(path)}`)).blob()
}

export async function bridgeWrite(path: string, content: string): Promise<void> {
  await call('/fs/write', { method: 'POST', body: JSON.stringify({ path, content }) })
}

export async function bridgeGit(): Promise<{ branch: string; head: string; subject: string; status: string }> {
  return (await call('/git')).json()
}

export interface ClaudeEvent { type: string; [k: string]: unknown }

/**
 * Run Claude Code headless in the bridge's checkout and stream its events (stream-json).
 * Returns a stop() to interrupt the run.
 */
export function bridgeClaude(
  body: { prompt: string; resume?: string; model?: string; appendSystemPrompt?: string; permissionMode?: string },
  onEvent: (e: ClaudeEvent) => void,
  onDone: (err?: Error) => void,
): () => void {
  const ctrl = new AbortController()
  ;(async () => {
    try {
      const res = await call('/claude', { method: 'POST', body: JSON.stringify(body), signal: ctrl.signal })
      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          try { onEvent(JSON.parse(line)) } catch { onEvent({ type: 'text', text: line }) }
        }
      }
      onDone()
    } catch (e) {
      onDone(ctrl.signal.aborted ? undefined : (e as Error))
    }
  })()
  return () => ctrl.abort()
}
