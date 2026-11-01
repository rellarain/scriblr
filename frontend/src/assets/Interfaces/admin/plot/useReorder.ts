import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { gripProps, zoneRef, type DropZone } from '../../../../lib/pointerDrag'
import { beforeAt, gapOf, slides, type SlotRow } from '../../writer/fieldSlots'

// Drag-to-reorder for one list (the presets, a card's subcategories, its clusters, a card's fieldsets): the grip starts a drag (lib/pointerDrag.ts: the
// item follows the pointer as it is), and over the list the pointer's place is the SLOT the item would go to (writer/fieldSlots.ts): the items it
// passes slide to open a gap there (drawn as a dashed slot, `gap`) and the dragged one leaves its place (hidden). Each list has its own instance, so
// an item dropped on another list is ignored. Alt+Up and Alt+Down on the grip move one place, for the keyboard.
//
// The list is the element `listRef` goes on (it is `position: relative`, the items' offsets are measured from it) and its items, its direct
// children, spread `item(id)`.
interface Slot { ids: string[]; before: string | null; size: number; gap: { top: number; height: number } | null }

export function useReorder<K extends string | number>(onMove: (id: K, beforeId: K | null) => void, onNudge?: (id: K, dir: -1 | 1) => void) {
  const kind = `reorder:${useId()}`
  const [dragId, setDragId] = useState<K | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const box = useRef<HTMLElement | null>(null)
  // The ids as the page names them (an attribute is a string), back to what the callers use.
  const keys = useRef(new Map<string, K>())
  const end = () => { setDragId(null); setSlot(null) }
  useEffect(() => { if (dragId === null) setSlot(null) }, [dragId])

  // Where the pointer at height `y` puts the dragged item in this list.
  function read(y: number): Slot | null {
    const el = box.current
    if (!el || dragId === null) return null
    const dragged = String(dragId)
    const gap = parseFloat(getComputedStyle(el).rowGap) || 0
    const rows: SlotRow[] = []
    const all: SlotRow[] = []
    let size = 0
    for (const child of Array.from(el.children)) {
      if (!(child instanceof HTMLElement) || child.dataset.reorderItem === undefined) continue
      const row = { id: child.dataset.reorderItem, top: child.offsetTop, height: child.offsetHeight }
      all.push(row)
      if (row.id === dragged) size = child.offsetHeight + gap
      else rows.push(row)
    }
    const before = beforeAt(rows, y - el.getBoundingClientRect().top + el.scrollTop)
    return { ids: all.map(r => r.id), before, size, gap: gapOf(all, dragged, before, gap) }
  }

  const zone: DropZone = {
    over: (_x, y) => {
      const next = read(y)
      if (next) setSlot(prev => (prev && prev.before === next.before && prev.size === next.size ? prev : next))
    },
    leave: () => setSlot(null),
    drop: (_x, y) => {
      const next = read(y)
      if (dragId === null || !next) return
      const moving = dragId
      end()
      onMove(moving, next.before === null ? null : keys.current.get(next.before) ?? null)
    },
  }
  const register = zoneRef(kind, zone)
  const moves = dragId !== null && slot ? slides(slot.ids, String(dragId), slot.before, slot.size) : new Map<string, number>()
  const el = box.current

  return {
    dragId, kind,
    // Ends the drag (a list that takes the drop itself calls it when the dragged one is let go).
    end,
    grip: (id: K) => ({
      ...gripProps(kind, String(id), grip => grip.closest<HTMLElement>('[data-reorder-item]'), { start: () => setDragId(id), end }),
      onKeyDown: (e: KeyboardEvent) => {
        if (!onNudge || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
        e.preventDefault()
        onNudge(id, e.key === 'ArrowUp' ? -1 : 1)
      },
    }),
    // The ref of the list's element: it takes the drop.
    listRef: (node: HTMLElement | null) => { box.current = node; register(node) },
    // Spread on an item of the list: it slides out of the way of the dragged one, and the dragged one itself leaves its place.
    item: (id: K): { 'data-reorder-item': string; style?: CSSProperties } => {
      keys.current.set(String(id), id)
      const slide = moves.get(String(id))
      const lifted = slot !== null && dragId === id
      const style: CSSProperties = {
        ...(slide ? { transform: `translateY(${slide}px)`, transition: 'transform 0.16s ease' } : {}),
        ...(lifted ? { visibility: 'hidden' as const } : {}),
      }
      return Object.keys(style).length > 0 ? { 'data-reorder-item': String(id), style } : { 'data-reorder-item': String(id) }
    },
    // The list has the dragged item over it.
    sliding: slot !== null,
    // Where the dragged item would land, for the dashed gap.
    gap: slot?.gap && el ? { left: 0, top: slot.gap.top, width: el.clientWidth, height: slot.gap.height } : null,
  }
}
