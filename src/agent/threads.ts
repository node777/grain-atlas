// Threads: conversations with voices. A thread keeps the exact message history it sends (so it
// is append-only) and a lighter display log for the screen. Threads persist in IndexedDB.
// A thread runs on the Claude API directly, or on Claude Code through the bridge.

import type Anthropic from '@anthropic-ai/sdk'
import { createStore } from '@/core/store'
import { kvGet, kvSet } from '@/github/kv'
import { runAgent, openingTurn, thresh, agentSettings, type AgentEvent } from './runtime'
import { Run } from './gauge'
import { voiceById, type Voice } from '@/voices/voices'
import { bridgeClaude, type ClaudeEvent } from '@/sources/bridge'
import { seedContext } from './context'
import { recall, bind } from './sheaves'

export interface ToolTrace { id: string; name: string; input: string; result?: string; error?: boolean; hand?: string }
export interface HandTrace { id: string; task: string; report?: string }

export interface Turn {
  id: string
  role: 'reader' | 'voice' | 'notice'
  text: string
  thinking?: string
  tools: ToolTrace[]
  hands: HandTrace[]
  cost: number
  at: number
  pending?: boolean
}

export interface Thread {
  id: string
  voiceId: string
  title: string
  createdAt: number
  updatedAt: number
  turns: Turn[]
  api: Anthropic.Beta.BetaMessageParam[]
  lastInputTokens: number
  cost: number
  sessionId?: string        // Claude Code session (bridge backend)
  from?: string             // the thread this one was threshed from
  summary?: string          // the grain it began from
}

export const threads = createStore<{ list: Thread[]; loaded: boolean; running: Record<string, boolean> }>({ list: [], loaded: false, running: {} })
const KEY = 'agent-threads'
const aborts = new Map<string, AbortController | (() => void)>()

export async function loadThreads(): Promise<void> {
  if (threads.get().loaded) return
  const list = (await kvGet<Thread[]>(KEY)) ?? []
  threads.set({ list, loaded: true })
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function save(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { kvSet(KEY, threads.get().list.slice(0, 120)) }, 600)
}

function update(id: string, fn: (t: Thread) => Thread): void {
  threads.set((s) => ({ list: s.list.map((t) => (t.id === id ? fn(t) : t)) }))
  save()
}

const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export function newThread(voiceId: string, opts: { title?: string; summary?: string; from?: string } = {}): Thread {
  const t: Thread = {
    id: newId('th'), voiceId, title: opts.title ?? 'a new thread', createdAt: Date.now(), updatedAt: Date.now(),
    turns: opts.summary ? [{ id: newId('t'), role: 'notice', text: `Begun from the grain of an earlier thread:\n\n${opts.summary}`, tools: [], hands: [], cost: 0, at: Date.now() }] : [],
    api: [], lastInputTokens: 0, cost: 0, from: opts.from, summary: opts.summary,
  }
  threads.set((s) => ({ list: [t, ...s.list] }))
  save()
  return t
}

export function deleteThread(id: string): void {
  threads.set((s) => ({ list: s.list.filter((t) => t.id !== id) }))
  save()
}

export const threadById = (id: string) => threads.get().list.find((t) => t.id === id)

/** Apply one agent event to the pending voice turn of a thread. */
function applyEvent(threadId: string, turnId: string, e: AgentEvent): void {
  update(threadId, (t) => ({
    ...t,
    updatedAt: Date.now(),
    turns: t.turns.map((u) => {
      if (u.id !== turnId) return u
      const top = !e.agent.includes('/hand-')
      switch (e.type) {
        case 'text': return top ? { ...u, text: u.text + e.text } : u
        case 'thinking': return top ? { ...u, thinking: (u.thinking ?? '') + e.text } : u
        case 'tool': return { ...u, tools: [...u.tools, { id: e.id, name: e.name, input: summarize(e.input), hand: top ? undefined : e.agent }] }
        case 'tool-result': return { ...u, tools: u.tools.map((x) => (x.id === e.id ? { ...x, result: e.result.slice(0, 900), error: e.error } : x)) }
        case 'usage': return { ...u, cost: u.cost + e.cost }
        case 'hand': return { ...u, hands: [...u.hands, { id: e.hand, task: e.task }] }
        case 'hand-done': return { ...u, hands: u.hands.map((h) => (h.id === e.hand ? { ...h, report: e.report } : h)) }
        case 'notice': case 'error': return { ...u, text: u.text + (u.text ? '\n\n' : '') + `_${e.text}_` }
        default: return u
      }
    }),
  }))
}

function summarize(input: unknown): string {
  if (!input || typeof input !== 'object') return String(input ?? '')
  const o = input as Record<string, unknown>
  const main = o.path ?? o.query ?? o.pattern ?? o.task ?? o.text ?? ''
  return String(main).slice(0, 160)
}

