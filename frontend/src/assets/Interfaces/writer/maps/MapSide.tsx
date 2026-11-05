import { useMemo, useState } from 'react'
import { MAP_MAX_SIDE, type MapLayerKind } from '../../../../api/types'
import { ChevronDownIcon, ChevronUpIcon, CheckIcon, CloseIcon, EyeClosedIcon, EyeIcon, LockIcon, PlusIcon, TrashIcon, UnlockIcon } from '../../../icons'
import { ColourInput, CommitNumber, CommitText, Field } from './MapFields'
import {
  LAYER_NAMES, MAP_TITLE_MAX, addLayer, addTerrain, editTerrain, moveLayer, removeLayer, removeTerrain, renameLayer, resize, setScale, setTitle, terrainCounts,
  toggleLayer, type MapDraft,
} from './mapModel'
import type { Maps } from './useMaps'

const NEW_TERRAIN_COLOURS = ['#c06c84', '#6c9bd2', '#d9a441', '#7a5c8e', '#4fa89a', '#b5654a', '#9aa86a', '#5a6f8e']
const LAYER_KINDS: Array<Exclude<MapLayerKind, 'terrain'>> = ['shapes', 'symbols', 'labels', 'notes']
const KIND_NAMES = { world: 'World or region', town: 'Town or city', interior: 'Interior' } as const

// The right-hand side of the Maps console: the terrains to paint with, the layers, and the map's own fields.
export function MapSide({ m, draft, terrain, onTerrain }: { m: Maps; draft: MapDraft; terrain: number; onTerrain: (index: number) => void }) {
  return (
    <aside className="mapSide" aria-label="Map details">
      <TerrainPanel m={m} draft={draft} terrain={terrain} onTerrain={onTerrain} />
      <LayerPanel m={m} draft={draft} />
      <MapFieldsPanel m={m} draft={draft} />
    </aside>
  )
}

