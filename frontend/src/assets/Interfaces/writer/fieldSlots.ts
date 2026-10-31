// Where a dragged field would land in a group of fields (the loose fields of a node, or the fields of one of its sets), and how the rows slide
// to make room. Pure: the pointer's place and the rows' layout go in, numbers and ids come out (useFieldGroupDrop.ts reads them off the page).
//
// A row is where it is laid out, never where a slide has drawn it, so the slot does not change when rows slide under the pointer.

export interface SlotRow { id: string; top: number; height: number }

// The field the dragged one would go in front of when the pointer is at `y` (measured like the rows' tops, from the top of the group);
// null = last. `rows` are the group's fields without the dragged one: the pointer is over a row's upper half = in front of that row, its
// lower half = in front of the next.
export function beforeAt(rows: SlotRow[], y: number): string | null {
  for (const row of rows) if (y < row.top + row.height / 2) return row.id
  return null
}

// How far each row of the dragged field's own group slides, in pixels (down is positive), when it is dragged to go in front of `beforeId`
// (null: last): the rows it passes slide out of the way, to where it was, by the room it takes (`size`: its height and the gap between rows).
// No entry = the row stays. Nothing slides when the field would stay where it is.
export function slides(ids: string[], draggedId: string, beforeId: string | null, size: number): Map<string, number> {
  const out = new Map<string, number>()
  const from = ids.indexOf(draggedId)
  const to = beforeId === null ? ids.length : ids.indexOf(beforeId)
  if (from < 0 || to < 0) return out
  // Going up: the rows from the gap down to where it was move down. Going down: the rows after it, up to the gap, move up.
  if (to < from) for (let i = to; i < from; i += 1) out.set(ids[i], size)
  else if (to > from + 1) for (let i = from + 1; i < to; i += 1) out.set(ids[i], -size)
  return out
}

// Whether dropping in front of `beforeId` leaves the group as it is.
export function staysPut(ids: string[], draggedId: string, beforeId: string | null): boolean {
  const from = ids.indexOf(draggedId)
  const to = beforeId === null ? ids.length : ids.indexOf(beforeId)
  return from >= 0 && (to === from || to === from + 1)
}
