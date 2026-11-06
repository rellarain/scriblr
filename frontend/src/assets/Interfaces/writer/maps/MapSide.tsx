import { useMemo, useState } from 'react'
import { MAP_MAX_SIDE, type MapLayerKind, type MapLineStyle, type MapPattern, type MapShape, type MapShapeType } from '../../../../api/types'
import { ChevronDownIcon, ChevronUpIcon, CheckIcon, CloseIcon, EyeClosedIcon, EyeIcon, LockIcon, PlusIcon, RestoreIcon, TrashIcon, UnlockIcon } from '../../../icons'
import { ColourInput, CommitNumber, CommitText, Field } from './MapFields'
import { LABEL_SIZE_RANGE, SYMBOL_SIZE_RANGE, editLabel, editShape, editSymbol, findItem, removeItem, replaceShape, type ItemRef } from './mapItems'
import { LINE_PRESETS, LINE_STYLES, PATTERNS, REGION_PRESETS, SHAPE_WIDTH_RANGE, setAllSmooth, type Pen } from './mapShapes'
import { SYMBOL_SETS, symbolName } from './mapSymbols'
import { MAP_THEMES } from './mapThemes'
import {
  LAYER_NAMES, MAP_TITLE_MAX, addLayer, addTerrain, editTerrain, moveLayer, removeLayer, removeTerrain, renameLayer, resize, setScale, setTitle, terrainCounts,
  setOverlay, setTheme, toggleLayer, type MapDraft,
} from './mapModel'
import type { Maps } from './useMaps'

// What a pen and a drawn shape have in common: how they are drawn.
type ShapeLook = Pick<MapShape, 'style' | 'color' | 'width' | 'fill' | 'opacity' | 'pattern'>

const NEW_TERRAIN_COLOURS = ['#c06c84', '#6c9bd2', '#d9a441', '#7a5c8e', '#4fa89a', '#b5654a', '#9aa86a', '#5a6f8e']
const LAYER_KINDS: Array<Exclude<MapLayerKind, 'terrain'>> = ['shapes', 'symbols', 'labels', 'notes']
const KIND_NAMES = { world: 'World or region', town: 'Town or city', interior: 'Interior' } as const

export interface MapSideProps {
  m: Maps
  draft: MapDraft
  terrain: number
  onTerrain: (index: number) => void
  // The symbol that the Symbol tool stamps, and how wide a new one is.
  symbolKind: string
  onSymbolKind: (id: string) => void
  symbolSize: number
  onSymbolSize: (size: number) => void
  // What new lines and regions are drawn with (the pen of the line tool or the region tool, whichever is in use), a change to it, and a preset (it picks the tool).
  pen: Pen
  penType: MapShapeType
  onPen: (patch: Partial<Pen>) => void
  onPreset: (type: MapShapeType, pen: Pen) => void
  // The chosen symbol or label (null = none); `fresh` is true for one that was just made (its text takes the cursor).
  selected: ItemRef | null
  fresh: boolean
  onDeleted: () => void
}

// The right-hand side of the Maps console: what is chosen on the map, the terrains to paint with, the symbols to stamp, the layers, and the map's own fields.
export function MapSide({ m, draft, terrain, onTerrain, symbolKind, onSymbolKind, symbolSize, onSymbolSize, pen, penType, onPen, onPreset, selected, fresh, onDeleted }: MapSideProps) {
  return (
    <aside className="mapSide" aria-label="Map details">
      {selected && <InspectorPanel m={m} draft={draft} selected={selected} fresh={fresh} onDeleted={onDeleted} />}
      <TerrainPanel m={m} draft={draft} terrain={terrain} onTerrain={onTerrain} />
      <SymbolPanel kind={symbolKind} onKind={onSymbolKind} size={symbolSize} onSize={onSymbolSize} />
      <PenPanel pen={pen} penType={penType} onPen={onPen} onPreset={onPreset} />
      <LayerPanel m={m} draft={draft} />
      <MapFieldsPanel m={m} draft={draft} />
    </aside>
  )
}

