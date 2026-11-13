import { useMemo, useState } from 'react'
import {
  MAP_MAX_PROJECT_BIOMES, MAP_MAX_SIDE, type MapBiome, type MapHeightMode, type MapLevel, type MapUnits, type OutlineNode, type PlotNode, type MapSummary, type MapLayerKind,
  type MapLineStyle, type MapPattern, type MapShape, type MapShapeType,
} from '../../../../api/types'
import { ChevronDownIcon, ChevronUpIcon, CheckIcon, CloseIcon, EyeClosedIcon, EyeIcon, FolderPlusIcon, ImageIcon, LockIcon, MapIcon, PlusIcon, RestoreIcon, TrashIcon, UnlockIcon } from '../../../icons'
import { ColourInput, CommitNumber, CommitText, Field } from './MapFields'
import { EXPORT_SCALES, exportMapImage, exportSize, type ExportScale } from './mapExport'
import {
  HEIGHT_LIMIT, LABEL_SIZE_RANGE, MAX_PLACE_MAPS, PLACE_NAME_MAX, SYMBOL_SIZE_RANGE, addPlaces, editLabel, editPlace, editShape, editSymbol, findItem, moveShapeOrder, placeKey,
  placeOf, removeItem, replaceShape, type ItemRef,
} from './mapItems'
import { looksLikePlaceKey } from './placesStore'
import type { ScenePlace } from './MapsConsole'
import { LINE_PRESETS, LINE_STYLES, PATTERNS, REGION_PRESETS, SHAPE_WIDTH_RANGE, setAllSmooth, type Pen } from './mapShapes'
import { SYMBOL_SETS, symbolName } from './mapSymbols'
import { biomeCounts, offeredBiomes, ownBiomeId, resolveBiome, saveOwnBiomes, type BiomesView } from './mapBiomes'
import { LEVELS, defaultsFor, levelDef, levelsBelow, nextLevelDown } from './mapLevels'
import { heightUnit, roundNice, unitsOf, type ConvertMode } from './mapUnits'
import {
  LAYER_NAMES, MAP_TITLE_MAX, addLayer, moveLayer, removeLayer, renameLayer, resize, setScale, setTitle,
  descendantIds, setAppliesFrom, setBase, setLevel, setOverlay, setPace, setParent, setUnits, toggleLayer, type MapDraft,
} from './mapModel'
import type { Maps } from './useMaps'
import { ForReadersPanel } from './ForReadersPanel'
import { JourneysPanel, type JourneyState } from './JourneysPanel'
import type { StoryPoint } from '../characters/story'
import { WorldLinks } from '../links/WorldLinks'

// What a pen and a drawn shape have in common: how they are drawn.
type ShapeLook = Pick<MapShape, 'style' | 'color' | 'width' | 'fill' | 'opacity' | 'pattern'>

const NEW_BIOME_COLOURS = ['#c06c84', '#6c9bd2', '#d9a441', '#7a5c8e', '#4fa89a', '#b5654a', '#9aa86a', '#5a6f8e']
const LAYER_KINDS: Array<Exclude<MapLayerKind, 'terrain'>> = ['shapes', 'symbols', 'labels', 'notes']
const HEIGHT_MODES: Array<{ id: MapHeightMode; name: string }> = [
  { id: 'none', name: 'Keeps the height' }, { id: 'raise', name: 'Raises the land' }, { id: 'lower', name: 'Lowers the land' }, { id: 'set', name: 'Sets the height' },
]
const UNIT_SYSTEMS: Array<{ id: MapUnits; name: string }> = [{ id: 'metric', name: 'Metric' }, { id: 'imperial', name: 'Imperial' }, { id: 'custom', name: 'Custom' }]

