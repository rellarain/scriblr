import { Fragment, useMemo, useRef, useState } from 'react'
import { MAP_MAX_SIDE, type MapKind, type MapSummary, type MapThemeName } from '../../../../api/types'
import { CheckIcon, ChevronRightIcon, CloseIcon, CopyIcon, ExportIcon, HistoryIcon, MapIcon, PlusIcon, TrashIcon, ImportIcon } from '../../../icons'
import type { StoryPoint } from '../characters/story'
import { appliesLabel, versionsOf } from './mapVersions'
import { CommitNumber, CommitText, Field } from './MapFields'
import { importRows, mapFileName, parseMapFile, type Choice, type MapFile } from './mapFile'
import { saveBlob } from './mapExport'
import { MAP_TITLE_MAX, mapRows } from './mapModel'
import { MAP_THEMES } from './mapThemes'
import type { Maps } from './useMaps'

const KINDS: Array<{ kind: MapKind; name: string; cell: number; unit: string }> = [
  { kind: 'world', name: 'World or region', cell: 10, unit: 'miles' },
  { kind: 'town', name: 'Town or city', cell: 10, unit: 'paces' },
  { kind: 'interior', name: 'Interior', cell: 5, unit: 'feet' },
]
export const MAP_SIZES = [
  { name: 'Small', width: 32, height: 24 }, { name: 'Medium', width: 64, height: 48 }, { name: 'Large', width: 128, height: 96 },
  { name: 'Huge', width: 256, height: 192 }, { name: 'Largest', width: MAP_MAX_SIDE, height: MAP_MAX_SIDE },
]

// The list of maps (each with the maps inside it under it) and the form that makes a new one.
export function MapList({ m, points = [] }: { m: Maps; points?: StoryPoint[] }) {
  const rows = useMemo(() => mapRows(m.maps), [m.maps])
  const [making, setMaking] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  // The map a version is being made of.
  const [versioning, setVersioning] = useState<string | null>(null)
  const open = m.openId
  const [incoming, setIncoming] = useState<MapFile | null>(null)
  const [problem, setProblem] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  async function exportOne(id: string, title: string) {
    const file = await m.exportFile(id)
    if (file) saveBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), mapFileName(title))
  }
  async function readFile(f: File | undefined) {
    if (!f) return
    setProblem('')
    const parsed = parseMapFile(await readText(f))
    if (parsed.ok) setIncoming(parsed.file)
    else setProblem(parsed.error)
  }

  return (
    <nav className="mapList" aria-label="Maps">
      <header className="mapPanelHead">
        <h3 className="mapPanelTitle">Maps</h3>
        <span className="mapRow">
          <button type="button" className="mapIconBtn" aria-label="Import maps from a file" title="Import maps from a file" onClick={() => fileInput.current?.click()}><ImportIcon size={16} /></button>
          <button type="button" className="mapIconBtn" aria-label="New map" title="New map" aria-expanded={making} onClick={() => setMaking(v => !v)}><PlusIcon size={16} /></button>
        </span>
        <input ref={fileInput} type="file" accept=".json,application/json" className="mapFileInput" aria-label="Map file" tabIndex={-1} onChange={e => { void readFile(e.target.files?.[0]); e.target.value = '' }} />
      </header>
      {problem && <p className="mapHint" role="alert">{problem}</p>}
      {incoming && <ImportForm m={m} file={incoming} onDone={() => setIncoming(null)} />}
      {making && <NewMapForm m={m} maps={m.maps} onDone={() => setMaking(false)} />}
      {rows.length === 0 && !making && <p className="mapHint">No maps yet. Make the first one with the plus.</p>}
      <ul className="mapRows">
        {rows.map(({ map, depth, hasChildren }) => (
          <Fragment key={map.id}>
          <li className={`mapRowItem${map.id === open ? ' mapRowItem--on' : ''}`} style={{ paddingLeft: `calc(${depth} * var(--space-6))` }}>
            <button type="button" className="mapRowMain" aria-label={`Open ${map.title}`} aria-current={map.id === open ? 'true' : undefined} title={`Open ${map.title}`} onClick={() => { void m.open(map.id) }}>
              {depth > 0 ? <ChevronRightIcon size={14} /> : <MapIcon size={14} />}
              <span className="mapRowTitle">{map.title}</span>
              <span className="mapRowMeta">{map.width}×{map.height}</span>
            </button>
            <button type="button" className="mapIconBtn mapRowDelete" aria-label={`Make a version of ${map.title}`} title={`Make a version of ${map.title}, to change for a later point of the story`} aria-expanded={versioning === map.id} onClick={() => setVersioning(v => (v === map.id ? null : map.id))}><CopyIcon size={16} /></button>
            <button type="button" className="mapIconBtn mapRowDelete" aria-label={`Export ${map.title} to a file`} title={hasChildren ? `Export ${map.title} and the maps inside it to a file` : `Export ${map.title} to a file`} onClick={() => { void exportOne(map.id, map.title) }}><ExportIcon size={16} /></button>
            {confirming === map.id ? (
              <span className="mapConfirm" role="group" aria-label={`Delete ${map.title}?`}>
                <button type="button" className="mapIconBtn" aria-label="Confirm delete" title="Confirm delete" onClick={() => { setConfirming(null); void m.remove(map.id) }}><CheckIcon size={16} /></button>
                <button type="button" className="mapIconBtn" aria-label="Cancel delete" title="Cancel" onClick={() => setConfirming(null)}><CloseIcon size={16} /></button>
              </span>
            ) : (
              <button type="button" className="mapIconBtn mapRowDelete" aria-label={`Delete ${map.title}`} title={hasChildren ? `Delete ${map.title} (the maps inside it move up)` : `Delete ${map.title}`} onClick={() => setConfirming(map.id)}><TrashIcon size={16} /></button>
            )}
          </li>
          {versionsOf(m.maps, map.id).map(v => (
            <li key={v.id} className={`mapRowItem mapRowItem--version${v.id === open ? ' mapRowItem--on' : ''}`} style={{ paddingLeft: `calc(${depth + 1} * var(--space-6))` }}>
              <button type="button" className="mapRowMain" aria-label={`Open ${v.title}`} aria-current={v.id === open ? 'true' : undefined} title={`Open ${v.title}`} onClick={() => { void m.open(v.id) }}>
                <HistoryIcon size={14} />
                <span className="mapRowTitle">{v.title}</span>
                <span className="mapRowMeta">{appliesLabel(v, points)}</span>
              </button>
              {confirming === v.id ? (
                <span className="mapConfirm" role="group" aria-label={`Delete ${v.title}?`}>
                  <button type="button" className="mapIconBtn" aria-label="Confirm delete" title="Confirm delete" onClick={() => { setConfirming(null); void m.remove(v.id) }}><CheckIcon size={16} /></button>
                  <button type="button" className="mapIconBtn" aria-label="Cancel delete" title="Cancel" onClick={() => setConfirming(null)}><CloseIcon size={16} /></button>
                </span>
              ) : (
                <button type="button" className="mapIconBtn mapRowDelete" aria-label={`Delete ${v.title}`} title={`Delete ${v.title}`} onClick={() => setConfirming(v.id)}><TrashIcon size={16} /></button>
              )}
            </li>
          ))}
          {versioning === map.id && <li className="mapRowItem"><VersionForm m={m} sourceId={map.id} points={points} onDone={() => setVersioning(null)} /></li>}
          </Fragment>
        ))}
      </ul>
    </nav>
  )
}

