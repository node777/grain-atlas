// The plugin list. To add a feature, write a plugin (see src/core/registry.ts) and add it here.
import type { AtlasPlugin } from '@/core/registry'
import { renderersPlugin } from './renderers'
import { fieldsPlugin, heavensPlugin, skyPlugin, benchPlugin, ledgerPlugin, journeysPlugin, introPlugin } from './views'

export const PLUGINS: AtlasPlugin[] = [
  renderersPlugin,
  fieldsPlugin,
  heavensPlugin,
  skyPlugin,
  benchPlugin,
  ledgerPlugin,
  journeysPlugin,
  introPlugin,
]
