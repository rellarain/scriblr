import { useMemo, useRef, useState } from 'react'
import type { PlotNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { ChevronRightIcon, PlusIcon } from '../../icons'
import { ChipEditor, DeleteControl } from './shared'
import { focusNodeField, useNodeKeys } from '../../../lib/nodeKeys'
import { ColorRange } from '../../../components/ColorRange'
import { coverColor, hueDelta, hueWindow, wrapHue } from '../../../theme/bookColors'
import { derivedShades } from '../../../theme/palettes'
import { useThemeState } from '../../../theme/useTheme'
import { plotColors, plotColorVars } from './plotColors'
import { assignedLevel, nodeLabel, sortByTitle } from './plotTree'
import { FieldEditor, FieldGroups, type PlotDrag, type PlotUi } from './FieldBlocks'
import { PlotOutlinePanel } from './PlotOutlinePanel'
import { fieldIndex, isScrapField, orderValues, valuesIn } from './plotFields'

// Project Plot: a collapsible navigation column (categories > subcategories
// > plotlines, alphabetized) and two page views -- the category/subcategory
// editor, and the plotline editor: its plotpoints listed unassigned first and
// then in order of occurrence, dragged onto the books and chapters of the
// outline. A plotpoint assigned within a chapter (to an act, scene or moment,
// from the chapter page) is locked here; the others can be unassigned.

function plotlineCount(node: PlotNode, children: Map<string | null, PlotNode[]>): number {
  return (children.get(node.id) ?? []).reduce(
    (n, c) => n + (c.kind === 'plotline' ? 1 : c.kind === 'plotpoint' ? 0 : plotlineCount(c, children)), 0)
}

function PlotNav({ w }: { w: WriterWorkspace }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const children = w.plotChildrenByParentId

  // Everything is open by default; the chevron collapses a branch.
  const toggle = (id: string) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  function rows(parentId: string | null): React.ReactNode[] {
    return sortByTitle((children.get(parentId) ?? []).filter(n => n.kind !== 'plotpoint'))
      .flatMap(node => {
        const kids = (children.get(node.id) ?? []).filter(c => c.kind !== 'plotpoint')
        const hasKids = kids.length > 0
        const open = !collapsed.has(node.id)
        const isLine = node.kind === 'plotline'
        return [
          <div
            key={node.id}
            className={`wrNavRow wrNavRow--${node.kind}${node.id === w.focusedPlotNodeId ? ' wrNavRow--active' : ''}`}
            style={plotColorVars(plotColors(node, w.plotNodeById))}
          >
            <button
              type="button" className="wrNavChevron" aria-label={open ? 'Collapse' : 'Expand'}
              style={{ visibility: hasKids ? 'visible' : 'hidden', transform: open ? 'rotate(90deg)' : undefined }}
              onClick={() => toggle(node.id)}
            >
              <ChevronRightIcon size={12} />
            </button>
            <button type="button" className="wrNavLabel" onClick={() => w.focusPlotNode(node.id)}>{nodeLabel(node)}</button>
            {!isLine && <span className="wrNavCount">{plotlineCount(node, children)}</span>}
          </div>,
          ...(open ? rows(node.id) : []),
        ]
      })
  }

  return (
    <div className="wrPlotNav">
      <div className="wrPlotNavHead">
        <span>Categories</span>
        <button type="button" className="wrSmallBtn" onClick={() => w.focusPlotNode(w.addPlotNode(null, 'category'))}>
          <PlusIcon size={13} /> Category
        </button>
      </div>
      <div className="wrPlotNavRows">
        {w.plotNodes.length === 0 && <p className="wrMuted">No categories yet.</p>}
        {rows(null)}
      </div>
    </div>
  )
}

function ChildRows({ w, node, kind, addLabel }: { w: WriterWorkspace; node: PlotNode; kind: 'subcategory' | 'plotline'; addLabel: string }) {
  const kids = sortByTitle((w.plotChildrenByParentId.get(node.id) ?? []).filter(c => c.kind === kind))
  return (
    <div className="wrChildRows">
      <div className="wrChildRowsHead">
        <span className="wrLabel">{kind === 'subcategory' ? 'Subcategories' : 'Plotlines'}</span>
        <button type="button" className="wrSmallBtn" onClick={() => w.focusPlotNode(w.addPlotNode(node.id, kind))}>
          <PlusIcon size={13} /> {addLabel}
        </button>
      </div>
      {kids.length === 0 && <p className="wrMuted">None yet.</p>}
      {kids.map(k => (
        <button key={k.id} type="button" className="wrChildRow" onClick={() => w.focusPlotNode(k.id)}>
          <span className="wrChildRowTitle">{nodeLabel(k)}</span>
          <span className="wrChildRowMeta">
            {k.keywords.slice(0, 3).map(kw => <span key={kw} className="wrChip wrChip--small">{kw}</span>)}
          </span>
          {k.kind === 'subcategory' && <span className="wrOutlineMeta">{plotlineCount(k, w.plotChildrenByParentId)} plotlines</span>}
          {k.kind === 'plotline' && <span className="wrOutlineMeta">{(w.plotChildrenByParentId.get(k.id) ?? []).length} plotpoints</span>}
        </button>
      ))}
    </div>
  )
}

// The hue selector of a category (theme colour) or subcategory (accent colour,
// within 60 degrees of its category's hue). Saturation and lightness are the
// active zone's, so what the thumb shows is what the app draws.
function HueField({ w, node }: { w: WriterWorkspace; node: PlotNode }) {
  const { settings, activeZone } = useThemeState()
  const pal = settings.zones[activeZone].palette
  if (node.kind === 'subcategory') {
    const accentFill = derivedShades(pal, 'accent', activeZone)[0].color
    const category = node.parentId ? w.plotNodeById.get(node.parentId) : undefined
    const centre = category?.hue ?? pal.theme.h
    const { min, max } = hueWindow(centre)
    const shown = centre + hueDelta(centre, node.hue ?? centre) // the same hue, inside the window
    return (
      <div>
        <div className="wrLabel">Colour <span className="wrOutlineMeta">within 60° of its category</span></div>
        <ColorRange
          label="Subcategory colour" value={shown} min={min} max={max}
          sat={accentFill.s} light={accentFill.l}
          onChange={v => w.setPlotHue(node.id, wrapHue(v), centre)}
        />
      </div>
    )
  }
  const cover = coverColor(pal, activeZone, node.hue ?? pal.theme.h)
  return (
    <div>
      <div className="wrLabel">Colour</div>
      <ColorRange
        label="Category colour" value={node.hue ?? pal.theme.h} sat={cover.s} light={cover.l}
        onChange={v => w.setPlotHue(node.id, v)}
      />
    </div>
  )
}

function KeywordsField({ w, node }: { w: WriterWorkspace; node: PlotNode }) {
  return (
    <div>
      <div className="wrLabel">Keywords</div>
      <ChipEditor
        items={node.keywords.map(k => ({ key: k, label: k }))} placeholder="Add keyword…"
        onAdd={k => w.addPlotKeyword(node.id, k)} onRemove={k => w.removePlotKeyword(node.id, k)}
      />
    </div>
  )
}

// Dragging does nothing in the category and subcategory editors (their values are not assigned there).
const NO_DRAG: PlotDrag = {
  dragId: null, valueDrag: () => ({ onDragStart: () => {}, onDragEnd: () => {} }), dropIntoField: () => {}, dragFieldId: null, setDragFieldId: () => {},
}

function CategoryEditor({ w, node, ui }: { w: WriterWorkspace; node: PlotNode; ui: PlotUi }) {
  const [dragFieldId, setDragFieldId] = useState<string | null>(null)
  const isCategory = node.kind === 'category'
  const colors = plotColors(node, w.plotNodeById)
  return (
    <div className={`wrCardPanel wrCardPanel--${node.kind}`} data-knode={node.id} style={plotColorVars(colors)}>
      <div className="wrCardPanelHead">
        <span className="wrKindBadge">{node.kind}</span>
        <input className="wrTitleField" data-kf="" value={node.title} onChange={e => w.updatePlotNodeField(node.id, 'title', e.target.value)} placeholder={`${isCategory ? 'Category' : 'Subcategory'} title`} />
        <DeleteControl
          tone="dark" message={`Delete ${nodeLabel(node)}? Its plotlines move to Unassigned.`}
          onConfirm={() => w.deletePlotNode(node.id)}
        />
      </div>
      <div>
        <div className="wrLabel">Description</div>
        <textarea
          className="wrField" data-kf="" rows={2} placeholder="Description" value={node.body}
          onChange={e => w.updatePlotNodeField(node.id, 'body', e.target.value)}
        />
      </div>
      <HueField w={w} node={node} />
      <KeywordsField w={w} node={node} />
      <FieldEditor w={w} owner={node} ui={ui} drag={{ ...NO_DRAG, dragFieldId, setDragFieldId }} />
      {isCategory && <ChildRows w={w} node={node} kind="subcategory" addLabel="Subcategory" />}
      <ChildRows w={w} node={node} kind="plotline" addLabel="Plotline" />
    </div>
  )
}

function PlotlineEditor({ w, node, ui }: { w: WriterWorkspace; node: PlotNode; ui: PlotUi }) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragFieldId, setDragFieldId] = useState<string | null>(null)
  const [showAssigned, setShowAssigned] = useState(true)

  const outlineById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  const points = w.plotNodes.filter(p => p.kind === 'plotpoint' && p.parentId === node.id)
  const hasAssigned = points.some(p => assignedLevel(p, outlineById) !== 'none')
  const colors = plotColors(node, w.plotNodeById)

  const drag: PlotDrag = {
    dragId,
    valueDrag: id => ({
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
        const card = (e.currentTarget as HTMLElement).closest('[data-point]')
        if (card) e.dataTransfer.setDragImage(card, 12, 12)
        setDragId(id)
      },
      onDragEnd: () => setDragId(null),
    }),
    dropIntoField: fieldId => { if (dragId) w.movePlotValue(dragId, fieldId); setDragId(null) },
    dragFieldId, setDragFieldId,
  }

  return (
    <div className="wrPlotlineLayout">
      <div className="wrPlotlineLeft">
        <div className="wrCardPanel wrCardPanel--plotline" data-knode={node.id} style={plotColorVars(colors)}>
          <div className="wrCardPanelHead">
            <span className="wrKindBadge">plotline</span>
            <input className="wrTitleField" data-kf="" value={node.title} onChange={e => w.updatePlotNodeField(node.id, 'title', e.target.value)} placeholder="Plotline title" />
            <DeleteControl
              tone="dark" message={`Delete ${nodeLabel(node)} and its plotpoints?`} onConfirm={() => w.deletePlotNode(node.id)}
              blockedReason={hasAssigned ? 'Unassign this plotline\'s plotpoints first' : undefined}
            />
          </div>
          <div>
            <div className="wrLabel">Description</div>
            <textarea
              className="wrField" data-kf="" rows={2} placeholder="Description" value={node.body}
              onChange={e => w.updatePlotNodeField(node.id, 'body', e.target.value)}
            />
          </div>
          <KeywordsField w={w} node={node} />
        </div>

        <div className="wrFieldsPanel">
          <div className="wrChildRowsHead">
            <span className="wrLabel">Fields</span>
            <label className="wrShowAssigned">
              <input type="checkbox" role="switch" checked={showAssigned} onChange={e => setShowAssigned(e.target.checked)} />
              <span>Show assigned</span>
            </label>
          </div>
          <FieldGroups w={w} plotline={node} ui={ui} drag={drag} showAssigned={showAssigned} />
        </div>
      </div>

      <div className="wrPlotlineRight">
        <PlotOutlinePanel
          w={w} plotline={node} dragId={dragId}
          onDropChapter={chapterId => { if (dragId) w.assignPlotpoint(dragId, chapterId); setDragId(null) }}
        />
      </div>
    </div>
  )
}

