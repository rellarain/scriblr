import { useState } from 'react'
import type { PlotNode } from '../../../api/types'
import { ChevronDownIcon, ChevronRightIcon, GripIcon, PlusIcon } from '../../icons'
import { FIELD_NAME_MAX, fieldGroups, isScrapField, orderValues, valuesIn, canMoveValue, type FieldInfo, type FieldScope } from './plotFields'
import { PlotValueCard } from './PlotValueCard'
import { assignedLevel, nodeLabel } from './plotTree'
import { DeleteControl } from './shared'
import type { WriterWorkspace } from './useWriterWorkspace'

// The fields of a category, subcategory or plotline, and their values.
//   FieldBlock    one field: a collapsible with its name, a count and its value cards
//   FieldGroups   the plotline editor: three collapsible groups, from where the fields come
//                 (the plotline's own on top, the subcategory's, the category's at the bottom)
//   FieldEditor   the category and subcategory editors: its own fields and their values

// Which fields are open (collapsed by default), shared with the keyboard shortcuts so that a
// value created from the keyboard is never made in a collapsed field.
export interface PlotUi {
  isOpen: (fieldId: string) => boolean
  setOpen: (fieldId: string, open: boolean) => void
  // A value just created, so its title can take focus.
  newValueId: string | null
  setNewValueId: (id: string | null) => void
}

// Dragging a value (to a chapter, or into another field) and a field (to reorder).
export interface PlotDrag {
  dragId: string | null
  valueDrag: (id: string) => { onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }
  dropIntoField: (fieldId: string) => void
  dragFieldId: string | null
  setDragFieldId: (id: string | null) => void
}

