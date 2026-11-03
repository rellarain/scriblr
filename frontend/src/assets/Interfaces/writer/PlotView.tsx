import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PlotNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { GridViewIcon, OutlineIcon, PencilIcon, PlusIcon, QueueIcon, TreeIcon } from '../../icons'
import { ChipEditor, DeleteControl } from './shared'
import { focusNodeField, useNodeKeys } from '../../../lib/nodeKeys'
import HueSlider from './HueSlider'
import { plotColors, plotColorVars } from './plotColors'
import { isPlaced } from './plotPlacement'
import { nodeLabel, sortByTitle } from './plotTree'
import { FieldEditor, FieldGroups, type PlotDrag, type PlotUi } from './FieldBlocks'
import { PlotOutlinePanel } from './PlotOutlinePanel'
import { PlotNav, plotlineCount } from './PlotNav'
import { PlotCompare } from './PlotCompare'
import { PlotParents, type ParentState, type ParentStates } from './PlotParents'
import PlotpointsTab from './levels/PlotpointsTab'
import { SplitArea, type SplitTile } from './SplitArea'
import type { SplitNode } from '../../../components/tiles/splitTree'
import { ICON_PX } from './schedule/IconBtn'
import { PLOT_BREAKPOINTS, plotSizeOf, useElementWidth } from './useElementWidth'
import { useStoredState } from './storage'
import { PlotOrderToggle, usePlotOrder } from './plotOrder'
import { fieldIndex, fieldsInOrder, isScrapField, orderValues, valuesIn } from './plotFields'
import { isChoice } from './plotKinds'

// The Plot console: five tiles on a split grid (drag a title bar to move one, a divider to resize), with a rail of tile tabs in its tile's title bar
// to turn each on and off.
//   Contents    categories > subcategories > clusters > plotlines, alphabetized, each with a tick box (PlotNav.tsx)
//   Editor      the category/subcategory/cluster editor, or the plotline editor: its fields and their plotpoints. Above its title the parents
//               (category, subcategory, cluster) are collapsibles by level, each opening onto its own fields to change in place
//   Chapters    the open plotline's books and chapters (PlotOutlinePanel.tsx): a plotpoint is dragged from the Editor onto a chapter. A plotpoint
//               assigned within a chapter (to an act, scene or moment, from the Outline level) is locked here; the others can be unassigned
//   Compare     the ticked plotlines side by side (PlotCompare.tsx); it opens by itself when a second plotline is ticked
//   Plotpoints  the tray of every plotpoint, to drag onto the Outline's cards, and what is placed in the open book (levels/PlotpointsTab.tsx)
// Compare and Plotpoints start turned off. The layout and which tiles are off are kept per user. Each tile follows its own width, so the Compare
// tile's columns and its chapters panel come and go with the tile.

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

