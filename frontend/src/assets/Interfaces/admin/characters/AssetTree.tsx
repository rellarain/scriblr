import { useMemo, useState, type KeyboardEvent } from 'react'
import type { ModelContent, ModelGroup, ModelLayer, ModelObject, ModelShape } from '../../../../api/types'
import { gripProps, zoneRef } from '../../../../lib/pointerDrag'
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, CopyIcon, EyeIcon, EyeOffIcon, FolderPlusIcon, GripIcon, LayersIcon, LinkIcon, LockIcon, PlusIcon, SearchIcon, StampIcon, SwapIcon, TrashIcon, TreeIcon, UnlockIcon } from '../../../icons'
import { ReorderList } from './ReorderList'
import { TemplateMenu } from './TemplateMenu'
import { same, type Selection } from './designerState'
import { classOfObject } from './engine/classEdit'
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
  // Switch an object or a group off or on for looking (the eye); the page keeps the list, and a preset can keep it.
  onToggleHidden: (id: string) => void
  // lock or unlock a group or an object against rolling the look (no lock button when missing)
  onToggleLock?: (id: string) => void
}
export type TreeMode = 'layers' | 'rig'

const label = (name: string, fallback: string) => name.trim() || fallback
// The marks on a shape in the tree (phase 4b): a shading shape lies on the shapes of its object; a helper shape is never drawn, it only clips or cuts.
function PaintMarks({ shape, name }: { shape: ModelShape; name: string }) {
  return (
    <>
      {shape.shade && <span className="cmTwin" role="img" title={`${name} is a shading shape: a ${shape.shade.kind === 'mid' ? 'mid tone' : shape.shade.kind} kept inside the other shapes of its object`} aria-label={`${name} is a shading shape`}><LayersIcon size={11} /></span>}
      {shape.helper && <span className="cmTwin" role="img" title={`${name} is a helper shape: it is not drawn in the previews`} aria-label={`${name} is a helper shape`}><EyeOffIcon size={11} /></span>}
    </>
  )
}

// The mark on a twin in the tree: it mirrors another thing and follows it.
function Twin({ of, name }: { of?: string | null; name: string }) {
  return of ? <span className="cmTwin" role="img" title={`${name} is a twin: it mirrors another and follows it`} aria-label={`${name} is a twin`}><SwapIcon size={11} /></span> : null
}
// The mark on an object of a class: the pattern (it is not drawn once it has members) or a member (its shapes follow the pattern's).
function ClassTag({ content, object }: { content: ModelContent; object: ModelObject }) {
  const k = classOfObject(content, object)
  if (!k) return null
  const pattern = k.template === object.id, name = k.name.trim() || 'Untitled class'
  const text = pattern ? `${object.name.trim() || 'This object'} is the pattern of class ${name}` : `${object.name.trim() || 'This object'} is a member of class ${name}`
  return <span className="cmTwin" role="img" title={text} aria-label={text}>{pattern ? <StampIcon size={11} /> : <LinkIcon size={11} />}</span>
}
const DRAG = 'cm-group'
const NO_HIDDEN: ReadonlySet<string> = new Set()

// The eye on an object or group row: pressed while the thing is shown. A hidden thing stays in the model and keeps doing its part in the rig.
function Eye({ id, name, hidden, onToggle }: { id: string; name: string; hidden: ReadonlySet<string>; onToggle: (id: string) => void }) {
  const off = hidden.has(id)
  return (
    <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Show ${name}`} aria-pressed={!off} title={off ? `${name} is hidden: show it` : `${name} is shown: hide it, to look at the rest`} onClick={() => onToggle(id)}>
      {off ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
    </button>
  )
}

// The lock beside the eye: a locked group or object (and everything in it) is left as it is when the look is rolled.
function Lock({ id, name, locks, onToggle }: { id: string; name: string; locks: ReadonlySet<string>; onToggle?: (id: string) => void }) {
  if (!onToggle) return null
  const on = locks.has(id)
  return (
    <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Lock ${name}`} aria-pressed={on} title={on ? `${name} is locked: rolling the look leaves it as it is` : `Lock ${name}, so rolling the look leaves it as it is`} onClick={() => onToggle(id)}>
      {on ? <LockIcon size={12} /> : <UnlockIcon size={12} />}
    </button>
  )
}

