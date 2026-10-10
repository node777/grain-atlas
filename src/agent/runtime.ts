// The agent loop. One voice, one thread, the watering tools, and the Gauge watching the spend.
//
// Context discipline (the cure for context bloat):
//   - the system prompt is stable (voice persona + grain's seed context) and cached;
//   - per-thread memory comes from sheaves, recalled for the task, not from replaying old talk;
//   - heavy reading goes to hands (subagents) whose own context is thrown away -- only their
//     short report comes back;
//   - when a thread grows long it is threshed: distilled into sheaves and a summary, and a fresh
//     thread begins from that grain. History is never rewritten in place (append-only).

import type Anthropic from '@anthropic-ai/sdk'
import { createStore } from '@/core/store'
import { TOOLS, type ToolContext } from './tools'
import { Run } from './gauge'
import { DEFAULT_MODEL, type Effort } from './models'
import { seedContext, focusNote } from './context'
import { recall } from './sheaves'

export interface AgentSettings {
  apiKey: string
  backend: 'api' | 'bridge'
  model: string
  handModel: string
  effort: Effort
  handEffort: Effort
  fallbacks: boolean       // server-side refusal fallback (on by default)
  threshAt: number         // input tokens per request after which the thread asks to be threshed
}

export const agentSettings = createStore<AgentSettings>({
  apiKey: '', backend: 'api', model: DEFAULT_MODEL, handModel: DEFAULT_MODEL,
  effort: 'high', handEffort: 'medium', fallbacks: true, threshAt: 120_000,
}, 'grain-atlas:agent')

export type AgentEvent =
  | { type: 'text'; agent: string; text: string }
  | { type: 'thinking'; agent: string; text: string }
  | { type: 'tool'; agent: string; id: string; name: string; input: unknown }
  | { type: 'tool-result'; agent: string; id: string; name: string; result: string; error?: boolean }
  | { type: 'usage'; agent: string; model: string; cost: number; inputTokens: number; cacheRead: number }
  | { type: 'hand'; agent: string; hand: string; task: string }
  | { type: 'hand-done'; agent: string; hand: string; report: string }
  | { type: 'notice'; agent: string; text: string }
  | { type: 'done'; agent: string; text: string; stop: string }
  | { type: 'error'; agent: string; text: string }

export interface VoiceLike { id: string; name: string; persona: string }

export interface RunAgentOptions {
  agentId: string
  voice: VoiceLike
  messages: Anthropic.Beta.BetaMessageParam[]   // the thread so far, ending with a user turn
  run: Run
  depth?: number
  model?: string
  effort?: Effort
  maxTurns?: number
  extraSystem?: string
  signal?: AbortSignal
  onEvent: (e: AgentEvent) => void
}

export interface RunResult { text: string; messages: Anthropic.Beta.BetaMessageParam[]; stop: string; lastInputTokens: number }

type SDK = typeof import('@anthropic-ai/sdk')
let sdkMod: SDK | null = null
/** The SDK loads on first use, so the atlas's first paint stays light. */
async function sdk(): Promise<SDK> {
  if (!sdkMod) sdkMod = await import('@anthropic-ai/sdk')
  return sdkMod
}

let client: Anthropic | null = null
let clientKey = ''
let customFetch: typeof fetch | undefined
/** For tests: route the SDK's requests through a stand-in fetch. */
export function setAgentFetch(f: typeof fetch | undefined): void { customFetch = f; client = null }
async function anthropic(): Promise<Anthropic> {
  const { default: AnthropicClient } = await sdk()
  const key = agentSettings.get().apiKey.trim()
  if (!key) throw new Error('Add an Anthropic API key on the Threshing Floor (Settings) to wake the voices.')
  if (!client || key !== clientKey) {
    // The key stays in this browser and goes only to api.anthropic.com.
    client = new AnthropicClient({ apiKey: key, dangerouslyAllowBrowser: true, ...(customFetch ? { fetch: customFetch, maxRetries: 0 } : {}) })
    clientKey = key
  }
  return client
}