export interface MapSideProps {
  projectId: string
  // The chapters and scenes of the outline in book order, the characters of the project, and the state of the journeys drawn on the map.
  points: StoryPoint[]
  cast: Array<{ id: string; name: string }>
  journey: JourneyState
  onJourney: (patch: Partial<JourneyState>) => void
  onJourneyTool: () => void
  plotNodes: PlotNode[]
  onOpenPlot?: (nodeId: string) => void
  // The outline and a way to open a chapter or scene, for the links of a place.
  outline?: OutlineNode[]
  onOpenScene?: (nodeId: string) => void
  m: Maps
  draft: MapDraft
  // The biomes of the project (the admin's and its own), the one a new biome area is made in, and whether new biome areas have curved points.
  biomes: BiomesView
  biome: string
  onBiome: (id: string) => void
  biomeSmooth: boolean
  onBiomeSmooth: (on: boolean) => void
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
  // The scenes of the project, and how to give one another location (for the places and the old-locations tool).
  scenes: ScenePlace[]
  onSetLocation?: (sceneId: string, location: string) => void
}

// The right-hand side of the Maps console: what is chosen on the map, the biomes to draw with, the symbols to stamp, the layers, and the map's own fields.
export function MapSide(p: MapSideProps) {
  const { projectId, points, cast, journey, onJourney, onJourneyTool, plotNodes, onOpenPlot, outline, onOpenScene, m, draft, symbolKind, onSymbolKind, symbolSize, onSymbolSize } = p
  const { pen, penType, onPen, onPreset, selected, fresh, onDeleted, scenes, onSetLocation } = p
  return (
    <aside className="mapSide" aria-label="Map details">
      {selected && <InspectorPanel projectId={projectId} plotNodes={plotNodes} onOpenPlot={onOpenPlot} outline={outline} onOpenScene={onOpenScene} m={m} draft={draft} selected={selected} fresh={fresh} onDeleted={onDeleted} scenes={scenes} biomes={p.biomes} />}
      <OldLocations m={m} draft={draft} scenes={scenes} onSetLocation={onSetLocation} />
      <BiomesPanel projectId={projectId} m={m} draft={draft} biomes={p.biomes} biome={p.biome} onBiome={p.onBiome} smooth={p.biomeSmooth} onSmooth={p.onBiomeSmooth} />
      <SymbolPanel kind={symbolKind} onKind={onSymbolKind} size={symbolSize} onSize={onSymbolSize} />
      <PenPanel pen={pen} penType={penType} onPen={onPen} onPreset={onPreset} />
      <LayerPanel m={m} draft={draft} />
      <JourneysPanel m={m} draft={draft} points={points} cast={cast} state={journey} onState={onJourney} onTool={onJourneyTool} />
      <MapFieldsPanel m={m} draft={draft} points={points} />
      <ExportPanel draft={draft} biomes={p.biomes} />
      <ForReadersPanel projectId={projectId} m={m} draft={draft} selected={selected} />
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
            <button type="button" className="mapIconBtn" aria-label="Use the ink of the map" title="Use the ink of the map" disabled={value.color === null} onClick={() => onChange({ color: null })}><RestoreIcon size={16} /></button>
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

// A symbol or an area (a biome area or a region) that has a name is a place: a scene can happen there, and the maps that open from it are listed (the town's
// map, the floors of a building). A map made for a place is the next level down from this one, or any lower level.
function PlaceFields({ projectId, plotNodes, onOpenPlot, outline, onOpenScene, m, draft, item, scenes }: { projectId: string; plotNodes: PlotNode[]; onOpenPlot?: (nodeId: string) => void; outline?: OutlineNode[]; onOpenScene?: (nodeId: string) => void; m: Maps; draft: MapDraft; item: ItemRef; scenes: ScenePlace[] }) {
  const place = placeOf(draft, item) ?? { name: '', mapIds: [] }
  const linked = place.mapIds.map(id => m.maps.find(x => x.id === id)).filter((x): x is MapSummary => !!x)
  const free = m.maps.filter(x => x.id !== draft.id && !x.versionOf && !place.mapIds.includes(x.id))
  const [pick, setPick] = useState('')
  const below = levelsBelow(draft.level)
  const [level, setLevelChoice] = useState<MapLevel>(() => nextLevelDown(draft.level))
  const childLevel = below.includes(level) ? level : below[0] ?? draft.level
  const key = placeKey(draft.id, item.id)
  const here = scenes.filter(sc => sc.location === key)

  async function makeMap() {
    const units = draft.units === 'custom' ? 'metric' : draft.units
    const d = defaultsFor(childLevel, units)
    const id = await m.create({ title: place.name, level: childLevel, units, width: d.width, height: d.height, cellSize: d.cellSize, unit: d.unit, base: d.base, parentId: draft.id }, false)
    if (id) m.apply(editPlace(draft, item, { mapIds: [...place.mapIds, id] }))
  }

  return (
    <>
      <Field label="Place name"><CommitText label="Name of the place" value={place.name} max={PLACE_NAME_MAX} onCommit={name => m.apply(editPlace(draft, item, { name }))} /></Field>
      {place.name === '' && <p className="mapHint">Give it a name to make it a place: a scene can happen there, and maps can open from it.</p>}
      {place.name !== '' && (
        <div className="mapLinks" role="group" aria-label="Maps from this place">
          <h4 className="mapSubTitle">Maps from here</h4>
          {linked.length === 0 && <p className="mapHint">No map opens from here yet. Double-click the place with the Select tool to open its first map.</p>}
          <ul className="mapLinked">
            {linked.map(x => (
              <li key={x.id} className="mapRow">
                <button type="button" className="mapLinkOpen" title={`Open ${x.title}`} aria-label={`Open ${x.title}`} onClick={() => { void m.open(x.id) }}><MapIcon size={14} /><span>{x.title}</span></button>
                <button type="button" className="mapIconBtn" aria-label={`Stop opening ${x.title} from here`} title="Stop opening this map from here" onClick={() => m.apply(editPlace(draft, item, { mapIds: place.mapIds.filter(id => id !== x.id) }))}><CloseIcon size={14} /></button>
              </li>
            ))}
          </ul>
          <div className="mapRow">
            {below.length > 0 && (
              <select className="mapSelect" aria-label="Level of a new map for this place" value={childLevel} onChange={e => setLevelChoice(e.target.value as MapLevel)}>
                {below.map(lv => <option key={lv} value={lv}>{levelDef(lv).name}</option>)}
              </select>
            )}
            <button type="button" className="mapIconBtn" aria-label="Make a map for this place" title={`Make a ${levelDef(childLevel).name.toLowerCase()} map for this place (inside this map)`} disabled={place.mapIds.length >= MAX_PLACE_MAPS} onClick={() => { void makeMap() }}><FolderPlusIcon size={16} /></button>
          </div>
          {free.length > 0 && (
            <div className="mapRow">
              <select className="mapSelect" aria-label="Another map to open from here" value={pick} onChange={e => setPick(e.target.value)}>
                <option value="">Link a map that exists…</option>
                {free.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
              <button type="button" className="mapIconBtn" aria-label="Link the map" title="Link the map" disabled={pick === ''} onClick={() => { m.apply(editPlace(draft, item, { mapIds: [...place.mapIds, pick] })); setPick('') }}><PlusIcon size={16} /></button>
            </div>
          )}
          <h4 className="mapSubTitle">Scenes here</h4>
          {here.length === 0 ? <p className="mapHint">No scene is set here. Choose it as a scene's Location in the Outline.</p> : <ul className="mapScenes">{here.map(sc => <li key={sc.id}>{sc.title || 'Untitled scene'}</li>)}</ul>}
          <WorldLinks projectId={projectId} self={`place:${key}`} plotNodes={plotNodes} onOpenPlot={onOpenPlot} outline={outline} onOpenScene={onOpenScene} />
        </div>
      )}
    </>
  )
}

// The tool for scenes whose Location is old text (typed before places existed): turn the texts that are checked into places on this map, and drop the rest.
function OldLocations({ m, draft, scenes, onSetLocation }: { m: Maps; draft: MapDraft; scenes: ScenePlace[]; onSetLocation?: (id: string, location: string) => void }) {
  const counts = new Map<string, number>()
  for (const sc of scenes) {
    const text = sc.location.trim()
    if (text !== '' && !looksLikePlaceKey(text)) counts.set(text, (counts.get(text) ?? 0) + 1)
  }
  const texts = [...counts.keys()].sort((a, b) => a.localeCompare(b))
  const [off, setOff] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  if (texts.length === 0 || !onSetLocation) return null
  const chosen = texts.filter(t => !off.has(t))

  async function convert() {
    const r = addPlaces(draft, chosen)
    if (!r) return
    setBusy(true)
    m.apply(r.change)
    // The places are saved before any scene points at them.
    await m.saveNow()
    chosen.forEach((text, i) => {
      for (const sc of scenes) if (sc.location.trim() === text) onSetLocation!(sc.id, placeKey(draft.id, r.ids[i]))
    })
    setBusy(false)
  }
  function dropRest() {
    setConfirming(false)
    for (const sc of scenes) {
      const text = sc.location.trim()
      if (text !== '' && !looksLikePlaceKey(text)) onSetLocation!(sc.id, '')
    }
  }

  return (
    <section className="mapPanel" aria-label="Old locations">
      <header className="mapPanelHead"><h3 className="mapPanelTitle">Old locations</h3></header>
      <p className="mapHint">These scenes have a Location typed before places existed. Make places of the texts you want to keep, here on {draft.title}; the rest can be dropped.</p>
      <ul className="mapOld">
        {texts.map(t => (
          <li key={t}>
            <label className="mapCheck">
              <input type="checkbox" checked={!off.has(t)} onChange={e => setOff(prev => { const next = new Set(prev); if (e.target.checked) next.delete(t); else next.add(t); return next })} />
              <span>{t}</span><span className="mapHint">{counts.get(t)} {counts.get(t) === 1 ? 'scene' : 'scenes'}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mapRow">
        <button type="button" className="mapChip" disabled={chosen.length === 0 || busy} onClick={() => { void convert() }}>Make places of the checked texts</button>
        {confirming ? (
          <span className="mapConfirm" role="group" aria-label="Drop the old locations?">
            <button type="button" className="mapIconBtn" aria-label="Confirm drop" title="Drop every old location that is still text" onClick={dropRest}><CheckIcon size={16} /></button>
            <button type="button" className="mapIconBtn" aria-label="Cancel drop" title="Cancel" onClick={() => setConfirming(false)}><CloseIcon size={16} /></button>
          </span>
        ) : (
          <button type="button" className="mapChip" onClick={() => setConfirming(true)}>Drop the old texts</button>
        )}
      </div>
    </section>
  )
}

// Save the map as an image: a size, and which layers are in it.
function ExportPanel({ draft, biomes }: { draft: MapDraft; biomes: BiomesView }) {
  const [scale, setScale] = useState<ExportScale>(1)
  const [off, setOff] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const chosen = new Set(draft.layers.map(l => l.id).filter(id => !off.has(id)))
  const size = exportSize(draft.width, draft.height, scale)

  async function save() {
    setNote('')
    const r = await exportMapImage(draft, biomes.index, scale, chosen)
    if (r === 'unavailable') setNote('The image could not be made.')
  }

  return (
    <section className="mapPanel" aria-label="Export">
      <header className="mapPanelHead">
        <h3 className="mapPanelTitle">Image</h3>
        <button type="button" className="mapIconBtn" aria-label="Save the map as an image" title={`Save as a PNG, ${size.width} × ${size.height} pixels`} onClick={() => { void save() }}><ImageIcon size={16} /></button>
      </header>
      <div className="mapSizes" role="group" aria-label="Size of the image">
        {EXPORT_SCALES.map(n => <button key={n} type="button" className="mapChip" aria-pressed={scale === n} title={`${exportSize(draft.width, draft.height, n).width} × ${exportSize(draft.width, draft.height, n).height} pixels`} onClick={() => setScale(n)}>{n}×</button>)}
      </div>
      <div className="mapChecks" role="group" aria-label="Layers in the image">
        {draft.layers.map(l => (
          <label key={l.id} className="mapCheck">
            <input type="checkbox" checked={!off.has(l.id)} onChange={e => setOff(prev => { const next = new Set(prev); if (e.target.checked) next.delete(l.id); else next.add(l.id); return next })} />{l.name}
          </label>
        ))}
      </div>
      <p className="mapHint">{size.width} × {size.height} pixels. The scale bar, compass and legend that are on are in it; a layer that is hidden is left out.</p>
      {note && <p className="mapHint" role="alert">{note}</p>}
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

// What is chosen on the map: a biome area (its biome and height), a symbol (its width and colour), a label (its text and height) or a line or region (how it
// is drawn), and a delete. An area or a symbol can be named, which makes it a place.
function InspectorPanel({ projectId, plotNodes, onOpenPlot, outline, onOpenScene, m, draft, selected, fresh, onDeleted, scenes, biomes }: { projectId: string; plotNodes: PlotNode[]; onOpenPlot?: (nodeId: string) => void; outline?: OutlineNode[]; onOpenScene?: (nodeId: string) => void; m: Maps; draft: MapDraft; selected: ItemRef; fresh: boolean; onDeleted: () => void; scenes: ScenePlace[]; biomes: BiomesView }) {
  const item = findItem(draft, selected)
  if (!item) return null
  const remove = () => { m.apply(removeItem(draft, selected)); onDeleted() }
  const place = <PlaceFields projectId={projectId} plotNodes={plotNodes} onOpenPlot={onOpenPlot} outline={outline} onOpenScene={onOpenScene} m={m} draft={draft} item={selected} scenes={scenes} />
  if (selected.kind === 'shape') {
    const sh = draft.shapes.find(y => y.id === selected.id)!
    const order = (
      <div className="mapSizes" role="group" aria-label="Order">
        <button type="button" className="mapChip" onClick={() => m.apply(moveShapeOrder(draft, sh.id, 'front'))}>Bring to front</button>
        <button type="button" className="mapChip" onClick={() => m.apply(moveShapeOrder(draft, sh.id, 'back'))}>Send to back</button>
      </div>
    )
    const curves = (
      <div className="mapSizes" role="group" aria-label="Curves">
        <button type="button" className="mapChip" onClick={() => m.apply(replaceShape(draft, setAllSmooth(sh, true)))}>Curve all points</button>
        <button type="button" className="mapChip" onClick={() => m.apply(replaceShape(draft, setAllSmooth(sh, false)))}>Straighten all points</button>
      </div>
    )
    if (sh.type === 'biome') {
      const offered = offeredBiomes(biomes.index, draft.level)
      const current = sh.biome ? resolveBiome(biomes.index, sh.biome) : null
      const unit = heightUnit(draft.units)
      return (
        <section className="mapPanel" aria-label="Chosen biome area">
          <header className="mapPanelHead">
            <h3 className="mapPanelTitle">{sh.name || (current ? current.name : 'Height only')}</h3>
            <button type="button" className="mapIconBtn" aria-label="Delete the biome area" title="Delete (Delete key)" onClick={remove}><TrashIcon size={16} /></button>
          </header>
          <div className="mapFields">
            <Field label="Biome">
              <span className="mapRow">
                {current && <span className="mapSwatch" style={{ background: current.color }} aria-hidden="true" />}
                <select className="mapSelect" aria-label="Biome of the area" value={sh.biome ?? ''} onChange={e => m.apply(editShape(draft, sh.id, { biome: e.target.value || null }))}>
                  <option value="">None: keeps the biome under it</option>
                  {current && !offered.some(b => b.id === current.id) && <option value={current.id}>{current.name}</option>}
                  {offered.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </span>
            </Field>
            <Field label="Height">
              <select className="mapSelect" aria-label="What the area does to the height" value={sh.heightMode ?? 'none'} onChange={e => m.apply(editShape(draft, sh.id, { heightMode: e.target.value as MapHeightMode }))}>
                {HEIGHT_MODES.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </Field>
            {(sh.heightMode ?? 'none') !== 'none' && (
              <Field label={sh.heightMode === 'set' ? `Height (${unit})` : `By (${unit})`} short>
                <CommitNumber label={`Height in ${unit === 'm' ? 'metres' : 'feet'}`} value={sh.height ?? 0} min={sh.heightMode === 'set' ? -HEIGHT_LIMIT : 0} max={HEIGHT_LIMIT} step={unit === 'm' ? 50 : 100} onCommit={height => m.apply(editShape(draft, sh.id, { height }))} />
              </Field>
            )}
          </div>
          {order}
          {curves}
          {place}
          <p className="mapHint">Higher land is drawn lighter, lower land darker. Drag the area, a point (square) or a handle (circle); double-click the outline to put a point in.</p>
        </section>
      )
    }
    const kind = sh.type === 'region' ? 'region' : 'line'
    return (
      <section className="mapPanel" aria-label={`Chosen ${kind}`}>
        <header className="mapPanelHead">
          <h3 className="mapPanelTitle">{sh.type === 'region' ? (sh.name || 'Region') : 'Line'}</h3>
          <button type="button" className="mapIconBtn" aria-label={`Delete the ${kind}`} title="Delete (Delete key)" onClick={remove}><TrashIcon size={16} /></button>
        </header>
        <ShapeFields type={sh.type} value={sh} onChange={patch => m.apply(editShape(draft, sh.id, patch))} />
        {order}
        {curves}
        {sh.type === 'region' && place}
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
                type="button" className="mapIconBtn" aria-label="Use the ink colour" title="Use the ink colour" disabled={s.color === null}
                onClick={() => m.apply(editSymbol(draft, s.id, { color: null }))}
              ><RestoreIcon size={16} /></button>
            </span>
          </Field>
        </div>
        {place}
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

// The biomes: what lies under everything (the base, a biome and its height), the biomes the map's level offers (choosing one draws a biome area in it),
// and the project's own biomes (added here, renamed and recoloured; one a map still uses is kept, no longer offered, when it is removed). The admin's
// biomes and their colours are set in Configuration > Maps.
function BiomesPanel({ projectId, m, draft, biomes, biome, onBiome, smooth, onSmooth }: { projectId: string; m: Maps; draft: MapDraft; biomes: BiomesView; biome: string; onBiome: (id: string) => void; smooth: boolean; onSmooth: (on: boolean) => void }) {
  const offered = offeredBiomes(biomes.index, draft.level)
  const counts = useMemo(() => biomeCounts(draft), [draft])
  const own = biomes.own.filter(b => !b.retired)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const unit = heightUnit(draft.units)
  const base = resolveBiome(biomes.index, draft.base.biome)
  const mine = own.find(b => b.id === editing)

  async function add() {
    const fresh: MapBiome = {
      id: ownBiomeId(biomes.own.map(b => b.id)), name: 'New biome', color: NEW_BIOME_COLOURS[biomes.own.length % NEW_BIOME_COLOURS.length],
      group: levelDef(draft.level).drawn === 'materials' ? 'material' : levelDef(draft.level).drawn === 'space' ? 'space' : 'land', levels: [], retired: false,
    }
    if (await saveOwnBiomes(projectId, [...biomes.own, fresh])) { setEditing(fresh.id); onBiome(fresh.id) }
  }
  const editOwn = (id: string, patch: Partial<MapBiome>) => { void saveOwnBiomes(projectId, biomes.own.map(b => (b.id === id ? { ...b, ...patch } : b))) }
  function removeOwn(id: string) {
    setConfirming(null)
    setEditing(null)
    void saveOwnBiomes(projectId, biomes.own.filter(b => b.id !== id))
  }

  return (
    <section className="mapPanel" aria-label="Biomes">
      <header className="mapPanelHead">
        <h3 className="mapPanelTitle">{levelDef(draft.level).drawn === 'materials' ? 'Floors' : 'Biomes'}</h3>
        <button type="button" className="mapIconBtn" aria-label="Add a biome of this project" title="Add a biome of this project" disabled={biomes.own.length >= MAP_MAX_PROJECT_BIOMES} onClick={() => { void add() }}><PlusIcon size={16} /></button>
      </header>
      <div className="mapFields">
        <Field label="Base">
          <span className="mapRow">
            <span className="mapSwatch" style={{ background: base.color }} aria-hidden="true" />
            <select className="mapSelect" aria-label="Biome under everything" value={draft.base.biome} onChange={e => m.apply(setBase(draft, { biome: e.target.value }))}>
              {!offered.some(b => b.id === base.id) && <option value={base.id}>{base.name}</option>}
              {offered.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </span>
        </Field>
        {levelDef(draft.level).drawn === 'biomes' && (
          <Field label={`Base height (${unit})`} short>
            <CommitNumber label={`Height of the base in ${unit === 'm' ? 'metres' : 'feet'}`} value={draft.base.height} min={-HEIGHT_LIMIT} max={HEIGHT_LIMIT} step={unit === 'm' ? 50 : 100} onCommit={height => m.apply(setBase(draft, { height }))} />
          </Field>
        )}
      </div>
      <ul className="mapTerrains">
        {offered.map(b => (
          <li key={b.id}>
            <button
              type="button" className={`mapTerrain${b.id === biome ? ' mapTerrain--on' : ''}`} aria-pressed={b.id === biome} aria-label={`Draw with ${b.name}`}
              title={`Draw a biome area of ${b.name}`} onClick={() => onBiome(b.id)}
            >
              <span className="mapSwatch" style={{ background: b.color }} aria-hidden="true" />
              <span className="mapTerrainName">{b.name}{b.id.startsWith('own_') ? ' (this project)' : ''}</span>
              {(counts.get(b.id) ?? 0) > 0 && <span className="mapTerrainCount" title={`${counts.get(b.id)} areas`}>{counts.get(b.id)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {own.length > 0 && (
        <div className="mapRow" role="group" aria-label="This project's biomes">
          <select className="mapSelect" aria-label="A biome of this project to change" value={editing ?? ''} onChange={e => setEditing(e.target.value || null)}>
            <option value="">Change a biome of this project…</option>
            {own.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      {mine && (
        <div className="mapEdit">
          <div className="mapRow">
            <ColourInput label={`Colour of ${mine.name}`} value={mine.color} onCommit={color => editOwn(mine.id, { color })} />
            <CommitText label={`Name of ${mine.name}`} value={mine.name} max={40} onCommit={name => editOwn(mine.id, { name })} />
            {confirming === mine.id ? (
              <span className="mapConfirm" role="group" aria-label={`Remove ${mine.name}?`}>
                <button type="button" className="mapIconBtn" aria-label="Confirm remove" title="Confirm remove" onClick={() => removeOwn(mine.id)}><CheckIcon size={16} /></button>
                <button type="button" className="mapIconBtn" aria-label="Cancel remove" title="Cancel" onClick={() => setConfirming(null)}><CloseIcon size={16} /></button>
              </span>
            ) : (
              <button type="button" className="mapIconBtn" aria-label={`Remove ${mine.name}`} title={`Remove ${mine.name}`} onClick={() => setConfirming(mine.id)}><TrashIcon size={16} /></button>
            )}
          </div>
          {confirming === mine.id && <p className="mapHint">Maps that use it keep its colour; it is no longer offered.</p>}
        </div>
      )}
      <label className="mapCheck"><input type="checkbox" checked={smooth} onChange={e => onSmooth(e.target.checked)} />Curve the points of new areas</label>
      <p className="mapHint">Choose a biome, then click on the map to draw its outline; double-click or Enter finishes. Later areas lie over earlier ones. Higher land is drawn lighter, lower land darker.</p>
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
              type="button" className="mapIconBtn" aria-label={`Delete ${layer.name}`} title={layer.kind === 'terrain' ? 'The biomes layer stays' : 'Delete'}
              disabled={layer.kind === 'terrain'} onClick={() => m.apply(removeLayer(draft, layer.id))}
            ><TrashIcon size={16} /></button>
          </li>
        ))}
      </ul>
      <p className="mapHint">Things are placed on the top layer of their kind that is shown and not locked. A line or region goes on the top shown, unlocked layer of regions and lines; a biome area on the biomes layer.</p>
    </section>
  )
}

function MapFieldsPanel({ m, draft, points }: { m: Maps; draft: MapDraft; points: StoryPoint[] }) {
  // A move to another unit system asks first: convert the numbers, or keep them and only rename the units.
  const [asking, setAsking] = useState<MapUnits | null>(null)
  const units = draft.units ?? 'custom'
  const offeredUnits = unitsOf(units)
  function chooseUnits(next: MapUnits) {
    if (next === units) return
    // Into custom, or out of it, nothing is converted: no question.
    if (next === 'custom' || units === 'custom') m.apply(setUnits(draft, next, 'keep'))
    else setAsking(next)
  }
  function answer(mode: ConvertMode) {
    if (asking) m.apply(setUnits(draft, asking, mode))
    setAsking(null)
  }
  return (
    <section className="mapPanel" aria-label="Map">
      <header className="mapPanelHead"><h3 className="mapPanelTitle">Map</h3></header>
      <div className="mapFields">
        <Field label="Title"><CommitText label="Map title" value={draft.title} max={MAP_TITLE_MAX} onCommit={title => m.apply(setTitle(draft, title))} /></Field>
        <Field label="Level">
          <select className="mapSelect" aria-label="Level of the map" value={draft.level} onChange={e => m.apply(setLevel(draft, e.target.value as MapLevel))}>
            {LEVELS.map(lv => <option key={lv.id} value={lv.id}>{lv.name}: {lv.holds}</option>)}
          </select>
        </Field>
        <div className="mapRow">
          <Field label="Width" short><CommitNumber label="Width in cells" value={draft.width} min={1} max={MAP_MAX_SIDE} onCommit={w => m.apply(resize(draft, w, draft.height))} /></Field>
          <Field label="Height" short><CommitNumber label="Height in cells" value={draft.height} min={1} max={MAP_MAX_SIDE} onCommit={h => m.apply(resize(draft, draft.width, h))} /></Field>
        </div>
        <Field label="Units">
          <select className="mapSelect" aria-label="Unit system of the map" value={asking ?? units} onChange={e => chooseUnits(e.target.value as MapUnits)}>
            {UNIT_SYSTEMS.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        {asking && (
          <div className="mapConfirm" role="group" aria-label={`Change to ${asking} units`}>
            <span className="mapHint">Change to {asking} units:</span>
            <button type="button" className="mapChip" onClick={() => answer('convert')}>Convert the numbers</button>
            <button type="button" className="mapChip" onClick={() => answer('keep')}>Keep the numbers</button>
            <button type="button" className="mapIconBtn" aria-label="Cancel the change of units" title="Cancel" onClick={() => setAsking(null)}><CloseIcon size={16} /></button>
          </div>
        )}
        <div className="mapRow">
          <Field label="One cell is" short><CommitNumber label="Size of one cell" value={draft.cellSize} min={0.001} max={1_000_000} step="any" onCommit={s => m.apply(setScale(draft, s, draft.unit))} /></Field>
          <Field label="Unit" short>
            {units === 'custom' ? (
              <CommitText label="Unit of a cell" value={draft.unit} max={20} className="mapInput mapInput--unit" onCommit={u => m.apply(setScale(draft, draft.cellSize, u))} />
            ) : (
              <select className="mapSelect" aria-label="Unit of a cell" value={draft.unit} onChange={e => m.apply(setScale(draft, draft.cellSize, e.target.value))}>
                {!offeredUnits.some(u => u.id === draft.unit) && <option value={draft.unit}>{draft.unit}</option>}
                {offeredUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
          </Field>
        </div>
        {draft.versionOf ? (
          <Field label="True from">
            <select className="mapSelect" aria-label="This version is true from" value={draft.appliesFrom ?? ''} onChange={e => m.apply(setAppliesFrom(draft, e.target.value || null))}>
              <option value="">Not placed yet</option>
              {draft.appliesFrom && !points.some(p => p.id === draft.appliesFrom) && <option value={draft.appliesFrom}>A part of the book that is gone</option>}
              {points.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Inside">
            <select className="mapSelect" aria-label="Inside which map" value={draft.parentId ?? ''} onChange={e => m.apply(setParent(draft, e.target.value || null))}>
              <option value="">No map (a top-level map)</option>
              {m.maps.filter(x => x.id !== draft.id && !x.versionOf && !descendantIds(m.maps, draft.id).has(x.id)).map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
          </Field>
        )}
        <Field label="A day's travel" short>
          <span className="mapRow">
            <CommitNumber label="How far a traveller goes in a day" value={draft.pace ?? 0} min={0} max={1_000_000} step="any" onCommit={n => m.apply(setPace(draft, n > 0 ? n : null))} />
            <span className="mapHint">{draft.unit} (0: not set)</span>
          </span>
        </Field>
        <div className="mapChecks" role="group" aria-label="Drawn over the map">
          {([['scaleBar', 'Scale bar'], ['compass', 'Compass'], ['legend', 'Legend']] as const).map(([field, label]) => (
            <label key={field} className="mapCheck"><input type="checkbox" checked={draft[field]} onChange={e => m.apply(setOverlay(draft, field, e.target.checked))} />{label}</label>
          ))}
        </div>
        <p className="mapHint">The map covers {roundNice(draft.width * draft.cellSize)} × {roundNice(draft.height * draft.cellSize)} {draft.unit}. The grid shows the scale; a new size keeps every shape where it is.</p>
      </div>
    </section>
  )
}
