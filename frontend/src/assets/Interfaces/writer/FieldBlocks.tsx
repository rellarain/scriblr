import { useState } from 'react'
import type { PlotFieldSet, PlotNode } from '../../../api/types'
import { ChevronDownIcon, ChevronRightIcon, GripIcon, PlusIcon } from '../../icons'
import { ChoiceBody, KindSelect } from './ChoiceFields'
import { useFieldGroupDrop } from './useFieldGroupDrop'
import DragGap from '../../../components/DragGap'
import { gripProps, zoneRef, zoneRefs, type DropZone } from '../../../lib/pointerDrag'
import { usePlotOrder } from './plotOrder'
import { usePlotSetOpen } from './plotSetOpen'
import {
  FIELD_NAME_MAX, FIELDSET_NAME_MAX, MAX_FIELDSETS, fieldLayout, isScrapField, orderValues, scopeLayouts, setsOf, valuesIn, canMoveValue,
  type FieldInfo, type FieldScope,
} from './plotFields'
import { PlotValueCard } from './PlotValueCard'
import { KIND_LABEL, isChoice, kindOf } from './plotKinds'
import { isPlaced, placedCount } from './plotPlacement'
import { nodeLabel } from './plotTree'
import { DeleteControl } from './shared'
import type { WriterWorkspace } from './useWriterWorkspace'

// The fields of a category, subcategory, cluster or plotline, and their values.
//   FieldBlock    one field: a collapsible with its name, a count and its value cards (a choice field: its options and answers, ChoiceFields.tsx)
//   FieldSetBlock a named, collapsible group of fields
//   FieldList     the fields of one place as it lists them: the loose fields, then the fieldsets, then the Scrap field
//   FieldGroups   the plotline editor: collapsible groups, from where the fields come
//                 (the plotline's own on top, the cluster's, the subcategory's, the category's at the bottom)
//   FieldEditor   the category, subcategory and cluster editors: its own fields and their values

// Which fields are open (collapsed by default), shared with the keyboard shortcuts so that a
// value created from the keyboard is never made in a collapsed field.
export interface PlotUi {
  isOpen: (fieldId: string) => boolean
  setOpen: (fieldId: string, open: boolean) => void
  // A value just created, so its title can take focus.
  newValueId: string | null
  setNewValueId: (id: string | null) => void
  // The parent chips (PlotParents.tsx) left open, by level (category, subcategory, cluster): kept while another node is opened.
  openParents: Set<string>
  toggleParent: (kind: PlotNode['kind']) => void
}

// Dragging a value (to a chapter, or into another field), a field (to reorder, or into or out of a set) and a fieldset (to reorder).
export interface PlotDrag {
  dragId: string | null
  valueDrag: (id: string) => { onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }
  dropIntoField: (fieldId: string) => void
  dragFieldId: string | null
  setDragFieldId: (id: string | null) => void
  dragSetId: string | null
  setDragSetId: (id: string | null) => void
  // Answers cannot be dragged onto a chapter here (the category, subcategory and cluster editors): they show no grip for it.
  noPlacing?: boolean
}

