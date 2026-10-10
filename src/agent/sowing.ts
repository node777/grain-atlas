// Sowing: the autonomous mode. Plant a seed -- an idea, a task, a direction -- and a field of
// agents grows it into something that works and belongs in grain.
//
//   1. Furrowing  -- the voice reads enough to lay out a few plots: independent, concrete pieces
//                    of work, each with a definition of done.
//   2. Tending    -- each plot gets its own hand (an agent with a fresh context), several at once
//                    up to the Gauge's agent limit. Hands may send hands of their own for reading.
//   3. Winnowing  -- a reviewer reads what came back and what changed, checks it against grain's
//                    ethos (bounded, witnessed, plainly written, honest about proven vs vision),
//                    and fixes small things.
//   4. Harvest    -- a harvest note: what grew, what remains, where it lives. Bound as a sheaf.
//
// Every request passes the Gauge first; at a limit the field rests and reports what it has.

import { createStore } from '@/core/store'
import { runAgent, type AgentEvent } from './runtime'
import { Run } from './gauge'
import { voiceById } from '@/voices/voices'
import { bind } from './sheaves'
import { changes, repo, writeFile } from '@/grain/repo'
import { keepDraft } from './drafts'
import { toStamp } from '@/grain/stamps'

export type PlotState = 'waiting' | 'growing' | 'grown' | 'withered'

export interface Plot {
  id: string
  title: string
  task: string
  paths: string[]
  done: string             // definition of done
  state: PlotState
  report?: string
  tools: number
  cost: number
  log: string[]
}

export interface Sowing {
  id: string
  seed: string
  voiceId: string
  phase: 'furrowing' | 'tending' | 'winnowing' | 'harvested' | 'resting' | 'stopped'
  plots: Plot[]
  plan?: string
  harvest?: string
  harvestPath?: string
  started: number
  cost: number
  cap: number
  agents: number
  log: string[]
}

export const sowings = createStore<{ list: Sowing[] }>({ list: [] }, 'grain-atlas:sowings')
const runs = new Map<string, { run: Run; ctrl: AbortController }>()

function patch(id: string, fn: (s: Sowing) => Sowing): void {
  sowings.set((st) => ({ list: st.list.map((s) => (s.id === id ? fn(s) : s)) }))
}
const patchPlot = (sid: string, pid: string, fn: (p: Plot) => Plot) =>
  patch(sid, (s) => ({ ...s, plots: s.plots.map((p) => (p.id === pid ? fn(p) : p)) }))
const say = (sid: string, line: string) => patch(sid, (s) => ({ ...s, log: [...s.log, line].slice(-300) }))

const PLAN_INSTRUCTIONS = (n: number) => `You are furrowing a sowing. Read only as much as you need (map_tree, search_tree, read_page, recall_sheaves) to understand where this seed belongs in grain. Then lay out at most ${n} plots: independent pieces of work that can run at the same time without stepping on each other, each small enough for one focused agent.

Reply with your reasoning in a sentence or two, then a single fenced json block of this shape and nothing after it:
\`\`\`json
{"plan": "one paragraph: what will grow and why it fits grain",
 "plots": [{"title": "short name", "task": "complete, standalone instructions", "paths": ["where to start"], "done": "how the hand knows it is finished"}]}
\`\`\``

const TEND_INSTRUCTIONS = (seed: string, plan: string, plot: Plot, others: string[]) => `You are tending one plot of a sowing.

The seed: ${seed}
The plan: ${plan}
Your plot: ${plot.title}
Done when: ${plot.done}
Other plots growing beside you (do not do their work): ${others.join('; ') || 'none'}

Work in grain's way: read before writing, keep changes small and bounded, give new pages a header (title, Status, Stamp from stamp_now, Voice) and mark unproven designs as vision. Use send_hand for heavy reading. When done, reply with a short report: what you made or changed (paths), what you verified, what remains.`

