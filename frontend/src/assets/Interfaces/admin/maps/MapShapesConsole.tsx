import { useMemo, useState } from 'react'
import type { MapShapeCategory, MyMapShape } from '../../../../api/types'
import { MAP_MAX_LIBRARY_SHAPES } from '../../../../api/types'
import { SaveCluster } from '../../../../components/SaveCluster'
import { setAutosaveMode, useSettings } from '../../../../settings/settingsStore'
import { autosaveModeOf } from '../../../../theme/types'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, CloseIcon, PlusIcon, TrashIcon } from '../../../icons'
import { CommitText } from '../../writer/maps/MapFields'
import { LEVELS } from '../../writer/maps/mapLevels'
import { CATEGORIES } from '../../writer/maps/mapLibrary'
import { ShapeThumb } from '../../writer/maps/ShapesPanel'
import { addFromMine, canAdd, editShape, hasChanges, moveShape, offeredOn, removeShape, shapeFaults, toggleLevel } from './mapShapesModel'
import { useMapShapeCatalog } from './useMapShapeCatalog'
import './mapBiomes.scss'

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

// AUI > Configuration > Maps > Shapes: the default shapes every project offers in a map's Shapes panel (land forms, space objects, building parts and
// markers), by the levels each is offered on. Shapes come from the admin's My shapes (drawn on a map, then Save to My shapes); here they are named, sorted
// into kinds, given levels, ordered and taken out. Saved as a draft the way the biome list is, and published as a whole.
function MapShapesConsole() {
  const shapes = useMapShapeCatalog()
  const { ui } = useSettings()
  const [kind, setKind] = useState<MapShapeCategory | 'all'>('all')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [version, setVersion] = useState('')
  const [adding, setAdding] = useState('')
  const { draft, catalog, mine } = shapes
  const faults = useMemo(() => shapeFaults(draft), [draft])
  const changed = hasChanges(draft, catalog?.published?.shapes ?? null)
  const versions = catalog ? [...(catalog.published ? [catalog.published] : []), ...catalog.history] : []
  const shown = draft.filter(s => kind === 'all' || s.category === kind)
  const byProject = useMemo(() => {
    const out = new Map<string, MyMapShape[]>()
    for (const s of mine) out.set(s.projectTitle || 'Another project', [...(out.get(s.projectTitle || 'Another project') ?? []), s])
    return out
  }, [mine])

  if (shapes.status === 'loading') return <p className="mbxNote" role="status">Loading the shapes…</p>
  if (shapes.status === 'error') {
    return (
      <div className="mbxNote" role="alert">
        <p>{shapes.loadError ?? 'The shapes could not be loaded.'}</p>
        <button type="button" className="mbxBtn" onClick={() => void shapes.reload()}>Try again</button>
      </div>
    )
  }

  const add = () => {
    const found = mine.find(s => s.id === adding)
    if (!found) return
    shapes.edit(list => addFromMine(list, found), true)
    setAdding('')
    setKind(found.category)
  }

  return (
    <div className="mbxPage">
      <div className="mbxBar">
        <h2 className="mbxBarTitle">Shapes</h2>
        <SaveCluster
          status={shapes.saveStatus} onSave={() => { void shapes.saveNow() }} scope=".mbxPage"
          autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: shapes.saveCountdown.nextSaveAt, wait: shapes.saveCountdown.wait }}
        />
      </div>
      <div className="mbxState" role="group" aria-label="Publishing">
        <span className="mbxMuted">
          {catalog?.published ? `Published v${catalog.published.version} on ${when(catalog.published.publishedAt)}` : 'Not published'}
          {changed ? ' · the list has changes that are not published' : ''}
        </span>
        <button type="button" className="mbxBtn mbxBtn--primary" disabled={shapes.busy || faults.length > 0 || !changed} title={faults[0] ?? (changed ? `Publish as v${catalog?.nextVersion ?? 1}` : 'Nothing to publish')} onClick={() => { void shapes.publish() }}>
          Publish v{catalog?.nextVersion ?? 1}
        </button>
        <button type="button" className="mbxBtn" disabled={shapes.busy || !changed} title="Put the list back as it is published" onClick={() => { void shapes.discard() }}>Discard changes</button>
        {versions.length > 0 && (
          <span className="mbxRow">
            <select className="mbxSelect" aria-label="A published version of the shapes to bring back" value={version} onChange={e => setVersion(e.target.value)}>
              <option value="">Bring back a version…</option>
              {versions.map(v => <option key={v.version} value={v.version}>v{v.version} · {when(v.publishedAt)}</option>)}
            </select>
            <button type="button" className="mbxIconBtn" aria-label="Bring this version into the list" title="Bring this version into the list (publish to use it)" disabled={version === '' || shapes.busy} onClick={() => { void shapes.restore(Number(version)); setVersion('') }}><CheckIcon size={16} /></button>
          </span>
        )}
      </div>
      {faults.length > 0 && <ul className="mbxFaults" role="alert">{faults.map(f => <li key={f}>{f}</li>)}</ul>}
      {shapes.actionError && <p className="mbxFaults" role="alert">{shapes.actionError}</p>}
      <p className="mbxMuted">
        A map&rsquo;s Shapes panel offers these on the levels ticked (none ticked: every level). To add one, draw it on a map, choose Save to My shapes, then add it here.
      </p>
      <div className="mbxRow" role="group" aria-label="Add from My shapes">
        {mine.length === 0 ? (
          <span className="mbxMuted">My shapes is empty: draw a shape on a map and choose Save to My shapes to add it here.</span>
        ) : (
          <>
            <select className="mbxSelect" aria-label="A shape of My shapes to add" value={adding} onChange={e => setAdding(e.target.value)}>
              <option value="">Add from My shapes…</option>
              {[...byProject].map(([project, list]) => (
                <optgroup key={project} label={project}>{list.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
              ))}
            </select>
            <button type="button" className="mbxIconBtn" aria-label="Add it to the shapes" title={canAdd(draft) ? 'Add it to the shapes' : `The list holds at most ${MAP_MAX_LIBRARY_SHAPES} shapes`} disabled={adding === '' || !canAdd(draft)} onClick={add}><PlusIcon size={16} /></button>
          </>
        )}
        <span className="mbxMuted">{draft.length} of {MAP_MAX_LIBRARY_SHAPES}</span>
      </div>
      <div className="mbxLevels" role="group" aria-label="Kinds of shape">
        {[{ id: 'all' as const, name: 'All' }, ...CATEGORIES].map(c => {
          const count = c.id === 'all' ? draft.length : draft.filter(s => s.category === c.id).length
          return <button key={c.id} type="button" className="mbxChip" aria-pressed={kind === c.id} onClick={() => setKind(c.id)}>{c.name} ({count})</button>
        })}
      </div>
      <ul className="mbxList" aria-label="Shapes">
        {shown.map(s => {
          const peers = draft.filter(o => o.category === s.category)
          const at = peers.indexOf(s)
          return (
            <li key={s.id} className="mbxItem">
              <div className="mbxRow">
                <span className="mbxThumb"><ShapeThumb shape={s} size={28} /></span>
                <CommitText label={`Name of ${s.name}`} value={s.name} max={60} className="mbxInput" onCommit={name => shapes.edit(list => editShape(list, s.id, { name }))} />
                <select className="mbxSelect" aria-label={`Kind of ${s.name}`} value={s.category} onChange={e => shapes.edit(list => editShape(list, s.id, { category: e.target.value as MapShapeCategory }), true)}>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span className="mbxTools">
                  <button type="button" className="mbxIconBtn" aria-label={`Move ${s.name} up`} title="Move up among its kind" disabled={at <= 0} onClick={() => shapes.edit(list => moveShape(list, s.id, -1), true)}><ChevronUpIcon size={16} /></button>
                  <button type="button" className="mbxIconBtn" aria-label={`Move ${s.name} down`} title="Move down among its kind" disabled={at === peers.length - 1} onClick={() => shapes.edit(list => moveShape(list, s.id, 1), true)}><ChevronDownIcon size={16} /></button>
                  {confirming === s.id ? (
                    <span className="mbxConfirm" role="group" aria-label={`Remove ${s.name}?`}>
                      <button type="button" className="mbxIconBtn" aria-label="Confirm remove" title="Confirm remove" onClick={() => { setConfirming(null); shapes.edit(list => removeShape(list, s.id), true) }}><CheckIcon size={16} /></button>
                      <button type="button" className="mbxIconBtn" aria-label="Cancel remove" title="Cancel" onClick={() => setConfirming(null)}><CloseIcon size={16} /></button>
                    </span>
                  ) : (
                    <button type="button" className="mbxIconBtn" aria-label={`Remove ${s.name}`} title={`Remove ${s.name} (shapes already on maps stay)`} onClick={() => setConfirming(s.id)}><TrashIcon size={16} /></button>
                  )}
                </span>
              </div>
              <div className="mbxLevels" role="group" aria-label={`Levels ${s.name} is offered on`}>
                {LEVELS.map(lv => {
                  const on = offeredOn(s, lv.id)
                  return (
                    <button
                      key={lv.id} type="button" className="mbxChip" aria-pressed={on} title={on ? `Offered on ${lv.name.toLowerCase()} maps` : `Not offered on ${lv.name.toLowerCase()} maps`}
                      onClick={() => shapes.edit(list => editShape(list, s.id, { levels: toggleLevel(s, lv.id) }), true)}
                    >{lv.name}</button>
                  )
                })}
                {s.levels.length === 0 && <span className="mbxMuted">every level</span>}
              </div>
            </li>
          )
        })}
      </ul>
      {shown.length === 0 && <p className="mbxMuted">No shapes of this kind.</p>}
    </div>
  )
}

export default MapShapesConsole
