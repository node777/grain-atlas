import { describe, expect, it } from 'vitest'

const mem = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0,
} as Storage

const { runAgent, agentSettings, setAgentFetch } = await import('../runtime')
const { Run } = await import('../gauge')
const { repo } = await import('../../grain/repo')

function sse(events: Array<Record<string, unknown>>): Response {
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const start = (id: string) => ({ type: 'message_start', message: { id, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage } })

describe('the agent loop', () => {
  it('runs a tool, answers it, and finishes with text, recording cost', async () => {
    // a tiny tree for the map_tree tool
    const entries = new Map()
    entries.set('', { path: '', name: 'grain', kind: 'dir', size: 0, parent: '', children: ['README.md'], files: 1 })
    entries.set('README.md', { path: 'README.md', name: 'README.md', kind: 'file', size: 10, parent: '', children: [], files: 1, meta: { title: 'Grain' } })
    repo.set({ entries, phase: 'ready' })

    const bodies: Array<Record<string, unknown>> = []
    let call = 0
    setAgentFetch((async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      call++
      if (call === 1) {
        return sse([
          start('m1'),
          { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name: 'map_tree', input: {} } },
          { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path": ""}' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 200 } },
          { type: 'message_stop' },
        ])
      }
      return sse([
        start('m2'),
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The root holds README.md.' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 50 } },
        { type: 'message_stop' },
      ])
    }) as typeof fetch)
    agentSettings.set({ apiKey: 'sk-test', fallbacks: true })

    const events: string[] = []
    const run = new Run('test', 5)
    const res = await runAgent({
      agentId: 'kyri', voice: { id: 'kyri', name: 'Kyri', persona: 'test' }, run,
      messages: [{ role: 'user', content: 'What is at the root?' }],
      onEvent: (e) => events.push(e.type),
    })

    expect(res.text).toBe('The root holds README.md.')
    expect(res.stop).toBe('end_turn')
    expect(events).toContain('tool')
    expect(events).toContain('tool-result')
    // the second request carries the tool result back in one user message
    const second = bodies[1] as { messages: Array<{ role: string; content: Array<{ type: string; content?: string }> }> }
    const last = second.messages[second.messages.length - 1]
    expect(last.role).toBe('user')
    expect(last.content[0].type).toBe('tool_result')
    expect(String(last.content[0].content)).toMatch(/README\.md/)
    // stable, cached system prompt; fallbacks on; adaptive thinking
    const first = bodies[0] as Record<string, unknown>
    expect(first.fallbacks).toBe('default')
    expect((first.thinking as { type: string }).type).toBe('adaptive')
    expect(JSON.stringify(first.system)).toMatch(/cache_control/)
    expect(run.spent).toBeGreaterThan(0)
    setAgentFetch(undefined)
  })
})