const WINNOW_INSTRUCTIONS = (seed: string, reports: string, changed: string) => `You are winnowing a sowing: separating the grain from the chaff.

The seed: ${seed}

Reports from the plots:
${reports}

Files written during the sowing:
${changed || '(none written to disk; check drafts if this version is read-only)'}

Read the changed files. Check them against grain's ethos: every claim says whether it is proven (checkable) or proposed (vision); pages carry a header; names are plain and warm; nothing unbounded; nothing contradicts the existing tree. Fix small problems directly with edit_page. Then reply with the harvest note in markdown: a title, a header (Status, Stamp, Voice), what grew, what was checked, what remains, and the paths -- closing with a one-line benediction.`

export function parsePlan(text: string): { plan: string; plots: Array<Pick<Plot, 'title' | 'task' | 'paths' | 'done'>> } | null {
  const m = /```json\s*([\s\S]*?)```/.exec(text) ?? /(\{[\s\S]*"plots"[\s\S]*\})\s*$/.exec(text)
  if (!m) return null
  try {
    const j = JSON.parse(m[1])
    if (!Array.isArray(j.plots)) return null
    return {
      plan: String(j.plan ?? ''),
      plots: j.plots.slice(0, 12).map((p: Record<string, unknown>) => ({
        title: String(p.title ?? 'a plot'), task: String(p.task ?? ''), done: String(p.done ?? 'the task is complete'),
        paths: Array.isArray(p.paths) ? p.paths.map(String).slice(0, 8) : [],
      })).filter((p: { task: string }) => p.task),
    }
  } catch {
    return null
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) await fn(items[i++])
  }))
}

export interface SowOptions { seed: string; voiceId: string; cap: number; agents: number; maxPlots: number }

