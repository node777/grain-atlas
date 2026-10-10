// The Gauge: what the agents have spent, and the limits they keep to.
//
// Every response's usage is recorded against the run, the day and the whole field. Before each
// request an agent asks the gauge whether it may spend; when a limit is near, agents are told to
// wrap up, and at the limit the run stops cleanly. Limits are the reader's to set.

import { createStore } from '@/core/store'
import { costOf, type Usage } from './models'

export interface Limits {
  perRun: number          // USD for one task or one sowing
  perDay: number          // USD across everything today
  perAgent: number        // USD for any single agent (subagents included separately)
  maxAgents: number       // concurrent agents in a sowing
}

export interface Ledger {
  day: string             // YYYY-MM-DD the totals below belong to
  today: number
  allTime: number
  tokensIn: number
  tokensOut: number
  cacheRead: number
  requests: number
  limits: Limits
  rateRemaining?: { requests?: number; tokens?: number; reset?: string }
}

const todayKey = () => new Date().toISOString().slice(0, 10)

export const gauge = createStore<Ledger>({
  day: todayKey(), today: 0, allTime: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, requests: 0,
  limits: { perRun: 2, perDay: 20, perAgent: 1, maxAgents: 4 },
}, 'grain-atlas:gauge')

export class Run {
  spent = 0
  readonly agents = new Map<string, number>()
  stopped = false
  constructor(readonly label: string, readonly cap = gauge.get().limits.perRun) {}

  record(agentId: string, model: string, usage: Usage): number {
    return this.recordCost(agentId, costOf(model, usage), usage)
  }

  /** Record a cost already priced (Claude Code reports its own total_cost_usd). */
  recordCost(agentId: string, c: number, usage: Usage = { input_tokens: 0, output_tokens: 0 }): number {
    this.spent += c
    this.agents.set(agentId, (this.agents.get(agentId) ?? 0) + c)
    const g = gauge.get()
    const fresh = g.day !== todayKey()
    gauge.set({
      day: todayKey(),
      today: (fresh ? 0 : g.today) + c,
      allTime: g.allTime + c,
      tokensIn: g.tokensIn + usage.input_tokens + (usage.cache_creation_input_tokens ?? 0),
      tokensOut: g.tokensOut + usage.output_tokens,
      cacheRead: g.cacheRead + (usage.cache_read_input_tokens ?? 0),
      requests: g.requests + 1,
    })
    return c
  }

  /** May this agent make another request? Returns a reason when it may not. */
  check(agentId: string): string | null {
    if (this.stopped) return 'the run was stopped'
    const g = gauge.get()
    const today = g.day === todayKey() ? g.today : 0
    if (today >= g.limits.perDay) return `today's limit of $${g.limits.perDay.toFixed(2)} is reached`
    if (this.spent >= this.cap) return `this run's limit of $${this.cap.toFixed(2)} is reached`
    if ((this.agents.get(agentId) ?? 0) >= g.limits.perAgent) return `this agent's limit of $${g.limits.perAgent.toFixed(2)} is reached`
    return null
  }

  /** Share of the tightest limit used, 0..1 -- agents are told to wrap up past 0.8. */
  pressure(agentId: string): number {
    const g = gauge.get()
    const today = g.day === todayKey() ? g.today : 0
    return Math.max(today / g.limits.perDay, this.spent / this.cap, (this.agents.get(agentId) ?? 0) / g.limits.perAgent)
  }

  stop() { this.stopped = true }
}

export const money = (n: number) => (n < 0.01 && n > 0 ? '<$0.01' : `$${n.toFixed(2)}`)