export async function ask(threadId: string, text: string): Promise<void> {
  const t0 = threadById(threadId)
  if (!t0 || threads.get().running[threadId]) return
  const voice = voiceById(t0.voiceId)
  const readerTurn: Turn = { id: newId('t'), role: 'reader', text, tools: [], hands: [], cost: 0, at: Date.now() }
  const voiceTurn: Turn = { id: newId('t'), role: 'voice', text: '', tools: [], hands: [], cost: 0, at: Date.now(), pending: true }
  update(threadId, (t) => ({ ...t, title: t.turns.length ? t.title : text.slice(0, 60), turns: [...t.turns, readerTurn, voiceTurn] }))
  threads.set((s) => ({ running: { ...s.running, [threadId]: true } }))

  const finish = (patch: Partial<Thread> = {}) => {
    update(threadId, (t) => ({
      ...t, ...patch,
      cost: t.cost + (t.turns.find((u) => u.id === voiceTurn.id)?.cost ?? 0),
      turns: t.turns.map((u) => (u.id === voiceTurn.id ? { ...u, pending: false } : u)),
    }))
    threads.set((s) => { const r = { ...s.running }; delete r[threadId]; return { running: r } })
    aborts.delete(threadId)
  }

  if (agentSettings.get().backend === 'bridge') {
    askBridge(t0, voice, text, voiceTurn.id, finish)
    return
  }

  const ctrl = new AbortController()
  aborts.set(threadId, ctrl)
  const first = t0.api.length === 0
  const content = first ? openingTurn((t0.summary ? `Where we left off:\n${t0.summary}\n\n` : '') + text, voice.name) : text
  const run = new Run(`thread ${t0.title}`)
  try {
    const res = await runAgent({
      agentId: voice.id, voice, run, signal: ctrl.signal,
      messages: [...t0.api, { role: 'user', content }],
      onEvent: (e) => applyEvent(threadId, voiceTurn.id, e),
    })
    finish({ api: res.messages, lastInputTokens: res.lastInputTokens })
  } catch (e) {
    applyEvent(threadId, voiceTurn.id, { type: 'error', agent: voice.id, text: (e as Error).message })
    finish()
  }
}

function askBridge(t0: Thread, voice: Voice, text: string, turnId: string, finish: (p?: Partial<Thread>) => void): void {
  const mem = recall(text, 8, voice.name)
  const append = [
    `You are ${voice.name}, a voice of grain, speaking with the reader through the Grain Atlas. ${voice.persona}`,
    mem.length ? `Sheaves recalled:\n${mem.map((m) => `- [${m.kind}] ${m.text}`).join('\n')}` : '',
    t0.sessionId ? '' : seedContext().slice(0, 6000),
  ].filter(Boolean).join('\n\n')
  let session = t0.sessionId
  const run = new Run(`bridge ${t0.title}`)
  const stop = bridgeClaude(
    { prompt: text, resume: t0.sessionId, appendSystemPrompt: append, model: agentSettings.get().model },
    (e: ClaudeEvent) => {
      if (e.type === 'system' && typeof e.session_id === 'string') session = e.session_id
      if (e.type === 'assistant') {
        const msg = e.message as { content?: Array<{ type: string; text?: string; name?: string; id?: string; input?: unknown }> }
        for (const b of msg?.content ?? []) {
          if (b.type === 'text' && b.text) applyEvent(t0.id, turnId, { type: 'text', agent: voice.id, text: b.text })
          if (b.type === 'tool_use') applyEvent(t0.id, turnId, { type: 'tool', agent: voice.id, id: b.id ?? newId('tool'), name: b.name ?? 'tool', input: b.input })
        }
      }
      if (e.type === 'user') {
        const msg = e.message as { content?: Array<{ type: string; tool_use_id?: string; content?: unknown; is_error?: boolean }> }
        for (const b of msg?.content ?? []) {
          if (b.type === 'tool_result' && b.tool_use_id) {
            const r = typeof b.content === 'string' ? b.content : JSON.stringify(b.content)
            applyEvent(t0.id, turnId, { type: 'tool-result', agent: voice.id, id: b.tool_use_id, name: '', result: r, error: b.is_error })
          }
        }
      }
      if (e.type === 'result') {
        const cost = Number(e.total_cost_usd ?? 0)
        if (cost) {
          run.recordCost(voice.id, cost)
          applyEvent(t0.id, turnId, { type: 'usage', agent: voice.id, model: 'claude-code', cost, inputTokens: 0, cacheRead: 0 })
        }
      }
      if (e.type === 'stderr' || e.type === 'error') applyEvent(t0.id, turnId, { type: 'notice', agent: voice.id, text: String(e.text ?? '').slice(0, 400) })
    },
    (err) => {
      if (err) applyEvent(t0.id, turnId, { type: 'error', agent: voice.id, text: err.message })
      finish({ sessionId: session })
    },
  )
  aborts.set(t0.id, stop)
}

export function stopThread(threadId: string): void {
  const a = aborts.get(threadId)
  if (!a) return
  if (typeof a === 'function') a()
  else a.abort()
}

/** Thresh a long thread into sheaves and a summary, and begin a fresh thread from it. */
export async function threshThread(threadId: string): Promise<Thread | null> {
  const t = threadById(threadId)
  if (!t || !t.api.length) return null
  const voice = voiceById(t.voiceId)
  threads.set((s) => ({ running: { ...s.running, [threadId]: true } }))
  try {
    const summary = await thresh(voice, t.api, new Run(`thresh ${t.title}`), () => undefined)
    bind({ kind: 'summary', text: summary.slice(0, 2000), tags: ['thresh'], paths: [], voice: voice.name })
    const fresh = newThread(t.voiceId, { title: `${t.title} (threshed)`, summary, from: t.id })
    return fresh
  } finally {
    threads.set((s) => { const r = { ...s.running }; delete r[threadId]; return { running: r } })
  }
}