export function FieldBlock({ w, info, holder, editable, ui, drag, showAssigned, slide, edge, lifted }: {
  w: WriterWorkspace
  info: FieldInfo
  // The node whose values are listed: the plotline being edited, or the owner itself.
  holder: PlotNode
  // The field's owner is being edited: its name, order and existence can be changed.
  editable: boolean
  ui: PlotUi
  drag: PlotDrag
  showAssigned: boolean
  // While a field is dragged in this block's group (useFieldGroupDrop.ts): how far it slides out of the way (px), a line drawn at its top or
  // bottom edge where the dragged field would land, and whether this is the dragged field itself, which has left its place.
  slide?: number
  edge?: 'before' | 'after' | null
  lifted?: boolean
}) {
  const { def, owner } = info
  const scrap = isScrapField(def)
  const choice = isChoice(def)
  const outlineById = new Map(w.outlineNodes.map(n => [n.id, n]))
  const all = valuesIn(w.plotNodes, holder.id, def.id)
  const [plotOrder] = usePlotOrder()
  const shown = orderValues(all, w.outlineNodes, w.activeProject?.settings.timeSystems ?? [], plotOrder)
    .filter(v => showAssigned || !isPlaced(v, outlineById))
  const open = ui.isOpen(def.id)
  const unassigned = all.filter(v => !isPlaced(v, outlineById)).length
  const placements = all.reduce((n, v) => n + placedCount(v, outlineById), 0)
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

  // A value dragged over the field is accepted as it enters as well as while it is over: a drag let go as it arrives, before the browser's next
  // dragover, would otherwise find nothing to drop on. (A dragged FIELD is the business of the group the block is in, useFieldGroupDrop.ts.)
  const allowDrop = (e: React.DragEvent) => {
    if (canDrop) { e.preventDefault(); setOver(true) }
  }

  return (
    <div
      className={`wrFieldBlock${over && canDrop ? ' wrFieldBlock--over' : ''}${drag.dragFieldId === def.id && !lifted ? ' wrFieldBlock--dragging' : ''}${lifted ? ' wrFieldBlock--lifted' : ''}${edge ? ` wrFieldBlock--${edge}` : ''}`}
      style={slide ? { transform: `translateY(${slide}px)` } : undefined}
      data-knode={def.id} data-field={def.id}
      onDragEnter={allowDrop} onDragOver={allowDrop}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        setOver(false)
        if (canDrop) { e.preventDefault(); e.stopPropagation(); drag.dropIntoField(def.id) }
      }}
    >
      <div className="wrFieldHead">
        <button type="button" className="wrFieldToggle" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${def.name || 'field'}`} onClick={() => ui.setOpen(def.id, !open)}>
          {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
        </button>
        {editable && !scrap && (
          <span
            className="wrGrip" aria-label="Drag to reorder fields" title="Drag to reorder"
            {...gripProps(`field:${owner.id}`, def.id, grip => grip.closest<HTMLElement>('[data-field]'), { start: drag.setDragFieldId, end: () => drag.setDragFieldId(null) })}
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
        {editable && !scrap
          ? <KindSelect w={w} owner={owner} def={def} ui={ui} />
          : choice && <span className="wrOutlineMeta wrFieldKind">{KIND_LABEL[kindOf(def)]}</span>}
        <span
          className="wrOutlineMeta wrFieldCount"
          title={choice ? `${all.length} ${all.length === 1 ? 'answer' : 'answers'}` : holder.kind === 'plotline' ? `${unassigned} not placed yet, of ${all.length}` : `${all.length} values`}
        >
          {holder.kind === 'plotline' && !choice ? `${unassigned} / ${all.length}` : all.length}
        </span>
        {holder.kind === 'plotline' && placements > 0 && (
          <span className="wrCount" title={`${placements} ${placements === 1 ? 'placement' : 'placements'} in all`}>×{placements}</span>
        )}
        {editable && !scrap && (
          <DeleteControl
            tone="dark" message={`Delete ${def.name || 'this field'}?`}
            onConfirm={() => w.removePlotField(owner.id, def.id)}
          />
        )}
      </div>
      {open && choice && <ChoiceBody w={w} info={info} holder={holder} editable={editable} drag={drag} />}
      {open && !choice && (
        <div className="wrFieldValues">
          {shown.map(v => (
            <PlotValueCard
              key={v.id} w={w} point={v} fieldName={def.name || 'Field'} autoFocus={v.id === ui.newValueId}
              drag={drag.valueDrag(v.id)}
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

// What one place lists: the loose fields, the fieldsets (each with its fields and the node that defines it) and the Scrap field.
interface FieldParts {
  loose: FieldInfo[]
  sets: Array<{ set: PlotFieldSet; owner: PlotNode; fields: FieldInfo[] }>
  scrap: FieldInfo | null
}
const hasFields = (parts: FieldParts) => parts.loose.length > 0 || parts.sets.length > 0 || parts.scrap !== null

// A named, collapsible group of fields. Its owner can rename it, drag it, add fields to it and delete it (the fields stay, loose); anyone
// else (a plotline looking at its category's set) sees it read-only.
function FieldSetBlock({ w, set, owner, fields, holder, editable, ui, drag, showAssigned }: {
  w: WriterWorkspace
  set: PlotFieldSet
  owner: PlotNode
  fields: FieldInfo[]
  holder: PlotNode
  editable: boolean
  ui: PlotUi
  drag: PlotDrag
  showAssigned: boolean
}) {
  const setUi = usePlotSetOpen()
  const open = setUi.isOpen(set.id)
  const [over, setHover] = useState(false)
  const [fresh] = useState(set.name === '')
  const draggedField = editable && drag.dragFieldId ? owner.customFieldDefs.find(d => d.id === drag.dragFieldId && !isScrapField(d)) : undefined
  const draggedSet = editable && drag.dragSetId && drag.dragSetId !== set.id && setsOf(owner).some(s => s.id === drag.dragSetId) ? drag.dragSetId : null
  const label = set.name || 'fieldset'
  // The set itself (its head, away from its rows) takes a dragged field as its last, and a dragged fieldset in front of it.
  const intoSet: DropZone = {
    over: () => setHover(true), leave: () => setHover(false),
    drop: () => {
      setHover(false)
      if (!draggedField) return
      w.setPlotFieldSet(owner.id, draggedField.id, set.id)
      drag.setDragFieldId(null)
      setUi.setOpen(set.id, true)
    },
  }
  const beforeSet: DropZone = {
    over: () => setHover(true), leave: () => setHover(false),
    drop: () => {
      setHover(false)
      if (!draggedSet) return
      w.movePlotFieldset(owner.id, draggedSet, set.id)
      drag.setDragSetId(null)
    },
  }
  // The rows of the set take a dragged field in the order the pointer asks for.
  const group = useFieldGroupDrop({
    kind: `field:${owner.id}`, ids: fields.map(f => f.def.id), draggedId: editable ? drag.dragFieldId : null, active: editable,
    onDrop: (id, before) => { w.setPlotFieldSet(owner.id, id, set.id, before, before === null); drag.setDragFieldId(null) },
  })

  // A set left unnamed is dropped when it holds nothing, and named otherwise.
  function nameBlur() {
    const trimmed = set.name.trim()
    if (trimmed !== '') { if (trimmed !== set.name) w.renamePlotFieldset(owner.id, set.id, trimmed); return }
    if (fields.length === 0) w.removePlotFieldset(owner.id, set.id)
    else w.renamePlotFieldset(owner.id, set.id, 'Untitled set')
  }

  return (
    <div
      className={`wrFieldSet${over && (draggedField || draggedSet) ? ' wrFieldSet--over' : ''}${drag.dragSetId === set.id ? ' wrFieldSet--dragging' : ''}`}
      role="group" aria-label={`Fieldset ${set.name}`} data-fieldset={set.id}
      ref={zoneRefs(zoneRef(`field:${owner.id}`, intoSet), zoneRef(`set:${owner.id}`, beforeSet))}
    >
      <div className="wrFieldSetHead">
        <button type="button" className="wrFieldToggle" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`} onClick={() => setUi.setOpen(set.id, !open)}>
          {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
        </button>
        {editable && (
          <span
            className="wrGrip" aria-label="Drag to reorder fieldsets" title="Drag to reorder"
            {...gripProps(`set:${owner.id}`, set.id, grip => grip.closest<HTMLElement>('[data-fieldset]'), { start: drag.setDragSetId, end: () => drag.setDragSetId(null) })}
          >
            <GripIcon size={14} />
          </span>
        )}
        {editable ? (
          <input
            className="wrFieldSetName" value={set.name} placeholder="Fieldset name" maxLength={FIELDSET_NAME_MAX} aria-label="Fieldset name" autoFocus={fresh}
            onChange={e => w.renamePlotFieldset(owner.id, set.id, e.target.value)} onBlur={nameBlur}
          />
        ) : (
          <span className="wrFieldSetNameText">{set.name}</span>
        )}
        <span className="wrOutlineMeta wrFieldCount" title={`${fields.length} ${fields.length === 1 ? 'field' : 'fields'}`}>{fields.length}</span>
        {editable && (
          <>
            <button
              type="button" className="wrSmallBtn" aria-label={`Add a field to ${label}`}
              onClick={() => { const id = w.addPlotField(owner.id, '', undefined, set.id); if (id) { ui.setOpen(id, true); setUi.setOpen(set.id, true) } }}
            >
              <PlusIcon size={13} /> Field
            </button>
            <DeleteControl
              tone="dark"
              message={fields.length > 0 ? `Delete ${set.name || 'this fieldset'}? Its ${fields.length === 1 ? 'field stays' : `${fields.length} fields stay`}.` : `Delete ${set.name || 'this fieldset'}?`}
              onConfirm={() => w.removePlotFieldset(owner.id, set.id)}
            />
          </>
        )}
      </div>
      {open && (
        <div ref={group.ref} className={`wrFieldSetBody${group.sliding ? ' wrFieldRows--sliding' : ''}${group.overEmpty ? ' wrFieldRows--over' : ''}`}>
          <DragGap rect={group.gap} />
          {fields.map(info => (
            <FieldBlock
              key={info.def.id} w={w} info={info} holder={holder} editable={editable} ui={ui} drag={drag} showAssigned={showAssigned}
              slide={group.slideOf(info.def.id)} edge={group.edgeOf(info.def.id)} lifted={group.isLifted(info.def.id)}
            />
          ))}
          {fields.length === 0 && <p className="wrMuted">{editable ? 'No fields yet. Drag one in or add one.' : 'No fields.'}</p>}
        </div>
      )}
    </div>
  )
}