// The fields of how a line or region is drawn, for the pen (what new ones are drawn with) and for the chosen one: a line's style, colour and width, and
// for a region its fill, how solid it is and its pattern.
function ShapeFields({ type, value, onChange }: { type: MapShapeType; value: ShapeLook; onChange: (patch: Partial<ShapeLook>) => void }) {
  return (
    <div className="mapFields">
      <Field label={type === 'region' ? 'Outline' : 'Style'}>
        <select className="mapSelect" aria-label={type === 'region' ? 'Outline style' : 'Line style'} value={value.style} onChange={e => onChange({ style: e.target.value as MapLineStyle })}>
          {LINE_STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <div className="mapRow">
        <Field label="Width" short>
          <CommitNumber label={type === 'region' ? 'Width of the outline in cells' : 'Width of the line in cells'} value={value.width} min={SHAPE_WIDTH_RANGE.min} max={SHAPE_WIDTH_RANGE.max} step={0.05} onCommit={width => onChange({ width })} />
        </Field>
        <Field label="Colour" short>
          <span className="mapRow">
            <ColourInput label={type === 'region' ? 'Colour of the outline' : 'Colour of the line'} value={value.color ?? '#22262c'} onCommit={color => onChange({ color })} />
            <button type="button" className="mapIconBtn" aria-label="Use the ink of the look" title="Use the ink of the look" disabled={value.color === null} onClick={() => onChange({ color: null })}><RestoreIcon size={16} /></button>
          </span>
        </Field>
      </div>
      {type === 'region' && (
        <>
          <div className="mapRow">
            <Field label="Fill" short>
              <span className="mapRow">
                <ColourInput label="Fill colour" value={value.fill ?? value.color ?? '#7a8aa0'} onCommit={fill => onChange({ fill })} />
                <button type="button" className="mapIconBtn" aria-label="Fill with the outline colour" title="Fill with the outline colour" disabled={value.fill === null} onClick={() => onChange({ fill: null })}><RestoreIcon size={16} /></button>
              </span>
            </Field>
            <Field label="Solid" short>
              <CommitNumber label="How solid the fill is, in percent" value={Math.round(value.opacity * 100)} min={0} max={100} step={5} onCommit={n => onChange({ opacity: n / 100 })} />
            </Field>
          </div>
          <Field label="Pattern">
            <select className="mapSelect" aria-label="Pattern of the fill" value={value.pattern} onChange={e => onChange({ pattern: e.target.value as MapPattern })}>
              {PATTERNS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </>
      )}
    </div>
  )
}

// The pen: what a new line or region is drawn with. A preset sets it and picks the tool; the fields below change it.
function PenPanel({ pen, penType, onPen, onPreset }: { pen: Pen; penType: MapShapeType; onPen: (patch: Partial<Pen>) => void; onPreset: (type: MapShapeType, pen: Pen) => void }) {
  return (
    <section className="mapPanel" aria-label="Lines and regions">
      <header className="mapPanelHead"><h3 className="mapPanelTitle">Lines and regions</h3></header>
      <div className="mapSizes" role="group" aria-label="Kinds of line">
        {LINE_PRESETS.map(pr => <button key={pr.id} type="button" className="mapChip" title={`Draw a ${pr.name.toLowerCase()}`} onClick={() => onPreset('line', pr.pen)}>{pr.name}</button>)}
      </div>
      <div className="mapSizes" role="group" aria-label="Kinds of region">
        {REGION_PRESETS.map(pr => <button key={pr.id} type="button" className="mapChip" title={`Draw a ${pr.name.toLowerCase()} region`} onClick={() => onPreset('region', pr.pen)}>{pr.name}</button>)}
      </div>
      <h4 className="mapSubTitle">New {penType === 'region' ? 'regions' : 'lines'}</h4>
      <ShapeFields type={penType} value={pen} onChange={onPen} />
      <label className="mapCheck"><input type="checkbox" checked={pen.smooth} onChange={e => onPen({ smooth: e.target.checked })} />Curve the points</label>
      <p className="mapHint">Click to add points; double-click or Enter finishes, Escape cancels. Points snap to grid corners and cell centres; Alt: no snapping.</p>
    </section>
  )
}

// The symbols: four sets, and the one the Symbol tool stamps.
function SymbolPanel({ kind, onKind, size, onSize }: { kind: string; onKind: (id: string) => void; size: number; onSize: (size: number) => void }) {
  const [setId, setSetId] = useState(() => SYMBOL_SETS.find(s => s.symbols.some(y => y.id === kind))?.id ?? SYMBOL_SETS[0].id)
  const set = SYMBOL_SETS.find(s => s.id === setId) ?? SYMBOL_SETS[0]
  return (
    <section className="mapPanel" aria-label="Symbols">
      <header className="mapPanelHead"><h3 className="mapPanelTitle">Symbols</h3></header>
      <div className="mapSizes" role="group" aria-label="Sets of symbols">
        {SYMBOL_SETS.map(s => <button key={s.id} type="button" className="mapChip" aria-pressed={s.id === set.id} onClick={() => setSetId(s.id)}>{s.name}</button>)}
      </div>
      <ul className="mapSymbols">
        {set.symbols.map(def => (
          <li key={def.id}>
            <button
              type="button" className={`mapSymbolBtn${def.id === kind ? ' mapSymbolBtn--on' : ''}`} aria-pressed={def.id === kind} aria-label={`Stamp ${def.name}`} title={`Stamp ${def.name}`}
              onClick={() => onKind(def.id)}
            ><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d={def.path} fill="currentColor" fillRule="evenodd" /></svg></button>
          </li>
        ))}
      </ul>
      <div className="mapRow">
        <Field label="New symbols are" short><CommitNumber label="Width of a new symbol in cells" value={size} min={SYMBOL_SIZE_RANGE.min} max={SYMBOL_SIZE_RANGE.max} step={0.25} onCommit={onSize} /></Field>
        <span className="mapHint">cells wide. Alt while placing: no snapping.</span>
      </div>
    </section>
  )
}

// What is chosen on the map: a symbol (its width and colour), a label (its text and height) or a line or region (how it is drawn), and a delete.
function InspectorPanel({ m, draft, selected, fresh, onDeleted }: { m: Maps; draft: MapDraft; selected: ItemRef; fresh: boolean; onDeleted: () => void }) {
  const item = findItem(draft, selected)
  if (!item) return null
  const remove = () => { m.apply(removeItem(draft, selected)); onDeleted() }
  if (selected.kind === 'shape') {
    const sh = draft.shapes.find(y => y.id === selected.id)!
    const kind = sh.type === 'region' ? 'region' : 'line'
    return (
      <section className="mapPanel" aria-label={`Chosen ${kind}`}>
        <header className="mapPanelHead">
          <h3 className="mapPanelTitle">{sh.type === 'region' ? 'Region' : 'Line'}</h3>
          <button type="button" className="mapIconBtn" aria-label={`Delete the ${kind}`} title="Delete (Delete key)" onClick={remove}><TrashIcon size={16} /></button>
        </header>
        <ShapeFields type={sh.type} value={sh} onChange={patch => m.apply(editShape(draft, sh.id, patch))} />
        <div className="mapSizes" role="group" aria-label="Curves">
          <button type="button" className="mapChip" onClick={() => m.apply(replaceShape(draft, setAllSmooth(sh, true)))}>Curve all points</button>
          <button type="button" className="mapChip" onClick={() => m.apply(replaceShape(draft, setAllSmooth(sh, false)))}>Straighten all points</button>
        </div>
        <p className="mapHint">Drag the shape, a point (square) or a handle (circle). Double-click a point to curve or straighten it, the line to put a point in. With a point chosen, Delete takes it away.</p>
      </section>
    )
  }
  if (selected.kind === 'symbol') {
    const s = draft.symbols.find(y => y.id === selected.id)!
    return (
      <section className="mapPanel" aria-label="Chosen symbol">
        <header className="mapPanelHead">
          <h3 className="mapPanelTitle">{symbolName(s.kind)}</h3>
          <button type="button" className="mapIconBtn" aria-label={`Delete ${symbolName(s.kind)}`} title="Delete (Delete key)" onClick={remove}><TrashIcon size={16} /></button>
        </header>
        <div className="mapRow">
          <Field label="Cells wide" short><CommitNumber label="Width of the symbol in cells" value={s.size} min={SYMBOL_SIZE_RANGE.min} max={SYMBOL_SIZE_RANGE.max} step={0.25} onCommit={size => m.apply(editSymbol(draft, s.id, { size }))} /></Field>
          <Field label="Colour" short>
            <span className="mapRow">
              <ColourInput label="Colour of the symbol" value={s.color ?? '#22262c'} onCommit={color => m.apply(editSymbol(draft, s.id, { color }))} />
              <button
                type="button" className="mapIconBtn" aria-label="Use the colour of the look" title="Use the colour of the look" disabled={s.color === null}
                onClick={() => m.apply(editSymbol(draft, s.id, { color: null }))}
              ><RestoreIcon size={16} /></button>
            </span>
          </Field>
        </div>
        <p className="mapHint">Drag it with the Select tool, or move it with the arrow keys (Shift for a quarter cell).</p>
      </section>
    )
  }
  const l = draft.labels.find(y => y.id === selected.id)!
  return (
    <section className="mapPanel" aria-label="Chosen label">
      <header className="mapPanelHead">
        <h3 className="mapPanelTitle">Label</h3>
        <button type="button" className="mapIconBtn" aria-label="Delete the label" title="Delete (Delete key)" onClick={remove}><TrashIcon size={16} /></button>
      </header>
      <Field label="Text"><CommitText label="Text of the label" value={l.text} max={120} autoFocus={fresh} onCommit={text => m.apply(editLabel(draft, l.id, { text }))} /></Field>
      <Field label="Cells tall" short><CommitNumber label="Height of the label in cells" value={l.size} min={LABEL_SIZE_RANGE.min} max={LABEL_SIZE_RANGE.max} step={0.25} onCommit={size => m.apply(editLabel(draft, l.id, { size }))} /></Field>
      <p className="mapHint">Drag it with the Select tool, or move it with the arrow keys.</p>
    </section>
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
      <p className="mapHint">Things are placed on the top layer of their kind that is shown and not locked. A line or region goes on the top shown, unlocked layer of regions and lines.</p>
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
        <Field label="Look">
          <select className="mapSelect" aria-label="Look of the map" value={draft.theme} onChange={e => m.apply(setTheme(draft, e.target.value as MapDraft['theme']))}>
            {MAP_THEMES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <div className="mapChecks" role="group" aria-label="Drawn over the map">
          {([['scaleBar', 'Scale bar'], ['compass', 'Compass'], ['legend', 'Legend']] as const).map(([field, label]) => (
            <label key={field} className="mapCheck"><input type="checkbox" checked={draft[field]} onChange={e => m.apply(setOverlay(draft, field, e.target.checked))} />{label}</label>
          ))}
        </div>
        <p className="mapHint">The map covers {draft.width * draft.cellSize} × {draft.height * draft.cellSize} {draft.unit}. A new size keeps the painted cells from the top left.</p>
      </div>
    </section>
  )
}
