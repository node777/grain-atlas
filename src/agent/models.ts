// The models an agent can run on, with list prices for the cost gauge (USD per million tokens).
// Prices are the Anthropic first-party API rates as of 2026-10; cache writes are billed at
// 1.25x input for the five-minute cache.

export interface ModelInfo {
  id: string
  label: string
  input: number
  output: number
  cacheRead: number
  note: string
}

export const MODELS: ModelInfo[] = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5', input: 4, output: 20, cacheRead: 0.2, note: 'the default: deep and careful' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', input: 2, output: 10, cacheRead: 0.2, note: 'quick and capable, half the cost' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5', input: 0.1, output: 0.5, cacheRead: 0.01, note: 'swift and light, for reading-heavy helpers' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1', input: 10, output: 50, cacheRead: 0.25, note: 'the most capable, for the hardest work' },
]

export const DEFAULT_MODEL = 'claude-opus-5-5'

export const modelInfo = (id: string): ModelInfo => MODELS.find((m) => m.id === id) ?? MODELS[0]

export interface Usage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

/** Dollar cost of one response's usage on a model. */
export function costOf(model: string, u: Usage): number {
  const m = modelInfo(model)
  const write = u.cache_creation_input_tokens ?? 0
  const read = u.cache_read_input_tokens ?? 0
  return (u.input_tokens * m.input + write * m.input * 1.25 + read * m.cacheRead + u.output_tokens * m.output) / 1_000_000
}

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Effort = (typeof EFFORTS)[number]
