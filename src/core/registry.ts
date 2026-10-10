// The plugin registry: every feature of the atlas arrives as a plugin.
//
// A plugin can contribute
//   views          -- a full-screen place to be (the Fields, the Ledger, the Sky ...)
//   fileRenderers  -- how a kind of file is shown in the reader (markdown, code, kyri ...)
//   commands       -- actions in the command palette ("open the sky now", "copy run line")
//   panels         -- small instruments shown inside other views (keyed by slot name)
//
// To add a feature: make a folder under src/plugins/, export a plugin from its index.ts, and
// list it in src/plugins/index.ts. Nothing else needs to change.

import type { ComponentType, ReactNode } from 'react'
import type { Route } from './router'

export type ViewKind = 'structured' | 'freeform' | 'sky' | 'tool'

export interface ViewProps {
  route: Route
}

export interface ViewDef {
  id: string              // route segment, e.g. "fields"
  title: string
  hint: string            // one plain line for the compass
  kind: ViewKind
  glyph: ReactNode        // small mark for the compass rose
  order: number
  component: ComponentType<ViewProps>
  hidden?: boolean        // reachable by route, not listed on the compass
}

export interface FileContext {
  path: string
  text: string
  rawUrl: string
  embedded?: boolean      // shown inside another page (a folder's README), without the folio header
}

export interface FileRendererDef {
  id: string
  priority: number        // higher wins when several match
  test: (path: string) => boolean
  component: ComponentType<FileContext>
}

export interface CommandDef {
  id: string
  title: string
  keywords?: string
  run: () => void
}

export interface PanelDef {
  id: string
  slot: string            // e.g. "reader.aside", "lab.readings"
  order: number
  component: ComponentType<{ path?: string; date?: Date }>
}

export interface AtlasPlugin {
  id: string
  title: string
  description: string
  views?: ViewDef[]
  fileRenderers?: FileRendererDef[]
  commands?: CommandDef[]
  panels?: PanelDef[]
  setup?: () => void
}

const plugins: AtlasPlugin[] = []

export function registerPlugins(list: AtlasPlugin[]): void {
  for (const p of list) {
    if (plugins.some((q) => q.id === p.id)) continue
    plugins.push(p)
    p.setup?.()
  }
}

export const allPlugins = () => plugins
export const allViews = () => plugins.flatMap((p) => p.views ?? []).sort((a, b) => a.order - b.order)
export const findView = (id: string) => allViews().find((v) => v.id === id)
export const allCommands = () => plugins.flatMap((p) => p.commands ?? [])
export const panelsFor = (slot: string) =>
  plugins.flatMap((p) => p.panels ?? []).filter((x) => x.slot === slot).sort((a, b) => a.order - b.order)

export function rendererFor(path: string): FileRendererDef | undefined {
  return plugins
    .flatMap((p) => p.fileRenderers ?? [])
    .filter((r) => r.test(path))
    .sort((a, b) => b.priority - a.priority)[0]
}
