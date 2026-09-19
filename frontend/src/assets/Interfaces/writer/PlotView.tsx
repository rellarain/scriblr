import { useMemo, useRef, useState } from 'react'
import type { OutlineNode, PlotNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { ChevronRightIcon, CloseIcon, GripIcon, LockIcon, PlusIcon } from '../../icons'
import { ChipEditor, DeleteControl } from './shared'
import { focusNodeField, useNodeKeys } from '../../../lib/nodeKeys'
import { ColorRange } from '../../../components/ColorRange'
import { coverColor, hueDelta, hueWindow, wrapHue } from '../../../theme/bookColors'
import { derivedShades } from '../../../theme/palettes'
import { useThemeState } from '../../../theme/useTheme'
import { nodeColorStyle, plotColors, type PlotColors } from './plotColors'
import {
  assignedLevel, chapterOfAssignment, nodeLabel, orderAssignedPlotpoints, plotpointDescriptionAllowed, sortByTitle, titleAfterEdit,
} from './plotTree'

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

  function rows(parentId: string | null, depth: number): React.ReactNode[] {
    return sortByTitle((children.get(parentId) ?? []).filter(n => n.kind !== 'plotpoint'))
      .flatMap(node => {
        const kids = (children.get(node.id) ?? []).filter(c => c.kind !== 'plotpoint')
        const hasKids = kids.length > 0
        const open = !collapsed.has(node.id)
        const isLine = node.kind === 'plotline'
        return [
          <div
            key={node.id}
            className={node.id === w.focusedPlotNodeId ? 'wrNavRow wrNavRow--active' : 'wrNavRow'}
            style={{ paddingLeft: 8 + depth * 16, ...nodeColorStyle(plotColors(node, w.plotNodeById).primary) }}
          >
            <button
              type="button" className="wrNavChevron" aria-label={open ? 'Collapse' : 'Expand'}
              style={{ visibility: hasKids ? 'visible' : 'hidden', transform: open ? 'rotate(90deg)' : undefined }}
              onClick={() => toggle(node.id)}
            >
              <ChevronRightIcon size={12} />
            </button>
            <span className="wrNavMark" />
            <button type="button" className="wrNavLabel" onClick={() => w.focusPlotNode(node.id)}>{nodeLabel(node)}</button>
            {!isLine && <span className="wrNavCount">{plotlineCount(node, children)}</span>}
          </div>,
          ...(open ? rows(node.id, depth + 1) : []),
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
        {rows(null, 0)}
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

// The category and subcategory colours a node wears, as two small squares.
function ColorTrail({ colors }: { colors: PlotColors }) {
  if (!colors.category) return null
  return (
    <span className="wrColorTrail" aria-hidden="true">
      <span className="wrColorDot" style={{ backgroundColor: colors.category }} />
      {colors.subcategory && <span className="wrColorDot" style={{ backgroundColor: colors.subcategory }} />}
    </span>
  )
}

// The hue selector of a category (theme colour) or subcategory (accent colour,
// within 60 degrees of its category's hue). Saturation and brightness are the
// active zone's, so what the thumb shows is what the app draws.
function HueField({ w, node }: { w: WriterWorkspace; node: PlotNode }) {
  const { settings, activeZone } = useThemeState()
  const pal = settings.zones[activeZone].palette
  if (node.kind === 'subcategory') {
    const category = node.parentId ? w.plotNodeById.get(node.parentId) : undefined
    const centre = category?.hue ?? pal.theme.h
    const { min, max } = hueWindow(centre)
    const shown = centre + hueDelta(centre, node.hue ?? centre) // the same hue, inside the window
    return (
      <div>
        <div className="wrLabel">Colour <span className="wrOutlineMeta">within 60° of its category</span></div>
        <ColorRange
          label="Subcategory colour" kind="hue" value={shown} min={min} max={max}
          sat={pal.accent.s} light={derivedShades(pal, 'accent')[0].color.l}
          onChange={v => w.setPlotHue(node.id, wrapHue(v), centre)}
        />
      </div>
    )
  }
  const cover = coverColor(pal, node.hue ?? pal.theme.h)
  return (
    <div>
      <div className="wrLabel">Colour</div>
      <ColorRange
        label="Category colour" kind="hue" value={node.hue ?? pal.theme.h} sat={cover.s} light={cover.l}
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

function CategoryEditor({ w, node }: { w: WriterWorkspace; node: PlotNode }) {
  const isCategory = node.kind === 'category'
  const colors = plotColors(node, w.plotNodeById)
  return (
    <div className="wrCardPanel wrCardPanel--colored" data-knode={node.id} style={nodeColorStyle(colors.primary)}>
      <div className="wrCardPanelHead">
        <span className="wrKindBadge">{node.kind}</span>
        <ColorTrail colors={colors} />
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
      <div>
        <div className="wrLabel">Plotline template fields</div>
        <ChipEditor
          items={node.customFieldDefs.map(f => ({ key: f.id, label: f.name }))} placeholder="Add field…"
          onAdd={name => w.addPlotCustomFieldDef(node.id, name)} onRemove={id => w.removePlotCustomFieldDef(node.id, id)}
        />
      </div>
      {isCategory && <ChildRows w={w} node={node} kind="subcategory" addLabel="Subcategory" />}
      <ChildRows w={w} node={node} kind="plotline" addLabel="Plotline" />
    </div>
  )
}

interface OutlineTarget { id: string; label: string; depth: number; meta: string }

function PlotlineEditor({ w, node }: { w: WriterWorkspace; node: PlotNode }) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [overUnassigned, setOverUnassigned] = useState(false)
  // A just-added plotpoint takes focus so its title can be typed right away.
  const [newPointId, setNewPointId] = useState<string | null>(null)

  const outlineById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])

  // Books and their chapters are the drop targets.
  const targets = useMemo<OutlineTarget[]>(() => {
    const out: OutlineTarget[] = []
    const byParent = new Map<string | null, OutlineNode[]>()
    for (const n of w.outlineNodes) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n])
    for (const b of w.books) {
      const chapters: OutlineNode[] = []
      const walk = (id: string) => (byParent.get(id) ?? []).sort((a, c) => a.order - c.order).forEach(ch => {
        if (ch.kind === 'chapter') chapters.push(ch)
        walk(ch.id)
      })
      walk(b.id)
      out.push({ id: b.id, label: nodeLabel(b), depth: 0, meta: `${chapters.length} chapters` })
      chapters.forEach((c, i) => out.push({ id: c.id, label: `${i + 1} · ${nodeLabel(c)}`, depth: 1, meta: '' }))
    }
    return out
  }, [w.outlineNodes, w.books])

  const points = (w.plotChildrenByParentId.get(node.id) ?? []).filter(p => p.kind === 'plotpoint')
  const unassigned = points.filter(p => assignedLevel(p, outlineById) === 'none')
  const assigned = useMemo(
    () => orderAssignedPlotpoints(
      points.filter(p => assignedLevel(p, outlineById) !== 'none'),
      w.outlineNodes, w.activeProject?.settings.timeSystems ?? [],
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w.plotNodes, w.outlineNodes, w.activeProject, node.id, outlineById],
  )
  const hasAssigned = assigned.length > 0
  const colors = plotColors(node, w.plotNodeById)

  // The custom fields a plotline fills in come from its category and
  // subcategory templates as well as its own.
  const fieldDefs = useMemo(() => {
    const defs: { id: string; name: string }[] = []
    let current: PlotNode | undefined = node
    const chain: PlotNode[] = []
    while (current) { chain.unshift(current); current = current.parentId ? w.plotNodeById.get(current.parentId) : undefined }
    for (const n of chain) defs.push(...n.customFieldDefs)
    return defs
  }, [node, w.plotNodeById])

  function endDrag() { setDragId(null); setOverId(null); setOverUnassigned(false) }

  function dragProps(id: string) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
        const card = (e.currentTarget as HTMLElement).closest('[data-point]')
        if (card) e.dataTransfer.setDragImage(card, 12, 12)
        setDragId(id)
      },
      onDragEnd: endDrag,
    }
  }

  // Plain render function (not a component) so the inputs keep focus while typing.
  const pointCard = (p: PlotNode) => {
    const level = assignedLevel(p, outlineById)
    const chapter = chapterOfAssignment(p, outlineById)
    const book = level === 'book' ? outlineById.get(p.assignedMomentId!) : undefined
    const locked = level === 'inner'
    return (
      <div
        key={p.id} data-point={p.id} data-knode={p.id} style={nodeColorStyle(colors.primary)}
        className={dragId === p.id ? 'wrPoint wrPoint--dragging' : 'wrPoint'}
      >
        {!locked && (
          <span className="wrGrip" {...dragProps(p.id)} aria-label="Drag plotpoint" title="Drag onto a book or chapter"><GripIcon size={14} /></span>
        )}
        <div className="wrPointFields">
          {level !== 'none' && (
            <div className="wrPointTarget">
              {chapter ? (
                <button
                  type="button" className="wrLinkBtn wrPointChapter" title="Open this chapter's outline"
                  onClick={() => w.openChapter(chapter.id, 'outline')}
                >
                  {nodeLabel(chapter)}
                </button>
              ) : (
                <span className="wrPointChapter">{book ? nodeLabel(book) : ''}</span>
              )}
              {locked ? (
                <span className="wrPointLock" title="Assigned in the chapter outline. Unassign it there first.">
                  <LockIcon size={12} />
                </span>
              ) : (
                <button
                  type="button" className="wrPointUnassign" aria-label={`Unassign ${p.title || 'plotpoint'}`} title="Unassign"
                  onClick={() => w.assignPlotpoint(p.id, null)}
                >
                  <CloseIcon size={12} />
                </button>
              )}
            </div>
          )}
          <input
            className="wrPointTitle" data-kf="" value={p.title} placeholder="Plotpoint title" autoFocus={p.id === newPointId}
            onChange={e => w.updatePlotNodeField(p.id, 'title', e.target.value)}
            // A description never stands without a title.
            onBlur={() => { const t = titleAfterEdit(p.title, p.body); if (t !== p.title) w.updatePlotNodeField(p.id, 'title', t) }}
          />
          {plotpointDescriptionAllowed(p) && (
            <input
              className="wrPointBody" data-kf="" value={p.body} placeholder="Description"
              onChange={e => w.updatePlotNodeField(p.id, 'body', e.target.value)}
            />
          )}
        </div>
        {level === 'none' && <DeleteControl tone="dark" message="Delete plotpoint?" onConfirm={() => w.deletePlotNode(p.id)} />}
      </div>
    )
  }

  return (
    <div className="wrPlotlineLayout">
      <div className="wrPlotlineLeft">
        <div className="wrCardPanel wrCardPanel--colored" data-knode={node.id} style={nodeColorStyle(colors.primary)}>
          <div className="wrCardPanelHead">
            <span className="wrKindBadge">plotline</span>
            <ColorTrail colors={colors} />
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
          {fieldDefs.map(f => (
            <label key={f.id} className="wrFieldRow">
              <span>{f.name}</span>
              <input
                className="wrField" data-kf="" value={node.customFieldValues[f.id] ?? ''}
                onChange={e => w.updatePlotCustomFieldValue(node.id, f.id, e.target.value)}
              />
            </label>
          ))}
        </div>

        <div
          className={overUnassigned ? 'wrUnassigned wrUnassigned--over' : 'wrUnassigned'}
          onDragOver={e => { if (dragId) { e.preventDefault(); setOverUnassigned(true) } }}
          onDragLeave={() => setOverUnassigned(false)}
          onDrop={e => { e.preventDefault(); if (dragId) w.assignPlotpoint(dragId, null); endDrag() }}
        >
          <div className="wrChildRowsHead">
            <span className="wrLabel">Plotpoints</span>
            <button type="button" className="wrSmallBtn" onClick={() => setNewPointId(w.addPlotNode(node.id, 'plotpoint'))}><PlusIcon size={13} /> Plotpoint</button>
          </div>
          <div className="wrPointList">
            {points.length === 0 && <p className="wrMuted">No plotpoints yet.</p>}
            {points.length > 0 && (
              <>
                <div className="wrPointSection">Unassigned <span>{unassigned.length}</span></div>
                {unassigned.length === 0 && <p className="wrMuted">Every plotpoint is assigned.</p>}
                {unassigned.map(pointCard)}
                <div className="wrPointSection">Assigned, in order of occurrence <span>{assigned.length}</span></div>
                {assigned.length === 0 && <p className="wrMuted">Drag a plotpoint onto a book or chapter to assign it.</p>}
                {assigned.map(pointCard)}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="wrPlotlineRight">
        <div className="wrOutlinePanel">
          <div className="wrChildRowsHead">
            <span className="wrLabel">Books and chapters</span>
            <span className="wrOutlineMeta">Drop a plotpoint on a book or chapter</span>
          </div>
          {targets.length === 0 && <p className="wrMuted">No books yet.</p>}
          <div className="wrTargetList">
            {targets.map(t => (
              <div
                key={t.id}
                className={overId === t.id ? 'wrTarget wrTarget--over' : 'wrTarget'}
                style={{ marginLeft: t.depth * 22 }}
                onDragOver={e => { if (dragId) { e.preventDefault(); setOverId(t.id) } }}
                onDragLeave={() => setOverId(prev => (prev === t.id ? null : prev))}
                onDrop={e => { e.preventDefault(); if (dragId) w.assignPlotpoint(dragId, t.id); endDrag() }}
              >
                <span className={t.depth === 0 ? 'wrTargetLabel wrTargetLabel--book' : 'wrTargetLabel'}>{t.label}</span>
                <span className="wrOutlineMeta">{t.meta}</span>
                <span className="wrTargetChips">
                  {points
                    .filter(p => (t.depth === 0 ? p.assignedMomentId === t.id : chapterOfAssignment(p, outlineById)?.id === t.id))
                    .map(p => {
                      const locked = assignedLevel(p, outlineById) === 'inner'
                      return locked ? (
                        <span key={p.id} data-point={p.id} className="wrPointChip wrPointChip--locked" title="Assigned in the chapter outline. Unassign it there first.">
                          {p.title || 'Plotpoint'}
                          <LockIcon size={11} />
                        </span>
                      ) : (
                        <span key={p.id} data-point={p.id} className="wrPointChip" {...dragProps(p.id)}>
                          {p.title || 'Plotpoint'}
                          <button type="button" aria-label={`Unassign ${p.title || 'plotpoint'}`} onClick={() => w.assignPlotpoint(p.id, null)}>×</button>
                        </span>
                      )
                    })}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

const isBlank = (text: string | undefined) => !text || text.trim() === ''

// A plotline's plotpoints in the order the list shows them: unassigned first,
// then assigned ones in order of occurrence.
function plotpointOrder(w: WriterWorkspace, plotlineId: string): string[] {
  const outlineById = new Map(w.outlineNodes.map(n => [n.id, n]))
  const points = (w.plotChildrenByParentId.get(plotlineId) ?? []).filter(p => p.kind === 'plotpoint')
  const unassigned = points.filter(p => assignedLevel(p, outlineById) === 'none')
  const assigned = orderAssignedPlotpoints(
    points.filter(p => assignedLevel(p, outlineById) !== 'none'), w.outlineNodes, w.activeProject?.settings.timeSystems ?? [],
  )
  return [...unassigned, ...assigned].map(p => p.id)
}

export default function PlotView({ w }: { w: WriterWorkspace }) {
  const node = w.focusedPlotNode
  // Kinds of nodes created a moment ago (the workspace maps have not updated yet),
  // so focusing one can also open its editor.
  const created = useRef(new Map<string, PlotNode['kind']>())

  // Keyboard shortcuts (lib/nodeKeys.ts). Categories, subcategories and plotlines
  // are separate editors, so a sibling is shown by focusing it; plotpoints are
  // the cards in the plotline editor. Assigned plotpoints and plotlines that
  // hold plotpoints are never treated as empty.
  const keys = useNodeKeys({
    parentOf: id => w.plotNodeById.get(id)?.parentId ?? null,
    siblingsOf: id => {
      const n = w.plotNodeById.get(id)
      if (!n) return [id]
      if (n.kind === 'plotpoint') return n.parentId ? plotpointOrder(w, n.parentId) : [id]
      return sortByTitle((w.plotChildrenByParentId.get(n.parentId) ?? []).filter(c => c.kind === n.kind)).map(c => c.id)
    },
    isEmpty: id => {
      const n = w.plotNodeById.get(id)
      if (!n) return true
      if (!isBlank(n.title) || !isBlank(n.body) || n.keywords.length > 0) return false
      if (n.kind === 'plotpoint') return assignedLevel(n, new Map(w.outlineNodes.map(o => [o.id, o]))) === 'none'
      if (n.customFieldDefs.length > 0 || Object.values(n.customFieldValues).some(v => !isBlank(v))) return false
      return (w.plotChildrenByParentId.get(id) ?? []).length === 0
    },
    createSibling: id => {
      const n = w.plotNodeById.get(id)
      if (!n) return null
      const made = w.addPlotNode(n.parentId, n.kind, undefined, id)
      created.current.set(made, n.kind)
      return made
    },
    // plotpoint -> a new plotline after its plotline, plotline -> a new subcategory
    // or category after its parent, subcategory -> a new category.
    createParentSibling: id => {
      const n = w.plotNodeById.get(id)
      const parent = n?.parentId ? w.plotNodeById.get(n.parentId) : undefined
      if (!parent) return null
      const made = w.addPlotNode(parent.parentId, parent.kind, undefined, parent.id)
      created.current.set(made, parent.kind)
      return made
    },
    canCreateParentSibling: id => {
      const parentId = w.plotNodeById.get(id)?.parentId
      return Boolean(parentId && w.plotNodeById.get(parentId))
    },
    remove: id => w.deletePlotNode(id),
    focusNode: (id, which) => {
      const kind = w.plotNodeById.get(id)?.kind ?? created.current.get(id)
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
          ? <PlotlineEditor key={node.id} w={w} node={node} />
          : node.kind === 'plotpoint'
            ? <p className="wrMuted">Plotpoints are edited from their plotline.</p>
            : <CategoryEditor key={node.id} w={w} node={node} />)}
      </div>
    </div>
  )
}