function systemFor(voice: VoiceLike, depth: number, extra?: string): Anthropic.Beta.BetaTextBlockParam[] {
  const role = depth === 0
    ? `You are ${voice.name}, a voice of grain, working with the reader inside the Grain Atlas. ${voice.persona}`
    : `You are a hand sent by ${voice.name}: a focused helper with a fresh context. Do the task, then report back briefly and concretely (what you found or changed, with paths). Do not chat.`
  return [
    { type: 'text', text: role },
    { type: 'text', text: seedContext(), cache_control: { type: 'ephemeral' } },
    ...(extra ? [{ type: 'text' as const, text: extra }] : []),
  ]
}

/** Validate a parsed tool input against the tool's required fields before running it. */
function validInput(name: string, input: unknown): input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const tool = TOOLS.find((t) => t.def.name === name)
  const req = (tool?.def.input_schema as { required?: string[] } | undefined)?.required ?? []
  return req.every((k) => k in (input as Record<string, unknown>))
}

export async function runAgent(o: RunAgentOptions): Promise<RunResult> {
  const s = agentSettings.get()
  const depth = o.depth ?? 0
  const model = o.model ?? (depth === 0 ? s.model : s.handModel)
  const effort = o.effort ?? (depth === 0 ? s.effort : s.handEffort)
  const tools = TOOLS.filter((t) => depth === 0 || t.def.name !== 'send_hand').map((t) => t.def)
  const messages = [...o.messages]
  const system = systemFor(o.voice, depth, o.extraSystem)
  let finalText = ''
  let stop = 'end_turn'
  let lastInput = 0
  let jsonRetries = 0
  let hands = 0

  const ctx: ToolContext = {
    run: o.run, agentId: o.agentId, voice: o.voice.name, depth,
    spawn: depth === 0
      ? async (task, paths, handModel) => {
          const hand = `${o.agentId}/hand-${++hands}`
          o.onEvent({ type: 'hand', agent: o.agentId, hand, task })
          const intro = paths.length ? `Start from: ${paths.join(', ')}\n\n` : ''
          const res = await runAgent({
            agentId: hand, voice: o.voice, run: o.run, depth: 1, model: handModel, signal: o.signal, maxTurns: 24,
            messages: [{ role: 'user', content: intro + task }], onEvent: o.onEvent,
          })
          o.onEvent({ type: 'hand-done', agent: o.agentId, hand, report: res.text })
          return res.text || `(the hand stopped: ${res.stop})`
        }
      : undefined,
  }

  for (let turn = 0; turn < (o.maxTurns ?? 40); turn++) {
    if (o.signal?.aborted) { stop = 'stopped'; break }
    const why = o.run.check(o.agentId)
    if (why) { o.onEvent({ type: 'notice', agent: o.agentId, text: `Resting: ${why}.` }); stop = 'limit'; break }
    const pressure = o.run.pressure(o.agentId)
    const sys = pressure > 0.8
      ? [...system, { type: 'text' as const, text: 'The spending gauge is above 80% of a limit: finish the current step, report what is done and what remains, and stop.' }]
      : system

    const api = await anthropic()
    const stream = api.beta.messages.stream({
      model,
      max_tokens: depth === 0 ? 64000 : 32000,
      system: sys,
      tools,
      messages,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort },
      cache_control: { type: 'ephemeral' },
      ...(s.fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    }, { signal: o.signal })

    stream.on('text', (delta) => o.onEvent({ type: 'text', agent: o.agentId, text: delta }))
    stream.on('streamEvent', (ev) => {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'thinking_delta' && ev.delta.thinking) {
        o.onEvent({ type: 'thinking', agent: o.agentId, text: ev.delta.thinking })
      }
    })

    let message: Anthropic.Beta.BetaMessage
    try {
      message = await stream.finalMessage()
      jsonRetries = 0
    } catch (err) {
      if (o.signal?.aborted) { stop = 'stopped'; break }
      if (err instanceof (await sdk()).APIError || jsonRetries++ >= 2) {
        o.onEvent({ type: 'error', agent: o.agentId, text: (err as Error).message })
        stop = 'error'
        break
      }
      o.onEvent({ type: 'notice', agent: o.agentId, text: 'A tool request arrived garbled; asking again.' })
      continue
    }

    const cost = o.run.record(o.agentId, message.model ?? model, message.usage)
    lastInput = message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0)
    o.onEvent({ type: 'usage', agent: o.agentId, model: message.model ?? model, cost, inputTokens: lastInput, cacheRead: message.usage.cache_read_input_tokens ?? 0 })

    const text = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('')
    if (text) finalText = text
    stop = message.stop_reason ?? 'end_turn'
    if (stop === 'refusal') {
      o.onEvent({ type: 'notice', agent: o.agentId, text: 'The model declined this request.' })
      break
    }
    if (stop === 'pause_turn') { messages.push({ role: 'assistant', content: message.content }); continue }
    const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (!uses.length) { messages.push({ role: 'assistant', content: message.content }); break }
    if (stop === 'max_tokens') {
      o.onEvent({ type: 'notice', agent: o.agentId, text: 'A tool request was cut off at the output limit; stopping before running it.' })
      messages.push({ role: 'assistant', content: message.content })
      break
    }
    messages.push({ role: 'assistant', content: message.content })

    // run every tool of this turn, in parallel, and answer them all in one user message
    const results = await Promise.all(uses.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
      o.onEvent({ type: 'tool', agent: o.agentId, id: u.id, name: u.name, input: u.input })
      const tool = TOOLS.find((t) => t.def.name === u.name)
      if (!tool || !validInput(u.name, u.input)) {
        const r = JSON.stringify({ INVALID_INPUT: u.input })
        o.onEvent({ type: 'tool-result', agent: o.agentId, id: u.id, name: u.name, result: r, error: true })
        return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: r }
      }
      try {
        const r = await tool.run(u.input, ctx)
        o.onEvent({ type: 'tool-result', agent: o.agentId, id: u.id, name: u.name, result: r })
        return { type: 'tool_result', tool_use_id: u.id, content: r }
      } catch (e) {
        const r = (e as Error).message
        o.onEvent({ type: 'tool-result', agent: o.agentId, id: u.id, name: u.name, result: r, error: true })
        return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: r }
      }
    }))
    messages.push({ role: 'user', content: results })
  }

  o.onEvent({ type: 'done', agent: o.agentId, text: finalText, stop })
  return { text: finalText, messages, stop, lastInputTokens: lastInput }
}

/** The opening user turn for a task: the reader's words plus where they are and what is remembered. */
export function openingTurn(task: string, voiceName: string): string {
  const mem = recall(task, 8, voiceName)
  const memory = mem.length ? `\n\nSheaves recalled for this task:\n${mem.map((m) => `- [${m.kind}] ${m.text}`).join('\n')}` : ''
  return `${focusNote()}${memory}\n\n---\n\n${task}`
}

/**
 * Thresh a thread: ask the voice to distill it into sheaves and a short summary, then return the
 * summary so a fresh thread can begin from it. The old thread is kept, not edited.
 */
export async function thresh(voice: VoiceLike, messages: Anthropic.Beta.BetaMessageParam[], run: Run, onEvent: (e: AgentEvent) => void): Promise<string> {
  const res = await runAgent({
    agentId: `${voice.id}/thresher`, voice, run, depth: 0, maxTurns: 12, onEvent,
    messages: [...messages, {
      role: 'user',
      content: 'Thresh this thread. Bind every durable fact, decision, plan and preference worth keeping as separate sheaves (bind_sheaf), then reply with a summary of under 250 words that a fresh thread can start from: the goal, what is done, what remains, and the key paths. Leave the chaff behind.',
    }],
  })
  return res.text
}

export { Run }