// The colour selector of a category (measured from the project's hue), subcategory (from its category's) or cluster (from its subcategory's, or of its
// category's when it sits straight under one): each node's own range, 30 to 360 degrees either side (its kind's default until it is chosen), or Inherit.
// Saturation and lightness are the active zone's, so what the thumb shows is what the app draws.
function HueField({ w, node }: { w: WriterWorkspace; node: PlotNode }) {
  const label = node.kind === 'cluster' ? 'Cluster colour' : node.kind === 'subcategory' ? 'Subcategory colour' : 'Category colour'
  return <HueSlider label={label} {...w.plotHueSliderOf(node)} />
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

// What a parent chip opens onto in an editor (PlotParents.tsx): the parent's own title, description, colour and keywords, changed in place.
function ParentFields({ w, node }: { w: WriterWorkspace; node: PlotNode }) {
  const kind = `${node.kind.charAt(0).toUpperCase()}${node.kind.slice(1)}`
  return (
    <div className="wrParentEdit">
      <input
        className="wrField" aria-label={`${kind} title`} placeholder={`${kind} title`} value={node.title}
        onChange={e => w.updatePlotNodeField(node.id, 'title', e.target.value)}
      />
      <textarea
        className="wrField" aria-label={`${kind} description`} rows={2} placeholder="Description" value={node.body}
        onChange={e => w.updatePlotNodeField(node.id, 'body', e.target.value)}
      />
      <HueField w={w} node={node} />
      <KeywordsField w={w} node={node} />
    </div>
  )
}

// Dragging does nothing in the category, subcategory and cluster editors (their values are not assigned there).
const NO_DRAG: PlotDrag = {
  dragId: null, valueDrag: () => ({ onDragStart: () => {}, onDragEnd: () => {} }), dropIntoField: () => {}, dragFieldId: null, setDragFieldId: () => {},
  dragSetId: null, setDragSetId: () => {}, noPlacing: true,
}

function CategoryEditor({ w, node, ui }: { w: WriterWorkspace; node: PlotNode; ui: PlotUi }) {
  const [dragFieldId, setDragFieldId] = useState<string | null>(null)
  const [dragSetId, setDragSetId] = useState<string | null>(null)
  const isCategory = node.kind === 'category'
  const colors = plotColors(node, w.plotNodeById, w.projectHue)
  return (
    <div className={`wrCardPanel wrCardPanel--${node.kind}`} data-knode={node.id} style={plotColorVars(colors)}>
      <PlotParents node={node} byId={w.plotNodeById} projectHue={w.projectHue} states={ui.parentStates} onState={ui.setParentState} onOpen={w.focusPlotNode} renderEditor={p => <ParentFields w={w} node={p} />} />
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
      <FieldEditor w={w} owner={node} ui={ui} drag={{ ...NO_DRAG, dragFieldId, setDragFieldId, dragSetId, setDragSetId }} />
      {isCategory && <ChildRows w={w} node={node} kind="subcategory" addLabel="Subcategory" />}
      {node.kind === 'subcategory' && <ChildRows w={w} node={node} kind="cluster" addLabel="Cluster" />}
      <ChildRows w={w} node={node} kind="plotline" addLabel="Plotline" />
    </div>
  )
}

// `dragId` is the plotpoint being dragged to a chapter in the Chapters tile (the console holds it, being the tile's parent as well).
function PlotlineEditor({ w, node, ui, dragId, setDragId }: { w: WriterWorkspace; node: PlotNode; ui: PlotUi; dragId: string | null; setDragId: (id: string | null) => void }) {
  const [dragFieldId, setDragFieldId] = useState<string | null>(null)
  const [dragSetId, setDragSetId] = useState<string | null>(null)
  const [showAssigned, setShowAssigned] = useState(true)

  const outlineById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  const points = w.plotNodes.filter(p => p.kind === 'plotpoint' && p.parentId === node.id)
  const hasAssigned = points.some(p => isPlaced(p, outlineById))
  const colors = plotColors(node, w.plotNodeById, w.projectHue)

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
    dragFieldId, setDragFieldId, dragSetId, setDragSetId,
  }

  return (
    <div className="wrPlotlineEditor">
      <div className="wrCardPanel wrCardPanel--plotline" data-knode={node.id} style={plotColorVars(colors)}>
        <PlotParents node={node} byId={w.plotNodeById} projectHue={w.projectHue} states={ui.parentStates} onState={ui.setParentState} onOpen={w.focusPlotNode} renderEditor={p => <ParentFields w={w} node={p} />} />
        <div className="wrCardPanelHead">
          <span className="wrKindBadge">plotline</span>
          <input className="wrTitleField" data-kf="" value={node.title} onChange={e => w.updatePlotNodeField(node.id, 'title', e.target.value)} placeholder="Plotline title" />
          <DeleteControl
            tone="dark" message={`Delete ${nodeLabel(node)} and its plotpoints?`} onConfirm={() => w.deletePlotNode(node.id)}
            blockedReason={hasAssigned ? 'Take this plotline\'s plotpoints out of the outline first' : undefined}
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
  )
}

const isBlank = (text: string | undefined) => !text || text.trim() === ''