// One place's fields as it lists them. While one of its own fields is dragged, a spot to take it out of its set; while one of its own
// sets is dragged, a spot to move it last. The spot stands BELOW the sets: opened above them it would push the rows (the dragged one among
// them) down in the very event the drag starts, and the browser cancels a drag whose source moves then.
function FieldList({ w, holder, parts, editable, ui, drag, showAssigned }: {
  w: WriterWorkspace; holder: PlotNode; parts: FieldParts; editable: boolean; ui: PlotUi; drag: PlotDrag; showAssigned: boolean
}) {
  const block = (info: FieldInfo) => <FieldBlock key={info.def.id} w={w} info={info} holder={holder} editable={editable} ui={ui} drag={drag} showAssigned={showAssigned} />
  const draggedField = editable && drag.dragFieldId ? parts.sets.flatMap(s => s.fields).find(f => f.def.id === drag.dragFieldId) : undefined
  const draggedSet = editable && drag.dragSetId && parts.sets.some(s => s.set.id === drag.dragSetId) ? drag.dragSetId : null
  // The loose fields take a dragged field (their own, or one taken out of a set) in the order the pointer asks for.
  const loose = useFieldGroupDrop({
    kind: `field:${holder.id}`, ids: parts.loose.map(f => f.def.id), draggedId: editable ? drag.dragFieldId : null, active: editable,
    onDrop: (id, before) => { w.setPlotFieldSet(holder.id, id, null, before, before === null); drag.setDragFieldId(null) },
  })
  // Taking the dragged field out of its set, last among the loose fields: dropped on the spot below the sets.
  const takeOut = () => {
    if (!draggedField) return
    w.setPlotFieldSet(holder.id, draggedField.def.id, null, null, true)
    drag.setDragFieldId(null)
  }
  return (
    <>
      {parts.loose.length > 0 && (
        <div ref={loose.ref} className={`wrFieldLoose${loose.sliding ? ' wrFieldRows--sliding' : ''}`}>
          <DragGap rect={loose.gap} />
          {parts.loose.map(info => (
            <FieldBlock
              key={info.def.id} w={w} info={info} holder={holder} editable={editable} ui={ui} drag={drag} showAssigned={showAssigned}
              slide={loose.slideOf(info.def.id)} edge={loose.edgeOf(info.def.id)} lifted={loose.isLifted(info.def.id)}
            />
          ))}
        </div>
      )}
      {parts.sets.map(s => (
        <FieldSetBlock key={s.set.id} w={w} set={s.set} owner={s.owner} fields={s.fields} holder={holder} editable={editable} ui={ui} drag={drag} showAssigned={showAssigned} />
      ))}
      {draggedField && (
        <p className="wrFieldDrop" ref={zoneRef(`field:${holder.id}`, { over: () => {}, leave: () => {}, drop: takeOut })}>Drop here to take it out of its set</p>
      )}
      {draggedSet && (
        <p
          className="wrFieldDrop"
          ref={zoneRef(`set:${holder.id}`, { over: () => {}, leave: () => {}, drop: () => { w.movePlotFieldset(holder.id, draggedSet, null); drag.setDragSetId(null) } })}
        >
          Drop here to move it last
        </p>
      )}
      {parts.scrap && block(parts.scrap)}
    </>
  )
}

