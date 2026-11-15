import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { ModelContent, ModelEntry, ModelGroup, ModelObject, ModelShape, ModelZone } from '../../../../api/types'
import { gripProps, zoneRef } from '../../../../lib/pointerDrag'
import { AnchorIcon, ChevronDownIcon, EyeIcon, EyeOffIcon, GripIcon, HandIcon, PlusIcon, SlidersIcon } from '../../../icons'
import { useStoredState } from '../../writer/storage'
import { marksOf } from './engine/anchors'
import { isSlider } from './engine/sliders'
import { LIMITS } from './engine/limits'
import { zonesOf } from './engine/zones'
import { useDesignerPolicy } from './designerPolicy'
import type { Selection } from './designerState'
import { groupById, objectById, outlineSize, shapeById } from './modelContent'
import { StatusBadge } from './StatusBadge'
import { ObjectMarks, ShapeMarks } from './TreeMarks'
import { CARD_NAMES, displayed, dropRule, isExpanded, pathTo, storedSpot, type DropWhere, type TreeKind } from './treeNav'

// The shape editor's tree (Z2): nested cards for the model, its zones, their groups, objects and shapes, an expanded shape listing its points. Every card stays listed beside
// its siblings whatever is selected; its chevron shows or hides what is in it (remembered per model and card; zones start expanded, the rest collapsed), and selecting
// anything, here or on the canvas, opens the way down to it. Each card has, to the right of its name: Add (a group in a zone, an object in a group, a shape in an object),
// the eye, and the chevron. A card's grip drags it among the cards of its kind anywhere in the tree, or onto a card of the level above (into it, at the top); Alt + Up or Down
// on the grip moves it one place. Topmost is drawn in front.

export interface ShapeTreeActions {
  onSelect: (sel: Selection) => void
  onSelectPoint: (shapeId: string, i: number) => void
  onAddZone: () => void
  onAddGroupIn: (zoneId: string) => void
  onAddObject: (groupId: string) => void
  onShapeForm: (objectId: string) => void
  // a card dropped (or nudged) into a parent (null for a zone), before a sibling in the stored order (null: last, the top)
  onMoveCard: (kind: TreeKind, id: string, parentId: string | null, beforeId: string | null) => void
  onToggleHidden: (id: string) => void
  onSetHidden: (ids: string[], hide: boolean) => void
  onToggleModelHidden: () => void
}

const DRAG_KIND = 'shapeTree'
const label = (name: string, fallback: string) => name.trim() || fallback

interface Place { kind: TreeKind; id: string; parent: string | null; siblings: string[] }

