// Lets a tab bar -- which can sit anywhere (the Writer's is in the level's header, far from its tiles) -- start a drag
// in the tile area it belongs to, found by the grid's id.
export interface DragStart { clientX: number; clientY: number; pointerId: number }
type Starter = (id: string, e: DragStart) => void

const starters = new Map<string, Starter>()

export function registerArea(gridId: string, start: Starter): () => void {
  starters.set(gridId, start)
  return () => { if (starters.get(gridId) === start) starters.delete(gridId) }
}

// A tab-bar icon was pressed: the area decides whether it becomes a drag (the pointer moves) or stays a click.
export function startBarDrag(gridId: string, id: string, e: DragStart): void {
  starters.get(gridId)?.(id, e)
}

// A drag ends with a click on the element it started from, dispatched in the same task as the pointerup; the bar ignores that one.
let ended = false
export const markDragEnded = (): void => { ended = true; setTimeout(() => { ended = false }, 0) }
export const dragJustEnded = (): boolean => ended
export const __resetDragEndedForTests = (): void => { ended = false }
