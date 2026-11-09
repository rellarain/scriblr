import { useMemo, useState, type KeyboardEvent } from 'react'
import type { ModelContent, ModelGroup, ModelLayer } from '../../../../api/types'
import { gripProps, zoneRef } from '../../../../lib/pointerDrag'
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, CopyIcon, FolderPlusIcon, GripIcon, LayersIcon, PlusIcon, SearchIcon, TrashIcon, TreeIcon } from '../../../icons'
import { ReorderList } from './ReorderList'
import { TemplateMenu } from './TemplateMenu'
import { same, type Selection } from './designerState'
import { chainDepth } from './engine/rig'
import { LIMITS } from './engine/limits'
import { treeOf } from './modelContent'

// The model as a tree, in two views. Layers: the three layers (Body, Clothing, Hair), the groups that have an object on each, their objects and the objects'
// shapes; the grips (or Alt + Up / Down) reorder them, which is also their order in front of each other. Rig: the groups nested under the group they hang
// from, with the depth of each in its pivot chain; drag a group onto another to hang it there (onto the empty part to unhang it), or Alt + Right / Left
// on its grip to indent or outdent it.
export interface TreeActions {
  onSelect: (sel: Selection) => void
  onAddGroup: () => void
  onAddObject: (layer: ModelLayer) => void
  onAddShape: (objectId: string, templateId: string) => void
  onDuplicateShape: (shapeId: string) => void
  onDelete: (sel: Selection) => void
  onMoveShape: (objectId: string, shapeId: string, dir: -1 | 1) => void
  onReorderShape: (objectId: string, shapeId: string, beforeId: string | null) => void
  onReorderObject: (groupId: string, objectId: string, beforeId: string | null) => void
  onReorderGroup: (groupId: string, beforeId: string | null) => void
  onReparent: (groupId: string, parentId: string | null) => void
}
export type TreeMode = 'layers' | 'rig'

const label = (name: string, fallback: string) => name.trim() || fallback
const DRAG = 'cm-group'

export function AssetTree({ content, sel, actions, mode, onMode }: { content: ModelContent; sel: Selection; actions: TreeActions; mode: TreeMode; onMode: (m: TreeMode) => void }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  return (
    <nav className="cmTree" aria-label="Model tree">
      <div className="cmTreeHead">
        <label className="cmSearch">
          <SearchIcon size={12} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" aria-label="Search the model" />
        </label>
        <button type="button" className="cmIconBtn" aria-label="New group" title="New group" onClick={actions.onAddGroup}><FolderPlusIcon size={14} /></button>
      </div>
      <div className="cmTreeModes" role="group" aria-label="What the tree shows">
        <button type="button" className={`cmIconBtn${mode === 'layers' ? ' cmIconBtn--on' : ''}`} aria-label="Layers" title="Layers: Body, Clothing and Hair" aria-pressed={mode === 'layers'} onClick={() => onMode('layers')}><LayersIcon size={14} /></button>
        <button type="button" className={`cmIconBtn${mode === 'rig' ? ' cmIconBtn--on' : ''}`} aria-label="Rig" title="Rig: groups under the group they hang from" aria-pressed={mode === 'rig'} onClick={() => onMode('rig')}><TreeIcon size={14} /></button>
      </div>
      {mode === 'layers' ? <LayersTree content={content} sel={sel} actions={actions} q={q} /> : <RigTree content={content} sel={sel} actions={actions} q={q} />}
    </nav>
  )
}

// ---- layers ----