export function ShapeTree({ content, sel, selPoint, hidden, entry, onOpenModels, modelCount, actions }: {
  content: ModelContent
  sel: Selection
  // the selected point of the selected shape (null: none)
  selPoint: number | null
  hidden: ReadonlySet<string>
  entry: ModelEntry
  onOpenModels: () => void
  modelCount: number
  actions: ShapeTreeActions
}) {
  const { max } = useDesignerPolicy()
  const [chosen, setChosen] = useStoredState<Record<string, boolean>>(`scriblr.designer.tree.${entry.id}`, {})
  const [drag, setDrag] = useState<Place | null>(null)
  // the card being dragged, at once (a drag can reach a card before the tree has drawn again)
  const dragNow = useRef<Place | null>(null)
  const [drop, setDrop] = useState<{ id: string; where: DropWhere } | null>(null)
  const heads = useRef(new Map<string, HTMLElement>())
  const navRef = useRef<HTMLDivElement | null>(null)
  const zones = zonesOf(content)

  // selecting opens the way down to what is selected (the zone, group and object it is in; a selected point's shape too)
  const path = pathTo(content, sel, selPoint !== null).join('|')
  useEffect(() => {
    const ids = path ? path.split('|') : []
    if (ids.length === 0) return
    setChosen(prev => (ids.every(id => prev[id] !== false && (prev[id] === true || zones.some(z => z.id === id))) ? prev : { ...prev, ...Object.fromEntries(ids.map(id => [id, true])) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
  // ... and brings its card into view
  useEffect(() => {
    if (sel.kind === 'none') return
    const el = navRef.current?.querySelector<HTMLElement>(`[data-tree-id="${sel.id}"]`)
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  }, [sel.kind, sel.id, path])

  const open = (kind: TreeKind | 'model', id: string) => isExpanded(kind, id, chosen)
  const toggle = (kind: TreeKind | 'model', id: string) => setChosen(prev => ({ ...prev, [id]: !isExpanded(kind, id, prev) }))

  // ---- dragging a card ----
  function whereOver(place: Place, y: number): DropWhere | null {
    const drag = dragNow.current
    if (!drag || drag.id === place.id) return null
    const rule = dropRule(drag.kind, place.kind)
    if (rule === 'into') return 'into'
    if (rule !== 'beside') return null
    const r = heads.current.get(place.id)?.getBoundingClientRect()
    return r && y < r.top + r.height / 2 ? 'before' : 'after'
  }
  function land(place: Place, where: DropWhere) {
    const drag = dragNow.current
    if (!drag) return
    if (where === 'into') {
      actions.onMoveCard(drag.kind, drag.id, place.id, storedSpot(childrenOf(place), drag.id, null, 'into'))
      // the card it went into opens, to show it there
      setChosen(prev => ({ ...prev, [place.id]: true }))
      return
    }
    actions.onMoveCard(drag.kind, drag.id, place.parent, storedSpot(place.siblings, drag.id, place.id, where))
  }
  // the stored children of a card (a drop into it goes on top of them)
  function childrenOf(place: Place): string[] {
    if (place.kind === 'zone') return zones.find(z => z.id === place.id)?.groups ?? []
    if (place.kind === 'group') return groupById(content, place.id)?.objects ?? []
    if (place.kind === 'object') return objectById(content, place.id)?.shapes ?? []
    return []
  }
  function headRef(place: Place) {
    const register = zoneRef(DRAG_KIND, {
      over: (_x, y) => { const where = whereOver(place, y); setDrop(d => (where ? (d?.id === place.id && d.where === where ? d : { id: place.id, where }) : d?.id === place.id ? null : d)) },
      leave: () => setDrop(d => (d?.id === place.id ? null : d)),
      drop: (_x, y) => { const where = whereOver(place, y); setDrop(null); if (where) land(place, where) },
    })
    return (el: HTMLElement | null) => { if (el) heads.current.set(place.id, el); else heads.current.delete(place.id); register(el) }
  }
  function nudge(place: Place, dir: -1 | 1) {
    // up (-1) is toward the top of the list: later in the stored order
    const shown = displayed(place.siblings), at = shown.indexOf(place.id), to = at + dir
    if (at < 0 || to < 0 || to >= shown.length) return
    actions.onMoveCard(place.kind, place.id, place.parent, storedSpot(place.siblings, place.id, shown[to], dir < 0 ? 'before' : 'after'))
  }
  function grip(place: Place, name: string): ReactNode {
    const g = gripProps(DRAG_KIND, place.id, el => el.closest<HTMLElement>('[data-tree-id]'), { start: () => { dragNow.current = place; setDrag(place) }, end: () => { dragNow.current = null; setDrag(null); setDrop(null) } })
    return (
      <span
        className="cmGrip" role="button" tabIndex={0} aria-label={`Move ${name} (Alt+Up or Down)`} title={`Drag ${name} among the ${CARD_NAMES[place.kind].toLowerCase()}s, or onto a card it can go into`} {...g}
        onKeyDown={(e: KeyboardEvent) => {
          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
          e.preventDefault()
          nudge(place, e.key === 'ArrowUp' ? -1 : 1)
        }}
      ><GripIcon size={12} /></span>
    )
  }

  // ---- one card ----
  function card(o: {
    place: Place; name: string; sub?: string; selected: boolean; off: boolean; shown: boolean; marks?: ReactNode
    add?: { label: string; title: string; off?: boolean; onClick: () => void }; onEye: () => void; kids: () => ReactNode
  }): ReactNode {
    const { place, name } = o, expanded = open(place.kind, place.id), d = drop?.id === place.id ? drop.where : null
    return (
      <li key={place.id} className={drag?.id === place.id ? 'cmDragging' : undefined}>
        <div className={`dzCard dzCard--${place.kind} dzTreeCard${o.selected ? ' dzCard--sel' : ''}${o.off ? ' dzCard--off' : ''}`} role="group" aria-label={`${CARD_NAMES[place.kind]} ${name}`} data-card={place.kind} data-tree-id={place.id}>
          <div className={`dzCardHead${d ? ` dzCardHead--${d}` : ''}`} ref={headRef(place)}>
            {grip(place, name)}
            <button type="button" className="dzCardMain" aria-label={name} aria-current={o.selected ? 'true' : undefined} title={`Select ${name}`} onClick={() => actions.onSelect({ kind: place.kind, id: place.id })}>{name}</button>
            {o.marks}
            {o.sub !== undefined && <small className="dzCardSub">{o.sub}</small>}
            {o.add && <button type="button" className="cmIconBtn cmIconBtn--small dzCardTool" aria-label={o.add.label} title={o.add.title} disabled={o.add.off} onClick={o.add.onClick}><PlusIcon size={12} /></button>}
            <EyeButton name={name} shown={o.shown} onClick={o.onEye} />
            <ChevronButton name={name} expanded={expanded} onClick={() => toggle(place.kind, place.id)} />
          </div>
          {expanded && <div className="dzKids">{o.kids()}</div>}
        </div>
      </li>
    )
  }

  // ---- the levels ----
  const zoneIds = zones.map(z => z.id)
  function zoneCard(z: ModelZone): ReactNode {
    const name = label(z.name, 'Untitled zone'), groups = z.groups.map(id => groupById(content, id)).filter((g): g is ModelGroup => !!g)
    const allHidden = groups.length > 0 && groups.every(g => hidden.has(g.id))
    return card({
      place: { kind: 'zone', id: z.id, parent: null, siblings: zoneIds }, name, sub: `${groups.length} group${groups.length === 1 ? '' : 's'}`,
      selected: sel.kind === 'zone' && sel.id === z.id, off: allHidden, shown: !allHidden,
      add: { label: `New group in ${name}`, title: `New group in ${name}`, off: content.groups.length >= max.groups, onClick: () => actions.onAddGroupIn(z.id) },
      onEye: () => actions.onSetHidden(groups.map(g => g.id), !allHidden),
      kids: () => <ul className="dzCardList dzTreeList">{displayed(groups).map(g => groupCard(g, z, allHidden))}</ul>,
    })
  }
  function groupCard(g: ModelGroup, z: ModelZone, zoneOff: boolean): ReactNode {
    const name = label(g.name, 'Untitled group'), objects = g.objects.map(id => objectById(content, id)).filter((o): o is ModelObject => !!o)
    const off = zoneOff || hidden.has(g.id)
    return card({
      place: { kind: 'group', id: g.id, parent: z.id, siblings: z.groups }, name, sub: `${objects.length} object${objects.length === 1 ? '' : 's'}`,
      selected: sel.kind === 'group' && sel.id === g.id, off, shown: !hidden.has(g.id),
      add: { label: `New object in ${name}`, title: `New object in ${name}`, off: g.objects.length >= max.objectsPerGroup, onClick: () => actions.onAddObject(g.id) },
      onEye: () => actions.onToggleHidden(g.id),
      kids: () => <ul className="dzCardList dzTreeList">{displayed(objects).map(o => objectCard(o, g, off))}</ul>,
    })
  }
  function objectCard(o: ModelObject, g: ModelGroup, groupOff: boolean): ReactNode {
    const name = label(o.name, 'Untitled object'), shapes = o.shapes.map(id => shapeById(content, id)).filter((s): s is ModelShape => !!s)
    const off = groupOff || hidden.has(o.id)
    return card({
      place: { kind: 'object', id: o.id, parent: g.id, siblings: g.objects }, name, sub: `${shapes.length} shape${shapes.length === 1 ? '' : 's'}`,
      selected: sel.kind === 'object' && sel.id === o.id, off, shown: !hidden.has(o.id),
      marks: <ObjectMarks content={content} object={o} name={name} />,
      add: { label: `Add a shape to ${name}`, title: `Add a shape to ${name}`, off: o.shapes.length >= max.shapesPerObject, onClick: () => actions.onShapeForm(o.id) },
      onEye: () => actions.onToggleHidden(o.id),
      kids: () => <ul className="dzCardList dzTreeList">{displayed(shapes).map(s => shapeCard(s, o, off))}</ul>,
    })
  }
  function shapeCard(s: ModelShape, o: ModelObject, objectOff: boolean): ReactNode {
    const name = label(s.name, 'Untitled shape')
    return card({
      place: { kind: 'shape', id: s.id, parent: o.id, siblings: o.shapes }, name, sub: `${outlineSize(content, s)} point${outlineSize(content, s) === 1 ? '' : 's'}`,
      selected: sel.kind === 'shape' && sel.id === s.id && selPoint === null, off: objectOff || hidden.has(s.id) || !!s.hide, shown: !hidden.has(s.id),
      marks: <ShapeMarks content={content} shape={s} name={name} />,
      onEye: () => actions.onToggleHidden(s.id),
      kids: () => <PointRows shape={s} name={name} selected={sel.kind === 'shape' && sel.id === s.id ? selPoint : null} onSelect={i => actions.onSelectPoint(s.id, i)} />,
    })
  }

  const allHidden = content.groups.length > 0 && content.groups.every(g => hidden.has(g.id))
  const modelName = label(entry.draft.name, 'Untitled model'), modelOpen = open('model', entry.id)
  return (
    <div className={`dzShapeTree${drag ? ' dzShapeTree--dragging' : ''}`} ref={navRef}>
      <div className={`dzCard dzCard--model dzCard--open dzTreeCard${sel.kind === 'none' ? ' dzCard--sel' : ''}${allHidden ? ' dzCard--off' : ''}`} role="group" aria-label={`Model ${modelName}`} data-card="model">
        <div className="dzCardHead">
          <button type="button" className="dzCardMain" aria-label={modelName} aria-current={sel.kind === 'none' ? 'true' : undefined} title="Show the whole model: nothing selected" onClick={() => actions.onSelect({ kind: 'none', id: '' })}>{modelName}</button>
          <button type="button" className="cmIconBtn cmIconBtn--small dzCardTool" aria-label="New zone" title="New zone, at the top" disabled={zones.length >= LIMITS.zonesMax} onClick={actions.onAddZone}><PlusIcon size={12} /></button>
          <EyeButton name={modelName} shown={!allHidden} onClick={actions.onToggleModelHidden} />
          <ChevronButton name={modelName} expanded={modelOpen} onClick={() => toggle('model', entry.id)} />
        </div>
        <div className="dzCardStatus"><StatusBadge entry={entry} /></div>
        <button type="button" className="dzAllModels" aria-label="Show all the models" aria-expanded={false} title="Show the cards of all the models" onClick={onOpenModels}>
          <ChevronDownIcon size={12} /> All models ({modelCount})
        </button>
        {modelOpen && <div className="dzKids"><ul className="dzCardList dzTreeList" aria-label="Zones">{displayed(zones).map(zoneCard)}</ul></div>}
      </div>
    </div>
  )
}

function EyeButton({ name, shown, onClick }: { name: string; shown: boolean; onClick: () => void }) {
  return (
    <button
      type="button" className={`cmIconBtn cmIconBtn--small dzCardTool${shown ? '' : ' cmIconBtn--on'}`} aria-label={`Show ${name}`} aria-pressed={shown}
      title={shown ? `${name} is shown: hide it, to look at the rest` : `${name} is hidden: show it`} onClick={onClick}
    >{shown ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />}</button>
  )
}

function ChevronButton({ name, expanded, onClick }: { name: string; expanded: boolean; onClick: () => void }) {
  return (
    <button
      type="button" className={`cmIconBtn cmIconBtn--small dzCardTool dzChevron${expanded ? '' : ' dzChevron--closed'}`} aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`} aria-expanded={expanded}
      title={expanded ? `Collapse ${name}` : `Expand ${name}: show what is in it`} onClick={onClick}
    ><ChevronDownIcon size={12} /></button>
  )
}

// The points of an expanded shape: a row each, with the marks it carries (an anchor, a posable point, a slider); a click selects the point.
function PointRows({ shape, name, selected, onSelect }: { shape: ModelShape; name: string; selected: number | null; onSelect: (i: number) => void }) {
  const marks = marksOf(shape)
  return (
    <ol className="dzPoints" aria-label={`Points of ${name}`}>
      {shape.pts.map((p, i) => {
        const anchor = marks.some(m => m.kind === 'anchor' && m.i === i), pose = marks.some(m => m.kind === 'pose' && m.i === i), slider = isSlider(p)
        return (
          <li key={i}>
            <button type="button" className={`dzPoint${selected === i ? ' dzPoint--sel' : ''}`} aria-current={selected === i ? 'true' : undefined} onClick={() => onSelect(i)}>
              <span className="dzPointName">Point {i + 1}</span>
              {p.bind?.name ? <small className="dzCardSub">{p.bind.name}</small> : null}
              {anchor && <span className="cmTwin" role="img" aria-label={`Point ${i + 1} is an anchor`} title="An anchor"><AnchorIcon size={11} /></span>}
              {pose && <span className="cmTwin" role="img" aria-label={`Point ${i + 1} is posable`} title="A posable point"><HandIcon size={11} /></span>}
              {slider && <span className="cmTwin" role="img" aria-label={`Point ${i + 1} is a slider`} title="A slider"><SlidersIcon size={11} /></span>}
            </button>
          </li>
        )
      })}
    </ol>
  )
}
