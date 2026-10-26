import { createContext, useContext, useRef, useState, type DragEvent } from 'react'
import type { PaletteKey, ZoneKey } from './types'

// What the account theme panel's drags carry, and the pieces the hue list and the role slots share.
//
//  - A swatch from the hue list, dropped on a role slot to give the role that hue, on the list to move it, or anywhere else to delete it.
//  - A role slot, dropped on another slot: the two swap when they are in one zone, the second takes the first's hue between zones.
//
// What is being dragged is held in React state, because a drag's data cannot be read while it is over a target (only when it is dropped).
// A click is the other way to do the same thing: click a swatch (or a slot) to pick it up, then click the slot that is to take it.

export type DragSource = { kind: 'swatch'; id: string } | { kind: 'role'; zone: ZoneKey; role: PaletteKey }

export const sameSource = (a: DragSource | null, b: DragSource | null): boolean => {
  if (!a || !b || a.kind !== b.kind) return false
  return a.kind === 'swatch' ? a.id === (b as typeof a).id : a.zone === (b as typeof a).zone && a.role === (b as typeof a).role
}

export interface ThemeDnd {
  // The drag under way, and the swatch or slot picked up by a click.
  dragging: DragSource | null
  picked: DragSource | null
  begin: (source: DragSource, e: DragEvent) => void
  end: () => void
  pick: (source: DragSource | null) => void
  // Something was dropped on a role slot.
  dropOnRole: (source: DragSource, zone: ZoneKey, role: PaletteKey) => void
}

const IDLE: ThemeDnd = {
  dragging: null, picked: null, begin: () => {}, end: () => {}, pick: () => {}, dropOnRole: () => {},
}

export const ThemeDndContext = createContext<ThemeDnd>(IDLE)
export const useThemeDnd = (): ThemeDnd => useContext(ThemeDndContext)

// Whether a drag is over an element, kept steady while it moves across the element's children (dragenter and dragleave also fire for
// each child, so a leave only counts when the pointer goes to something outside the element).
export function useDropTarget(accepts: boolean, onDrop: (e: DragEvent) => void) {
  const [over, setOver] = useState(false)
  const ref = useRef<HTMLElement | null>(null)
  return {
    over: over && accepts,
    ref,
    props: {
      onDragEnter: (e: DragEvent) => {
        if (!accepts) return
        e.preventDefault()
        setOver(true)
      },
      onDragOver: (e: DragEvent) => {
        if (!accepts) return
        e.preventDefault()
        e.stopPropagation() // the panel's catch-all (delete) is only for what lands on no target
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      },
      onDragLeave: (e: DragEvent) => {
        const to = e.relatedTarget
        if (to instanceof Node && e.currentTarget.contains(to)) return
        setOver(false)
      },
      onDrop: (e: DragEvent) => {
        setOver(false)
        if (!accepts) return
        e.preventDefault()
        e.stopPropagation()
        onDrop(e)
      },
    },
  }
}

// Start a drag with the browser's data set (Firefox starts none without some).
export function startDrag(e: DragEvent, label: string): void {
  e.dataTransfer.effectAllowed = 'copyMove'
  e.dataTransfer.setData('text/plain', label)
}
