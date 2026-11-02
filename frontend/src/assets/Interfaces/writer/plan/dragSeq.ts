import type { DragEvent } from 'react'
import type { WorkKind } from '../../../../lib/planSequence'

// What is being dragged inside the plan: a phase, a section of one, or a piece of work in a section. The browser does not show what a drag carries until it is dropped,
// so while it lasts the row it came from (its home row) is kept here, and a drop on another row is refused. (Work dragged from the Work tile or the Backlog is
// not in this: it is not placed yet, and goes to any row.)

export const DRAG_SEQ = 'application/x-scriblr-seq'

export type SeqDrag =
  | { kind: 'phase' | 'milestone'; id: string; rowKey: string }
  | { kind: 'work'; id: string; rowKey: string; workKind: WorkKind; from: string }

let current: SeqDrag | null = null
export const seqDrag = (): SeqDrag | null => current
export const endSeqDrag = (): void => { current = null }

export function beginSeqDrag(e: DragEvent, drag: SeqDrag, image?: Element | null): void {
  current = drag
  e.dataTransfer.setData(DRAG_SEQ, drag.id)
  e.dataTransfer.effectAllowed = 'move'
  if (image) e.dataTransfer.setDragImage(image, 12, 12)
}

export const OUTSIDE_ROW = 'It can only move inside its own row.'
