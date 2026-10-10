import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { registerPlugins } from '@/core/registry'
import { settings, settlePlaceOnce } from '@/core/settings'
import { loadRepo } from '@/grain/repo'
import { PLUGINS } from '@/plugins'
import { Shell } from '@/app/Shell'

registerPlugins(PLUGINS)
console.info('%cGrain Atlas%c  an atlas of grain, by DJINN', 'font: italic 16px Vollkorn, Georgia, serif; color: #d9b45a', 'font: 12px sans-serif; color: #b4a892')
if (settings.get().introSeen) settlePlaceOnce()
loadRepo()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
)
