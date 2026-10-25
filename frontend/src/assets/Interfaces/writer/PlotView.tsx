import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlotNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from '../../icons'
import { ChipEditor, DeleteControl } from './shared'
import { focusNodeField, useNodeKeys } from '../../../lib/nodeKeys'
import { hueOfCode, rangeOf } from '../../../theme/bookColors'
import { useThemeState } from '../../../theme/useTheme'
import HueSlider from './HueSlider'
import { plotColors, plotColorVars } from './plotColors'
import { assignedLevel, nodeLabel, plotTrail, sortByTitle } from './plotTree'
import { plotParentOf, shownPlotHue } from './plotHues'
import { FieldEditor, FieldGroups, type PlotDrag, type PlotUi } from './FieldBlocks'
import { PlotOutlinePanel } from './PlotOutlinePanel'
import { PlotNav, plotlineCount } from './PlotNav'
import { PlotCompare } from './PlotCompare'
import { PlotParents } from './PlotParents'
import { PLOT_BREAKPOINTS, plotSizeOf, useElementWidth } from './useElementWidth'
import { PlotOrderToggle, usePlotOrder } from './plotOrder'
import { fieldIndex, isScrapField, orderValues, valuesIn } from './plotFields'

// Project Plot: a collapsible navigation column (categories > subcategories
// > clusters > plotlines, alphabetized) and two page views -- the category/subcategory/cluster
// editor, and the plotline editor: its plotpoints listed unassigned first and
// then in order of occurrence, dragged onto the books and chapters of the
// outline. A plotpoint assigned within a chapter (to an act, scene or moment,
// from the Outline level) is locked here; the others can be unassigned.
//
// The tool follows its own width (useElementWidth.ts): wide, the contents beside the editor; medium, the same but a plotline's
// chapters under its fields; compact, one column with the contents as a bar on top. Ticking two or more plotlines in the contents
// opens the compare view (PlotCompare.tsx) in place of the editor.

const counted = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

function ChildRows({ w, node, kind, addLabel }: { w: WriterWorkspace; node: PlotNode; kind: 'subcategory' | 'cluster' | 'plotline'; addLabel: string }) {
  const kids = sortByTitle((w.plotChildrenByParentId.get(node.id) ?? []).filter(c => c.kind === kind))
  return (
    <div className="wrChildRows">
      <div className="wrChildRowsHead">
        <span className="wrLabel">{kind === 'subcategory' ? 'Subcategories' : kind === 'cluster' ? 'Clusters' : 'Plotlines'}</span>
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
          {(k.kind === 'subcategory' || k.kind === 'cluster') && <span className="wrOutlineMeta">{counted(plotlineCount(k, w.plotChildrenByParentId), 'plotline')}</span>}
          {k.kind === 'plotline' && <span className="wrOutlineMeta">{counted((w.plotChildrenByParentId.get(k.id) ?? []).length, 'plotpoint')}</span>}
        </button>
      ))}
    </div>
  )
}