function TerrainPanel({ m, draft, terrain, onTerrain }: { m: Maps; draft: MapDraft; terrain: number; onTerrain: (index: number) => void }) {
  // How many cells each terrain has (counted again after every change: a stroke, a fill or an undo makes a new draft, though its cells array stays).
  const counts = useMemo(() => terrainCounts(draft.cells, draft.terrains.length), [draft])
  const [confirming, setConfirming] = useState(false)
  const picked = draft.terrains[terrain]
  const total = draft.width * draft.height

  function add() {
    const r = addTerrain(draft, 'New terrain', NEW_TERRAIN_COLOURS[draft.terrains.length % NEW_TERRAIN_COLOURS.length])
    if (r && m.apply(r.change)) onTerrain(r.index)
  }
  function remove() {
    setConfirming(false)
    if (m.apply(removeTerrain(draft, terrain))) onTerrain(Math.max(0, Math.min(terrain, draft.terrains.length - 2)))
  }

  return (
    <section className="mapPanel" aria-label="Terrain">
      <header className="mapPanelHead">
        <h3 className="mapPanelTitle">Terrain</h3>
        <button type="button" className="mapIconBtn" aria-label="Add a terrain" title="Add a terrain" onClick={add}><PlusIcon size={16} /></button>
      </header>
      <ul className="mapTerrains">
        {draft.terrains.map((t, i) => (
          <li key={t.id}>
            <button
              type="button" className={`mapTerrain${i === terrain ? ' mapTerrain--on' : ''}`} aria-pressed={i === terrain} aria-label={`Paint with ${t.name}`}
              title={`Paint with ${t.name}`} onClick={() => onTerrain(i)}
            >
              <span className="mapSwatch" style={{ background: t.color }} aria-hidden="true" />
              <span className="mapTerrainName">{t.name}</span>
              <span className="mapTerrainCount" title={`${counts[i]} of ${total} cells`}>{Math.round((counts[i] / total) * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>
      {picked && (
        <div className="mapEdit">
          <div className="mapRow">
            <ColourInput label={`Colour of ${picked.name}`} value={picked.color} onCommit={color => m.apply(editTerrain(draft, terrain, { color }))} />
            <CommitText label={`Name of ${picked.name}`} value={picked.name} max={40} onCommit={name => m.apply(editTerrain(draft, terrain, { name }))} />
            {confirming ? (
              <span className="mapConfirm" role="group" aria-label={`Remove ${picked.name}?`}>
                <button type="button" className="mapIconBtn" aria-label="Confirm remove" title="Confirm remove" onClick={remove}><CheckIcon size={16} /></button>
                <button type="button" className="mapIconBtn" aria-label="Cancel remove" title="Cancel" onClick={() => setConfirming(false)}><CloseIcon size={16} /></button>
              </span>
            ) : (
              <button
                type="button" className="mapIconBtn" aria-label={`Remove ${picked.name}`} title={draft.terrains.length <= 1 ? 'The last terrain stays' : `Remove ${picked.name}`}
                disabled={draft.terrains.length <= 1} onClick={() => (counts[terrain] === 0 ? remove() : setConfirming(true))}
              ><TrashIcon size={16} /></button>
            )}
          </div>
          {confirming && <p className="mapHint">Its {counts[terrain]} cells become {draft.terrains[0].name}.</p>}
        </div>
      )}
    </section>
  )
}

function LayerPanel({ m, draft }: { m: Maps; draft: MapDraft }) {
  const [kind, setKind] = useState<Exclude<MapLayerKind, 'terrain'>>('shapes')
  // Top layer first, as a stack of sheets reads.
  const rows = [...draft.layers].reverse()
  return (
    <section className="mapPanel" aria-label="Layers">
      <header className="mapPanelHead">
        <h3 className="mapPanelTitle">Layers</h3>
        <span className="mapRow">
          <select className="mapSelect" aria-label="Kind of layer to add" value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
            {LAYER_KINDS.map(k => <option key={k} value={k}>{LAYER_NAMES[k]}</option>)}
          </select>
          <button type="button" className="mapIconBtn" aria-label="Add a layer" title="Add a layer" onClick={() => m.apply(addLayer(draft, kind))}><PlusIcon size={16} /></button>
        </span>
      </header>
      <ul className="mapLayers">
        {rows.map((layer, row) => (
          <li key={layer.id} className={`mapLayer${layer.visible ? '' : ' mapLayer--hidden'}`}>
            <button
              type="button" className="mapIconBtn" aria-pressed={layer.visible} aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
              title={layer.visible ? 'Hide' : 'Show'} onClick={() => m.apply(toggleLayer(draft, layer.id, 'visible'))}
            >{layer.visible ? <EyeIcon size={16} /> : <EyeClosedIcon size={16} />}</button>
            <button
              type="button" className="mapIconBtn" aria-pressed={layer.locked} aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}
              title={layer.locked ? 'Unlock' : 'Lock'} onClick={() => m.apply(toggleLayer(draft, layer.id, 'locked'))}
            >{layer.locked ? <LockIcon size={16} /> : <UnlockIcon size={16} />}</button>
            <CommitText label={`Name of the ${layer.name} layer`} value={layer.name} max={40} className="mapInput mapInput--layer" onCommit={name => m.apply(renameLayer(draft, layer.id, name))} />
            <button
              type="button" className="mapIconBtn" aria-label={`Move ${layer.name} up`} title="Move up" disabled={row === 0}
              onClick={() => m.apply(moveLayer(draft, layer.id, 1))}
            ><ChevronUpIcon size={16} /></button>
            <button
              type="button" className="mapIconBtn" aria-label={`Move ${layer.name} down`} title="Move down" disabled={row === rows.length - 1}
              onClick={() => m.apply(moveLayer(draft, layer.id, -1))}
            ><ChevronDownIcon size={16} /></button>
            <button
              type="button" className="mapIconBtn" aria-label={`Delete ${layer.name}`} title={layer.kind === 'terrain' ? 'The terrain layer stays' : 'Delete'}
              disabled={layer.kind === 'terrain'} onClick={() => m.apply(removeLayer(draft, layer.id))}
            ><TrashIcon size={16} /></button>
          </li>
        ))}
      </ul>
      <p className="mapHint">Symbols, labels and shapes arrive in the next updates; the layers are ready for them.</p>
    </section>
  )
}

function MapFieldsPanel({ m, draft }: { m: Maps; draft: MapDraft }) {
  return (
    <section className="mapPanel" aria-label="Map">
      <header className="mapPanelHead"><h3 className="mapPanelTitle">Map</h3></header>
      <div className="mapFields">
        <Field label="Title"><CommitText label="Map title" value={draft.title} max={MAP_TITLE_MAX} onCommit={title => m.apply(setTitle(draft, title))} /></Field>
        <Field label="Kind"><span className="mapStatic">{KIND_NAMES[draft.kind]}</span></Field>
        <div className="mapRow">
          <Field label="Width" short><CommitNumber label="Width in cells" value={draft.width} min={1} max={MAP_MAX_SIDE} onCommit={w => m.apply(resize(draft, w, draft.height))} /></Field>
          <Field label="Height" short><CommitNumber label="Height in cells" value={draft.height} min={1} max={MAP_MAX_SIDE} onCommit={h => m.apply(resize(draft, draft.width, h))} /></Field>
        </div>
        <div className="mapRow">
          <Field label="One cell is" short><CommitNumber label="Size of one cell" value={draft.cellSize} min={0.001} max={1_000_000} step="any" onCommit={s => m.apply(setScale(draft, s, draft.unit))} /></Field>
          <Field label="Unit" short><CommitText label="Unit of a cell" value={draft.unit} max={20} className="mapInput mapInput--unit" onCommit={u => m.apply(setScale(draft, draft.cellSize, u))} /></Field>
        </div>
        <p className="mapHint">The map covers {draft.width * draft.cellSize} × {draft.height * draft.cellSize} {draft.unit}. A new size keeps the painted cells from the top left.</p>
      </div>
    </section>
  )
}
