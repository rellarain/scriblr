import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { CHIP_TAIL, chipBeforeAt, chipSlides, type ChipBox, type ChipMove, type ChipSize } from './chipSlots'

// A row of chips (the options of a field) as the place a dragged chip is dropped, in the order the pointer asks for. Over the group the pointer's
// place is the SLOT the chip would go to (chipSlots.ts): the chips it passes slide, to open a gap there, and the chip itself leaves its place
// (hidden; the pointer carries its picture). Chips slide by a transform only, and only once the drag is under way: the browser cancels a drag
// whose source moves in the dragstart event. A chip's place is its layout place, so one that has slid under the pointer does not change the slot.
//
// The group is the element `ref` goes on, which is `position: relative` (the chips' offsets are measured from it). Its chips carry
// `data-chip="<id>"`; what follows them (the add chip) carries `data-chip-tail`, and slides too.

interface Slot { before: string | null; moves: Map<string, ChipMove> }

export interface ChipGroupDrop {
  ref: React.RefObject<HTMLDivElement>
  handlers: {
    onDragEnter: (e: DragEvent) => void
    onDragOver: (e: DragEvent) => void
    onDragLeave: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
  }
  // How far a chip is drawn from its place, or undefined; and the style that does it.
  slideOf: (id: string) => ChipMove | undefined
  tailSlide: ChipMove | undefined
  // The dragged chip, once it has left its place.
  isLifted: (id: string) => boolean
  // The drag is over the group: the chips slide.
  sliding: boolean
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
  const ref = useRef<HTMLDivElement>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  useEffect(() => { if (draggedId === null) setSlot(null) }, [draggedId])

  // Where the pointer in `e` puts the dragged chip; `prev` is kept while the slot is the same.
  function read(e: DragEvent, prev: Slot | null): Slot | null {
    const box = ref.current
    if (!box || draggedId === null) return null
    const chips: ChipSize[] = []
    const others: ChipBox[] = []
    let tail: ChipSize | null = null
    for (const el of Array.from(box.children)) {
      if (!(el instanceof HTMLElement)) continue
      const size = { width: el.offsetWidth, height: el.offsetHeight }
      if (el.dataset.chip !== undefined) {
        chips.push({ id: el.dataset.chip, ...size })
        if (el.dataset.chip !== draggedId) others.push({ id: el.dataset.chip, left: el.offsetLeft, top: el.offsetTop, ...size })
      } else if (el.dataset.chipTail !== undefined) tail = { id: CHIP_TAIL, ...size }
    }
    const at = box.getBoundingClientRect()
    const before = chipBeforeAt(others, e.clientX - at.left, e.clientY - at.top)
    if (prev && prev.before === before) return prev
    const style = getComputedStyle(box)
    const flow = { width: box.clientWidth - px(style.paddingLeft) - px(style.paddingRight), columnGap: px(style.columnGap), rowGap: px(style.rowGap) }
    return { before, moves: chipSlides(chips, tail, draggedId, before, flow) }
  }

  const over = (e: DragEvent) => {
    if (draggedId === null) return
    e.preventDefault(); e.stopPropagation()
    const next = read(e, slot)
    if (next) setSlot(prev => (prev && prev.before === next.before ? prev : next))
  }
  const leave = (e: DragEvent) => {
    if (e.relatedTarget instanceof Node && ref.current?.contains(e.relatedTarget)) return
    setSlot(null)
  }
  const drop = (e: DragEvent) => {
    if (draggedId === null) return
    e.preventDefault(); e.stopPropagation()
    const next = read(e, null)
    setSlot(null)
    if (next) onDrop(draggedId, next.before)
  }

  return {
    ref,
    handlers: { onDragEnter: over, onDragOver: over, onDragLeave: leave, onDrop: drop },
    slideOf: id => slot?.moves.get(id),
    tailSlide: slot?.moves.get(CHIP_TAIL),
    isLifted: id => slot !== null && id === draggedId,
    sliding: slot !== null,
  }
}