// The "+ Field" and "+ Fieldset" buttons of a node that can define fields.
function AddButtons({ w, owner, ui }: { w: WriterWorkspace; owner: PlotNode; ui: PlotUi }) {
  const full = setsOf(owner).length >= MAX_FIELDSETS
  return (
    <span className="wrFieldGroupActions">
      <button type="button" className="wrSmallBtn" onClick={() => { const id = w.addPlotField(owner.id); if (id) ui.setOpen(id, true) }}>
        <PlusIcon size={13} /> Field
      </button>
      <button
        type="button" className="wrSmallBtn" disabled={full} title={full ? `A ${owner.kind} can have ${MAX_FIELDSETS} fieldsets` : 'A named group of fields'}
        onClick={() => w.addPlotFieldset(owner.id)}
      >
        <PlusIcon size={13} /> Fieldset
      </button>
    </span>
  )
}

// The origin of an inherited group, shown at the far right of its head (the title on the left is the parent's own).
const GROUP_ORIGIN: Partial<Record<FieldScope, string>> = { cluster: 'Cluster', subcategory: 'Subcategory', category: 'Category' }
const GROUP_TITLE: Record<FieldScope, (owners: PlotNode[]) => string> = {
  plotline: () => 'Plotline fields',
  cluster: owners => `From cluster: ${owners.map(nodeLabel).join(', ')}`,
  subcategory: owners => `From subcategory: ${owners.map(nodeLabel).join(', ')}`,
  category: owners => `From category: ${owners.map(nodeLabel).join(', ')}`,
}

