// The watering can: the tools an agent uses to tend grain. Reading tools work on any version;
// writing tools write into your own grain (a local folder or the bridge) and otherwise keep a
// draft. Every tool returns plain text, bounded in size so one call never floods a context.

import type Anthropic from '@anthropic-ai/sdk'
import { repo, readFile, writeFile, stampOf } from '@/grain/repo'
import { regionOf, REGIONS } from '@/grain/rooms'
import { toStamp } from '@/grain/stamps'
import { quickMoment, quickLine } from '@/astro/describe'
import { settings } from '@/core/settings'
import { bind, recall, type SheafKind } from './sheaves'
import { keepDraft, draftFor } from './drafts'
import { gauge, money, type Run } from './gauge'

export interface ToolContext {
  run: Run
  agentId: string
  voice: string
  depth: number
  spawn?: (task: string, paths: string[], model?: string) => Promise<string>
}

export interface AgentTool {
  def: Anthropic.Beta.BetaTool
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<string>
}

const MAX_OUT = 24_000
const clip = (s: string, n = MAX_OUT) => (s.length > n ? s.slice(0, n) + `\n... [clipped ${s.length - n} characters; ask for a narrower range]` : s)
const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string') throw new Error(`"${name}" must be a string`)
  return v
}
const optStr = (v: unknown) => (typeof v === 'string' ? v : undefined)
const optNum = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const cleanPath = (p: string) => {
  const c = p.replace(/^\.?\//, '').replace(/\/+$/, '')
  if (c.split('/').some((x) => x === '..')) throw new Error('paths stay inside the tree')
  return c
}

async function currentText(path: string): Promise<string> {
  const d = draftFor(path)
  if (d && repo.get().origin.kind === 'github') return d.text
  return readFile(path)
}

const TEXT = /\.(md|mdc|txt|kyri|brix|rish|rye|glow|brush|arbor|sh|manifest|json|ts|js|py|c|h|swift|nix|yml|yaml|toml)$/i

export const TOOLS: AgentTool[] = [
  {
    def: {
      name: 'map_tree',
      description: 'List a folder of the grain tree: its sub-folders with file counts and its files with titles and stamps. Use path "" for the root. Start here to orient.',
      input_schema: { type: 'object', properties: { path: { type: 'string', description: 'folder path, "" for the root' }, depth: { type: 'number', description: '1 (default) or 2' } }, required: ['path'] },
    },
    async run(input) {
      const path = cleanPath(str(input.path ?? '', 'path'))
      const depth = Math.min(2, optNum(input.depth, 1))
      const entries = repo.get().entries
      const e = entries.get(path)
      if (!e || e.kind !== 'dir') return `No folder at "${path}". Folders at the root: ${entries.get('')?.children.filter((c) => entries.get(c)?.kind === 'dir').join(', ')}`
      const lines: string[] = [`${path || '(root)'} -- ${e.files} files, region: ${regionOf(path ? path + '/x' : 'x').name}`]
      const walk = (d: string, level: number) => {
        for (const c of entries.get(d)?.children ?? []) {
          const x = entries.get(c)!
          const pad = '  '.repeat(level)
          if (x.kind === 'dir') {
            lines.push(`${pad}${x.name}/  (${x.files} files)`)
            if (level + 1 < depth) walk(c, level + 1)
          } else {
            const st = stampOf(x)
            lines.push(`${pad}${x.name}${x.meta?.title ? `  -- ${x.meta.title}` : ''}${st ? `  [${st.raw}]` : ''}`)
          }
        }
      }
      walk(path, 0)
      return clip(lines.join('\n'))
    },
  },
  {
    def: {
      name: 'read_page',
      description: 'Read a file from the grain tree with line numbers. Long files: pass from_line/to_line (at most 400 lines per call).',
      input_schema: { type: 'object', properties: { path: { type: 'string' }, from_line: { type: 'number' }, to_line: { type: 'number' } }, required: ['path'] },
    },
    async run(input) {
      const path = cleanPath(str(input.path, 'path'))
      const text = await currentText(path)
      const lines = text.split('\n')
      const from = Math.max(1, optNum(input.from_line, 1))
      const to = Math.min(lines.length, optNum(input.to_line, from + 399), from + 399)
      const body = lines.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(5)}  ${l}`).join('\n')
      const draft = draftFor(path) && repo.get().origin.kind === 'github' ? ' (your draft)' : ''
      return clip(`${path}${draft} -- lines ${from}-${to} of ${lines.length}\n${body}`)
    },
  },
  {
    def: {
      name: 'search_tree',
      description: 'Find files by words in their path or title. Fast; searches the whole tree without reading files.',
      input_schema: { type: 'object', properties: { query: { type: 'string' }, room: { type: 'string', description: 'limit to a top-level folder' }, limit: { type: 'number' } }, required: ['query'] },
    },
    async run(input) {
      const terms = str(input.query, 'query').toLowerCase().split(/\s+/).filter(Boolean)
      const room = optStr(input.room)
      const limit = Math.min(80, optNum(input.limit, 30))
      const out: string[] = []
      for (const e of repo.get().entries.values()) {
        if (e.kind === 'dir' || (room && !e.path.startsWith(room + '/'))) continue
        const hay = `${e.path} ${e.meta?.title ?? ''}`.toLowerCase()
        if (terms.every((t) => hay.includes(t))) out.push(`${e.path}${e.meta?.title ? `  -- ${e.meta.title}` : ''}`)
        if (out.length >= limit) break
      }
      return out.length ? out.join('\n') : 'Nothing matched. Try fewer or different words, or map_tree.'
    },
  },
  {
    def: {
      name: 'grep_tree',
      description: 'Search inside files for a regular expression. Give a room (top-level folder) or path prefix to keep it bounded; reads at most 120 text files.',
      input_schema: { type: 'object', properties: { pattern: { type: 'string' }, prefix: { type: 'string', description: 'path prefix such as "foundations/" or "context/specs"' }, limit: { type: 'number' } }, required: ['pattern', 'prefix'] },
    },
    async run(input) {
      const re = new RegExp(str(input.pattern, 'pattern'), 'i')
      const prefix = cleanPath(str(input.prefix, 'prefix'))
      const limit = Math.min(120, optNum(input.limit, 60))
      const files = [...repo.get().entries.values()].filter((e) => e.kind === 'file' && e.path.startsWith(prefix) && TEXT.test(e.path) && e.size < 400_000).slice(0, 120)
      const out: string[] = []
      for (const f of files) {
        const text = await currentText(f.path).catch(() => '')
        text.split('\n').forEach((l, i) => { if (out.length < limit && re.test(l)) out.push(`${f.path}:${i + 1}: ${l.trim().slice(0, 200)}`) })
        if (out.length >= limit) break
      }
      return out.length ? out.join('\n') : `No match in ${files.length} files under ${prefix}.`
    },
  },
  {
    def: {
      name: 'recent_pages',
      description: 'The most recently stamped pages (by grain\'s one-clock stamps), optionally within a room. Good for "what is the latest thinking on X".',
      input_schema: { type: 'object', properties: { room: { type: 'string' }, limit: { type: 'number' } }, required: [] },
    },
    async run(input) {
      const room = optStr(input.room)
      const limit = Math.min(60, optNum(input.limit, 20))
      const lon = settings.get().place.lon
      const list = [...repo.get().entries.values()]
        .filter((e) => e.kind === 'file' && (!room || e.path.startsWith(room + '/')))
        .map((e) => ({ e, st: stampOf(e) }))
        .filter((x) => x.st && x.st.date.getTime() < Date.now() + 86400000)
        .sort((a, b) => b.st!.date.getTime() - a.st!.date.getTime())
        .slice(0, limit)
      return list.map(({ e, st }) => `${st!.raw}  ${quickLine(quickMoment(st!.date, lon))}  ${e.path}${e.meta?.title ? ` -- ${e.meta.title}` : ''}`).join('\n') || 'No stamped pages found.'
    },
  },
  {
    def: {
      name: 'write_page',
      description: 'Write a whole file into grain (create or replace). In your own grain it is written to disk; on a read-only version it is kept as a draft for review. Keep grain\'s habits: a header under the title (Status, Stamp, Voice), one-clock stamps in new filenames.',
      input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, note: { type: 'string', description: 'one line on why' } }, required: ['path', 'content'] },
      eager_input_streaming: true,
    },
    async run(input, ctx) {
      const path = cleanPath(str(input.path, 'path'))
      const content = str(input.content, 'content')
      if (repo.get().writable) {
        await writeFile(path, content, ctx.voice)
        return `Wrote ${path} (${content.length} characters) into ${repo.get().versionInfo?.name ?? 'your grain'}.`
      }
      keepDraft({ path, text: content, by: ctx.voice, note: optStr(input.note) })
      return `This version is read-only, so ${path} is kept as a draft (${content.length} characters) for the reader to review.`
    },
  },
  {
    def: {
      name: 'edit_page',
      description: 'Replace one exact piece of text in a file with new text. old_text must appear exactly once. Prefer this to write_page for small changes.',
      input_schema: { type: 'object', properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['path', 'old_text', 'new_text'] },
      eager_input_streaming: true,
    },
    async run(input, ctx) {
      const path = cleanPath(str(input.path, 'path'))
      const oldT = str(input.old_text, 'old_text')
      const newT = str(input.new_text, 'new_text')
      const text = await currentText(path)
      const count = text.split(oldT).length - 1
      if (count !== 1) return `old_text appears ${count} times in ${path}; it must appear exactly once. Read the page and quote a longer, unique passage.`
      const next = text.replace(oldT, newT)
      if (repo.get().writable) {
        await writeFile(path, next, ctx.voice)
        return `Edited ${path}.`
      }
      keepDraft({ path, text: next, by: ctx.voice, base: text })
      return `Edited ${path} as a draft (this version is read-only).`
    },
  },
  {
    def: {
      name: 'stamp_now',
      description: 'The current moment as a grain one-clock stamp (America/New_York wall), its filename form, and its Vedic reading.',
      input_schema: { type: 'object', properties: {}, required: [] },
    },
    async run() {
      const now = new Date()
      const s = toStamp(now)
      return `stamp ${s}\nfilename ${s.replace('.', '-')}_your-sprig.md\nmoment ${quickLine(quickMoment(now, settings.get().place.lon))}`
    },
  },
  {
    def: {
      name: 'bind_sheaf',
      description: 'Bind something worth remembering into long memory (a sheaf): a fact you verified, a decision, a plan, the reader\'s preference. Keep each sheaf short and self-contained; future threads will recall it.',
      input_schema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['fact', 'decision', 'plan', 'summary', 'note', 'preference'] },
          text: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, paths: { type: 'array', items: { type: 'string' } },
        },
        required: ['kind', 'text'],
      },
    },
    async run(input, ctx) {
      const kind = (optStr(input.kind) ?? 'note') as SheafKind
      const s = bind({
        kind, text: str(input.text, 'text').slice(0, 2000), voice: ctx.voice,
        tags: Array.isArray(input.tags) ? input.tags.map(String).slice(0, 8) : [],
        paths: Array.isArray(input.paths) ? input.paths.map(String).slice(0, 8) : [],
      })
      return `Bound ${s.id}.`
    },
  },
  {
    def: {
      name: 'recall_sheaves',
      description: 'Recall sheaves (long memory) relevant to a question.',
      input_schema: { type: 'object', properties: { query: { type: 'string' }, k: { type: 'number' } }, required: ['query'] },
    },
    async run(input, ctx) {
      const hits = recall(str(input.query, 'query'), Math.min(20, optNum(input.k, 8)), ctx.voice)
      return hits.length ? hits.map((h) => `[${h.kind} by ${h.voice}] ${h.text}${h.paths.length ? ` (${h.paths.join(', ')})` : ''}`).join('\n') : 'No sheaves match yet.'
    },
  },
  {
    def: {
      name: 'send_hand',
      description: 'Send a hand (a subagent with its own fresh, small context) to do a focused piece of work -- read a room, survey a question, draft a page -- and return a short report. Use it to keep your own context light. Give a complete, standalone task and the paths it should start from.',
      input_schema: {
        type: 'object',
        properties: { task: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } }, model: { type: 'string', description: 'optional model id for the hand' } },
        required: ['task'],
      },
    },
    async run(input, ctx) {
      if (!ctx.spawn) return 'Hands cannot send hands of their own; do the work directly.'
      const paths = Array.isArray(input.paths) ? input.paths.map(String).slice(0, 12) : []
      return clip(await ctx.spawn(str(input.task, 'task'), paths, optStr(input.model)), 12_000)
    },
  },
  {
    def: {
      name: 'gauge',
      description: 'What has been spent and the limits in force. Check before starting something large.',
      input_schema: { type: 'object', properties: {}, required: [] },
    },
    async run(_input, ctx) {
      const g = gauge.get()
      return `this run: ${money(ctx.run.spent)} of ${money(ctx.run.cap)}\ntoday: ${money(g.today)} of ${money(g.limits.perDay)}\nthis agent: ${money(ctx.run.agents.get(ctx.agentId) ?? 0)} of ${money(g.limits.perAgent)}`
    },
  },
]

export const REGION_SUMMARY = () => REGIONS.map((r) => `${r.name}: ${r.rooms.filter(Boolean).join(', ') || '(root files)'}`).join('\n')
