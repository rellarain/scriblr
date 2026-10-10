import { canInsertBelow, canInsertBeside, type Rect } from './splitTree'

export type EdgeSide = 'left' | 'right' | 'top' | 'bottom'

// The width (as a fraction of a tile's own box, on its own axis) of its edge margins where
// dropping a dragged tile splits off a new column/row beside/below it, instead of swapping.
export const EDGE_ZONE = 0.25

// Whether a pointer at (x, y) sits in one of a tile's four edge margins (and there's room to
// split off a new column/row there) rather than its middle (a swap, as usual). `box` is the
// tile's on-screen box and `rect` its place in the split tree. Each axis qualifies
// independently against its own box length (EDGE_ZONE); when both would qualify at once
// (near a corner), whichever the pointer sits physically closer to, in real pixels, wins --
// comparing raw px (not the two axes' fractions against each other) is what keeps this
// right for a tile far wider than it is tall, or the reverse.
export function edgeSideOf(
  box: { left: number; top: number; width: number; height: number },
  x: number, y: number, rect: Rect, oneColumn: boolean,
): EdgeSide | null {
  if (box.width <= 0 || box.height <= 0) return null
  const distL = x - box.left
  const distR = box.left + box.width - x
  const distT = y - box.top
  const distB = box.top + box.height - y
  const hDist = Math.min(distL, distR)
  const vDist = Math.min(distT, distB)
  const hOk = !oneColumn && canInsertBeside(rect) && hDist <= EDGE_ZONE * box.width
  const vOk = canInsertBelow(rect) && vDist <= EDGE_ZONE * box.height
  if (!hOk && !vOk) return null
  if (hOk && (!vOk || hDist <= vDist)) return distL < distR ? 'left' : 'right'
  return distT < distB ? 'top' : 'bottom'
}