// The scopes a node's fields come from above its own, nearest first: a cluster has its subcategory's and its category's, a subcategory its category's,
// a plotline all three.
const INHERITED: Record<PlotNode['kind'], FieldScope[]> = {
  plotpoint: [], category: [], subcategory: ['category'], cluster: ['subcategory', 'category'], plotline: ['cluster', 'subcategory', 'category'],
}

// The groups of fields a node inherits, each collapsible and read-only: the values are the node's own, the fields are defined above it.
function InheritedGroups({ w, holder, scopes, ui, drag, showAssigned, empty }: {
  w: WriterWorkspace; holder: PlotNode; scopes: FieldScope[]; ui: PlotUi; drag: PlotDrag; showAssigned: boolean; empty?: string
}) {
  const layouts = scopeLayouts(holder, w.plotNodeById)
  const [closed, setClosed] = useState<Set<FieldScope>>(new Set())
  const toggle = (scope: FieldScope) => setClosed(prev => { const next = new Set(prev); if (next.has(scope)) next.delete(scope); else next.add(scope); return next })
  return (
    <>
      {scopes.map(scope => {
        const parts = layouts[scope]
        if (parts.owners.length === 0) return null
        const owners = parts.owners
        const isClosed = closed.has(scope)
        return (
          <section key={scope} className="wrFieldGroup" aria-label={GROUP_TITLE[scope](owners)}>
            <div className="wrFieldGroupHead">
              <button type="button" className="wrFieldToggle" aria-expanded={!isClosed} aria-label={GROUP_TITLE[scope](owners)} onClick={() => toggle(scope)}>
                {isClosed ? <ChevronRightIcon size={14} /> : <ChevronDownIcon size={14} />}
                <span className="wrFieldGroupName">{owners.map(nodeLabel).join(', ')}</span>
              </button>
              <span className="wrFieldGroupOrigin">{GROUP_ORIGIN[scope]}</span>
            </div>
            {!isClosed && <FieldList w={w} holder={holder} parts={parts} editable={false} ui={ui} drag={drag} showAssigned={showAssigned} />}
            {!isClosed && !hasFields(parts) && empty && <p className="wrMuted">{empty}</p>}
          </section>
        )
      })}
    </>
  )
}

