// Where a dragged chip would land among chips that flow and wrap like text (a row of option chips), and how the chips slide to make room. Pure:
// the pointer's place and the chips' sizes go in, ids and offsets come out (useChipDrop.ts reads them off the page).
//
// Unlike a column of rows (fieldSlots.ts), a chip that makes room does not move by a fixed amount: it takes the place the chip beside it had,
// or one on another line, depending on how the chips wrap. So the new order is laid out the way the browser wraps it (`flowOf`), and each chip
// slides from where it is to where that puts it. A chip's place is its layout place, never where a slide has drawn it.

export interface ChipBox { id: string; left: number; top: number; width: number; height: number }
export interface ChipSize { id: string; width: number; height: number }
export interface ChipMove { dx: number; dy: number }
// The room the chips flow in: the width of the line, and the gaps between chips and between lines.
export interface ChipFlow { width: number; columnGap: number; rowGap: number }

// The id of the thing after the chips that is not one of them (the "add" chip), among those that slide.
export const CHIP_TAIL = ' tail'

// The chip the dragged one would go in front of when the pointer is at (x, y), measured like the boxes (from the top left of the group); null =
// last. `boxes` are the group's chips without the dragged one, in order. The pointer is in the line its height falls in (a gap between two lines
// belongs to the lower one): in front of the first chip there whose middle is to its right, or, past them all, in front of the first chip of
// the next line.
export function chipBeforeAt(boxes: ChipBox[], x: number, y: number): string | null {
  let at = 0
  while (at < boxes.length) {
    // the line starting at `at`: the chips up to the first one that starts below the bottom of the line so far
    let end = at
    let bottom = boxes[at].top + boxes[at].height
    while (end + 1 < boxes.length && boxes[end + 1].top < bottom) {
      end += 1
      bottom = Math.max(bottom, boxes[end].top + boxes[end].height)
    }
    if (y < bottom) {
      for (let i = at; i <= end; i += 1) if (x < boxes[i].left + boxes[i].width / 2) return boxes[i].id
      return boxes[end + 1]?.id ?? null
    }
    at = end + 1
  }
  return null
}

// Where each chip goes, from the top left of the group, when `sizes` wrap in a line `flow.width` wide: lines of the chips that fit, as tall as
// their tallest, the chips in a line centred in it.
export function flowOf(sizes: ChipSize[], flow: ChipFlow): Map<string, { x: number; y: number }> {
  const lines: ChipSize[][] = []
  let used = 0
  for (const size of sizes) {
    if (lines.length === 0 || (used > 0 && used + size.width > flow.width + 0.5)) { lines.push([]); used = 0 }
    lines[lines.length - 1].push(size)
    used += size.width + flow.columnGap
  }
  const out = new Map<string, { x: number; y: number }>()
  let top = 0
  for (const line of lines) {
    const tall = Math.max(...line.map(s => s.height))
    let left = 0
    for (const size of line) {
      out.set(size.id, { x: left, y: top + (tall - size.height) / 2 })
      left += size.width + flow.columnGap
    }
    top += tall + flow.rowGap
  }
  return out
}

// How far each chip slides, from its place, when the dragged one goes in front of `beforeId` (null: last): the others move to where the
// wrapped new order puts them. `tail` is what comes after the chips (the add chip), which moves too when a line breaks differently. No entry =
// the chip stays, and nothing slides when the dragged chip would stay where it is.
export function chipSlides(chips: ChipSize[], tail: ChipSize | null, draggedId: string, beforeId: string | null, flow: ChipFlow): Map<string, ChipMove> {
  const out = new Map<string, ChipMove>()
  const dragged = chips.find(c => c.id === draggedId)
  const rest = chips.filter(c => c.id !== draggedId)
  const to = beforeId === null ? rest.length : rest.findIndex(c => c.id === beforeId)
  if (!dragged || to < 0) return out
  const after = tail ? [{ ...tail, id: CHIP_TAIL }] : []
  const was = flowOf([...chips, ...after], flow)
  const now = flowOf([...rest.slice(0, to), dragged, ...rest.slice(to), ...after], flow)
  for (const { id } of [...rest, ...after]) {
    const from = was.get(id)
    const next = now.get(id)
    if (!from || !next) continue
    const move = { dx: Math.round(next.x - from.x), dy: Math.round(next.y - from.y) }
    if (move.dx !== 0 || move.dy !== 0) out.set(id, move)
  }
  return out
}
