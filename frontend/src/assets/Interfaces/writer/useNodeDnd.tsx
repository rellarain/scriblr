import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import type { OutlineNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { moveNodeTo } from './outlineTree'

// Drag-and-drop reordering and reparenting for the Outline level's cards (arcs,
// chapters, acts, scenes and moments). A card's grip is the drag handle. Drops land
// in the GAPS between cards: before the first, between, and after the last child of
// every container (an empty container has one gap too). Only gaps whose parent may
// hold the dragged kind take part, and the hovered gap opens up to the dragged card's
// height.
// The project's top level (series and loose books) has no parent node.
const ROOT = '(project)'

export function useNodeDnd(w: WriterWorkspace, opts: {
  // A further say in where a dragged node may go, on top of the nesting rule (an editor that shows
  // only some kinds under a parent, say, must not take the rest).
  accepts?: (dragged: OutlineNode, parentId: string | null) => boolean
} = {}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragHeight, setDragHeight] = useState(0)
  const [overKey, setOverKey] = useState<string | null>(null)

  function endDrag() { setDragId(null); setOverKey(null) }

  // Whether a drop into (parentId, beforeId) is allowed, worked out once per gap for the node being dragged: every gap asks on every
  // render (each dragover re-renders), and each answer walks the tree.
  const verdicts = useMemo(() => new Map<string, boolean>(), [dragId, w.outlineNodes]) // eslint-disable-line react-hooks/exhaustive-deps
  const allowed = (parentId: string | null, beforeId: string | null) => {
    if (dragId === null) return false
    const key = `${parentId ?? ROOT}|${beforeId ?? ''}`
    const known = verdicts.get(key)
    if (known !== undefined) return known
    let verdict = moveNodeTo(w.outlineNodes, dragId, parentId, beforeId) !== null
    if (verdict && opts.accepts) {
      const dragged = w.outlineNodes.find(n => n.id === dragId)
      verdict = Boolean(dragged) && opts.accepts(dragged!, parentId)
    }
    verdicts.set(key, verdict)
    return verdict
  }

  // A drop target between the children of `parentId`: just before `beforeId`, or last when null.
  // `empty` marks a container with no children at all, whose only gap gets a taller slot while dragging.
  function gap(parentId: string | null, beforeId: string | null, empty = false): ReactNode {
    const key = `${parentId ?? ROOT}|${beforeId ?? ''}`
    const open = dragId !== null && allowed(parentId, beforeId)
    const over = open && overKey === key
    return (
      <div
        key={`gap-${key}`}
        className={`wrDropGap${open ? ' wrDropGap--open' : ''}${over ? ' wrDropGap--over' : ''}${empty ? ' wrDropGap--empty' : ''}`}
        style={over ? { height: dragHeight } : undefined}
        onDragOver={open ? (e: DragEvent) => {
          e.preventDefault()
          e.stopPropagation()
          if (overKey !== key) setOverKey(key)
        } : undefined}
        onDragLeave={open ? () => setOverKey(prev => (prev === key ? null : prev)) : undefined}
        onDrop={open ? (e: DragEvent) => {
          e.preventDefault()
          e.stopPropagation()
          if (!dragId) return
          w.moveOutlineNodeInto(dragId, parentId, beforeId)
          endDrag()
        } : undefined}
      />
    )
  }

  // A container's children with a gap before, between and after them.
  function children<T extends { id: string }>(parentId: string | null, list: T[], render: (item: T) => ReactNode): ReactNode {
    return (
      <div className="wrChildren">
        {list.length === 0
          ? gap(parentId, null, true)
          : <>{list.flatMap(item => [gap(parentId, item.id), render(item)])}{gap(parentId, null)}</>}
      </div>
    )
  }

  // Spread onto the grip element.
  const gripProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.stopPropagation()
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
      const card = (e.currentTarget as HTMLElement).closest('[data-node]') as HTMLElement | null
      if (card) {
        e.dataTransfer.setDragImage(card, 12, 12)
        setDragHeight(card.offsetHeight)
      }
      setDragId(id)
    },
    onDragEnd: endDrag,
  })

  const cardClass = (base: string, id: string) => `${base}${dragId === id ? ' wrOutlineCard--dragging' : ''}`

  return { gap, children, gripProps, cardClass, dragId }
}