// The colour selector of a category (within 90 degrees of the project's hue), subcategory (within 60 of its category's) or cluster (within 30 of
// its subcategory's, or of its category's when it sits straight under one). Saturation and lightness are the active
// zone's, so what the thumb shows is what the app draws.
function HueField({ w, node }: { w: WriterWorkspace; node: PlotNode }) {
  const { settings, activeZone } = useThemeState()
  const appCode = settings.zones[activeZone].palette.theme.h
  if (node.kind === 'subcategory' || node.kind === 'cluster') {
    const parent = plotParentOf(node, w.plotNodeById)
    // The hue the parent shows; a node with no colour of its own shows it too.
    const parentCode = shownPlotHue(parent, w.plotNodeById, appCode)
    return (
      <div>
        <div className="wrLabel">Colour <span className="wrOutlineMeta">within {rangeOf(node.kind)}° of its {parent?.kind ?? 'category'}</span></div>
        <HueSlider
          label={node.kind === 'cluster' ? 'Cluster colour' : 'Subcategory colour'} hue={node.hue ?? parentCode} centre={hueOfCode(parentCode)} range={rangeOf(node.kind)}
          onChange={code => w.setPlotHue(node.id, code, parentCode)}
        />
      </div>
    )
  }
  return (
    <div>
      <div className="wrLabel">Colour <span className="wrOutlineMeta">within {rangeOf('category')}° of the project</span></div>
      <HueSlider
        label="Category colour" hue={node.hue ?? appCode} centre={w.projectHue} range={rangeOf('category')}
        onChange={code => w.setPlotHue(node.id, code)}
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

// Dragging does nothing in the category, subcategory and cluster editors (their values are not assigned there).
const NO_DRAG: PlotDrag = {
  dragId: null, valueDrag: () => ({ onDragStart: () => {}, onDragEnd: () => {} }), dropIntoField: () => {}, dragFieldId: null, setDragFieldId: () => {},
}

function CategoryEditor({ w, node, ui }: { w: WriterWorkspace; node: PlotNode; ui: PlotUi }) {
  const [dragFieldId, setDragFieldId] = useState<string | null>(null)
  const isCategory = node.kind === 'category'
  const colors = plotColors(node, w.plotNodeById)
  return (
    <div className={`wrCardPanel wrCardPanel--${node.kind}`} data-knode={node.id} style={plotColorVars(colors)}>
      <PlotParents node={node} byId={w.plotNodeById} open={ui.openParents} onToggle={ui.toggleParent} onOpen={w.focusPlotNode} />
      <div className="wrCardPanelHead">
        <span className="wrKindBadge">{node.kind}</span>
        <input className="wrTitleField" data-kf="" value={node.title} onChange={e => w.updatePlotNodeField(node.id, 'title', e.target.value)} placeholder={`${node.kind.charAt(0).toUpperCase()}${node.kind.slice(1)} title`} />
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
      {node.kind === 'subcategory' && <ChildRows w={w} node={node} kind="cluster" addLabel="Cluster" />}
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
          <PlotParents node={node} byId={w.plotNodeById} open={ui.openParents} onToggle={ui.toggleParent} onOpen={w.focusPlotNode} />
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
            <PlotOrderToggle />
          </div>
          <FieldGroups w={w} plotline={node} ui={ui} drag={drag} showAssigned={showAssigned} />
        </div>
      </div>

      <div className="wrPlotlineRight">
        <PlotOutlinePanel
          w={w} plotlines={[node]} dragId={dragId}
          onDropChapter={chapterId => { if (dragId) w.assignPlotpoint(dragId, chapterId); setDragId(null) }}
        />
      </div>
    </div>
  )
}

const isBlank = (text: string | undefined) => !text || text.trim() === ''

export default function PlotView({ w }: { w: WriterWorkspace }) {
  const [plotOrder] = usePlotOrder()
  const node = w.focusedPlotNode
  // Kinds of nodes created a moment ago (the workspace maps have not updated yet),
  // so focusing one can also open its editor.
  const created = useRef(new Map<string, PlotNode['kind']>())
  // The tool's own width picks its layout; the compare view opens when plotlines are ticked and gives way to a row's editor.
  const [sizeRef, width] = useElementWidth<HTMLDivElement>(PLOT_BREAKPOINTS)
  const size = plotSizeOf(width)
  const [barOpen, setBarOpen] = useState(false)
  // The contents drawer closes on Escape or a click outside the bar.
  useEffect(() => {
    if (!barOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBarOpen(false) }
    const onDown = (e: MouseEvent) => { if (!(e.target as Element | null)?.closest?.('.wrPlotBar')) setBarOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [barOpen])
  const [compareOpen, setCompareOpen] = useState(false)
  const selectedLines = w.plotSelection.map(id => w.plotNodeById.get(id)).filter((n): n is PlotNode => n?.kind === 'plotline')
  const tickedCount = selectedLines.length
  const lastTicked = useRef(0)
  useEffect(() => {
    if (tickedCount < 2) setCompareOpen(false)
    else if (tickedCount > lastTicked.current) setCompareOpen(true)
    lastTicked.current = tickedCount
  }, [tickedCount])
  const comparing = compareOpen && tickedCount >= 2
  // A node opens at the top of its editor, not where the last one was scrolled to.
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (bodyRef.current) { bodyRef.current.scrollTop = 0; bodyRef.current.scrollLeft = 0 } }, [node?.id, comparing])

  // Which fields are open (collapsed by default), and the value just created (it takes focus).
  const [openFields, setOpenFields] = useState<Set<string>>(new Set())
  const [newValueId, setNewValueId] = useState<string | null>(null)
  // The levels whose parent chips are left open, kept while moving from one node to another (open the category chip once and every editor's
  // category chip is open).
  const [openParents, setOpenParents] = useState<Set<string>>(new Set())
  const toggleParent = (kind: string) => setOpenParents(prev => { const next = new Set(prev); if (next.has(kind)) next.delete(kind); else next.add(kind); return next })
  const ui: PlotUi = {
    openParents, toggleParent,
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

  // A plotpoint pointed at (a click in the compare view or the chapter outline) is brought into view, its field opened.
  useEffect(() => {
    if (!w.highlightedPointId) return
    bodyRef.current?.querySelector(`[data-point="${w.highlightedPointId}"]`)?.scrollIntoView?.({ block: 'center' })
  }, [w.highlightedPointId, node?.id, openFields])

  const fields = useMemo(() => fieldIndex(w.plotNodes), [w.plotNodes])
  const outlineById = useMemo(() => new Map(w.outlineNodes.map(o => [o.id, o])), [w.outlineNodes])

  // Keyboard shortcuts (lib/nodeKeys.ts). Categories, subcategories and plotlines are
  // separate editors, so a sibling is shown by focusing it. Inside an editor a node's fields
  // are nodes too: a field's parent is the node being edited, a value's parent is its field.
  //   Enter        the next value in its field, or the next field after a field name
  //   Shift+Enter  a child: category > subcategory > cluster > plotline > a value in its first field,
  //                a field > a value in it, a value has none
  //   Ctrl+Enter   a value > a new field after its field, a field > a new sibling of the node
  const holderOf = (fieldId: string) => (node?.kind === 'plotline' ? node : fields.get(fieldId)?.owner)
  const siblingValues = (id: string) => {
    const v = w.plotNodeById.get(id)
    if (!v?.parentId || !v.fieldId) return [id]
    return orderValues(valuesIn(w.plotNodes, v.parentId, v.fieldId), w.outlineNodes, w.activeProject?.settings.timeSystems ?? [], plotOrder).map(x => x.id)
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
      const kind = n.kind === 'category' ? 'subcategory' : n.kind === 'subcategory' ? 'cluster' : 'plotline'
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

  const nav = (
    <PlotNav
      w={w}
      onOpenNode={() => { setCompareOpen(false); setBarOpen(false) }}
      onCompare={() => { setCompareOpen(true); setBarOpen(false) }}
    />
  )
  // Compact: the contents are one line (where you are), and fold down over the editor.
  const barLabel = comparing ? `Comparing ${tickedCount} plotlines`
    : node ? [...plotTrail(node, w.plotNodeById), node].map(nodeLabel).join(' › ') : 'Contents'

  return (
    <div className="wrPlotView" ref={sizeRef}>
      <div className="wrPlotFrame" data-size={size}>
        {size === 'compact' ? (
          <div className="wrPlotBar">
            <button type="button" className="wrPlotBarToggle" aria-expanded={barOpen} onClick={() => setBarOpen(open => !open)}>
              {barOpen ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
              <span className="wrPlotBarLabel">{barLabel}</span>
              {tickedCount > 0 && !comparing && <span className="wrNavCount">{tickedCount} ticked</span>}
            </button>
            {barOpen && <div className="wrPlotBarDrawer">{nav}</div>}
          </div>
        ) : nav}
        <div className="wrPlotBody" ref={bodyRef} onKeyDown={keys.onKeyDown}>
          {w.plotSaveError && <p className="wrError">{w.plotSaveError}</p>}
          {w.plotStatus === 'loading' && <p className="wrMuted">Loading plot…</p>}
          {w.plotStatus === 'error' && <p className="wrError">{w.plotError ?? 'Failed to load plot.'}</p>}
          {w.plotStatus === 'idle' && comparing && (
            <PlotCompare
              w={w} lines={selectedLines} size={size}
              onOpen={(plotlineId, pointId) => {
                const fieldId = w.plotNodeById.get(pointId)?.fieldId
                if (fieldId) ui.setOpen(fieldId, true)
                w.focusPlotNode(plotlineId); setCompareOpen(false); w.highlightPlotpoint(pointId)
              }}
              onDeselect={id => w.togglePlotSelection(id, false)}
              onOpenNode={id => { w.focusPlotNode(id); setCompareOpen(false) }}
              openParents={openParents} onToggleParent={toggleParent}
            />
          )}
          {w.plotStatus === 'idle' && !comparing && !node && <p className="wrMuted">Select a category or plotline to edit it, or add a category.</p>}
          {w.plotStatus === 'idle' && !comparing && node && (node.kind === 'plotline'
            ? <PlotlineEditor key={node.id} w={w} node={node} ui={ui} />
            : node.kind === 'plotpoint'
              ? <p className="wrMuted">Plotpoints are edited from their plotline.</p>
              : <CategoryEditor key={node.id} w={w} node={node} ui={ui} />)}
        </div>
      </div>
    </div>
  )
}