export async function sow(o: SowOptions): Promise<string> {
  const id = `sow-${Date.now().toString(36)}`
  const voice = voiceById(o.voiceId)
  const run = new Run(`sowing ${o.seed.slice(0, 40)}`, o.cap)
  const ctrl = new AbortController()
  runs.set(id, { run, ctrl })
  const s: Sowing = { id, seed: o.seed, voiceId: o.voiceId, phase: 'furrowing', plots: [], started: Date.now(), cost: 0, cap: o.cap, agents: o.agents, log: [] }
  sowings.set((st) => ({ list: [s, ...st.list].slice(0, 30) }))
  const changeMark = changes.get().list[0]?.at ?? 0
  const sync = () => patch(id, (x) => ({ ...x, cost: run.spent }))
  const live = () => !ctrl.signal.aborted && !run.stopped

  try {
    // 1. furrowing
    say(id, `${voice.name} reads the ground for the seed.`)
    const planRes = await runAgent({
      agentId: `${voice.id}/furrow`, voice, run, signal: ctrl.signal, maxTurns: 20,
      extraSystem: PLAN_INSTRUCTIONS(o.maxPlots),
      messages: [{ role: 'user', content: `The seed to sow:\n\n${o.seed}` }],
      onEvent: (e) => { if (e.type === 'tool') say(id, `furrow: ${e.name}`) ; if (e.type === 'usage') sync() },
    })
    const plan = parsePlan(planRes.text)
    if (!plan || !plan.plots.length) {
      patch(id, (x) => ({ ...x, phase: live() ? 'resting' : 'stopped', plan: planRes.text }))
      say(id, 'The furrow came back without plots; the field rests. Read the plan text and sow again with a clearer seed.')
      return id
    }
    const plots: Plot[] = plan.plots.map((p, i) => ({ ...p, id: `${id}-p${i}`, state: 'waiting', tools: 0, cost: 0, log: [] }))
    patch(id, (x) => ({ ...x, phase: 'tending', plan: plan.plan, plots }))
    say(id, `${plots.length} plots laid out.`)

    // 2. tending
    await pool(plots, o.agents, async (plot) => {
      if (!live()) return
      patchPlot(id, plot.id, (p) => ({ ...p, state: 'growing' }))
      const before = run.spent
      const res = await runAgent({
        agentId: `${voice.id}/${plot.id}`, voice, run, signal: ctrl.signal, maxTurns: 40,
        extraSystem: TEND_INSTRUCTIONS(o.seed, plan.plan, plot, plots.filter((x) => x.id !== plot.id).map((x) => x.title)),
        messages: [{ role: 'user', content: `${plot.paths.length ? `Start from: ${plot.paths.join(', ')}\n\n` : ''}${plot.task}` }],
        onEvent: (e: AgentEvent) => {
          if (e.type === 'tool') patchPlot(id, plot.id, (p) => ({ ...p, tools: p.tools + 1, log: [...p.log, `${e.name} ${shortInput(e.input)}`].slice(-40) }))
          if (e.type === 'hand') patchPlot(id, plot.id, (p) => ({ ...p, log: [...p.log, `sends a hand: ${e.task.slice(0, 80)}`].slice(-40) }))
          if (e.type === 'usage') { patchPlot(id, plot.id, (p) => ({ ...p, cost: run.spent - before })); sync() }
          if (e.type === 'notice' || e.type === 'error') patchPlot(id, plot.id, (p) => ({ ...p, log: [...p.log, e.text].slice(-40) }))
        },
      })
      patchPlot(id, plot.id, (p) => ({ ...p, state: res.stop === 'error' || res.stop === 'limit' || res.stop === 'stopped' ? 'withered' : 'grown', report: res.text }))
      say(id, `plot "${plot.title}" ${res.stop === 'end_turn' ? 'grown' : `stopped (${res.stop})`}.`)
    })

    // 3. winnowing
    if (!live()) throw new Error('stopped')
    patch(id, (x) => ({ ...x, phase: 'winnowing' }))
    const current = sowings.get().list.find((x) => x.id === id)!
    const reports = current.plots.map((p) => `## ${p.title} (${p.state})\n${p.report ?? '(no report)'}`).join('\n\n')
    const changed = changes.get().list.filter((c) => c.at > changeMark).map((c) => `- ${c.path} (${c.created ? 'new' : 'changed'}, by ${c.by})`).join('\n')
    const win = await runAgent({
      agentId: `${voice.id}/winnow`, voice, run, signal: ctrl.signal, maxTurns: 24,
      extraSystem: WINNOW_INSTRUCTIONS(o.seed, reports, changed),
      messages: [{ role: 'user', content: 'Winnow the field and write the harvest note.' }],
      onEvent: (e) => { if (e.type === 'tool') say(id, `winnow: ${e.name}`); if (e.type === 'usage') sync() },
    })

    // 4. harvest
    const stamp = toStamp(new Date())
    const sprig = o.seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'harvest'
    const harvestPath = `atlas-harvests/${stamp.replace('.', '-')}_${sprig}.md`
    const note = win.text || reports
    if (repo.get().writable) await writeFile(harvestPath, note, voice.name).catch(() => keepDraft({ path: harvestPath, text: note, by: voice.name }))
    else keepDraft({ path: harvestPath, text: note, by: voice.name, note: 'harvest note' })
    bind({ kind: 'summary', text: `Sowing "${o.seed.slice(0, 120)}": ${note.slice(0, 1500)}`, tags: ['sowing', 'harvest'], paths: [harvestPath], voice: voice.name })
    patch(id, (x) => ({ ...x, phase: 'harvested', harvest: note, harvestPath, cost: run.spent }))
    say(id, `Harvested into ${harvestPath}.`)
  } catch (e) {
    patch(id, (x) => ({ ...x, phase: ctrl.signal.aborted ? 'stopped' : 'resting', cost: run.spent }))
    say(id, ctrl.signal.aborted ? 'The sowing was stopped.' : `The field rests: ${(e as Error).message}`)
  } finally {
    runs.delete(id)
  }
  return id
}

export function stopSowing(id: string): void {
  const r = runs.get(id)
  if (!r) return
  r.run.stop()
  r.ctrl.abort()
}

export const isSowing = (id: string) => runs.has(id)

function shortInput(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  return String(o.path ?? o.query ?? o.pattern ?? '').slice(0, 80)
}
