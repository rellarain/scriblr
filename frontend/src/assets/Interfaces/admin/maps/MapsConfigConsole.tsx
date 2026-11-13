import { useRef } from 'react'
import { MapIcon, StampIcon } from '../../../icons'
import MapBiomesConsole from './MapBiomesConsole'
import MapShapesConsole from './MapShapesConsole'
import { useStoredState } from '../../writer/storage'
import './mapBiomes.scss'

type Tab = 'biomes' | 'shapes'
const TABS: Array<{ id: Tab; name: string; Icon: typeof MapIcon }> = [
  { id: 'biomes', name: 'Biomes', Icon: MapIcon },
  { id: 'shapes', name: 'Shapes', Icon: StampIcon },
]

// AUI > Configuration > Maps: two tabs, the biome list and the default shapes (each published on its own). The open tab is remembered.
function MapsConfigConsole() {
  const [stored, setStored] = useStoredState<string>('scriblr.config.maps.tab', 'biomes')
  const tab: Tab = stored === 'shapes' ? 'shapes' : 'biomes'
  const refs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})
  const choose = (next: Tab) => setStored(next)
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const at = TABS.findIndex(t => t.id === tab)
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
    choose(TABS[to].id)
    refs.current[TABS[to].id]?.focus()
  }
  return (
    <div className="mbxTabbed">
      <div className="mbxTabs" role="tablist" aria-label="Map settings" onKeyDown={onKey}>
        {TABS.map(t => (
          <button
            key={t.id} ref={el => { refs.current[t.id] = el }} type="button" role="tab" id={`mbx-tab-${t.id}`} aria-controls={`mbx-panel-${t.id}`}
            aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} className="mbxTab" title={t.name} onClick={() => choose(t.id)}
          ><t.Icon size={16} /> {t.name}</button>
        ))}
      </div>
      <div role="tabpanel" id={`mbx-panel-${tab}`} aria-labelledby={`mbx-tab-${tab}`} className="mbxTabPanel">
        {tab === 'biomes' ? <MapBiomesConsole /> : <MapShapesConsole />}
      </div>
    </div>
  )
}

export default MapsConfigConsole
