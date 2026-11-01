import { useEffect, useRef, useState } from 'react'
import { zoneRef, type DropZone } from '../../../lib/pointerDrag'
import { beforeAt, gapOf, slides, type SlotRow } from './fieldSlots'

// One group of fields (the loose fields of a node, or the fields of one of its sets, or the options of a field) as the place a dragged field is
// dropped, in the order the pointer asks for. The field is dragged by the pointer (lib/pointerDrag.ts); over the group, the pointer's place is the
// SLOT the field would go to (fieldSlots.ts):
//   - in its own group, the rows it passes slide out of the way to open a gap at the slot (drawn as a dashed slot, `gap`), and the field leaves its
//     place (hidden);
//   - in another group, a line is drawn where it would go (sliding there would grow the group, and move what is under the pointer).
// Rows only slide by a transform. A row's place is its layout place, so a row that has slid under the pointer does not change the slot.
// Every group a field can be dropped in shares the `kind` the grip starts the drag in.

interface Slot { before: string | null; size: number; gap: { top: number; height: number } | null }

export interface FieldGroupDrop {
  // The ref of the group's element (it also makes the group a drop zone); it is `position: relative`, so the rows' offsets are measured from it.
  ref: (el: HTMLDivElement | null) => void
  // (Kept for the callers that spread it: the pointer engine needs no handlers on the element.)
  handlers: Record<string, never>
  // How far (px, down is positive) a row of the group is drawn from its place while the field is dragged in its own group.
  slideOf: (id: string) => number | undefined
  // The dragged field of this group, once it has left its place (hidden while the others slide).
  isLifted: (id: string) => boolean
  // A line at the slot, drawn on the row it is in front of ('before') or, at the end, behind the last row ('after'), for a field of another group.
  edgeOf: (id: string) => 'before' | 'after' | null
  // The drag is over this group: sliding (its own field), a line (another's), or over a group with no row to draw it on.
  sliding: boolean
  overEmpty: boolean
  // Where the dragged field would land in its own group, for the dashed gap (left and width are the group's).
  gap: { left: number; top: number; width: number; height: number } | null
}

export function useFieldGroupDrop({ kind, ids, draggedId, active, onDrop }: {
  // What a grip starts the drag in, the same for every group the field can go to.
  kind: string
  // The group's fields in order.
  ids: string[]
  // The field being dragged in this editor, if any.
  draggedId: string | null
  // The group's node is being edited: it takes drops.
  active: boolean
  // The dragged field is dropped here: in front of `beforeId`, or last (null).
  onDrop: (draggedId: string, beforeId: string | null) => void
}): FieldGroupDrop {
  const box = useRef<HTMLDivElement | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  useEffect(() => { if (!draggedId) setSlot(null) }, [draggedId])

  // Where the pointer at (x, y) puts the dragged field in this group.
  function read(y: number): Slot | null {
    const el = box.current
    if (!el || !draggedId) return null
    const gap = parseFloat(getComputedStyle(el).rowGap) || 0
    const rows: SlotRow[] = []
    const all: SlotRow[] = []
    let size = 0
    for (const child of Array.from(el.children)) {
      if (!(child instanceof HTMLElement) || !child.dataset.field) continue
      const row = { id: child.dataset.field, top: child.offsetTop, height: child.offsetHeight }
      all.push(row)
      if (child.dataset.field === draggedId) size = child.offsetHeight + gap
      else rows.push(row)
    }
    const before = beforeAt(rows, y - el.getBoundingClientRect().top)
    return { before, size, gap: gapOf(all, draggedId, before, gap) }
  }

  const zone: DropZone = {
    over: (_x, y) => {
      if (!active || !draggedId) return
      const next = read(y)
      if (next) setSlot(prev => (prev && prev.before === next.before && prev.size === next.size ? prev : next))
    },
    leave: () => setSlot(null),
    drop: (_x, y) => {
      if (!active || !draggedId) return
      const next = read(y)
      setSlot(null)
      if (next) onDrop(draggedId, next.before)
    },
  }
  const register = zoneRef(kind, zone)
  const ref = (el: HTMLDivElement | null) => { box.current = el; register(el) }

  const own = draggedId !== null && ids.includes(draggedId)
  const moves = own && slot ? slides(ids, draggedId, slot.before, slot.size) : new Map<string, number>()
  const edgeId = !own && slot ? slot.before ?? ids[ids.length - 1] ?? null : null
  const el = box.current
  return {
    ref, handlers: {},
    slideOf: id => moves.get(id),
    isLifted: id => own && slot !== null && id === draggedId,
    edgeOf: id => (edgeId === id && slot ? (slot.before === null ? 'after' : 'before') : null),
    sliding: slot !== null,
    overEmpty: !own && slot !== null && ids.length === 0,
    gap: own && slot?.gap && el ? { left: 0, top: slot.gap.top, width: el.clientWidth, height: slot.gap.height } : null,
  }
}
