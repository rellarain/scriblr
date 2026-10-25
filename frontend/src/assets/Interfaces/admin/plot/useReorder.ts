import { useState, type DragEvent, type KeyboardEvent } from 'react'

// Drag-to-reorder for one list (the presets, a card's subcategories, its clusters, a card's fields): the grip starts a drag, and dropping on
// an item puts the dragged one just before it; the end zone puts it last. Each list has its own instance, so an item dropped on another list
// is ignored. Alt+Up and Alt+Down on the grip move one place, for the keyboard.
export function useReorder<K extends string | number>(onMove: (id: K, beforeId: K | null) => void, onNudge?: (id: K, dir: -1 | 1) => void) {
  const [dragId, setDragId] = useState<K | null>(null)
  // What the drag is over: an item (it goes before it), null (the end zone), or undefined (nothing).
  const [overId, setOverId] = useState<K | null | undefined>(undefined)
  const end = () => { setDragId(null); setOverId(undefined) }

  return {
    dragId, overId,
    grip: (id: K) => ({
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.stopPropagation()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(id))
        setDragId(id)
      },
      onDragEnd: end,
      onKeyDown: (e: KeyboardEvent) => {
        if (!onNudge || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
        e.preventDefault()
        onNudge(id, e.key === 'ArrowUp' ? -1 : 1)
      },
    }),
    // Spread on an item (beforeId = its id) or on the end zone (null).
    target: (beforeId: K | null) => ({
      onDragOver: (e: DragEvent) => {
        if (dragId === null) return
        e.preventDefault()
        e.stopPropagation()
        setOverId(beforeId)
      },
      onDragLeave: () => setOverId(prev => (prev === beforeId ? undefined : prev)),
      onDrop: (e: DragEvent) => {
        if (dragId === null) return
        e.preventDefault()
        e.stopPropagation()
        const moving = dragId
        end()
        onMove(moving, beforeId)
      },
    }),
  }
}
