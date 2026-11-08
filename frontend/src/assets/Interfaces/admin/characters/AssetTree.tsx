import { useMemo, useState } from 'react'
import type { ModelContent, ModelLayer } from '../../../../api/types'
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, CopyIcon, SearchIcon, TrashIcon, FolderPlusIcon, PlusIcon } from '../../../icons'
import { TemplateMenu } from './TemplateMenu'
import { same, type Selection } from './designerState'
import { LIMITS } from './engine/limits'
import { treeOf } from './modelContent'

// The model as a tree: the three layers (Body, Clothing, Hair), the groups that have an object on each, their objects and the objects' shapes. Pick a
// row to select it; the buttons add, copy, delete and reorder. (Dragging to reorder is a later refinement: the arrows do it for now.)
export interface TreeActions {
  onSelect: (sel: Selection) => void
  onAddGroup: () => void
  onAddObject: (layer: ModelLayer) => void
  onAddShape: (objectId: string, templateId: string) => void
  onDuplicateShape: (shapeId: string) => void
  onDelete: (sel: Selection) => void
  onMoveShape: (objectId: string, shapeId: string, dir: -1 | 1) => void
}

const label = (name: string, fallback: string) => name.trim() || fallback

export function AssetTree({ content, sel, actions }: { content: ModelContent; sel: Selection; actions: TreeActions }) {
  const [query, setQuery] = useState('')
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const tree = useMemo(() => treeOf(content), [content])
  const q = query.trim().toLowerCase()
  const match = (name: string) => !q || name.toLowerCase().includes(q)
  const toggle = (key: string) => setClosed(c => ({ ...c, [key]: !c[key] }))
  const isOpen = (key: string) => !closed[key]

  return (
    <nav className="cmTree" aria-label="Model tree">
      <div className="cmTreeHead">
        <label className="cmSearch">
          <SearchIcon size={12} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" aria-label="Search the model" />
        </label>
        <button type="button" className="cmIconBtn" aria-label="New group" title="New group" onClick={actions.onAddGroup}><FolderPlusIcon size={14} /></button>
      </div>
      <ul className="cmTreeList">
        {tree.map(layer => (
          <li key={layer.id} className="cmTreeLayer">
            <div className="cmTreeRow cmTreeRow--layer">
              <button type="button" className="cmTreeTwisty" aria-label={`${isOpen(layer.id) ? 'Fold' : 'Open'} ${layer.name}`} aria-expanded={isOpen(layer.id)} onClick={() => toggle(layer.id)}>
                {isOpen(layer.id) ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
              </button>
              <span className="cmTreeName">{layer.name}</span>
              <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Add an object to ${layer.name}`} title={`Add an object to ${layer.name}`} onClick={() => actions.onAddObject(layer.id)}><PlusIcon size={12} /></button>
            </div>
            {isOpen(layer.id) && (
              <ul className="cmTreeList cmTreeList--in">
                {[...layer.groups.map(g => ({ key: g.group.id, group: g.group as ModelContent['groups'][number] | null, objects: g.objects })), ...(layer.loose.length ? [{ key: `${layer.id}-loose`, group: null, objects: layer.loose }] : [])].map(g => {
                  const groupMatches = g.group ? match(g.group.name) : false
                  const objects = g.objects.filter(o => !q || groupMatches || match(o.object.name) || o.shapes.some(s => match(s.name)))
                  if (q && !objects.length && !groupMatches) return null
                  const gkey = `${layer.id}:${g.key}`
                  return (
                    <li key={g.key}>
                      <div className={`cmTreeRow${g.group && same(sel, { kind: 'group', id: g.group.id }) ? ' cmTreeRow--on' : ''}`}>
                        <button type="button" className="cmTreeTwisty" aria-label={`${isOpen(gkey) ? 'Fold' : 'Open'} ${label(g.group?.name ?? '', 'No group')}`} aria-expanded={isOpen(gkey)} onClick={() => toggle(gkey)}>
                          {isOpen(gkey) ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                        </button>
                        {g.group ? (
                          <button type="button" className="cmTreeName cmTreeName--btn" aria-current={same(sel, { kind: 'group', id: g.group.id })} onClick={() => actions.onSelect({ kind: 'group', id: g.group!.id })}>
                            {label(g.group.name, 'Untitled group')}
                          </button>
                        ) : <span className="cmTreeName cmTreeName--muted">Not in a group</span>}
                        {g.group && <>
                          <span className={`cmCount${g.group.objects.length > LIMITS.objectsPerGroupWarn ? ' cmCount--warn' : ''}`} title="Objects in the group">{g.group.objects.length}</span>
                          <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete group ${label(g.group.name, 'Untitled group')}`} title="Delete the group with its objects and shapes" onClick={() => actions.onDelete({ kind: 'group', id: g.group!.id })}><TrashIcon size={12} /></button>
                        </>}
                      </div>
                      {isOpen(gkey) && (
                        <ul className="cmTreeList cmTreeList--in">
                          {objects.map(o => (
                            <li key={o.object.id}>
                              <div className={`cmTreeRow${same(sel, { kind: 'object', id: o.object.id }) ? ' cmTreeRow--on' : ''}`}>
                                <span className="cmTreeTwisty" aria-hidden="true" />
                                <button type="button" className="cmTreeName cmTreeName--btn" aria-current={same(sel, { kind: 'object', id: o.object.id })} onClick={() => actions.onSelect({ kind: 'object', id: o.object.id })}>
                                  {label(o.object.name, 'Untitled object')}
                                </button>
                                <span className={`cmCount${o.object.shapes.length > LIMITS.shapesPerObjectWarn ? ' cmCount--warn' : ''}`} title="Shapes in the object">{o.object.shapes.length}</span>
                                <TemplateMenu label={`Add a shape to ${label(o.object.name, 'the object')}`} onPick={t => actions.onAddShape(o.object.id, t)} />
                                <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete object ${label(o.object.name, 'Untitled object')}`} title="Delete the object with its shapes" onClick={() => actions.onDelete({ kind: 'object', id: o.object.id })}><TrashIcon size={12} /></button>
                              </div>
                              <ul className="cmTreeList cmTreeList--in">
                                {o.shapes.filter(s => !q || groupMatches || match(o.object.name) || match(s.name)).map((s, i, all) => (
                                  <li key={s.id} className={`cmTreeRow cmTreeRow--shape${same(sel, { kind: 'shape', id: s.id }) ? ' cmTreeRow--on' : ''}`}>
                                    <span className="cmTreeTwisty" aria-hidden="true" />
                                    <button type="button" className="cmTreeName cmTreeName--btn" aria-current={same(sel, { kind: 'shape', id: s.id })} onClick={() => actions.onSelect({ kind: 'shape', id: s.id })}>
                                      {label(s.name, 'Untitled shape')}
                                    </button>
                                    <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Move ${label(s.name, 'the shape')} down in the draw order`} title="Draw it earlier (further back)" disabled={i === 0} onClick={() => actions.onMoveShape(o.object.id, s.id, -1)}><ChevronDownIcon size={12} /></button>
                                    <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Move ${label(s.name, 'the shape')} up in the draw order`} title="Draw it later (in front)" disabled={i === all.length - 1} onClick={() => actions.onMoveShape(o.object.id, s.id, 1)}><ChevronUpIcon size={12} /></button>
                                    <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Copy ${label(s.name, 'the shape')}`} title="Copy the shape" onClick={() => actions.onDuplicateShape(s.id)}><CopyIcon size={12} /></button>
                                    <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete ${label(s.name, 'the shape')}`} title="Delete the shape" onClick={() => actions.onDelete({ kind: 'shape', id: s.id })}><TrashIcon size={12} /></button>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