// Where the tiles sit before any is moved: the contents beside the editor, the chapters beside that, the compare and the plotpoints under the chapters
// (both turned off until wanted, so the others take their room).
export const PLOT_TREE: SplitNode = {
  dir: 'row', ratio: 0.24,
  a: { id: 'contents' },
  b: { dir: 'row', ratio: 0.55, a: { id: 'editor' }, b: { dir: 'col', ratio: 0.5, a: { id: 'chapters' }, b: { dir: 'col', ratio: 0.5, a: { id: 'compare' }, b: { id: 'plotpoints' } } } },
}
const MINIMIZED_KEY = 'scriblr.writer.plot.minimized'
const STARTS_OFF = ['compare', 'plotpoints']

// The compare tile's body: the view lays itself out by this tile's own width.
function CompareBody({ w, lines, onOpen, onOpenNode, onDeselect, ui }: {
  w: WriterWorkspace; lines: PlotNode[]; ui: PlotUi
  onOpen: (plotlineId: string, pointId: string) => void; onOpenNode: (id: string) => void; onDeselect: (id: string) => void
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>(PLOT_BREAKPOINTS)
  return (
    <div className="wrPlotBody" ref={ref}>
      {lines.length < 2
        ? <p className="wrMuted">Tick two or more plotlines in the contents to compare them.</p>
        : <PlotCompare w={w} lines={lines} size={plotSizeOf(width)} onOpen={onOpen} onOpenNode={onOpenNode} onDeselect={onDeselect} parentStates={ui.parentStates} onParentState={ui.setParentState} />}
    </div>
  )
}

// `titleSlot` is the element in the console's tab-tile title bar where the rail of the console's tiles goes (null while it is not drawn yet); without
// one (undefined) the rail is a bar above the tiles.
export default function PlotView({ w, titleSlot, columns }: { w: WriterWorkspace; titleSlot?: HTMLElement | null; columns?: 'auto' | 'one' }) {
  const [plotOrder] = usePlotOrder()
  const node = w.focusedPlotNode
  // Kinds of nodes created a moment ago (the workspace maps have not updated yet),
  // so focusing one can also open its editor.
  const created = useRef(new Map<string, PlotNode['kind']>())
  // The tiles that are turned off, and the element in the title bar that holds the rail of tile tabs.
  const [minimized, setMinimized] = useStoredState<string[]>(MINIMIZED_KEY, STARTS_OFF)
  const [railHost, setRailHost] = useState<HTMLElement | null>(null)
  const showTile = (id: string) => setMinimized(prev => (prev.includes(id) ? prev.filter(x => x !== id) : prev))
  // The plotpoint being dragged from a field to a chapter (the Editor's fields to the Chapters tile).
  const [dragId, setDragId] = useState<string | null>(null)
  useEffect(() => setDragId(null), [node?.id])
  // Ticking a second plotline turns the compare tile on.
  const selectedLines = w.plotSelection.map(id => w.plotNodeById.get(id)).filter((n): n is PlotNode => n?.kind === 'plotline')
  const tickedCount = selectedLines.length
  const lastTicked = useRef(0)
  useEffect(() => {
    if (tickedCount >= 2 && tickedCount > lastTicked.current) setMinimized(prev => (prev.includes('compare') ? prev.filter(x => x !== 'compare') : prev))
    lastTicked.current = tickedCount
  }, [tickedCount, setMinimized])
  // A node opens at the top of its editor, not where the last one was scrolled to.
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (bodyRef.current) { bodyRef.current.scrollTop = 0; bodyRef.current.scrollLeft = 0 } }, [node?.id])

  // Which fields are open (collapsed by default), and the value just created (it takes focus).
  const [openFields, setOpenFields] = useState<Set<string>>(new Set())
  const [newValueId, setNewValueId] = useState<string | null>(null)
  // The state of the parent chips by level, kept while moving from one node to another (expand the category chip once and every editor's
  // category chip is expanded). A level not in the map is minimized.
  const [parentStates, setParentStates] = useState<ParentStates>(new Map())
  const setParentState = (kind: string, state: ParentState) => setParentStates(prev => { const next = new Map(prev); if (state === 'minimized') next.delete(kind); else next.set(kind, state); return next })
  const ui: PlotUi = {
    parentStates, setParentState,
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
      if (f) return fieldsInOrder(f.owner).map(d => d.id)
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
      if (n.kind === 'plotpoint') return !n.refId && isBlank(n.title) && isBlank(n.body) && !isPlaced(n, outlineById)
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
        const first = n.customFieldDefs.find(d => !isScrapField(d) && !isChoice(d)) ?? undefined
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

  // Opening a node from anywhere (the contents, a compare card) brings the editor back if it was turned off.
  const nav = <PlotNav w={w} onOpenNode={() => showTile('editor')} onCompare={() => showTile('compare')} />
  const tiles: SplitTile[] = [
    { id: 'contents', title: 'Contents', Icon: TreeIcon, children: nav },
    {
      id: 'editor', title: 'Editor', Icon: PencilIcon,
      children: (
        <div className="wrPlotBody wrPlotBody--editor" ref={bodyRef} onKeyDown={keys.onKeyDown}>
          {w.plotSaveError && <p className="wrError">{w.plotSaveError}</p>}
          {w.plotStatus === 'loading' && <p className="wrMuted">Loading plot…</p>}
          {w.plotStatus === 'error' && <p className="wrError">{w.plotError ?? 'Failed to load plot.'}</p>}
          {w.plotStatus === 'idle' && !node && <p className="wrMuted">Select a category or plotline to edit it, or add a category.</p>}
          {w.plotStatus === 'idle' && node && (node.kind === 'plotline'
            ? <PlotlineEditor key={node.id} w={w} node={node} ui={ui} dragId={dragId} setDragId={setDragId} />
            : node.kind === 'plotpoint'
              ? <p className="wrMuted">Plotpoints are edited from their plotline.</p>
              : <CategoryEditor key={node.id} w={w} node={node} ui={ui} />)}
        </div>
      ),
    },
    {
      id: 'chapters', title: 'Chapters', Icon: OutlineIcon,
      children: (
        <div className="wrPlotBody">
          {w.plotStatus === 'idle' && node?.kind === 'plotline'
            ? <PlotOutlinePanel key={node.id} w={w} plotlines={[node]} dragId={dragId} onDropChapter={chapterId => { if (dragId) w.placePlotpoint(dragId, chapterId); setDragId(null) }} />
            : <p className="wrMuted">Open a plotline to place its plotpoints in the chapters.</p>}
        </div>
      ),
    },
    {
      id: 'compare', title: 'Compare', Icon: GridViewIcon,
      children: (
        <CompareBody
          w={w} lines={selectedLines} ui={ui}
          onOpen={(plotlineId, pointId) => {
            const fieldId = w.plotNodeById.get(pointId)?.fieldId
            if (fieldId) ui.setOpen(fieldId, true)
            showTile('editor'); w.focusPlotNode(plotlineId); w.highlightPlotpoint(pointId)
          }}
          onDeselect={id => w.togglePlotSelection(id, false)}
          onOpenNode={id => { showTile('editor'); w.focusPlotNode(id) }}
        />
      ),
    },
    { id: 'plotpoints', title: 'Plotpoints', Icon: QueueIcon, children: <div className="wrPlotBody"><PlotpointsTab w={w} /></div> },
  ]

  return (
    <div className="wrPlotConsole">
      {titleSlot && createPortal(<span ref={setRailHost} className="wrPlotRail" />, titleSlot)}
      <SplitArea
        iconSize={ICON_PX} gridId="scriblr.writer.plot.tiles" columns={columns} label="Plot tiles" bar barHost={titleSlot === undefined ? undefined : railHost}
        minimized={minimized} onMinimizedChange={(id, off) => setMinimized(prev => (off ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter(x => x !== id)))}
        tiles={tiles.map(t => ({ ...t, bodyClassName: 'wrTabTileBody--surface wrPlotTileBody' }))} defaultTree={PLOT_TREE}
      />
    </div>
  )
}