const isBlank = (text: string | undefined) => !text || text.trim() === ''

export default function PlotView({ w }: { w: WriterWorkspace }) {
  const node = w.focusedPlotNode
  // Kinds of nodes created a moment ago (the workspace maps have not updated yet),
  // so focusing one can also open its editor.
  const created = useRef(new Map<string, PlotNode['kind']>())

  // Which fields are open (collapsed by default), and the value just created (it takes focus).
  const [openFields, setOpenFields] = useState<Set<string>>(new Set())
  const [newValueId, setNewValueId] = useState<string | null>(null)
  const ui: PlotUi = {
    isOpen: id => openFields.has(id),
    setOpen: (id, open) => setOpenFields(prev => {
      if (prev.has(id) === open) return prev
      const next = new Set(prev)
      if (open) next.add(id)
      else next.delete(id)
      return next
    }),
    newValueId, setNewValueId,
  }

  const fields = useMemo(() => fieldIndex(w.plotNodes), [w.plotNodes])
  const outlineById = useMemo(() => new Map(w.outlineNodes.map(o => [o.id, o])), [w.outlineNodes])

  // Keyboard shortcuts (lib/nodeKeys.ts). Categories, subcategories and plotlines are
  // separate editors, so a sibling is shown by focusing it. Inside an editor a node's fields
  // are nodes too: a field's parent is the node being edited, a value's parent is its field.
  //   Enter        the next value in its field, or the next field after a field name
  //   Shift+Enter  a child: category > subcategory > plotline > a value in its first field,
  //                a field > a value in it, a value has none
  //   Ctrl+Enter   a value > a new field after its field, a field > a new sibling of the node
  const holderOf = (fieldId: string) => (node?.kind === 'plotline' ? node : fields.get(fieldId)?.owner)
  const siblingValues = (id: string) => {
    const v = w.plotNodeById.get(id)
    if (!v?.parentId || !v.fieldId) return [id]
    return orderValues(valuesIn(w.plotNodes, v.parentId, v.fieldId), w.outlineNodes, w.activeProject?.settings.timeSystems ?? []).map(x => x.id)
  }
  const keys = useNodeKeys({
    parentOf: id => {
      if (fields.has(id)) return node?.id ?? null
      const n = w.plotNodeById.get(id)
      if (!n) return null
      if (n.kind === 'plotpoint') return n.fieldId && fields.has(n.fieldId) ? n.fieldId : n.parentId
      return n.parentId
    },
    siblingsOf: id => {
      const f = fields.get(id)
      if (f) return f.owner.customFieldDefs.map(d => d.id)
      const n = w.plotNodeById.get(id)
      if (!n) return [id]
      if (n.kind === 'plotpoint') return siblingValues(id)
      return sortByTitle((w.plotChildrenByParentId.get(n.parentId) ?? []).filter(c => c.kind === n.kind)).map(c => c.id)
    },
    isEmpty: id => {
      const f = fields.get(id)
      if (f) return isBlank(f.def.name) && !isScrapField(f.def) && !w.plotNodes.some(p => p.fieldId === id)
      const n = w.plotNodeById.get(id)
      if (!n) return true
      if (n.kind === 'plotpoint') return !n.refId && isBlank(n.title) && isBlank(n.body) && assignedLevel(n, outlineById) === 'none'
      if (!isBlank(n.title) || !isBlank(n.body) || n.keywords.length > 0 || n.customFieldDefs.length > 0) return false
      return (w.plotChildrenByParentId.get(id) ?? []).filter(c => !c.refId).length === 0
    },
    createSibling: id => {
      const f = fields.get(id)
      if (f) { const made = w.addPlotField(f.owner.id, '', id); if (made) ui.setOpen(made, true); return made }
      const n = w.plotNodeById.get(id)
      if (!n) return null
      if (n.kind === 'plotpoint') {
        if (!n.parentId || !n.fieldId) return null
        ui.setOpen(n.fieldId, true)
        return w.addPlotValue(n.parentId, n.fieldId, id)
      }
      const made = w.addPlotNode(n.parentId, n.kind, undefined, id)
      created.current.set(made, n.kind)
      return made
    },
    // A value or field starts at the plot node above it; a plotline goes down into its first field.
    createChild: id => {
      const f = fields.get(id)
      if (f) {
        const holder = holderOf(id)
        if (!holder) return null
        ui.setOpen(id, true)
        return w.addPlotValue(holder.id, id)
      }
      const n = w.plotNodeById.get(id)
      if (!n || n.kind === 'plotpoint') return null
      if (n.kind === 'plotline') {
        const first = n.customFieldDefs.find(d => !isScrapField(d)) ?? undefined
        const fieldId = first?.id ?? w.addPlotField(n.id, 'Default')
        if (!fieldId) return null
        ui.setOpen(fieldId, true)
        return w.addPlotValue(n.id, fieldId)
      }
      const kind = n.kind === 'category' ? 'subcategory' : 'plotline'
      const made = w.addPlotNode(n.id, kind)
      created.current.set(made, kind)
      return made
    },
    canCreateChild: id => {
      if (fields.has(id)) return Boolean(holderOf(id))
      const n = w.plotNodeById.get(id)
      return Boolean(n && n.kind !== 'plotpoint')
    },
    // value -> a new field after its field, field -> a new sibling of the node being edited,
    // node -> a new sibling of its parent.
    createParentSibling: id => {
      const f = fields.get(id)
      if (f) {
        if (!node) return null
        const made = w.addPlotNode(node.parentId, node.kind, undefined, node.id)
        created.current.set(made, node.kind)
        return made
      }
      const n = w.plotNodeById.get(id)
      if (!n) return null
      if (n.kind === 'plotpoint') {
        const info = n.fieldId ? fields.get(n.fieldId) : undefined
        const ownerId = info && (info.owner.id === node?.id || info.owner.kind === 'plotline') ? info.owner.id : node?.id
        if (!ownerId) return null
        const made = w.addPlotField(ownerId, '', info?.owner.id === ownerId ? n.fieldId ?? undefined : undefined)
        if (made) ui.setOpen(made, true)
        return made
      }
      const parent = n.parentId ? w.plotNodeById.get(n.parentId) : undefined
      if (!parent) return null
      const made = w.addPlotNode(parent.parentId, parent.kind, undefined, parent.id)
      created.current.set(made, parent.kind)
      return made
    },
    canCreateParentSibling: id => {
      if (fields.has(id)) return Boolean(node)
      const n = w.plotNodeById.get(id)
      if (n?.kind === 'plotpoint') return Boolean(node)
      const parentId = n?.parentId
      return Boolean(parentId && w.plotNodeById.get(parentId))
    },
    remove: id => {
      const f = fields.get(id)
      if (f) w.removePlotField(f.owner.id, id)
      else if (w.plotNodeById.get(id)?.kind === 'plotpoint') w.removePlotValue(id)
      else w.deletePlotNode(id)
    },
    focusNode: (id, which) => {
      const v = w.plotNodeById.get(id)
      if (v?.kind === 'plotpoint' && v.fieldId) ui.setOpen(v.fieldId, true)
      const kind = v?.kind ?? created.current.get(id)
      if (kind && kind !== 'plotpoint' && w.focusedPlotNodeId !== id) w.focusPlotNode(id)
      return focusNodeField(id, which)
    },
  })

  return (
    <div className="wrPlotView">
      <PlotNav w={w} />
      <div className="wrPlotBody" onKeyDown={keys.onKeyDown}>
        {w.plotSaveError && <p className="wrError">{w.plotSaveError}</p>}
        {w.plotStatus === 'loading' && <p className="wrMuted">Loading plot…</p>}
        {w.plotStatus === 'error' && <p className="wrError">{w.plotError ?? 'Failed to load plot.'}</p>}
        {w.plotStatus === 'idle' && !node && <p className="wrMuted">Select a category or plotline to edit it, or add a category.</p>}
        {w.plotStatus === 'idle' && node && (node.kind === 'plotline'
          ? <PlotlineEditor key={node.id} w={w} node={node} ui={ui} />
          : node.kind === 'plotpoint'
            ? <p className="wrMuted">Plotpoints are edited from their plotline.</p>
            : <CategoryEditor key={node.id} w={w} node={node} ui={ui} />)}
      </div>
    </div>
  )
}
