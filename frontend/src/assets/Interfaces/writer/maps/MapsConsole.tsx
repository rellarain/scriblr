import { useEffect, useMemo, useRef, useState } from 'react'
import { storyPoints } from '../characters/story'
import { useCast } from '../characters/castStore'
import type { JourneyState } from './JourneysPanel'
import type { OutlineNode, PlotNode } from '../../../../api/types'
import { hasPending, usePendingOpen } from '../links/worldNav'
import { SaveCluster } from '../../../../components/SaveCluster'
import { setAutosaveMode, useSettings } from '../../../../settings/settingsStore'
import { autosaveModeOf } from '../../../../theme/types'
import { FollowIcon, BiomeIcon, ChevronLeftIcon, CursorIcon, GridLinesIcon, HandIcon, PathIcon, PolygonIcon, RedoIcon, RulerIcon, StampIcon, TextSizeIcon } from '../../../icons'
import MapCanvas, { type MapTool } from './MapCanvas'
import { MapList } from './MapList'
import { VersionBar } from './VersionBar'
import { addStop, journeysOf, whereAt } from './mapJourneys'
import type { JourneyView } from './mapDrawJourneys'
import { MapSide } from './MapSide'
import { addBiomeShape, addLabel, addShape, addSymbol, findItem, removeItem, replaceShape, type AreaLook, type ItemRef } from './mapItems'
import { mapPath } from './mapModel'
import { offeredBiomes, resolveBiome, useBiomes } from './mapBiomes'
import { heightAt, heightsOf } from './mapHeights'
import { POLITICAL_LEVELS } from './mapLevels'
import { formatHeight } from './mapUnits'
import { DEFAULT_LINE_PEN, DEFAULT_REGION_PEN, hitShape, type Pen } from './mapShapes'
import { DEFAULT_SYMBOL_SIZE, symbolName } from './mapSymbols'
import { formatDistance } from './mapView'
import { useMaps } from './useMaps'
import './maps.scss'

const TOOLS: Array<{ tool: MapTool; label: string; Icon: typeof BiomeIcon }> = [
  { tool: 'select', label: 'Select and move', Icon: CursorIcon },
  { tool: 'biome', label: 'Draw a biome area', Icon: BiomeIcon },
  { tool: 'symbol', label: 'Stamp a symbol', Icon: StampIcon },
  { tool: 'label', label: 'Place a label', Icon: TextSizeIcon },
  { tool: 'line', label: 'Draw a line', Icon: PathIcon },
  { tool: 'region', label: 'Draw a region', Icon: PolygonIcon },
  { tool: 'measure', label: 'Measure a distance', Icon: RulerIcon },
  { tool: 'journey', label: 'Add a stop to a journey', Icon: FollowIcon },
  { tool: 'hand', label: 'Move the view', Icon: HandIcon },
]
const NEW_LABEL_SIZE = 1.5

// The view of a map, remembered on this computer for each map: its biomes, or its nations (planetary to regional maps).
export type MapViewMode = 'biomes' | 'nations'
const viewKey = (mapId: string) => `scriblr.maps.view.${mapId}`
function readView(mapId: string): MapViewMode {
  try { return localStorage.getItem(viewKey(mapId)) === 'nations' ? 'nations' : 'biomes' } catch { return 'biomes' }
}
function keepView(mapId: string, mode: MapViewMode) {
  try { if (mode === 'nations') localStorage.setItem(viewKey(mapId), mode); else localStorage.removeItem(viewKey(mapId)) } catch { /* not kept */ }
}

// Project > Maps: the maps of the setting, each of a level (intergalactic down to interior). A list of maps (nested ones under the map they are in), the open
// map as a canvas to draw biome areas, lines and regions on and to stamp symbols and place labels on (pan and zoom, a pointer that picks and moves things,
// undo), and beside it the biomes, the symbols, the pens, the layers and the map's own fields (its level, units, the scale bar, compass and legend). Edits
// save the way the Writer's do: the Save button, and autosave when the user has turned it on.
// A scene of the project, for the places: its location is the key of a place (or old text, from before there were places).
export interface ScenePlace { id: string; title: string; location: string }