export function FieldBlock({ w, info, holder, editable, ui, drag, showAssigned }: {
  w: WriterWorkspace
  info: FieldInfo
  // The node whose values are listed: the plotline being edited, or the owner itself.
  holder: PlotNode
  // The field's owner is being edited: its name, order and existence can be changed.
  editable: boolean
  ui: PlotUi
  drag: PlotDrag
  showAssigned: boolean
}) {
  const { def, owner } = info
  const scrap = isScrapField(def)
  const outlineById = new Map(w.outlineNodes.map(n => [n.id, n]))
  const all = valuesIn(w.plotNodes, holder.id, def.id)
  const shown = orderValues(all, w.outlineNodes, w.activeProject?.settings.timeSystems ?? [])
    .filter(v => showAssigned || assignedLevel(v, outlineById) === 'none')
  const open = ui.isOpen(def.id)
  const unassigned = all.filter(v => assignedLevel(v, outlineById) === 'none').length
  const dragged = drag.dragId ? w.plotNodeById.get(drag.dragId) : undefined
  const canDrop = Boolean(dragged && canMoveValue(dragged, def.id, w.plotNodeById, outlineById) && dragged.parentId === holder.id && dragged.fieldId !== def.id)
  const [over, setOver] = useState(false)

  function newValue(afterId?: string) {
    ui.setOpen(def.id, true)
    const id = w.addPlotValue(holder.id, def.id, afterId)
    ui.setNewValueId(id)
  }

  // A field name left blank is dropped when it has no values, and named otherwise.
  function nameBlur() {
    if (def.name.trim() !== '') { if (def.name !== def.name.trim()) w.renamePlotField(owner.id, def.id, def.name.trim()); return }
    if (all.length === 0) w.removePlotField(owner.id, def.id)
    else w.renamePlotField(owner.id, def.id, 'Untitled field')
  }

  return (
    <div
      className={`wrFieldBlock${over && canDrop ? ' wrFieldBlock--over' : ''}${drag.dragFieldId === def.id ? ' wrFieldBlock--dragging' : ''}`}
      data-knode={def.id} data-field={def.id}
      onDragOver={e => {
        if (drag.dragFieldId && editable && drag.dragFieldId !== def.id) { e.preventDefault(); return }
        if (canDrop) { e.preventDefault(); setOver(true) }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        setOver(false)
        if (drag.dragFieldId && editable && drag.dragFieldId !== def.id) {
          e.preventDefault(); e.stopPropagation()
          w.movePlotField(owner.id, drag.dragFieldId, def.id)
          drag.setDragFieldId(null)
          return
        }
        if (canDrop) { e.preventDefault(); e.stopPropagation(); drag.dropIntoField(def.id) }
      }}
    >
      <div className="wrFieldHead">
        <button type="button" className="wrFieldToggle" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${def.name || 'field'}`} onClick={() => ui.setOpen(def.id, !open)}>
          {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
        </button>
        {editable && !scrap && (
          <span
            className="wrGrip" draggable aria-label="Drag to reorder fields" title="Drag to reorder"
            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', def.id); drag.setDragFieldId(def.id) }}
            onDragEnd={() => drag.setDragFieldId(null)}
          >
            <GripIcon size={14} />
          </span>
        )}
        {editable && !scrap ? (
          <input
            className="wrFieldName" data-kf="" value={def.name} placeholder="Field name" maxLength={FIELD_NAME_MAX} aria-label="Field name"
            onChange={e => w.renamePlotField(owner.id, def.id, e.target.value)} onBlur={nameBlur}
          />
        ) : (
          <span className="wrFieldNameText">{def.name}</span>
        )}
        <span className="wrOutlineMeta wrFieldCount" title={holder.kind === 'plotline' ? `${unassigned} unassigned of ${all.length}` : `${all.length} values`}>
          {holder.kind === 'plotline' ? `${unassigned} / ${all.length}` : all.length}
        </span>
        {editable && !scrap && (
          <DeleteControl
            tone="dark" message={`Delete ${def.name || 'this field'}?`}
            onConfirm={() => w.removePlotField(owner.id, def.id)}
          />
        )}
      </div>
      {open && (
        <div className="wrFieldValues">
          {shown.map(v => (
            <PlotValueCard
              key={v.id} w={w} point={v} fieldName={def.name || 'Field'} autoFocus={v.id === ui.newValueId}
              drag={assignedLevel(v, outlineById) === 'none' ? drag.valueDrag(v.id) : undefined}
              dragging={drag.dragId === v.id}
            />
          ))}
          {shown.length === 0 && <p className="wrMuted">{all.length > 0 && !showAssigned ? 'Everything here is assigned.' : 'No values yet.'}</p>}
          <div><button type="button" className="wrSmallBtn" onClick={() => newValue()}><PlusIcon size={13} /> Value</button></div>
        </div>
      )}
    </div>
  )
}

const GROUP_TITLE: Record<FieldScope, (owners: PlotNode[]) => string> = {
  plotline: () => 'Plotline fields',
  subcategory: owners => `From subcategory: ${owners.map(nodeLabel).join(', ')}`,
  category: owners => `From category: ${owners.map(nodeLabel).join(', ')}`,
}

// The plotline editor's fields: plotline fields on top, then the subcategory's, then the category's.
export function FieldGroups({ w, plotline, ui, drag, showAssigned }: {
  w: WriterWorkspace; plotline: PlotNode; ui: PlotUi; drag: PlotDrag; showAssigned: boolean
}) {
  const groups = fieldGroups(plotline, w.plotNodeById)
  const [closed, setClosed] = useState<Set<FieldScope>>(new Set())
  const toggle = (scope: FieldScope) => setClosed(prev => { const next = new Set(prev); if (next.has(scope)) next.delete(scope); else next.add(scope); return next })

  return (
    <div className="wrFieldGroups">
      {(['plotline', 'subcategory', 'category'] as FieldScope[]).map(scope => {
        const fields = groups[scope]
        if (scope !== 'plotline' && fields.length === 0) return null
        const owners = [...new Map(fields.map(f => [f.owner.id, f.owner])).values()]
        const isClosed = closed.has(scope)
        return (
          <section key={scope} className="wrFieldGroup" aria-label={GROUP_TITLE[scope](owners)}>
            <div className="wrFieldGroupHead">
              <button type="button" className="wrFieldToggle" aria-expanded={!isClosed} onClick={() => toggle(scope)}>
                {isClosed ? <ChevronRightIcon size={14} /> : <ChevronDownIcon size={14} />}
                <span className="wrFieldGroupName">{GROUP_TITLE[scope](owners)}</span>
              </button>
              {scope === 'plotline' && (
                <button
                  type="button" className="wrSmallBtn"
                  onClick={() => { const id = w.addPlotField(plotline.id); if (id) ui.setOpen(id, true) }}
                >
                  <PlusIcon size={13} /> Field
                </button>
              )}
            </div>
            {!isClosed && fields.map(info => (
              <FieldBlock key={info.def.id} w={w} info={info} holder={plotline} editable={scope === 'plotline'} ui={ui} drag={drag} showAssigned={showAssigned} />
            ))}
            {!isClosed && fields.length === 0 && <p className="wrMuted">No fields yet. Add one to start listing plotpoints.</p>}
          </section>
        )
      })}
    </div>
  )
}

// The category and subcategory editors: the node's own fields, with the values every
// plotline under it will show.
export function FieldEditor({ w, owner, ui, drag }: { w: WriterWorkspace; owner: PlotNode; ui: PlotUi; drag: PlotDrag }) {
  return (
    <div className="wrFieldGroups">
      <section className="wrFieldGroup" aria-label="Fields">
        <div className="wrFieldGroupHead">
          <span className="wrLabel">Fields</span>
          <button type="button" className="wrSmallBtn" onClick={() => { const id = w.addPlotField(owner.id); if (id) ui.setOpen(id, true) }}>
            <PlusIcon size={13} /> Field
          </button>
        </div>
        <p className="wrHint">Each value here appears on every plotline under this {owner.kind}.</p>
        {owner.customFieldDefs.map(def => (
          <FieldBlock key={def.id} w={w} info={{ def, owner, scope: owner.kind === 'category' ? 'category' : 'subcategory' }} holder={owner} editable ui={ui} drag={drag} showAssigned />
        ))}
        {owner.customFieldDefs.length === 0 && <p className="wrMuted">No fields yet.</p>}
      </section>
    </div>
  )
}
