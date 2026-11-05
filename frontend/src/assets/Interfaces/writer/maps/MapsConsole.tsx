import { useEffect, useState } from 'react'
import { SaveCluster } from '../../../../components/SaveCluster'
import { setAutosaveMode, useSettings } from '../../../../settings/settingsStore'
import { autosaveModeOf } from '../../../../theme/types'
import { BrushIcon, BucketIcon, GridLinesIcon, HandIcon, PipetteIcon, RedoIcon } from '../../../icons'
import MapCanvas, { type MapTool } from './MapCanvas'
import { MapList } from './MapList'
import { MapSide } from './MapSide'
import { cellIndex, BRUSH_SIZES } from './mapModel'
import { formatDistance } from './mapView'
import { useMaps } from './useMaps'
import './maps.scss'

const TOOLS: Array<{ tool: MapTool; label: string; Icon: typeof BrushIcon }> = [
  { tool: 'brush', label: 'Paint', Icon: BrushIcon },
  { tool: 'fill', label: 'Fill an area', Icon: BucketIcon },
  { tool: 'pick', label: 'Pick up a terrain', Icon: PipetteIcon },
  { tool: 'hand', label: 'Move the view', Icon: HandIcon },
]

// Project > Maps: the maps of the setting. A list of maps (nested ones under the map they are in), the open map as a canvas to paint terrain on
// (pan and zoom, a brush, a fill, a dropper, undo), and beside it the terrains, the layers and the map's own fields. Edits save the way the
// Writer's do: the Save button, and autosave when the user has turned it on.
export default function MapsConsole({ projectId }: { projectId: string }) {
  const m = useMaps(projectId)
  const { ui } = useSettings()
  const [tool, setTool] = useState<MapTool>('brush')
  const [terrain, setTerrain] = useState(1)
  const [brush, setBrush] = useState<number>(1)
  const [grid, setGrid] = useState(true)
  const [hover, setHover] = useState<[number, number] | null>(null)
  const [blocked, setBlocked] = useState(false)
  const { draft } = m

  // The first map opens by itself.
  useEffect(() => {
    if (m.status === 'ready' && m.openId === null && m.maps.length > 0) void m.open(m.maps[0].id)
    // Only when the list has loaded (opening is not repeated after a map is closed by deleting it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.status])
  useEffect(() => { setBlocked(false) }, [m.openId])
  // The chosen terrain stays one the map has.
  const chosen = draft ? Math.min(terrain, draft.terrains.length - 1) : 0

  if (m.status === 'error') {
    return (
      <div className="mapNote" role="alert">
        <p>{m.loadError ?? 'The maps could not be loaded.'}</p>
        <button type="button" className="mapIconBtn" aria-label="Try loading again" title="Try loading again" onClick={() => { void m.reload() }}><RedoIcon size={18} /></button>
      </div>
    )
  }
  if (m.status === 'loading') return <p className="mapNote" role="status">Loading the maps…</p>

  const under = hover && draft ? draft.terrains[draft.cells[cellIndex(draft.width, hover[0], hover[1])]] : null

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
            {BRUSH_SIZES.map(n => (
              <button
                key={n} type="button" className="mapIconBtn mapBrush" aria-pressed={brush === n} aria-label={`Brush ${n} ${n === 1 ? 'cell' : 'cells'} wide`}
                title={`Brush ${n} ${n === 1 ? 'cell' : 'cells'} wide`} onClick={() => { setBrush(n); setTool('brush') }}
              ><span className="mapBrushDot" style={{ width: 4 + n * 4, height: 4 + n * 4 }} aria-hidden="true" /></button>
            ))}
            <span className="mapSep" aria-hidden="true" />
            <button type="button" className="mapIconBtn" aria-pressed={grid} aria-label="Grid" title="Show the grid" onClick={() => setGrid(g => !g)}><GridLinesIcon size={18} /></button>
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
      {blocked && <p className="mapNote mapNote--error" role="status">The terrain layer is hidden or locked: show or unlock it to paint.</p>}
      <div className="mapSplit">
        <MapList m={m} />
        {draft ? (
          <>
            <div className="mapStage">
              <MapCanvas
                draft={draft} rev={m.rev} tool={tool} terrain={chosen} brushSize={brush} showGrid={grid}
                onBeginStroke={(t, size) => { setBlocked(false); return m.beginStroke(t, size) }} onEndStroke={m.endStroke}
                onFill={(x, y, t) => { const ok = m.fill(x, y, t); if (ok === false) setBlocked(true) }} onPick={i => { setTerrain(i); setTool('brush') }}
                onHover={setHover} onBlocked={() => setBlocked(true)}
              />
              <p className="mapStatus" aria-live="off">
                {hover ? `Cell ${hover[0] + 1}, ${hover[1] + 1}${under ? ` · ${under.name}` : ''}` : `${draft.width} × ${draft.height} cells`}
                {' · '}{formatDistance(draft.width * draft.cellSize, draft.unit)} wide
              </p>
            </div>
            <MapSide m={m} draft={draft} terrain={chosen} onTerrain={setTerrain} />
          </>
        ) : (
          <p className="mapNote mapEmpty">{m.maps.length === 0 ? 'Make a map to start: a world, a town or a building.' : 'Pick a map in the list to open it.'}</p>
        )}
      </div>
    </div>
  )
}