export default function MapsConsole({ projectId, scenes = [], onSetLocation, plotNodes = [], onOpenPlot, outline = [], onOpenScene }: {
  projectId: string
  // The outline, for the points of the story that versions and journeys are tied to.
  outline?: OutlineNode[]
  scenes?: ScenePlace[]
  // The plot's nodes, to link a place to, and how to open one.
  plotNodes?: PlotNode[]
  onOpenPlot?: (nodeId: string) => void
  onOpenScene?: (nodeId: string) => void
  // Give a scene another location (a place key, or '' for none): what the old-locations tool changes.
  onSetLocation?: (sceneId: string, location: string) => void
}) {
  const m = useMaps(projectId)
  const biomes = useBiomes(projectId)
  const points = useMemo(() => storyPoints(outline), [outline])
  const { cast } = useCast(projectId)
  const [journey, setJourney] = useState<JourneyState>({ journeyId: null, showPaths: true, atPoint: '', stopPoint: '' })
  const { ui } = useSettings()
  const [tool, setTool] = useState<MapTool>('select')
  // The biome a new biome area is made in (one the map's level offers; the first it offers when this one is not).
  const [biome, setBiome] = useState('forest')
  // New biome areas have curved points (smooth outlines) unless this is off, and what they do to the height.
  const [biomeSmooth, setBiomeSmooth] = useState(true)
  const [areaLook, setAreaLook] = useState<AreaLook>({ heightMode: 'none', height: 500, profile: 'hill', slope: 0 })
  // The Biomes or Nations view of the open map.
  const [viewMode, setViewMode] = useState<MapViewMode>('biomes')
  const [grid, setGrid] = useState(true)
  const [hoverAt, setHoverAt] = useState<[number, number] | null>(null)
  const [symbolKind, setSymbolKind] = useState('village')
  const [symbolSize, setSymbolSize] = useState(DEFAULT_SYMBOL_SIZE)
  // What new lines and regions are drawn with, one pen for each.
  const [linePen, setLinePen] = useState<Pen>(DEFAULT_LINE_PEN)
  const [regionPen, setRegionPen] = useState<Pen>(DEFAULT_REGION_PEN)
  const [picked, setPicked] = useState<ItemRef | null>(null)
  // The label that was just placed: its text takes the cursor.
  const [fresh, setFresh] = useState<string | null>(null)
  const [hover, setHover] = useState<[number, number] | null>(null)
  // What the Measure tool says of its path.
  const [measured, setMeasured] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const { draft } = m

  // The first map opens by itself.
  useEffect(() => {
    if (m.status === 'ready' && m.openId === null && m.maps.length > 0 && !hasPending('place')) void m.open(m.maps[0].id)
    // Only when the list has loaded (opening is not repeated after a map is closed by deleting it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.status])
  useEffect(() => { setBlocked(false); setPicked(null); setFresh(null); setMeasured(null); setJourney(j => ({ ...j, journeyId: null })); setViewMode(m.openId ? readView(m.openId) : 'biomes') }, [m.openId])
  // A link from another console asked for a place: its map opens, and the place (a symbol or an area) is chosen on it.
  const wanted = useRef<{ mapId: string; placeId: string } | null>(null)
  const pickPlace = (doc: NonNullable<typeof draft>, placeId: string) => {
    if (doc.symbols.some(s => s.id === placeId)) setPicked({ kind: 'symbol', id: placeId })
    else if (doc.shapes.some(s => s.id === placeId)) setPicked({ kind: 'shape', id: placeId })
  }
  usePendingOpen('place', m.status === 'ready', key => {
    const [mapId, placeId] = key.split('/')
    wanted.current = { mapId, placeId }
    if (m.openId === mapId && m.draft) pickPlace(m.draft, placeId)
    else void m.open(mapId)
  })
  useEffect(() => {
    const want = wanted.current
    if (!want || !m.draft || m.draft.id !== want.mapId) return
    wanted.current = null
    pickPlace(m.draft, want.placeId)
  }, [m.openId, m.draft])
  // The chosen biome stays one the map's level offers, and the chosen item one that is still on it (an undo can take it away).
  const offered = draft ? offeredBiomes(biomes.index, draft.level) : []
  const chosenBiome = offered.some(b => b.id === biome) ? biome : offered[0]?.id ?? biome
  const selected = draft && picked && findItem(draft, picked) ? picked : null

  // The journeys as the canvas draws them, and a click of the Journey tool: a stop at a cell of the chosen journey, from the point new stops are from.
  const journeyView = useMemo<JourneyView | undefined>(() => {
    if (!draft || (journeysOf(draft).length === 0)) return undefined
    return {
      list: journeysOf(draft), names: new Map(cast.map(c => [c.id, c.name])), selectedId: journey.journeyId, showPaths: journey.showPaths,
      at: journey.atPoint ? whereAt(journeysOf(draft), points, journey.atPoint) : null,
    }
  }, [draft, cast, journey, points])
  if (m.status === 'error') {
    return (
      <div className="mapNote" role="alert">
        <p>{m.loadError ?? 'The maps could not be loaded.'}</p>
        <button type="button" className="mapIconBtn" aria-label="Try loading again" title="Try loading again" onClick={() => { void m.reload() }}><RedoIcon size={18} /></button>
      </div>
    )
  }
  if (m.status === 'loading') return <p className="mapNote" role="status">Loading the maps…</p>

  const penType = tool === 'region' ? 'region' : 'line'
  const pen = tool === 'biome' ? { ...regionPen, smooth: biomeSmooth } : penType === 'region' ? regionPen : linePen
  // The land under the pointer: the topmost biome area there with a biome, or the base, and the height there (none on a map of space or a building).
  const nationsShown = Boolean(draft && POLITICAL_LEVELS.includes(draft.level) && viewMode === 'nations')
  const under = (() => {
    if (!hoverAt || !draft) return null
    let id = draft.base.biome
    for (const s of draft.shapes) if (s.type === 'biome' && s.biome && hitShape(s, hoverAt[0], hoverAt[1], 0)) id = s.biome
    const grid = heightsOf(draft, biomes.index)
    return { name: resolveBiome(biomes.index, id).name, height: grid ? heightAt(grid, hoverAt[0], hoverAt[1]) : null }
  })()

  // Stamp a symbol, or put a label (which then takes the cursor in the side panel, ready to be given its text).
  function place(kind: 'symbol' | 'label', x: number, y: number): boolean {
    if (!draft) return false
    setBlocked(false)
    if (kind === 'symbol') {
      const r = addSymbol(draft, symbolKind, x, y, symbolSize)
      if (!r || !m.apply(r.change)) return false
      setPicked({ kind: 'symbol', id: r.id })
      setFresh(null)
      return true
    }
    const r = addLabel(draft, 'New label', x, y, NEW_LABEL_SIZE)
    if (!r || !m.apply(r.change)) return false
    setPicked({ kind: 'label', id: r.id })
    setFresh(r.id)
    setTool('select')
    return true
  }

  // A shape that was drawn: a biome area goes on the biomes layer, a line or region on the top shown, unlocked layer of shapes; it is chosen, so its points
  // can be fixed straight away.
  function finishShape(type: 'line' | 'region' | 'biome', points: Array<[number, number]>): boolean {
    if (!draft) return false
    setBlocked(false)
    const r = type === 'biome' ? addBiomeShape(draft, points, chosenBiome, biomeSmooth, undefined, areaLook) : addShape(draft, type, points, type === 'region' ? regionPen : linePen)
    if (!r || !m.apply(r.change)) return false
    setPicked({ kind: 'shape', id: r.id })
    setFresh(null)
    return true
  }

  function removeChosen() {
    if (!draft || !selected) return
    m.apply(removeItem(draft, selected))
    setPicked(null)
  }

  function addJourneyStop(x: number, y: number): boolean {
    if (!draft || !journey.journeyId) return false
    const made = addStop(draft, journey.journeyId, x, y, journey.stopPoint, points)
    return made !== null && m.apply(made.change)
  }

  const path = draft ? mapPath(m.maps, draft.id) : []
  const hint = tool === 'line' || tool === 'region' || tool === 'biome' ? ' · click to add points, double-click or Enter to finish, Esc to cancel' : ''
  const shapeKind = (id: string) => ({ region: 'Region', line: 'Line', biome: 'Biome area' } as const)[draft?.shapes.find(s => s.id === id)?.type ?? 'line']
  const statusText = hover
    ? `Cell ${hover[0] + 1}, ${hover[1] + 1}${under ? ` · ${under.name}${under.height !== null ? `, ${formatHeight(under.height, draft?.units)}` : ''}` : ''}`
    : selected && draft
      ? (selected.kind === 'symbol' ? `${symbolName(draft.symbols.find(s => s.id === selected.id)?.kind ?? '')} chosen` : selected.kind === 'shape' ? `${shapeKind(selected.id)} chosen` : 'Label chosen')
      : `${draft?.width ?? 0} × ${draft?.height ?? 0} cells`

  return (
    <div className="mapPage">
      <div className="mapBar">
        <h2 className="mapBarTitle">Maps</h2>
        {draft && (
          <div className="mapTools" role="toolbar" aria-label="Map tools">
            {TOOLS.map(({ tool: t, label, Icon }) => (
              <button key={t} type="button" className="mapIconBtn" aria-pressed={tool === t} aria-label={label} title={label} onClick={() => setTool(t)}><Icon size={18} /></button>
            ))}
            <span className="mapSep" aria-hidden="true" />
            <button type="button" className="mapIconBtn" aria-pressed={grid} aria-label="Grid" title="Show the grid" onClick={() => setGrid(g => !g)}><GridLinesIcon size={18} /></button>
            {POLITICAL_LEVELS.includes(draft.level) && (
              <span className="mapViewSwitch" role="group" aria-label="View of the map">
                {(['biomes', 'nations'] as const).map(mode => (
                  <button
                    key={mode} type="button" className="mapChip" aria-pressed={viewMode === mode}
                    title={mode === 'biomes' ? 'The land in its biomes, shaded by height' : 'The nations, states and municipalities, each in its own colour'}
                    onClick={() => { setViewMode(mode); keepView(draft.id, mode) }}
                  >{mode === 'biomes' ? 'Biomes' : 'Nations'}</button>
                ))}
              </span>
            )}
          </div>
        )}
        <SaveCluster
          status={m.saveStatus} onSave={() => { void m.saveNow() }} scope=".mapPage"
          history={{ canUndo: m.canUndo, canRedo: m.canRedo, onUndo: m.undo, onRedo: m.redo }}
          autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: m.saveCountdown.nextSaveAt, wait: m.saveCountdown.wait }}
        />
      </div>
      {m.saveStatus.error && <p className="mapNote mapNote--error" role="alert">{m.saveStatus.error}</p>}
      {m.notice && <p className="mapNote mapNote--error" role="alert">{m.notice}</p>}
      {blocked && <p className="mapNote mapNote--error" role="status">There is no shown, unlocked layer to put that on: show or unlock one in Layers.</p>}
      <div className="mapSplit">
        <MapList m={m} points={points} />
        {draft ? (
          <>
            <div className="mapStage">
              {path.length > 1 && (
                <nav className="mapPath" aria-label="Where this map is">
                  <button type="button" className="mapIconBtn" aria-label={`Up to ${path[path.length - 2].title}`} title={`Up to ${path[path.length - 2].title}`} onClick={() => { void m.open(path[path.length - 2].id) }}><ChevronLeftIcon size={16} /></button>
                  <ol className="mapCrumbs">
                    {path.map((p, i) => (
                      <li key={p.id}>{i < path.length - 1 ? <button type="button" className="mapCrumb" onClick={() => { void m.open(p.id) }}>{p.title}</button> : <span className="mapCrumb mapCrumb--here" aria-current="page">{p.title}</span>}</li>
                    ))}
                  </ol>
                </nav>
              )}
              <VersionBar m={m} draft={draft} points={points} />
              <MapCanvas
                draft={draft} biomes={biomes.index} biome={chosenBiome} tool={tool} showGrid={grid} pen={pen} selected={selected} onSelect={setPicked}
                onPlace={place} onFinishShape={finishShape} onPreview={m.preview} onCommitMove={m.commitMove} onChangeShape={shape => { m.apply(replaceShape(draft, shape)) }} onDelete={removeChosen}
                onOpenPlace={id => { void m.open(id) }} onMeasure={setMeasured}
                onHover={(cell, at) => { setHover(cell); setHoverAt(at ?? null) }} onBlocked={() => setBlocked(true)}
                journeys={journeyView} onAddStop={addJourneyStop} nations={nationsShown}
              />
              <p className="mapStatus" aria-live="off">{tool === 'measure' && measured !== null ? `${measured} · click to add a point, Backspace takes one back, Esc clears` : `${statusText} · ${formatDistance(draft.width * draft.cellSize, draft.unit)} wide${tool === 'measure' ? ' · click to start measuring' : hint}`}</p>
            </div>
            <MapSide
              projectId={projectId} plotNodes={plotNodes} onOpenPlot={onOpenPlot} outline={outline} onOpenScene={onOpenScene} m={m} draft={draft}
              biomes={biomes} biome={chosenBiome} onBiome={id => { setBiome(id); setTool('biome') }} biomeSmooth={biomeSmooth} onBiomeSmooth={setBiomeSmooth}
              areaLook={areaLook} onAreaLook={patch => setAreaLook(old => ({ ...old, ...patch }))}
              symbolKind={symbolKind} onSymbolKind={id => { setSymbolKind(id); setTool('symbol') }} symbolSize={symbolSize} onSymbolSize={setSymbolSize}
              pen={pen} penType={penType}
              onPen={patch => (penType === 'region' ? setRegionPen : setLinePen)(old => ({ ...old, ...patch }))}
              onPreset={(type, next) => { (type === 'region' ? setRegionPen : setLinePen)(next); setTool(type) }}
              selected={selected} fresh={selected !== null && fresh === selected.id} onDeleted={() => setPicked(null)}
              scenes={scenes} onSetLocation={onSetLocation}
              points={points} cast={cast} journey={journey} onJourney={patch => setJourney(j => ({ ...j, ...patch }))} onJourneyTool={() => setTool('journey')}
            />
          </>
        ) : (
          <p className="mapNote mapEmpty">{m.maps.length === 0 ? 'Make a map to start: a star system, a planet, a nation, a town or a building.' : 'Pick a map in the list to open it.'}</p>
        )}
      </div>
    </div>
  )
}
