import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { zoneRef, type DropZone } from '../../../lib/pointerDrag'
import { CHIP_TAIL, chipBeforeAt, chipSlides, chipSlot, type ChipBox, type ChipMove, type ChipSize } from './chipSlots'

// A row of chips (the options of a field) as the place a dragged chip is dropped, in the order the pointer asks for. The chip is dragged by the
// pointer (lib/pointerDrag.ts): its picture follows the pointer, and over the group the pointer's place is the SLOT the chip would go to
// (chipSlots.ts): the chips it passes slide, to open a gap there (drawn as a dashed slot, `gap`), and the chip itself leaves its place (hidden).
// Chips slide by a transform only. A chip's place is its layout place, so one that has slid under the pointer does not change the slot.
//
// The group is the element `ref` goes on, which is `position: relative` (the chips' offsets are measured from it). Its chips carry
// `data-chip="<id>"`; what follows them (the add chip) carries `data-chip-tail`, and slides too. The grip of a chip starts the drag in `kind`.

interface Slot { before: string | null; moves: Map<string, ChipMove>; gap: GapRect | null }
export interface GapRect { left: number; top: number; width: number; height: number }

export interface ChipGroupDrop {
  // The ref of the group's element (it also makes the group a drop zone).
  ref: (el: HTMLDivElement | null) => void
  // What a grip is told to start a drag that this group takes.
  kind: string
  // (Kept for the callers that spread it: the pointer engine needs no handlers on the element.)
  handlers: Record<string, never>
  // How far a chip is drawn from its place, or undefined; and the style that does it.
  slideOf: (id: string) => ChipMove | undefined
  tailSlide: ChipMove | undefined
  // The dragged chip, once it has left its place.
  isLifted: (id: string) => boolean
  // The drag is over the group: the chips slide.
  sliding: boolean
  // Where the dragged chip would land, in the group's own coordinates, for the dashed gap.
  gap: GapRect | null
}

// The style that draws a chip `move` away from its place.
export const slideStyle = (move: ChipMove | undefined): CSSProperties | undefined => (move ? { transform: `translate(${move.dx}px, ${move.dy}px)` } : undefined)

const px = (value: string) => parseFloat(value) || 0

export function useChipDrop({ draggedId, onDrop }: {
  // The chip being dragged, if any.
  draggedId: string | null
  // The dragged chip is dropped here: in front of `beforeId`, or last (null).
  onDrop: (draggedId: string, beforeId: string | null) => void
}): ChipGroupDrop {
  const box = useRef<HTMLDivElement | null>(null)
  const kind = `chip:${useId()}`
  const [slot, setSlot] = useState<Slot | null>(null)
  useEffect(() => { if (draggedId === null) setSlot(null) }, [draggedId])

  // Where the pointer at (x, y) puts the dragged chip; `prev` is kept while the slot is the same.
  function read(x: number, y: number, prev: Slot | null): Slot | null {
    const el = box.current
    if (!el || draggedId === null) return null
    const chips: ChipSize[] = []
    const others: ChipBox[] = []
    let tail: ChipSize | null = null
    for (const child of Array.from(el.children)) {
      if (!(child instanceof HTMLElement)) continue
      const size = { width: child.offsetWidth, height: child.offsetHeight }
      if (child.dataset.chip !== undefined) {
        chips.push({ id: child.dataset.chip, ...size })
        if (child.dataset.chip !== draggedId) others.push({ id: child.dataset.chip, left: child.offsetLeft, top: child.offsetTop, ...size })
      } else if (child.dataset.chipTail !== undefined) tail = { id: CHIP_TAIL, ...size }
    }
    const at = el.getBoundingClientRect()
    const before = chipBeforeAt(others, x - at.left, y - at.top)
    if (prev && prev.before === before) return prev
    const style = getComputedStyle(el)
    const flow = { width: el.clientWidth - px(style.paddingLeft) - px(style.paddingRight), columnGap: px(style.columnGap), rowGap: px(style.rowGap) }
    const room = chipSlot(chips, tail, draggedId, before, flow)
    return {
      before, moves: chipSlides(chips, tail, draggedId, before, flow),
      gap: room && { left: room.x + px(style.paddingLeft), top: room.y + px(style.paddingTop), width: room.width, height: room.height },
    }
  }

  const zone: DropZone = {
    over: (x, y) => {
      if (draggedId === null) return
      const next = read(x, y, slot)
      if (next) setSlot(prev => (prev && prev.before === next.before ? prev : next))
    },
    leave: () => setSlot(null),
    drop: (x, y) => {
      if (draggedId === null) return
      const next = read(x, y, null)
      setSlot(null)
      if (next) onDrop(draggedId, next.before)
    },
  }
  const register = zoneRef(kind, zone)
  const ref = (el: HTMLDivElement | null) => { box.current = el; register(el) }

  return {
    ref, kind, handlers: {},
    slideOf: id => slot?.moves.get(id),
    tailSlide: slot?.moves.get(CHIP_TAIL),
    isLifted: id => slot !== null && id === draggedId,
    sliding: slot !== null,
    gap: slot?.gap ?? null,
  }
}