export function AssetTree({ content, sel, actions, mode, onMode, hidden = NO_HIDDEN, locks = NO_HIDDEN }: { content: ModelContent; sel: Selection; actions: TreeActions; mode: TreeMode; onMode: (m: TreeMode) => void; hidden?: ReadonlySet<string>; locks?: ReadonlySet<string> }) {
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
      {mode === 'layers' ? <LayersTree content={content} sel={sel} actions={actions} q={q} hidden={hidden} locks={locks} /> : <RigTree content={content} sel={sel} actions={actions} q={q} hidden={hidden} locks={locks} />}
    </nav>
  )
}

// ---- layers ----

function LayersTree({ content, sel, actions, q, hidden, locks }: { content: ModelContent; sel: Selection; actions: TreeActions; q: string; hidden: ReadonlySet<string>; locks: ReadonlySet<string> }) {
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
                      <div className={`cmTreeRow${g && same(sel, { kind: 'group', id: g.id }) ? ' cmTreeRow--on' : ''}${g && hidden.has(g.id) ? ' cmTreeRow--off' : ''}`}>
                        {g ? grip : <span className="cmGrip cmGrip--off" aria-hidden="true" />}
                        {twisty(gkey, label(g?.name ?? '', 'No group'))}
                        {g ? (
                          <button type="button" className="cmTreeName cmTreeName--btn" aria-current={same(sel, { kind: 'group', id: g.id })} onClick={() => actions.onSelect({ kind: 'group', id: g.id })}>
                            {label(g.name, 'Untitled group')}
                          </button>
                        ) : <span className="cmTreeName cmTreeName--muted">Not in a group</span>}
                        {g && <Twin of={g.mirrorOf} name={label(g.name, 'Untitled group')} />}
                        {g && <>
                          <span className={`cmCount${g.objects.length > LIMITS.objectsPerGroupWarn ? ' cmCount--warn' : ''}`} title="Objects in the group">{g.objects.length}</span>
                          <Eye id={g.id} name={label(g.name, 'Untitled group')} hidden={hidden} onToggle={actions.onToggleHidden} /><Lock id={g.id} name={label(g.name, 'Untitled group')} locks={locks} onToggle={actions.onToggleLock} />
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
                              <div className={`cmTreeRow${same(sel, { kind: 'object', id: o.object.id }) ? ' cmTreeRow--on' : ''}${hidden.has(o.object.id) || (g && hidden.has(g.id)) ? ' cmTreeRow--off' : ''}`}>
                                {g ? ogrip : <span className="cmGrip cmGrip--off" aria-hidden="true" />}
                                <button type="button" className="cmTreeName cmTreeName--btn" aria-current={same(sel, { kind: 'object', id: o.object.id })} onClick={() => actions.onSelect({ kind: 'object', id: o.object.id })}>
                                  {label(o.object.name, 'Untitled object')}
                                </button>
                                <Twin of={o.object.mirrorOf} name={label(o.object.name, 'Untitled object')} />
                                <ClassTag content={content} object={o.object} />
                                <span className={`cmCount${o.object.shapes.length > LIMITS.shapesPerObjectWarn ? ' cmCount--warn' : ''}`} title="Shapes in the object">{o.object.shapes.length}</span>
                                <Eye id={o.object.id} name={label(o.object.name, 'Untitled object')} hidden={hidden} onToggle={actions.onToggleHidden} /><Lock id={o.object.id} name={label(o.object.name, 'Untitled object')} locks={locks} onToggle={actions.onToggleLock} />
                                <TemplateMenu label={`Add a shape to ${label(o.object.name, 'the object')}`} onPick={t => actions.onAddShape(o.object.id, t)} />
                                <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete object ${label(o.object.name, 'Untitled object')}`} title="Delete the object with its shapes" onClick={() => actions.onDelete({ kind: 'object', id: o.object.id })}><TrashIcon size={12} /></button>
                              </div>
                              <ReorderList
                                className="cmTreeList cmTreeList--in"
                                items={shown}
                                itemClass={s => `cmTreeRow cmTreeRow--shape${same(sel, { kind: 'shape', id: s.id }) ? ' cmTreeRow--on' : ''}${hidden.has(o.object.id) || (g && hidden.has(g.id)) || s.hide ? ' cmTreeRow--off' : ''}`}
                                label={s => label(s.name, 'the shape')}
                                onMove={(id, before) => actions.onReorderShape(o.object.id, id, before)}
                                render={(s, sgrip) => (
                                  <>
                                    {sgrip}
                                    <button type="button" className="cmTreeName cmTreeName--btn" aria-current={same(sel, { kind: 'shape', id: s.id })} onClick={() => actions.onSelect({ kind: 'shape', id: s.id })}>
                                      {label(s.name, 'Untitled shape')}
                                    </button>
                                    <Twin of={s.mirrorOf} name={label(s.name, 'Untitled shape')} />
                                    <PaintMarks shape={s} name={label(s.name, 'Untitled shape')} />
                                    {s.copyOf && <span className="cmTwin" role="img" title={`${label(s.name, 'This shape')} follows the pattern${s.pts.length >= 3 ? ' (it has an outline of its own)' : ''}`} aria-label={`${label(s.name, 'This shape')} follows the pattern`}><LinkIcon size={11} /></span>}
                                    <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Move ${label(s.name, 'the shape')} down in the draw order`} title="Draw it earlier (further back)" disabled={shown[0]?.id === s.id} onClick={() => actions.onMoveShape(o.object.id, s.id, -1)}><ChevronDownIcon size={12} /></button>
                                    <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Move ${label(s.name, 'the shape')} up in the draw order`} title="Draw it later (in front)" disabled={shown[shown.length - 1]?.id === s.id} onClick={() => actions.onMoveShape(o.object.id, s.id, 1)}><ChevronUpIcon size={12} /></button>
                                    {!s.copyOf && <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Copy ${label(s.name, 'the shape')}`} title="Copy the shape" onClick={() => actions.onDuplicateShape(s.id)}><CopyIcon size={12} /></button>}
                                    {!s.copyOf && <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete ${label(s.name, 'the shape')}`} title="Delete the shape" onClick={() => actions.onDelete({ kind: 'shape', id: s.id })}><TrashIcon size={12} /></button>}
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

function RigTree({ content, sel, actions, q, hidden, locks }: { content: ModelContent; sel: Selection; actions: TreeActions; q: string; hidden: ReadonlySet<string>; locks: ReadonlySet<string> }) {
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

  // a group is dimmed when it, or a group above it, is switched off
  const dimmed = (g: ModelGroup): boolean => {
    const seen = new Set<string>()
    for (let cur: ModelGroup | undefined = g; cur && !seen.has(cur.id); cur = cur.parent ? content.groups.find(x => x.id === cur!.parent) : undefined) {
      if (hidden.has(cur.id)) return true
      seen.add(cur.id)
    }
    return false
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
              <div ref={row} className={`cmTreeRow${same(sel, { kind: 'group', id: g.id }) ? ' cmTreeRow--on' : ''}${over === g.id && dragId !== g.id ? ' cmTreeRow--drop' : ''}${dragId === g.id ? ' cmTreeRow--lifted' : ''}${dimmed(g) ? ' cmTreeRow--off' : ''}`} data-rig-row="">
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
                <Twin of={g.mirrorOf} name={name} />
                <span className={`cmCount${level > LIMITS.chainWarn ? ' cmCount--warn' : ''}`} title={`Level ${level} of ${LIMITS.chainMax} in the pivot chain`}>{level}</span>
                <Eye id={g.id} name={name} hidden={hidden} onToggle={actions.onToggleHidden} /><Lock id={g.id} name={name} locks={locks} onToggle={actions.onToggleLock} />
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