// The form that makes a version: a title, and the chapter or scene from which it is the map that is true.
function VersionForm({ m, sourceId, points, onDone }: { m: Maps; sourceId: string; points: StoryPoint[]; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [from, setFrom] = useState('')
  const [busy, setBusy] = useState(false)
  async function make() {
    setBusy(true)
    const id = await m.createVersion(sourceId, title, from || null)
    setBusy(false)
    if (id) onDone()
  }
  return (
    <form className="mapNew" aria-label="New version" noValidate onSubmit={e => { e.preventDefault(); void make() }}>
      <Field label="Title of the version"><CommitText label="Title of the new version" value={title} max={MAP_TITLE_MAX} onCommit={setTitle} live /></Field>
      <Field label="True from">
        <select className="mapSelect" aria-label="The version is true from" value={from} onChange={e => setFrom(e.target.value)}>
          <option value="">Not placed yet</option>
          {points.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </Field>
      <p className="mapHint">A copy of the map as it is now, to change for a later point of the story. Its places stay the first map&apos;s.</p>
      <div className="mapRow">
        <button type="submit" className="mapIconBtn" aria-label="Make the version" title="Make the version" disabled={busy}><CheckIcon size={16} /></button>
        <button type="button" className="mapIconBtn" aria-label="Cancel the version" title="Cancel" onClick={onDone}><CloseIcon size={16} /></button>
      </div>
    </form>
  )
}

function NewMapForm({ m, maps, onDone }: { m: Maps; maps: MapSummary[]; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<MapKind>('world')
  const [width, setWidth] = useState(64)
  const [height, setHeight] = useState(48)
  const [cell, setCell] = useState(10)
  const [unit, setUnit] = useState('miles')
  const [theme, setTheme] = useState<MapThemeName>('parchment')
  const [parent, setParent] = useState('')
  const [busy, setBusy] = useState(false)

  function pickKind(next: MapKind) {
    const k = KINDS.find(x => x.kind === next)!
    setKind(next); setCell(k.cell); setUnit(k.unit)
  }
  async function make() {
    setBusy(true)
    const id = await m.create({ title: title.trim() || undefined, kind, width, height, cellSize: cell, unit, theme, parentId: parent || null })
    setBusy(false)
    if (id) onDone()
  }

  return (
    <form className="mapNew" aria-label="New map" noValidate onSubmit={e => { e.preventDefault(); void make() }}>
      <Field label="Title"><CommitText label="Title of the new map" value={title} max={MAP_TITLE_MAX} onCommit={setTitle} live /></Field>
      <Field label="Kind">
        <select className="mapSelect" aria-label="Kind of map" value={kind} onChange={e => pickKind(e.target.value as MapKind)}>
          {KINDS.map(k => <option key={k.kind} value={k.kind}>{k.name}</option>)}
        </select>
      </Field>
      <Field label="Size">
        <div className="mapSizes" role="group" aria-label="Size presets">
          {MAP_SIZES.map(s => (
            <button
              key={s.name} type="button" className="mapChip" aria-pressed={width === s.width && height === s.height}
              title={`${s.width} × ${s.height} cells`} onClick={() => { setWidth(s.width); setHeight(s.height) }}
            >{s.name}</button>
          ))}
        </div>
      </Field>
      <div className="mapRow">
        <Field label="Width" short><CommitNumber label="Width in cells" value={width} min={1} max={MAP_MAX_SIDE} onCommit={setWidth} live /></Field>
        <Field label="Height" short><CommitNumber label="Height in cells" value={height} min={1} max={MAP_MAX_SIDE} onCommit={setHeight} live /></Field>
      </div>
      <div className="mapRow">
        <Field label="One cell is" short><CommitNumber label="Size of one cell" value={cell} min={0.001} max={1_000_000} step="any" onCommit={setCell} live /></Field>
        <Field label="Unit" short><CommitText label="Unit of a cell" value={unit} max={20} className="mapInput mapInput--unit" onCommit={setUnit} live /></Field>
      </div>
      <Field label="Look">
        <select className="mapSelect" aria-label="Look of the new map" value={theme} onChange={e => setTheme(e.target.value as MapThemeName)}>
          {MAP_THEMES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      {maps.length > 0 && (
        <Field label="Inside">
          <select className="mapSelect" aria-label="Inside which map" value={parent} onChange={e => setParent(e.target.value)}>
            <option value="">No map (a top-level map)</option>
            {mapRows(maps).map(({ map, depth }) => <option key={map.id} value={map.id}>{'– '.repeat(depth)}{map.title}</option>)}
          </select>
        </Field>
      )}
      <div className="mapRow">
        <button type="submit" className="mapIconBtn" aria-label="Make the map" title="Make the map" disabled={busy}><CheckIcon size={16} /></button>
        <button type="button" className="mapIconBtn" aria-label="Cancel" title="Cancel" onClick={onDone}><CloseIcon size={16} /></button>
      </div>
    </form>
  )
}

// The text of a file the user chose.
const readText = (f: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result ?? ''))
  r.onerror = () => reject(r.error)
  r.readAsText(f)
})

// What an import does: each map of the file, with a choice (bring it new, replace the map that has its id, or leave it out) for those that clash.
function ImportForm({ m, file, onDone }: { m: Maps; file: MapFile; onDone: () => void }) {
  const rows = useMemo(() => importRows(file, m.maps), [file, m.maps])
  const [choices, setChoices] = useState<Map<string, Choice>>(new Map())
  const [parent, setParent] = useState('')
  const [busy, setBusy] = useState(false)

  async function bring() {
    setBusy(true)
    const r = await m.importFile(file, choices, parent || null)
    setBusy(false)
    if (r && !r.error) onDone()
  }

  return (
    <form className="mapNew" aria-label="Import maps" onSubmit={e => { e.preventDefault(); void bring() }}>
      <h4 className="mapSubTitle">Maps in the file</h4>
      <ul className="mapOld">
        {rows.map(({ map, depth, clash }) => (
          <li key={map.id} className="mapRow" style={{ paddingLeft: `calc(${depth} * var(--space-6))` }}>
            <span className="mapRowTitle">{map.title}</span>
            {clash ? (
              <select className="mapSelect" aria-label={`What to do with ${map.title}, which the project has already`} value={choices.get(map.id) ?? 'both'} onChange={e => setChoices(prev => new Map(prev).set(map.id, e.target.value as Choice))}>
                <option value="both">Keep both</option>
                <option value="replace">Replace the one here</option>
                <option value="skip">Leave it out</option>
              </select>
            ) : <span className="mapHint">new</span>}
          </li>
        ))}
      </ul>
      {m.maps.length > 0 && (
        <Field label="Inside">
          <select className="mapSelect" aria-label="Put the imported map inside" value={parent} onChange={e => setParent(e.target.value)}>
            <option value="">No map (a top-level map)</option>
            {mapRows(m.maps).map(({ map, depth }) => <option key={map.id} value={map.id}>{'– '.repeat(depth)}{map.title}</option>)}
          </select>
        </Field>
      )}
      <p className="mapHint">Links to maps that are not in the file are dropped.</p>
      <div className="mapRow">
        <button type="submit" className="mapIconBtn" aria-label="Import the maps" title="Import the maps" disabled={busy}><CheckIcon size={16} /></button>
        <button type="button" className="mapIconBtn" aria-label="Cancel the import" title="Cancel" onClick={onDone}><CloseIcon size={16} /></button>
      </div>
    </form>
  )
}
