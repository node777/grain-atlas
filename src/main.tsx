import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { registerPlugins } from '@/core/registry'
import { applyTheme, settings, settlePlaceOnce } from '@/core/settings'
import { loadRepo } from '@/grain/repo'
import { PLUGINS } from '@/plugins'
import { Shell } from '@/app/Shell'

registerPlugins(PLUGINS)
applyTheme(settings.get())
if (settings.get().introSeen) settlePlaceOnce()
loadRepo()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
)
