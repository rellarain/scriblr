import { useState, type DragEvent } from 'react'
import type { WriterWorkspace } from './useWriterWorkspace'
import { moveNode } from './outlineTree'

// Drag-and-drop reparenting for outline cards (the chapter page's acts,
// scenes and moments; the book editor's arcs and chapters). A card's grip is
// the drag handle; every card is a drop target.
//
// Where a drop lands: onto a shallower kind it goes inside (appended); onto
// its own kind it goes before that sibling. A target that would not accept the
// move (nesting rule, or into its own subtree) does not claim the drag, so a
// parent card can.
export function useNodeDnd(w: WriterWorkspace, enabled: boolean) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  function dropMode(targetId: string): 'inside' | 'before' | null {
    if (!dragId) return null
    const target = w.outlineNodes.find(n => n.id === targetId)
    const dragged = w.outlineNodes.find(n => n.id === dragId)
    if (!target || !dragged) return null
    const dropAs = target.kind === dragged.kind ? 'before' : 'inside'
    return moveNode(w.outlineNodes, dragId, targetId, dropAs) ? dropAs : null
  }

  function endDrag() { setDragId(null); setOverId(null) }

  const dropProps = (id: string) => !enabled ? {} : {
    onDragOver: (e: DragEvent) => {
      if (!dropMode(id)) return
      e.preventDefault()
      e.stopPropagation()
      if (overId !== id) setOverId(id)
    },
    onDrop: (e: DragEvent) => {
      const dropAs = dropMode(id)
      if (!dropAs || !dragId) return
      e.preventDefault()
      e.stopPropagation()
      w.moveOutlineNodeTo(dragId, id, dropAs)
      endDrag()
    },
  }

  // Spread onto the grip element.
  const gripProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.stopPropagation()
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
      const card = (e.currentTarget as HTMLElement).closest('[data-node]')
      if (card) e.dataTransfer.setDragImage(card, 12, 12)
      setDragId(id)
    },
    onDragEnd: endDrag,
  })

  const cardClass = (base: string, id: string) =>
    `${base}${dragId === id ? ' wrOutlineCard--dragging' : ''}${overId === id ? ' wrOutlineCard--over' : ''}`

  return { dropProps, gripProps, cardClass }
}
