import { useEffect, useRef, useState, type DragEvent } from 'react'
import { beforeAt, slides, type SlotRow } from './fieldSlots'

// One group of fields (the loose fields of a node, or the fields of one of its sets) as the place a dragged field is dropped, in the order the
// pointer asks for. Over the group, the pointer's place is the SLOT the field would go to (fieldSlots.ts):
//   - in its own group, the rows it passes slide out of the way to open a gap at the slot, and the field leaves its place (its picture is the
//     one the pointer carries);
//   - in another group, a line is drawn where it would go (sliding there would grow the group, and move what is under the pointer).
// Rows only slide by a transform, and only once the drag is under way: the browser cancels a drag whose source moves in the dragstart event.
// A row's place is its layout place, so a row that has slid under the pointer does not change the slot.

interface Slot { before: string | null; size: number }

export interface FieldGroupDrop {
  ref: React.RefObject<HTMLDivElement>
  // Spread on the element that holds the group's rows (it is `position: relative`, so the rows' offsets are measured from it).
  handlers: {
    onDragEnter: (e: DragEvent) => void
    onDragOver: (e: DragEvent) => void
    onDragLeave: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
  }
  // How far (px, down is positive) a row of the group is drawn from its place while the field is dragged in its own group.
  slideOf: (id: string) => number | undefined
  // The dragged field of this group, once it has left its place (hidden while the others slide).
  isLifted: (id: string) => boolean
  // A line at the slot, drawn on the row it is in front of ('before') or, at the end, behind the last row ('after'), for a field of another group.
  edgeOf: (id: string) => 'before' | 'after' | null
  // The drag is over this group: sliding (its own field), a line (another's), or over a group with no row to draw it on.
  sliding: boolean
  overEmpty: boolean
}

export function useFieldGroupDrop({ ids, draggedId, active, onDrop }: {
  // The group's fields in order.
  ids: string[]
  // The field being dragged in this editor, if any.
  draggedId: string | null
  // The group's node is being edited: it takes drops.
  active: boolean
  // The dragged field is dropped here: in front of `beforeId`, or last (null).
  onDrop: (draggedId: string, beforeId: string | null) => void
}): FieldGroupDrop {
  const ref = useRef<HTMLDivElement>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  useEffect(() => { if (!draggedId) setSlot(null) }, [draggedId])

  // Where the pointer in `e` puts the dragged field in this group.
  function read(e: DragEvent): Slot | null {
    const box = ref.current
    if (!box || !draggedId) return null
    const gap = parseFloat(getComputedStyle(box).rowGap) || 0
    const rows: SlotRow[] = []
    let size = 0
    for (const el of Array.from(box.children)) {
      if (!(el instanceof HTMLElement) || !el.dataset.field) continue
      if (el.dataset.field === draggedId) size = el.offsetHeight + gap
      else rows.push({ id: el.dataset.field, top: el.offsetTop, height: el.offsetHeight })
    }
    return { before: beforeAt(rows, e.clientY - box.getBoundingClientRect().top), size }
  }

  const over = (e: DragEvent) => {
    if (!active || !draggedId) return
    const next = read(e)
    if (!next) return
    e.preventDefault(); e.stopPropagation()
    setSlot(prev => (prev && prev.before === next.before && prev.size === next.size ? prev : next))
  }
  const leave = (e: DragEvent) => {
    if (e.relatedTarget instanceof Node && ref.current?.contains(e.relatedTarget)) return
    setSlot(null)
  }
  const drop = (e: DragEvent) => {
    if (!active || !draggedId) return
    const next = read(e)
    if (!next) return
    e.preventDefault(); e.stopPropagation()
    setSlot(null)
    onDrop(draggedId, next.before)
  }

  const own = draggedId !== null && ids.includes(draggedId)
  const moves = own && slot ? slides(ids, draggedId, slot.before, slot.size) : new Map<string, number>()
  const edgeId = !own && slot ? slot.before ?? ids[ids.length - 1] ?? null : null
  return {
    ref,
    handlers: { onDragEnter: over, onDragOver: over, onDragLeave: leave, onDrop: drop },
    slideOf: id => moves.get(id),
    isLifted: id => own && slot !== null && id === draggedId,
    edgeOf: id => (edgeId === id && slot ? (slot.before === null ? 'after' : 'before') : null),
    sliding: slot !== null,
    overEmpty: !own && slot !== null && ids.length === 0,
  }
}