function LayersTree({ content, sel, actions, q }: { content: ModelContent; sel: Selection; actions: TreeActions; q: string }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const tree = useMemo(() => treeOf(content), [content])
  const match = (name: string) => !q || name.toLowerCase().includes(q)
  const toggle = (key: string) => setClosed(c => ({ ...c, [key]: !c[key] }))
  const isOpen = (key: string) => !closed[key]
  const twisty = (key: string, name: string) => (
    <button type="button" className="cmTreeTwisty" aria-label={`${isOpen(key) ? 'Fold' : 'Open'} ${name}`} aria-expanded={isOpen(key)} onClick={() => toggle(key)}>
      {isOpen(key) ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
    </button>
  )

  return (
    <ul className="cmTreeList">
      {tree.map(layer => {
        const entries = [...layer.groups.map(g => ({ id: g.group.id, group: g.group as ModelGroup | null, objects: g.objects })), ...(layer.loose.length ? [{ id: `${layer.id}-loose`, group: null, objects: layer.loose }] : [])]
        return (
          <li key={layer.id} className="cmTreeLayer">
            <div className="cmTreeRow cmTreeRow--layer">
              {twisty(layer.id, layer.name)}
              <span className="cmTreeName">{layer.name}</span>
              <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Add an object to ${layer.name}`} title={`Add an object to ${layer.name}`} onClick={() => actions.onAddObject(layer.id)}><PlusIcon size={12} /></button>
            </div>
            {isOpen(layer.id) && (
              <ReorderList
                className="cmTreeList cmTreeList--in"
                items={entries.filter(e => {
                  const groupMatches = e.group ? match(e.group.name) : false
                  return !q || groupMatches || e.objects.some(o => match(o.object.name) || o.shapes.some(s => match(s.name)))
                })}
                label={e => label(e.group?.name ?? '', 'the group')}
                onMove={(id, before) => { if (id.endsWith('-loose')) return; actions.onReorderGroup(id, before && !before.endsWith('-loose') ? before : null) }}
                render={(e, grip) => {
                  const g = e.group, groupMatches = g ? match(g.name) : false, gkey = `${layer.id}:${e.id}`
                  const objects = e.objects.filter(o => !q || groupMatches || match(o.object.name) || o.shapes.some(s => match(s.name)))
                  return (
                    <>
                      <div className={`cmTreeRow${g && same(sel, { kind: 'group', id: g.id }) ? ' cmTreeRow--on' : ''}`}>
                        {g ? grip : <span className="cmGrip cmGrip--off" aria-hidden="true" />}
                        {twisty(gkey, label(g?.name ?? '', 'No group'))}
                        {g ? (
                          <button type="button" className="cmTreeName cmTreeName--btn" aria-current={same(sel, { kind: 'group', id: g.id })} onClick={() => actions.onSelect({ kind: 'group', id: g.id })}>
                            {label(g.name, 'Untitled group')}
                          </button>
                        ) : <span className="cmTreeName cmTreeName--muted">Not in a group</span>}
                        {g && <>
                          <span className={`cmCount${g.objects.length > LIMITS.objectsPerGroupWarn ? ' cmCount--warn' : ''}`} title="Objects in the group">{g.objects.length}</span>
                          <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete group ${label(g.name, 'Untitled group')}`} title="Delete the group with its objects and shapes" onClick={() => actions.onDelete({ kind: 'group', id: g.id })}><TrashIcon size={12} /></button>
                        </>}
                      </div>
                      {isOpen(gkey) && (
                        <ReorderList
                          className="cmTreeList cmTreeList--in"
                          items={objects.map(o => ({ id: o.object.id, o }))}
                          label={x => label(x.o.object.name, 'the object')}
                          onMove={(id, before) => g && actions.onReorderObject(g.id, id, before)}
                          render={({ o }, ogrip) => {
                            const shown = o.shapes.filter(s => !q || groupMatches || match(o.object.name) || match(s.name))
                            return (
                            <>
                              <div className={`cmTreeRow${same(sel, { kind: 'object', id: o.object.id }) ? ' cmTreeRow--on' : ''}`}>
                                {g ? ogrip : <span className="cmGrip cmGrip--off" aria-hidden="true" />}
                                <button type="button" className="cmTreeName cmTreeName--btn" aria-current={same(sel, { kind: 'object', id: o.object.id })} onClick={() => actions.onSelect({ kind: 'object', id: o.object.id })}>
                                  {label(o.object.name, 'Untitled object')}
                                </button>
                                <span className={`cmCount${o.object.shapes.length > LIMITS.shapesPerObjectWarn ? ' cmCount--warn' : ''}`} title="Shapes in the object">{o.object.shapes.length}</span>
                                <TemplateMenu label={`Add a shape to ${label(o.object.name, 'the object')}`} onPick={t => actions.onAddShape(o.object.id, t)} />
                                <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete object ${label(o.object.name, 'Untitled object')}`} title="Delete the object with its shapes" onClick={() => actions.onDelete({ kind: 'object', id: o.object.id })}><TrashIcon size={12} /></button>
                              </div>
                              <ReorderList
                                className="cmTreeList cmTreeList--in"
                                items={shown}
                                itemClass={s => `cmTreeRow cmTreeRow--shape${same(sel, { kind: 'shape', id: s.id }) ? ' cmTreeRow--on' : ''}`}
                                label={s => label(s.name, 'the shape')}
                                onMove={(id, before) => actions.onReorderShape(o.object.id, id, before)}
                                render={(s, sgrip) => (
                                  <>
                                    {sgrip}
                                    <button type="button" className="cmTreeName cmTreeName--btn" aria-current={same(sel, { kind: 'shape', id: s.id })} onClick={() => actions.onSelect({ kind: 'shape', id: s.id })}>
                                      {label(s.name, 'Untitled shape')}
                                    </button>
                                    <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Move ${label(s.name, 'the shape')} down in the draw order`} title="Draw it earlier (further back)" disabled={shown[0]?.id === s.id} onClick={() => actions.onMoveShape(o.object.id, s.id, -1)}><ChevronDownIcon size={12} /></button>
                                    <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Move ${label(s.name, 'the shape')} up in the draw order`} title="Draw it later (in front)" disabled={shown[shown.length - 1]?.id === s.id} onClick={() => actions.onMoveShape(o.object.id, s.id, 1)}><ChevronUpIcon size={12} /></button>
                                    <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Copy ${label(s.name, 'the shape')}`} title="Copy the shape" onClick={() => actions.onDuplicateShape(s.id)}><CopyIcon size={12} /></button>
                                    <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete ${label(s.name, 'the shape')}`} title="Delete the shape" onClick={() => actions.onDelete({ kind: 'shape', id: s.id })}><TrashIcon size={12} /></button>
                                  </>
                                )}
                              />
                            </>
                            )
                          }}
                        />
                      )}
                    </>
                  )
                }}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ---- rig ----

function RigTree({ content, sel, actions, q }: { content: ModelContent; sel: Selection; actions: TreeActions; q: string }) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const ids = new Set(content.groups.map(g => g.id))
  // a group whose parent is missing (a draft in the middle of an edit) is shown at the top
  const kids = (parent: string | null) => content.groups.filter(g => (parent === null ? g.parent === null || !ids.has(g.parent) : g.parent === parent))
  const hasMatch = (g: ModelGroup): boolean => !q || (g.name || g.id).toLowerCase().includes(q) || kids(g.id).some(hasMatch)
  const root = zoneRef(DRAG, { over: () => setOver('root'), leave: () => setOver(null), drop: () => { setOver(null); if (dragId) actions.onReparent(dragId, null) } })

  function nudge(g: ModelGroup, e: KeyboardEvent) {
    if (!e.altKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return
    e.preventDefault()
    if (e.key === 'ArrowLeft') {
      const parent = content.groups.find(x => x.id === g.parent)
      if (parent) actions.onReparent(g.id, parent.parent)
    } else {
      const siblings = kids(g.parent), at = siblings.findIndex(x => x.id === g.id)
      if (at > 0) actions.onReparent(g.id, siblings[at - 1].id)
    }
  }

  function branch(parent: string | null, depth: number) {
    const list = kids(parent).filter(hasMatch)
    if (!list.length) return null
    return (
      <ul className={`cmTreeList${parent ? ' cmTreeList--in' : ''}`}>
        {list.map(g => {
          const name = label(g.name, 'Untitled group'), open = !closed[g.id], children = kids(g.id).filter(hasMatch)
          const row = zoneRef(DRAG, { over: () => setOver(g.id), leave: () => setOver(null), drop: () => { setOver(null); if (dragId) actions.onReparent(dragId, g.id) } })
          const level = chainDepth(content, g.id)
          return (
            <li key={g.id}>
              <div ref={row} className={`cmTreeRow${same(sel, { kind: 'group', id: g.id }) ? ' cmTreeRow--on' : ''}${over === g.id && dragId !== g.id ? ' cmTreeRow--drop' : ''}${dragId === g.id ? ' cmTreeRow--lifted' : ''}`} data-rig-row="">
                <span
                  className="cmGrip" role="button" tabIndex={0} aria-label={`Move ${name} to another parent (Alt+Right or Left)`}
                  {...gripProps(DRAG, g.id, grip => grip.closest<HTMLElement>('[data-rig-row]'), { start: setDragId, end: () => { setDragId(null); setOver(null) } })}
                  onKeyDown={e => nudge(g, e)}
                ><GripIcon size={12} /></span>
                {children.length ? (
                  <button type="button" className="cmTreeTwisty" aria-label={`${open ? 'Fold' : 'Open'} ${name}`} aria-expanded={open} onClick={() => setClosed(c => ({ ...c, [g.id]: open }))}>
                    {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                  </button>
                ) : <span className="cmTreeTwisty" aria-hidden="true" />}
                <button type="button" className="cmTreeName cmTreeName--btn" aria-current={same(sel, { kind: 'group', id: g.id })} onClick={() => actions.onSelect({ kind: 'group', id: g.id })}>{name}</button>
                <span className={`cmCount${level >= LIMITS.chainMax ? ' cmCount--warn' : ''}`} title={`Level ${level} of ${LIMITS.chainMax} in the pivot chain`}>{level}</span>
              </div>
              {open && branch(g.id, depth + 1)}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div ref={root} className={`cmRigTree${over === 'root' ? ' cmRigTree--drop' : ''}`}>
      {content.groups.length === 0 ? <p className="cmInsText">No group yet. Make one with the folder button above.</p> : branch(null, 0)}
      <p className="cmInsText">Drag a group onto another to hang it there; onto the empty space to unhang it.</p>
    </div>
  )
}