// The plotline editor's fields: plotline fields on top, then the cluster's, the subcategory's, then the category's.
export function FieldGroups({ w, plotline, ui, drag, showAssigned }: {
  w: WriterWorkspace; plotline: PlotNode; ui: PlotUi; drag: PlotDrag; showAssigned: boolean
}) {
  const own = scopeLayouts(plotline, w.plotNodeById).plotline
  const [closed, setClosed] = useState(false)
  return (
    <div className="wrFieldGroups">
      <section className="wrFieldGroup" aria-label={GROUP_TITLE.plotline([])}>
        <div className="wrFieldGroupHead">
          <button type="button" className="wrFieldToggle" aria-expanded={!closed} aria-label={GROUP_TITLE.plotline([])} onClick={() => setClosed(c => !c)}>
            {closed ? <ChevronRightIcon size={14} /> : <ChevronDownIcon size={14} />}
            <span className="wrFieldGroupName">{GROUP_TITLE.plotline([])}</span>
          </button>
          <AddButtons w={w} owner={plotline} ui={ui} />
        </div>
        {!closed && <FieldList w={w} holder={plotline} parts={own} editable ui={ui} drag={drag} showAssigned={showAssigned} />}
        {!closed && !hasFields(own) && <p className="wrMuted">No fields yet. Add one to start listing plotpoints.</p>}
      </section>
      <InheritedGroups w={w} holder={plotline} scopes={INHERITED.plotline} ui={ui} drag={drag} showAssigned={showAssigned} empty="No fields yet. Add one to start listing plotpoints." />
    </div>
  )
}

// The category, subcategory and cluster editors: the node's own fields, with the values every
// plotline under it will show.
export function FieldEditor({ w, owner, ui, drag }: { w: WriterWorkspace; owner: PlotNode; ui: PlotUi; drag: PlotDrag }) {
  const scope: FieldScope = owner.kind === 'category' ? 'category' : owner.kind === 'cluster' ? 'cluster' : 'subcategory'
  const layout = fieldLayout(owner)
  const infoOf = (def: FieldInfo['def']): FieldInfo => ({ def, owner, scope })
  const parts: FieldParts = {
    loose: layout.loose.map(infoOf),
    sets: layout.sets.map(s => ({ set: s.set, owner, fields: s.fields.map(infoOf) })),
    scrap: layout.scrap ? infoOf(layout.scrap) : null,
  }
  return (
    <div className="wrFieldGroups">
      <section className="wrFieldGroup" aria-label="Fields">
        <div className="wrFieldGroupHead">
          <span className="wrLabel">Fields</span>
          <AddButtons w={w} owner={owner} ui={ui} />
        </div>
        <p className="wrHint">Each value here appears on every plotline under this {owner.kind}.</p>
        <FieldList w={w} holder={owner} parts={parts} editable ui={ui} drag={drag} showAssigned />
        {!hasFields(parts) && <p className="wrMuted">No fields yet.</p>}
      </section>
      {/* A subcategory has its category's fields and a cluster its subcategory's and its category's: shown here, read-only, with the node's own values. */}
      <InheritedGroups w={w} holder={owner} scopes={INHERITED[owner.kind]} ui={ui} drag={drag} showAssigned />
    </div>
  )
}
